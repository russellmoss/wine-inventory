import { describe, it, expect } from "vitest";
import { QboClient } from "@/lib/accounting/qbo/client";
import type { ProviderCallContext } from "@/lib/accounting/adapter";

// Plan 073 Unit 6 — the QBO vendor resolver is CURRENCY-SCOPED for a foreign bill. A QBO vendor's currency
// is fixed at creation and a foreign Bill must reference a currency-matching vendor, so a foreign vendor gets
// a currency-suffixed DisplayName ("Acme (EUR)") + CurrencyRef, distinct from the home "Acme". Query-before-
// create keeps it idempotent. We drive the real QboClient with a stubbed fetch and inspect the QBO calls.

const ctx: ProviderCallContext = { accessToken: "tok", realmId: "realm1", environment: "sandbox" };

/** A stub QBO endpoint. `vendorsByDisplayName` seeds already-existing vendors; records every POST body. */
function stub(vendorsByDisplayName: Record<string, string> = {}) {
  const posts: Array<{ path: string; body: unknown }> = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    if (u.pathname.endsWith("/query")) {
      const q = u.searchParams.get("query") ?? "";
      const m = q.match(/DisplayName = '(.+)'/);
      const name = m ? m[1].replace(/''/g, "'") : "";
      const id = vendorsByDisplayName[name];
      return { ok: true, status: 200, json: async () => ({ QueryResponse: id ? { Vendor: [{ Id: id }] } : {} }) } as unknown as Response;
    }
    if (u.pathname.endsWith("/vendor")) {
      const body = init?.body ? JSON.parse(init.body as string) : {};
      posts.push({ path: "vendor", body });
      return { ok: true, status: 200, json: async () => ({ Vendor: { Id: "NEW-1" } }) } as unknown as Response;
    }
    return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
  }) as unknown as typeof fetch;
  return { client: new QboClient({ fetchImpl }), posts };
}

describe("findOrCreateVendor — currency-scoped (Plan 073)", () => {
  it("creates a foreign vendor with a currency-suffixed DisplayName + CurrencyRef", async () => {
    const { client, posts } = stub();
    const id = await client.findOrCreateVendor(ctx, "Acme", "EUR");
    expect(id).toBe("NEW-1");
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toEqual({ DisplayName: "Acme (EUR)", CurrencyRef: { value: "EUR" } });
  });

  it("does NOT reuse the home (USD) vendor of the same name for a EUR bill — it creates a distinct EUR vendor", async () => {
    // "Acme" (home) already exists; the EUR lookup is for "Acme (EUR)" which does NOT, so a new one is made.
    const { client, posts } = stub({ Acme: "HOME-USD-7" });
    const id = await client.findOrCreateVendor(ctx, "Acme", "EUR");
    expect(id).toBe("NEW-1"); // not HOME-USD-7
    expect(posts[0].body).toEqual({ DisplayName: "Acme (EUR)", CurrencyRef: { value: "EUR" } });
  });

  it("is idempotent — an existing currency-scoped vendor is reused, not duplicated", async () => {
    const { client, posts } = stub({ "Acme (EUR)": "EUR-VENDOR-9" });
    const id = await client.findOrCreateVendor(ctx, "Acme", "EUR");
    expect(id).toBe("EUR-VENDOR-9");
    expect(posts).toHaveLength(0); // no create — found the existing EUR vendor
  });

  it("home-currency path (no currency arg) is unchanged — plain DisplayName, no CurrencyRef", async () => {
    const { client, posts } = stub();
    const id = await client.findOrCreateVendor(ctx, "Acme");
    expect(id).toBe("NEW-1");
    expect(posts[0].body).toEqual({ DisplayName: "Acme" });
  });
});
