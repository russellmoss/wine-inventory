import { describe, it, expect } from "vitest";
import {
  QboClient,
  QboAdapter,
  classifyFault,
  buildJournalEntryPayload,
  docNumberFor,
} from "@/lib/accounting/qbo/client";
import { toReversalLines, assertBalanced, ProviderFault, type JournalLineInput } from "@/lib/accounting/adapter";
import type { QboAppConfig } from "@/lib/accounting/qbo/config";

// Phase 15 Unit 3 — provider adapter + thin QBO client. All mocked fetch, NO network. Covers: authorize
// URL, code→token parse, rotated refresh, 429 backoff, Fault/period-closed classification, reversal
// swap (positive amounts), and query-before-post by DocNumber.

const CFG: QboAppConfig = {
  clientId: "test-client",
  clientSecret: "test-secret",
  environment: "sandbox",
  redirectUri: "http://localhost:3000/api/accounting/qbo/callback",
};

const CTX = { accessToken: "access-tok", realmId: "9341457394686717", environment: "sandbox" as const };

function res(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

/** A fetch mock that returns queued responses in order and records the URLs it was called with. */
function queuedFetch(responses: Response[]) {
  const calls: string[] = [];
  const fn = (async (url: string) => {
    calls.push(String(url));
    const r = responses.shift();
    if (!r) throw new Error("queuedFetch: no more responses");
    return r;
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const noSleep = async () => {};

describe("authorize URL", () => {
  it("builds a PKCE S256 authorize URL with state + redirect", () => {
    const adapter = new QboAdapter({ config: CFG });
    const url = adapter.buildAuthorizeUrl({
      scope: "com.intuit.quickbooks.accounting",
      state: "nonce123",
      redirectUri: CFG.redirectUri,
      codeChallenge: "chal",
    });
    expect(url.startsWith("https://appcenter.intuit.com/connect/oauth2?")).toBe(true);
    const q = new URL(url).searchParams;
    expect(q.get("client_id")).toBe("test-client");
    expect(q.get("response_type")).toBe("code");
    expect(q.get("state")).toBe("nonce123");
    expect(q.get("code_challenge")).toBe("chal");
    expect(q.get("code_challenge_method")).toBe("S256");
    expect(q.get("redirect_uri")).toBe(CFG.redirectUri);
  });
});

describe("token exchange + refresh", () => {
  it("parses code→token and keeps the realmId hint from the callback", async () => {
    const { fn } = queuedFetch([
      res(200, { access_token: "acc1", refresh_token: "ref1", expires_in: 3600, x_refresh_token_expires_in: 8640000, scope: "accounting" }),
    ]);
    const adapter = new QboAdapter({ config: CFG, deps: { fetchImpl: fn } });
    const t = await adapter.exchangeCode({ code: "authcode", redirectUri: CFG.redirectUri, codeVerifier: "verifier", realmIdHint: "9341457394686717" });
    expect(t.accessToken).toBe("acc1");
    expect(t.refreshToken).toBe("ref1");
    expect(t.expiresInSec).toBe(3600);
    expect(t.refreshTokenExpiresInSec).toBe(8640000);
    expect(t.realmIdHint).toBe("9341457394686717");
  });

  it("refresh returns the ROTATED refresh token", async () => {
    const { fn } = queuedFetch([res(200, { access_token: "acc2", refresh_token: "ref2-rotated", expires_in: 3600 })]);
    const adapter = new QboAdapter({ config: CFG, deps: { fetchImpl: fn } });
    const t = await adapter.refresh("ref1-old");
    expect(t.accessToken).toBe("acc2");
    expect(t.refreshToken).toBe("ref2-rotated");
  });

  it("throws (without leaking the body) when the token endpoint errors", async () => {
    const { fn } = queuedFetch([res(400, { error: "invalid_grant" })]);
    const adapter = new QboAdapter({ config: CFG, deps: { fetchImpl: fn } });
    await expect(adapter.refresh("dead-token")).rejects.toThrow(/invalid_grant/);
  });
});

describe("request backoff + fault classification", () => {
  it("retries a 429 then succeeds", async () => {
    const { fn, calls } = queuedFetch([res(429, {}), res(200, { CompanyInfo: { CompanyName: "Sandbox Company US 115b" } })]);
    const client = new QboClient({ fetchImpl: fn, sleep: noSleep, random: () => 0 });
    const body = await client.request<{ CompanyInfo: { CompanyName: string } }>(CTX, "GET", "companyinfo/1");
    expect(body.CompanyInfo.CompanyName).toBe("Sandbox Company US 115b");
    expect(calls).toHaveLength(2);
  });

  it("classifies a closed-period fault", () => {
    const f = classifyFault(400, { Fault: { Error: [{ Message: "Business Validation Error", Detail: "The account period is closed for the date entered", code: "6210" }] } });
    expect(f.kind).toBe("period_closed");
  });

  it("classifies 401 as auth and 500 as transient", () => {
    expect(classifyFault(401, {}).kind).toBe("auth");
    expect(classifyFault(500, {}).kind).toBe("transient");
    expect(classifyFault(400, { Fault: { Error: [{ Message: "bad", Detail: "unbalanced" }] } }).kind).toBe("validation");
  });

  it("throws a typed ProviderFault on a closed period (no retry)", async () => {
    const { fn, calls } = queuedFetch([res(400, { Fault: { Error: [{ Detail: "The account period is closed" }] } })]);
    const client = new QboClient({ fetchImpl: fn, sleep: noSleep, random: () => 0 });
    await expect(client.request(CTX, "POST", "journalentry", { body: {} })).rejects.toMatchObject({ kind: "period_closed" });
    expect(calls).toHaveLength(1); // not retried
  });

  it("gives up on a persistent 5xx as a transient fault", async () => {
    const { fn, calls } = queuedFetch([res(503, {}), res(503, {}), res(503, {}), res(503, {}), res(503, {})]);
    const client = new QboClient({ fetchImpl: fn, sleep: noSleep, random: () => 0 });
    await expect(client.request(CTX, "GET", "companyinfo/1")).rejects.toBeInstanceOf(ProviderFault);
    expect(calls).toHaveLength(5); // MAX_ATTEMPTS
  });
});

describe("reversal + balanced journals", () => {
  const lines: JournalLineInput[] = [
    { amount: 300, posting: "Debit", accountKey: "5000" },
    { amount: 300, posting: "Credit", accountKey: "1400" },
  ];

  it("swaps debit/credit and keeps amounts positive", () => {
    const rev = toReversalLines(lines);
    expect(rev[0]).toMatchObject({ posting: "Credit", accountKey: "5000", amount: 300 });
    expect(rev[1]).toMatchObject({ posting: "Debit", accountKey: "1400", amount: 300 });
    expect(() => assertBalanced(rev)).not.toThrow();
  });

  it("builds a JE payload with positive amounts + swapped posting on reversal", () => {
    const payload = buildJournalEntryPayload({ postingKey: "cogs:r1:s1:-:FRUIT:rev", txnDate: "2026-07-02", currency: "USD", lines: toReversalLines(lines) });
    const linesOut = payload.Line as Array<{ Amount: number; JournalEntryLineDetail: { PostingType: string; AccountRef: { value: string } } }>;
    expect(linesOut[0].JournalEntryLineDetail.PostingType).toBe("Credit");
    expect(linesOut[0].Amount).toBe(300);
    expect(payload.DocNumber).toBe(docNumberFor("cogs:r1:s1:-:FRUIT:rev"));
  });

  it("refuses an unbalanced journal before hitting the network", () => {
    expect(() => buildJournalEntryPayload({ postingKey: "k", txnDate: "2026-07-02", currency: "USD", lines: [{ amount: 300, posting: "Debit", accountKey: "5000" }, { amount: 250, posting: "Credit", accountKey: "1400" }] })).toThrow(/balanced/);
  });

  it("refuses a negative amount", () => {
    expect(() => assertBalanced([{ amount: -1, posting: "Debit", accountKey: "x" }])).toThrow(/positive/);
  });
});

describe("query-before-post + docNumber", () => {
  it("finds an existing object by DocNumber and returns its Id + SyncToken", async () => {
    const { fn } = queuedFetch([res(200, { QueryResponse: { JournalEntry: [{ Id: "42", SyncToken: "0", DocNumber: "abc" }] } })]);
    const client = new QboClient({ fetchImpl: fn });
    const found = await client.findByDocNumber(CTX, "JournalEntry", "abc");
    expect(found).toEqual({ externalId: "42", version: "0", docNumber: "abc" });
  });

  it("returns null when no object has that DocNumber", async () => {
    const { fn } = queuedFetch([res(200, { QueryResponse: {} })]);
    const client = new QboClient({ fetchImpl: fn });
    expect(await client.findByDocNumber(CTX, "JournalEntry", "nope")).toBeNull();
  });

  it("docNumberFor is deterministic and <= 21 chars", () => {
    expect(docNumberFor("cogs:run1:sku1:-:FRUIT")).toBe(docNumberFor("cogs:run1:sku1:-:FRUIT"));
    expect(docNumberFor("cogs:run1:sku1:-:FRUIT").length).toBeLessThanOrEqual(21);
  });
});
