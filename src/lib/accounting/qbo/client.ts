// Phase 15 Unit 3 — the thin QBO v3 client + the QboAdapter (implements the provider-neutral
// AccountingAdapter). One authenticated `request` with the pinned minorversion, its OWN 429/5xx
// backoff (NOT the DB-only withWriteRetry — this is remote HTTP), Fault classification (incl. the
// closed-period fault), and query-before-post by DocNumber. Node runtime (Buffer/crypto). No batch in
// v1 — one JournalEntry/Bill per request (safer crash recovery). SEC-S3/S4: fixed origins, no redirect
// following, never logs tokens.

import { createHash } from "node:crypto";
import {
  apiBase,
  minorVersion,
  loadQboConfig,
  type ProviderEnvironment,
  type QboAppConfig,
} from "@/lib/accounting/qbo/config";
import * as oauth from "@/lib/accounting/qbo/oauth";
import {
  ProviderFault,
  assertBalanced,
  type AccountingAdapter,
  type JournalEntryInput,
  type NormalizedAccount,
  type NormalizedVendor,
  type OAuthTokens,
  type PostResult,
  type ProviderCallContext,
  type ProviderFaultKind,
  type QboObjectType,
} from "@/lib/accounting/adapter";

export type ClientDeps = {
  fetchImpl?: typeof fetch;
  /** injectable so tests don't actually sleep during backoff */
  sleep?: (ms: number) => Promise<void>;
  /** injectable jitter source (0..1); fixed in tests for determinism */
  random?: () => number;
};

const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 500;
const BACKOFF_CAP_MS = 8000;

/** QBO DocNumber max length is 21 — derive a deterministic, collision-safe short id from postingKey. */
export function docNumberFor(postingKey: string): string {
  return createHash("sha256").update(postingKey).digest("hex").slice(0, 21);
}

/** PURE: classify an HTTP status + parsed error body into a provider-neutral fault kind. */
export function classifyFault(status: number, body: unknown): { kind: ProviderFaultKind; message: string; code?: string } {
  if (status === 401) return { kind: "auth", message: "Unauthorized (token expired or revoked)." };
  if (status === 429) return { kind: "rate_limit", message: "Rate limited by QBO." };
  if (status >= 500) return { kind: "transient", message: `QBO server error (${status}).` };

  // 4xx with a Fault envelope: { Fault: { Error: [{ Message, Detail, code }], type } }
  const fault = (body as { Fault?: { Error?: Array<{ Message?: string; Detail?: string; code?: string }>; type?: string } })?.Fault;
  const errs = fault?.Error ?? [];
  const text = errs.map((e) => `${e.Message ?? ""} ${e.Detail ?? ""}`).join(" ").toLowerCase();
  const code = errs[0]?.code;
  if (/period.*clos|closed.*period|closing date/.test(text)) {
    return { kind: "period_closed", message: errs[0]?.Detail || errs[0]?.Message || "Accounting period is closed.", code };
  }
  if (fault) return { kind: "validation", message: errs[0]?.Detail || errs[0]?.Message || "QBO validation fault.", code };
  return { kind: "unknown", message: `QBO request failed (${status}).`, code };
}

/** PURE: build the QBO JournalEntry payload. v1 omits CurrencyRef (non-home currency is withheld
 * upstream, so every posted entry is in the company home currency — avoids the multicurrency-required
 * fault). Amounts are rounded to cents; balance is asserted before we ever hit the network. */
export function buildJournalEntryPayload(input: JournalEntryInput): Record<string, unknown> {
  assertBalanced(input.lines);
  return {
    DocNumber: docNumberFor(input.postingKey),
    TxnDate: input.txnDate,
    PrivateNote: input.privateNote ?? input.postingKey,
    Line: input.lines.map((l) => ({
      DetailType: "JournalEntryLineDetail",
      Amount: Math.round(l.amount * 100) / 100,
      ...(l.description ? { Description: l.description } : {}),
      JournalEntryLineDetail: {
        PostingType: l.posting,
        AccountRef: { value: l.accountKey },
      },
    })),
  };
}

export class QboClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;

  constructor(deps?: ClientDeps) {
    this.fetchImpl = deps?.fetchImpl ?? fetch;
    this.sleep = deps?.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.random = deps?.random ?? Math.random;
  }

  private url(ctx: ProviderCallContext, path: string, params: Record<string, string> = {}): string {
    const q = new URLSearchParams({ minorversion: minorVersion(), ...params });
    return `${apiBase(ctx.environment)}/v3/company/${ctx.realmId}/${path}?${q.toString()}`;
  }

  private backoffMs(attempt: number): number {
    const capped = Math.min(BACKOFF_CAP_MS, BASE_BACKOFF_MS * 2 ** attempt);
    return Math.floor(capped * this.random()); // full jitter
  }

  /** One authenticated call with 429/5xx backoff + Fault classification. Retries only rate_limit /
   *  transient; auth/validation/period_closed throw immediately (retrying can't help). */
  async request<T>(
    ctx: ProviderCallContext,
    method: "GET" | "POST",
    path: string,
    opts: { params?: Record<string, string>; body?: unknown } = {},
  ): Promise<T> {
    let lastFault: ProviderFault | undefined;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const res = await this.fetchImpl(this.url(ctx, path, opts.params), {
        method,
        headers: {
          Authorization: `Bearer ${ctx.accessToken}`,
          Accept: "application/json",
          ...(opts.body ? { "Content-Type": "application/json" } : {}),
        },
        ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
        redirect: "error", // SEC-S3
      });
      if (res.ok) return (await res.json()) as T;

      const parsed = await res.json().catch(() => ({}));
      const f = classifyFault(res.status, parsed);
      lastFault = new ProviderFault(f.kind, f.message, f.code, res.status);
      if ((f.kind === "rate_limit" || f.kind === "transient") && attempt < MAX_ATTEMPTS - 1) {
        await this.sleep(this.backoffMs(attempt));
        continue;
      }
      throw lastFault;
    }
    throw lastFault ?? new ProviderFault("unknown", "QBO request exhausted retries.");
  }

  async query<T>(ctx: ProviderCallContext, sql: string): Promise<T> {
    const r = await this.request<{ QueryResponse?: T }>(ctx, "GET", "query", { params: { query: sql } });
    return (r.QueryResponse ?? ({} as T)) as T;
  }

  async getCompanyInfo(ctx: ProviderCallContext): Promise<{ companyName: string; homeCurrency: string; country?: string; multiCurrencyEnabled: boolean }> {
    const info = await this.request<{ CompanyInfo?: { CompanyName?: string; Country?: string } }>(
      ctx,
      "GET",
      `companyinfo/${ctx.realmId}`,
    );
    // Home currency + the multicurrency flag both live in Preferences.CurrencyPrefs. Plan 073 reads
    // MultiCurrencyEnabled at connect (council #2) so a foreign bill is gated EARLY, not at post time.
    let homeCurrency = "USD";
    let multiCurrencyEnabled = false;
    try {
      const prefs = await this.query<{ Preferences?: Array<{ CurrencyPrefs?: { HomeCurrency?: { value?: string }; MultiCurrencyEnabled?: boolean } }> }>(
        ctx,
        "SELECT * FROM Preferences",
      );
      const cp = prefs.Preferences?.[0]?.CurrencyPrefs;
      homeCurrency = cp?.HomeCurrency?.value || "USD";
      multiCurrencyEnabled = cp?.MultiCurrencyEnabled === true;
    } catch {
      // Preferences read is best-effort; a missing value just defaults to USD / multicurrency off.
    }
    return {
      companyName: info.CompanyInfo?.CompanyName ?? "QuickBooks company",
      country: info.CompanyInfo?.Country,
      homeCurrency,
      multiCurrencyEnabled,
    };
  }

  async listAccounts(ctx: ProviderCallContext): Promise<NormalizedAccount[]> {
    // v1: single page (MAXRESULTS 1000). >1000 accounts would need pagination (deferred, noted).
    const r = await this.query<{ Account?: Array<Record<string, unknown>> }>(
      ctx,
      "SELECT * FROM Account WHERE Active = true MAXRESULTS 1000",
    );
    return (r.Account ?? []).map((a) => ({
      accountKey: String(a.Id),
      name: String(a.FullyQualifiedName ?? a.Name ?? ""),
      number: a.AcctNum != null ? String(a.AcctNum) : undefined,
      type: String(a.AccountType ?? ""),
      subType: a.AccountSubType != null ? String(a.AccountSubType) : undefined,
      classification: a.Classification != null ? String(a.Classification) : undefined,
      currency: (a.CurrencyRef as { value?: string })?.value,
      active: a.Active !== false,
    }));
  }

  /** Slice 1: pull EVERY vendor, active + inactive, via QBO's STARTPOSITION/MAXRESULTS paging (1-based
   *  position, 1000/page — the query API's max). Loops until a short page; bounded by MAX_VENDOR_PAGES so a
   *  runaway can't spin forever. Returns raw DisplayNames (the pull strips the Plan-073 " (CUR)" suffix). */
  async listVendors(ctx: ProviderCallContext): Promise<NormalizedVendor[]> {
    const PAGE = 1000;
    const MAX_VENDOR_PAGES = 50; // 50k vendors is far beyond any real winery; a hard backstop
    const out: NormalizedVendor[] = [];
    for (let page = 0; page < MAX_VENDOR_PAGES; page++) {
      const start = page * PAGE + 1; // QBO STARTPOSITION is 1-based
      const r = await this.query<{ Vendor?: Array<Record<string, unknown>> }>(
        ctx,
        `SELECT * FROM Vendor STARTPOSITION ${start} MAXRESULTS ${PAGE}`,
      );
      const rows = r.Vendor ?? [];
      for (const v of rows) {
        out.push({ externalId: String(v.Id), name: String(v.DisplayName ?? ""), active: v.Active !== false });
      }
      if (rows.length < PAGE) break; // last page
    }
    return out;
  }

  async findByDocNumber(
    ctx: ProviderCallContext,
    objectType: QboObjectType,
    docNumber: string,
  ): Promise<PostResult | null> {
    const safe = docNumber.replace(/'/g, "''"); // escape single quotes for the QBO query language
    const r = await this.query<Record<string, Array<{ Id: string; SyncToken: string; DocNumber?: string }>>>(
      ctx,
      `SELECT Id, SyncToken, DocNumber FROM ${objectType} WHERE DocNumber = '${safe}'`,
    );
    const row = r[objectType]?.[0];
    return row ? { externalId: row.Id, version: row.SyncToken, docNumber: row.DocNumber } : null;
  }

  async getById(
    ctx: ProviderCallContext,
    objectType: QboObjectType,
    externalId: string,
  ): Promise<PostResult | null> {
    const safe = externalId.replace(/'/g, "''");
    const r = await this.query<Record<string, Array<{ Id: string; SyncToken: string; DocNumber?: string }>>>(
      ctx,
      `SELECT Id, SyncToken, DocNumber FROM ${objectType} WHERE Id = '${safe}'`,
    );
    const row = r[objectType]?.[0];
    return row ? { externalId: row.Id, version: row.SyncToken, docNumber: row.DocNumber } : null;
  }

  async postJournalEntry(ctx: ProviderCallContext, input: JournalEntryInput, requestId: string): Promise<PostResult> {
    const payload = buildJournalEntryPayload(input);
    const r = await this.request<{ JournalEntry?: { Id: string; SyncToken: string; DocNumber?: string } }>(
      ctx,
      "POST",
      "journalentry",
      { params: { requestid: requestId }, body: payload },
    );
    const je = r.JournalEntry;
    if (!je?.Id) throw new ProviderFault("unknown", "QBO accepted the JournalEntry but returned no Id.");
    return { externalId: je.Id, version: je.SyncToken, docNumber: je.DocNumber };
  }

  /** Find a QBO Vendor by exact display name, else create it. Returns the QBO Vendor.Id. (Unit 10)
   *  Plan 073: when `currency` is given (a foreign, non-home bill), resolve a CURRENCY-SCOPED vendor — a
   *  QBO vendor's currency is fixed at creation and a foreign Bill must reference a vendor whose currency
   *  matches. QBO DisplayName is globally unique per company, so a foreign vendor gets a currency-suffixed
   *  DisplayName ("Acme (EUR)") distinct from the home "Acme", and CurrencyRef pins its currency. The
   *  query-before-create keeps it idempotent (a re-post finds the existing currency-scoped vendor). */
  async findOrCreateVendor(ctx: ProviderCallContext, name: string, currency?: string): Promise<string> {
    const displayName = currency ? `${name} (${currency.toUpperCase()})` : name;
    const safe = displayName.replace(/'/g, "''");
    const found = await this.query<{ Vendor?: Array<{ Id: string }> }>(ctx, `SELECT Id FROM Vendor WHERE DisplayName = '${safe}'`);
    const hit = found.Vendor?.[0]?.Id;
    if (hit) return hit;
    const body: Record<string, unknown> = { DisplayName: displayName };
    if (currency) body.CurrencyRef = { value: currency.toUpperCase() };
    const created = await this.request<{ Vendor?: { Id: string } }>(ctx, "POST", "vendor", { body });
    if (!created.Vendor?.Id) throw new ProviderFault("unknown", "QBO created a Vendor but returned no Id.");
    return created.Vendor.Id;
  }

  async postBill(ctx: ProviderCallContext, payload: Record<string, unknown>, requestId: string): Promise<PostResult> {
    const r = await this.request<{ Bill?: { Id: string; SyncToken: string; DocNumber?: string } }>(ctx, "POST", "bill", { params: { requestid: requestId }, body: payload });
    const bill = r.Bill;
    if (!bill?.Id) throw new ProviderFault("unknown", "QBO accepted the Bill but returned no Id.");
    return { externalId: bill.Id, version: bill.SyncToken, docNumber: bill.DocNumber };
  }

  /** Plan 076: post a BillPayment (settles a Bill from the pay-from account). Zeroes the Bill's balance. */
  async postBillPayment(ctx: ProviderCallContext, payload: Record<string, unknown>, requestId: string): Promise<PostResult> {
    const r = await this.request<{ BillPayment?: { Id: string; SyncToken: string; DocNumber?: string } }>(ctx, "POST", "billpayment", { params: { requestid: requestId }, body: payload });
    const bp = r.BillPayment;
    if (!bp?.Id) throw new ProviderFault("unknown", "QBO accepted the BillPayment but returned no Id.");
    return { externalId: bp.Id, version: bp.SyncToken, docNumber: bp.DocNumber };
  }

  /** Plan 076: read a Bill's outstanding Balance (0 = paid). Null if the Bill is gone (deleted in the GL). */
  async getBillBalance(ctx: ProviderCallContext, externalId: string): Promise<number | null> {
    const safe = externalId.replace(/'/g, "''");
    const r = await this.query<{ Bill?: Array<{ Id: string; Balance?: number }> }>(ctx, `SELECT Id, Balance FROM Bill WHERE Id = '${safe}'`);
    const row = r.Bill?.[0];
    return row ? Number(row.Balance ?? 0) : null;
  }
}

/**
 * The QBO implementation of the provider-neutral AccountingAdapter. OAuth delegates to oauth.ts; the
 * authenticated calls delegate to QboClient. Construct with app config (defaults to env) + deps.
 */
export class QboAdapter implements AccountingAdapter {
  private readonly cfg: QboAppConfig;
  private readonly client: QboClient;
  private readonly oauthDeps: oauth.OAuthDeps;

  constructor(opts?: { config?: QboAppConfig; deps?: ClientDeps }) {
    this.cfg = opts?.config ?? loadQboConfig();
    this.client = new QboClient(opts?.deps);
    this.oauthDeps = { fetchImpl: opts?.deps?.fetchImpl };
  }

  get environment(): ProviderEnvironment {
    return this.cfg.environment;
  }

  buildAuthorizeUrl(input: { scope: string; state: string; redirectUri: string; codeChallenge: string }): string {
    return oauth.buildAuthorizeUrl(this.cfg, input);
  }
  exchangeCode(input: { code: string; redirectUri: string; codeVerifier: string; realmIdHint?: string }): Promise<OAuthTokens> {
    return oauth.exchangeCode(this.cfg, input, this.oauthDeps);
  }
  refresh(refreshToken: string): Promise<OAuthTokens> {
    return oauth.refresh(this.cfg, refreshToken, this.oauthDeps);
  }
  revoke(token: string): Promise<void> {
    return oauth.revoke(this.cfg, token, this.oauthDeps);
  }
  getCompanyInfo(ctx: ProviderCallContext) {
    return this.client.getCompanyInfo(ctx);
  }
  listAccounts(ctx: ProviderCallContext) {
    return this.client.listAccounts(ctx);
  }
  listVendors(ctx: ProviderCallContext) {
    return this.client.listVendors(ctx);
  }
  findByDocNumber(ctx: ProviderCallContext, objectType: QboObjectType, docNumber: string) {
    return this.client.findByDocNumber(ctx, objectType, docNumber);
  }
  getById(ctx: ProviderCallContext, objectType: QboObjectType, externalId: string) {
    return this.client.getById(ctx, objectType, externalId);
  }
  postJournalEntry(ctx: ProviderCallContext, input: JournalEntryInput, requestId: string) {
    return this.client.postJournalEntry(ctx, input, requestId);
  }
  findOrCreateVendor(ctx: ProviderCallContext, name: string, currency?: string) {
    return this.client.findOrCreateVendor(ctx, name, currency);
  }
  postBill(ctx: ProviderCallContext, payload: Record<string, unknown>, requestId: string) {
    return this.client.postBill(ctx, payload, requestId);
  }
  postBillPayment(ctx: ProviderCallContext, payload: Record<string, unknown>, requestId: string) {
    return this.client.postBillPayment(ctx, payload, requestId);
  }
  getBillBalance(ctx: ProviderCallContext, externalId: string) {
    return this.client.getBillBalance(ctx, externalId);
  }
}
