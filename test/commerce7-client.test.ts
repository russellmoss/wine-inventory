import { describe, it, expect } from "vitest";
import {
  Commerce7Client,
  classifyFault,
  centsToMajor,
  normalizeOrder,
  normalizeProduct,
} from "@/lib/commerce/commerce7/client";
import { RateBudget } from "@/lib/commerce/rate-budget";
import { CommerceFault, type ProviderCallContext } from "@/lib/commerce/adapter";
import { createMockCommerceAdapter, emptyMockState } from "@/lib/commerce/mock";

// Phase 16 Unit 2 — Commerce7 client + adapter, all mocked fetch, NO network. Covers: fault
// classification, cents→major + UTC normalization, cursor paging, Basic Auth + tenant header,
// Retry-After backoff, additive-adjust semantics, and rate-budget throttling.

const CTX: ProviderCallContext = { appId: "app-123", secretKey: "sek-shh", tenantSlug: "demo-winery", environment: "sandbox" };

function res(status: number, body: unknown, headers?: Record<string, string>): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers?.[k.toLowerCase()] ?? null },
    json: async () => body,
  } as unknown as Response;
}

function queuedFetch(responses: Response[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    const r = responses.shift();
    if (!r) throw new Error("queuedFetch: no more responses");
    return r;
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const noSleep = async () => {};
const fastBudget = () => new RateBudget(100000, { now: () => 0, sleep: noSleep });

describe("classifyFault", () => {
  it("maps HTTP status to provider-neutral kinds", () => {
    expect(classifyFault(401).kind).toBe("auth");
    expect(classifyFault(403).kind).toBe("auth");
    expect(classifyFault(404).kind).toBe("not_found");
    expect(classifyFault(429).kind).toBe("rate_limit");
    expect(classifyFault(500).kind).toBe("transient");
    expect(classifyFault(422).kind).toBe("validation");
  });
});

describe("centsToMajor", () => {
  it("converts cents to dollars, defensive on null", () => {
    expect(centsToMajor(1999)).toBe(19.99);
    expect(centsToMajor(0)).toBe(0);
    expect(centsToMajor(null)).toBe(0);
    expect(centsToMajor(undefined)).toBe(0);
  });
});

describe("normalizeOrder", () => {
  it("normalizes cents→major, keeps ONLY the opaque customer id (no PII)", () => {
    const o = normalizeOrder({
      id: "ord_1",
      orderNumber: 1042,
      customer: { id: "cust_9" },
      channel: "DTC",
      paymentStatus: "Paid",
      currencyCode: "USD",
      createdAt: "2026-07-01T10:00:00.000Z",
      updatedAt: "2026-07-01T12:00:00.000Z",
      paidAt: "2026-07-01T10:05:00.000Z",
      items: [{ productVariantId: "var_1", productId: "prod_1", sku: "PN-2022", quantity: 2, price: 4500, tax: 720, totalAfterDiscount: 9000, inventoryLocationId: "loc_1" }],
      subTotal: 9000,
      totalTax: 720,
      shipTotal: 1500,
      promotionTotal: 500,
      total: 10720,
    });
    expect(o.orderId).toBe("ord_1");
    expect(o.orderNumber).toBe("1042");
    expect(o.customerId).toBe("cust_9");
    expect(o).not.toHaveProperty("customerName");
    expect(o.paymentStatus).toBe("Paid");
    expect(o.subtotal).toBe(90);
    expect(o.tax).toBe(7.2);
    expect(o.shipping).toBe(15);
    expect(o.discount).toBe(5);
    expect(o.total).toBe(107.2);
    expect(o.lines[0]).toMatchObject({ skuRef: "var_1", quantity: 2, unitPrice: 45, tax: 7.2, lineSubtotal: 90, inventoryLocationId: "loc_1" });
    expect(o.paidAt).toBe("2026-07-01T10:05:00.000Z");
  });
});

describe("normalizeProduct", () => {
  it("flattens variants × per-location inventory", () => {
    const p = normalizeProduct({
      id: "prod_1",
      title: "Pinot Noir",
      variants: [{ id: "var_1", sku: "PN-2022", price: 4500, inventory: [{ inventoryLocationId: "loc_1", availableForSaleCount: 120 }, { inventoryLocationId: "loc_2", availableForSaleCount: 5 }] }],
    });
    expect(p.variants).toHaveLength(2);
    expect(p.variants[0]).toMatchObject({ variantId: "var_1", inventoryLocationId: "loc_1", availableForSaleCount: 120, price: 45 });
    expect(p.variants[1].inventoryLocationId).toBe("loc_2");
  });
});

describe("Commerce7Client.request", () => {
  it("sends Basic Auth + tenant header, no redirect", async () => {
    const { fn, calls } = queuedFetch([res(200, { orders: [] })]);
    const client = new Commerce7Client({ fetchImpl: fn, sleep: noSleep, rateBudget: fastBudget() });
    await client.listOrdersSince(CTX, null);
    const init = calls[0].init as RequestInit & { headers: Record<string, string> };
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from("app-123:sek-shh").toString("base64")}`);
    expect(init.headers.tenant).toBe("demo-winery");
    expect(init.redirect).toBe("error");
  });

  it("retries 429 honoring Retry-After, then succeeds", async () => {
    const waits: number[] = [];
    const sleep = async (ms: number) => { waits.push(ms); };
    const { fn } = queuedFetch([res(429, {}, { "retry-after": "2" }), res(200, { orders: [] })]);
    const client = new Commerce7Client({ fetchImpl: fn, sleep, rateBudget: fastBudget() });
    await client.listOrdersSince(CTX, null);
    expect(waits[0]).toBe(2000); // honored Retry-After (seconds → ms)
  });

  it("throws a classified auth fault on 401 (no retry)", async () => {
    const { fn, calls } = queuedFetch([res(401, {})]);
    const client = new Commerce7Client({ fetchImpl: fn, sleep: noSleep, rateBudget: fastBudget() });
    await expect(client.listOrdersSince(CTX, null)).rejects.toMatchObject({ kind: "auth" });
    expect(calls).toHaveLength(1);
  });

  it("getOrder returns null on 404 (drop a fake webhook id)", async () => {
    const { fn } = queuedFetch([res(404, {})]);
    const client = new Commerce7Client({ fetchImpl: fn, sleep: noSleep, rateBudget: fastBudget() });
    expect(await client.getOrder(CTX, "ghost")).toBeNull();
  });

  it("cursor paging: a full page advances the cursor, a short page ends it", async () => {
    const full = Array.from({ length: 50 }, (_, i) => ({ id: `o${i}`, paymentStatus: "Paid", updatedAt: "2026-07-01T00:00:00.000Z" }));
    const { fn } = queuedFetch([res(200, { orders: full }), res(200, { orders: [{ id: "tail", paymentStatus: "Paid", updatedAt: "2026-07-02T00:00:00.000Z" }] })]);
    const client = new Commerce7Client({ fetchImpl: fn, sleep: noSleep, rateBudget: fastBudget() });
    const p1 = await client.listOrdersSince(CTX, { updatedAtGte: "2026-07-01T00:00:00.000Z", page: 1 });
    expect(p1.orders).toHaveLength(50);
    expect(p1.nextCursor).toMatchObject({ page: 2 });
    const p2 = await client.listOrdersSince(CTX, p1.nextCursor);
    expect(p2.nextCursor).toBeNull();
  });
});

describe("RateBudget", () => {
  it("throttles once the bucket empties, refilling over time", async () => {
    let t = 0;
    const waits: number[] = [];
    const budget = new RateBudget(60, { now: () => t, sleep: async (ms) => { waits.push(ms); t += ms; } }); // 60/min = 1/sec
    for (let i = 0; i < 60; i++) await budget.acquire("k"); // drain the full bucket, no wait
    expect(waits).toHaveLength(0);
    await budget.acquire("k"); // 61st must wait ~1s for a refill
    expect(waits.length).toBeGreaterThan(0);
    expect(waits[0]).toBeGreaterThanOrEqual(1000);
  });

  it("buckets are per-key (per tenant slug)", async () => {
    const budget = new RateBudget(1, { now: () => 0, sleep: noSleep });
    await budget.acquire("a"); // drains a's single token
    // b has its own token — resolves without the injected sleep advancing time (would loop forever if shared)
    await expect(Promise.race([budget.acquire("b"), new Promise((_, rej) => setTimeout(() => rej(new Error("blocked")), 50))])).resolves.toBeUndefined();
  });
});

describe("mock adapter", () => {
  it("records additive adjust calls and mutates inventory", async () => {
    const state = emptyMockState();
    state.inventory.set("var_1:loc_1", 10);
    const mock = createMockCommerceAdapter(state);
    await mock.adjustInventory(CTX, "var_1", "loc_1", 6);
    expect(state.adjustCalls).toEqual([{ variantId: "var_1", locationId: "loc_1", delta: 6 }]);
    expect(await mock.getVariantInventory(CTX, "var_1", "loc_1")).toBe(16);
  });

  it("crashOnce throws a transient fault exactly once", async () => {
    const state = emptyMockState();
    state.crashOnce = new Set(["adjust:var_1:loc_1"]);
    const mock = createMockCommerceAdapter(state);
    await expect(mock.adjustInventory(CTX, "var_1", "loc_1", 1)).rejects.toBeInstanceOf(CommerceFault);
    await mock.adjustInventory(CTX, "var_1", "loc_1", 1); // second call succeeds
    expect(state.adjustCalls).toHaveLength(1);
  });
});
