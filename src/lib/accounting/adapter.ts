// Phase 15 Unit 3 — the provider-neutral accounting adapter. QBO is the only implementation in v1,
// but every type here is Xero-ready: we normalize QBO's Account.Id / RequestId / SyncToken (and
// Xero's AccountCode / Idempotency-Key / opaque version) behind `accountKey` / `idempotencyKey` /
// `version`, and express journals as debit/credit lines with POSITIVE amounts (QBO rejects negative
// JE lines; Xero uses signed amounts, which the Xero adapter would derive from posting+amount). No
// QBO specifics leak into these types — that is the point.

import type { ProviderEnvironment } from "@/lib/accounting/qbo/config";

export type { ProviderEnvironment };

/** The OAuth token set returned by exchange/refresh. `realmId` is a callback HINT only (SEC-C2). */
export type OAuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
  refreshTokenExpiresInSec?: number;
  scope?: string;
  /** Present on exchange (from the callback), absent on refresh. Treat as a hint, verify canonically. */
  realmIdHint?: string;
};

/** The minimum a call needs: a live access token + which company + which environment. */
export type ProviderCallContext = {
  accessToken: string;
  realmId: string;
  environment: ProviderEnvironment;
};

/** A chart-of-accounts entry, normalized. `accountKey` is the opaque id we persist in AccountMapping. */
export type NormalizedAccount = {
  accountKey: string; // QBO Account.Id (Xero: Account.Code)
  name: string; // FullyQualifiedName / AcctNum-qualified name
  number?: string; // AcctNum
  type: string; // AccountType (e.g. "Cost of Goods Sold")
  subType?: string; // AccountSubType
  classification?: string; // "Asset" | "Expense" | "Liability" | ...
  currency?: string;
  active: boolean;
};

export type Posting = "Debit" | "Credit";

/** One balanced-journal line. Amount is ALWAYS positive; direction is `posting`. */
export type JournalLineInput = {
  amount: number;
  posting: Posting;
  accountKey: string;
  description?: string;
};

export type JournalEntryInput = {
  /** our idempotency root; becomes DocNumber (shortened) + PrivateNote. */
  postingKey: string;
  txnDate: string; // YYYY-MM-DD
  currency: string;
  privateNote?: string;
  lines: JournalLineInput[];
};

/** The result of a successful post (or an adopted existing object found by query-before-post). */
export type PostResult = {
  externalId: string; // QBO object Id (Xero: the object's opaque Id)
  version: string; // QBO SyncToken (Xero: opaque version) — read-before-write for updates
  docNumber?: string;
};

/** A classified provider error. The poster (Unit 8) branches on `kind`, not on raw QBO fault codes. */
export type ProviderFaultKind =
  | "period_closed" // post the reversal to the current open period instead (U11)
  | "validation" // our payload is wrong (unbalanced, bad account) — do not blindly retry
  | "auth" // 401 / invalid_grant — needs a fresh token / NEEDS_REAUTH (U5)
  | "rate_limit" // 429 — backoff (handled internally, surfaced if it persists)
  | "transient" // 5xx / network — safe to retry, may leave a VERIFYING gap
  | "unknown";

export class ProviderFault extends Error {
  constructor(
    readonly kind: ProviderFaultKind,
    message: string,
    readonly code?: string,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "ProviderFault";
  }
}

/**
 * Turn a set of journal lines into their REVERSAL: swap Debit<->Credit, keep amounts POSITIVE (QBO
 * rejects negative JE line amounts, so a reversal is a mirror-image entry, not a negated one — D6/U11).
 * Pure + provider-neutral; the Xero adapter re-signs from posting at build time.
 */
export function toReversalLines(lines: JournalLineInput[]): JournalLineInput[] {
  return lines.map((l) => ({ ...l, posting: l.posting === "Debit" ? "Credit" : "Debit" }));
}

/** Assert a journal is balanced (sum of debits == sum of credits) with only positive amounts. */
export function assertBalanced(lines: JournalLineInput[]): void {
  let debit = 0;
  let credit = 0;
  for (const l of lines) {
    if (!(l.amount > 0)) throw new Error(`Journal line amount must be positive (got ${l.amount}).`);
    if (l.posting === "Debit") debit += l.amount;
    else credit += l.amount;
  }
  // Compare in integer cents to avoid float drift.
  if (Math.round(debit * 100) !== Math.round(credit * 100)) {
    throw new Error(`Journal is not balanced: debits ${debit} != credits ${credit}.`);
  }
}

/** The provider-neutral surface. QBO implements it; a Xero adapter would drop in behind the same shape. */
export interface AccountingAdapter {
  buildAuthorizeUrl(input: {
    scope: string;
    state: string;
    redirectUri: string;
    codeChallenge: string;
  }): string;
  exchangeCode(input: { code: string; redirectUri: string; codeVerifier: string; realmIdHint?: string }): Promise<OAuthTokens>;
  refresh(refreshToken: string): Promise<OAuthTokens>;
  revoke(token: string): Promise<void>;

  /** Canonical company id + display name + home currency, from a trusted endpoint (SEC-C2). */
  getCompanyInfo(ctx: ProviderCallContext): Promise<{ companyName: string; homeCurrency: string; country?: string }>;
  listAccounts(ctx: ProviderCallContext): Promise<NormalizedAccount[]>;
  /** Query-before-post: find an already-posted object by our idempotency DocNumber. Null if none. */
  findByDocNumber(ctx: ProviderCallContext, objectType: "JournalEntry" | "Bill", docNumber: string): Promise<PostResult | null>;
  postJournalEntry(ctx: ProviderCallContext, input: JournalEntryInput, requestId: string): Promise<PostResult>;
}
