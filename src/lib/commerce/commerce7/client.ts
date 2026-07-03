// Phase 16 Unit 2 — the thin Commerce7 v1 REST client + the Commerce7Adapter (implements the
// provider-neutral CommerceAdapter). Basic Auth (App ID:Secret Key) + a `tenant:` header, its OWN
// 429/5xx backoff that HONORS Retry-After, cursor/offset paging, a per-tenant RateBudget shared across
// all call sites, `redirect: "error"`, a hardcoded api.commerce7.com egress, cents→major-units + UTC
// normalization, and NEVER logs credentials. Node runtime (Buffer). The pure classify/normalize helpers
// are exported for unit tests.
//
// Money is in CENTS on the wire (research); timestamps are UTC. Several endpoints/fields are unconfirmed
// until the Unit-0 sandbox pass — each is isolated here and flagged. Sources:
// developer.commerce7.com/docs/{commerce7-apis,app-apis-webhooks}.

import { COMMERCE7_API_BASE, type Commerce7AppConfig, loadCommerce7Config } from "@/lib/commerce/commerce7/config";
import { RateBudget, sharedRateBudget } from "@/lib/commerce/rate-budget";
import {
  CommerceFault,
  type CommerceAdapter,
  type CommerceFaultKind,
  type PageCursor,
  type ProviderCallContext,
  type ProviderOrder,
  type ProviderOrderLine,
  type ProviderProduct,
} from "@/lib/commerce/adapter";

export type ClientDeps = {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  rateBudget?: RateBudget;
};

const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 500;
const BACKOFF_CAP_MS = 8000;
const PAGE_SIZE = 50; // Commerce7 default; past page 100 is throttled → bounded batches + cursor.

/** cents (integer) → major units (dollars), rounded to cents. Defensive against null/undefined. */
export function centsToMajor(cents: unknown): number {
  const n = typeof cents === "number" ? cents : Number(cents ?? 0);
  return Math.round(n) / 100;
}

/** PURE: classify an HTTP status into a provider-neutral fault kind. */
export function classifyFault(status: number): { kind: CommerceFaultKind; message: string } {
  if (status === 401 || status === 403) return { kind: "auth", message: `Commerce7 rejected the app credentials (${status}).` };
  if (status === 404) return { kind: "not_found", message: "Commerce7 resource not found (404)." };
  if (status === 429) return { kind: "rate_limit", message: "Rate limited by Commerce7 (429)." };
  if (status >= 500) return { kind: "transient", message: `Commerce7 server error (${status}).` };
  if (status >= 400) return { kind: "validation", message: `Commerce7 rejected the request (${status}).` };
  return { kind: "unknown", message: `Commerce7 request failed (${status}).` };
}

// ── Raw wire shapes (best-effort; confirmed in Unit 0, isolated here) ──
type RawOrderItem = {
  productVariantId?: string;
  variantId?: string;
  productId?: string;
  sku?: string;
  quantity?: number;
  price?: number; // cents
  tax?: number; // cents
  totalAfterDiscount?: number; // cents
  inventoryLocationId?: string;
};
type RawOrder = {
  id: string;
  orderNumber?: number | string;
  customer?: { id?: string };
  customerId?: string;
  channel?: string;
  paymentStatus?: string;
  fulfillmentStatus?: string;
  currencyCode?: string;
  updatedAt?: string;
  createdAt?: string;
  paidAt?: string;
  items?: RawOrderItem[];
  subTotal?: number; // cents
  totalTax?: number; // cents
  shipTotal?: number; // cents
  promotionTotal?: number; // cents (discount)
  total?: number; // cents
};

/** PURE: normalize a raw Commerce7 order into a provider-neutral order (major units, ISO UTC, NO PII). */
export function normalizeOrder(raw: RawOrder): ProviderOrder {
  const lines: ProviderOrderLine[] = (raw.items ?? []).map((it) => ({
    skuRef: String(it.productVariantId ?? it.variantId ?? it.sku ?? ""),
    externalProductId: it.productId,
    sku: it.sku,
    inventoryLocationId: it.inventoryLocationId,
    quantity: Number(it.quantity ?? 0),
    unitPrice: centsToMajor(it.price),
    lineSubtotal: centsToMajor(it.totalAfterDiscount ?? (it.price ?? 0) * (it.quantity ?? 0)),
    tax: centsToMajor(it.tax),
    discount: 0,
  }));
  const occurredAt = raw.createdAt ?? raw.updatedAt ?? new Date(0).toISOString();
  return {
    orderId: raw.id,
    orderNumber: raw.orderNumber != null ? String(raw.orderNumber) : undefined,
    customerId: raw.customer?.id ?? raw.customerId, // OPAQUE id only (D19)
    channel: raw.channel,
    paymentStatus: raw.paymentStatus ?? "Unknown",
    fulfillmentStatus: raw.fulfillmentStatus,
    currency: raw.currencyCode ?? "USD",
    updatedAt: raw.updatedAt ?? occurredAt,
    occurredAt,
    paidAt: raw.paidAt,
    lines,
    subtotal: centsToMajor(raw.subTotal),
    tax: centsToMajor(raw.totalTax),
    shipping: centsToMajor(raw.shipTotal),
    discount: centsToMajor(raw.promotionTotal),
    total: centsToMajor(raw.total),
  };
}

type RawVariant = { id: string; sku?: string; title?: string; price?: number; inventory?: Array<{ inventoryLocationId?: string; availableForSaleCount?: number }> };
type RawProduct = { id: string; title?: string; variants?: RawVariant[] };

/** PURE: normalize a raw Commerce7 product (variants carry per-location inventory). */
export function normalizeProduct(raw: RawProduct): ProviderProduct {
  const variants = (raw.variants ?? []).flatMap((v) =>
    (v.inventory ?? [{}]).map((inv) => ({
      productId: raw.id,
      variantId: v.id,
      sku: v.sku ?? "",
      title: v.title,
      price: centsToMajor(v.price),
      inventoryLocationId: String(inv.inventoryLocationId ?? ""),
      availableForSaleCount: Number(inv.availableForSaleCount ?? 0),
    })),
  );
  return { productId: raw.id, title: raw.title ?? "", variants };
}

export class Commerce7Client {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly rateBudget: RateBudget;

  constructor(deps?: ClientDeps) {
    this.fetchImpl = deps?.fetchImpl ?? fetch;
    this.sleep = deps?.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.random = deps?.random ?? Math.random;
    this.rateBudget = deps?.rateBudget ?? sharedRateBudget();
  }

  private authHeader(ctx: ProviderCallContext): string {
    return `Basic ${Buffer.from(`${ctx.appId}:${ctx.secretKey}`).toString("base64")}`;
  }

  private backoffMs(attempt: number, retryAfterSec?: number): number {
    if (retryAfterSec && retryAfterSec > 0) return Math.min(BACKOFF_CAP_MS * 4, retryAfterSec * 1000);
    const capped = Math.min(BACKOFF_CAP_MS, BASE_BACKOFF_MS * 2 ** attempt);
    return Math.floor(capped * this.random()); // full jitter
  }

  /** One authenticated call: rate-budgeted, Basic Auth + `tenant:` header, 429/5xx backoff honoring
   *  Retry-After, no redirect following (SEC), never logs creds. Retries only rate_limit/transient. */
  async request<T>(
    ctx: ProviderCallContext,
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    opts: { params?: Record<string, string>; body?: unknown } = {},
  ): Promise<T> {
    const q = opts.params ? `?${new URLSearchParams(opts.params).toString()}` : "";
    const url = `${COMMERCE7_API_BASE}/${path}${q}`;
    let lastFault: CommerceFault | undefined;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      await this.rateBudget.acquire(ctx.tenantSlug);
      const res = await this.fetchImpl(url, {
        method,
        headers: {
          Authorization: this.authHeader(ctx),
          tenant: ctx.tenantSlug,
          Accept: "application/json",
          ...(opts.body ? { "Content-Type": "application/json" } : {}),
        },
        ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
        redirect: "error",
      });
      if (res.status === 204) return undefined as T;
      if (res.ok) return (await res.json().catch(() => ({}))) as T;

      const f = classifyFault(res.status);
      lastFault = new CommerceFault(f.kind, f.message, res.status);
      if ((f.kind === "rate_limit" || f.kind === "transient") && attempt < MAX_ATTEMPTS - 1) {
        const retryAfter = Number(res.headers?.get?.("retry-after")) || undefined;
        await this.sleep(this.backoffMs(attempt, retryAfter));
        continue;
      }
      throw lastFault;
    }
    throw lastFault ?? new CommerceFault("unknown", "Commerce7 request exhausted retries.");
  }

  async listOrdersSince(ctx: ProviderCallContext, cursor: PageCursor): Promise<{ orders: ProviderOrder[]; nextCursor: PageCursor }> {
    const page = cursor?.page ?? 1;
    const params: Record<string, string> = { page: String(page) };
    if (cursor?.updatedAtGte) params.updatedAt = `gte:${cursor.updatedAtGte}`;
    const r = await this.request<{ orders?: RawOrder[] }>(ctx, "GET", "order", { params });
    const raw = r.orders ?? [];
    const orders = raw.map(normalizeOrder);
    // A full page implies more; advance the page, keep the same updatedAt floor (overlap handled upstream).
    const nextCursor = raw.length >= PAGE_SIZE ? { updatedAtGte: cursor?.updatedAtGte, page: page + 1 } : null;
    return { orders, nextCursor };
  }

  async getOrder(ctx: ProviderCallContext, orderId: string): Promise<ProviderOrder | null> {
    try {
      const raw = await this.request<RawOrder>(ctx, "GET", `order/${encodeURIComponent(orderId)}`);
      return raw && raw.id ? normalizeOrder(raw) : null;
    } catch (e) {
      if (e instanceof CommerceFault && e.kind === "not_found") return null;
      throw e;
    }
  }

  async listProducts(ctx: ProviderCallContext, cursor: PageCursor): Promise<{ products: ProviderProduct[]; nextCursor: PageCursor }> {
    const page = cursor?.page ?? 1;
    const r = await this.request<{ products?: RawProduct[] }>(ctx, "GET", "product", { params: { page: String(page) } });
    const raw = r.products ?? [];
    const products = raw.map(normalizeProduct);
    const nextCursor = raw.length >= PAGE_SIZE ? { page: page + 1 } : null;
    return { products, nextCursor };
  }

  async getVariantInventory(ctx: ProviderCallContext, variantId: string, locationId: string): Promise<number | null> {
    try {
      const r = await this.request<{ inventory?: Array<{ inventoryLocationId?: string; availableForSaleCount?: number }> }>(
        ctx,
        "GET",
        `product-variant/${encodeURIComponent(variantId)}/inventory`,
      );
      const row = (r.inventory ?? []).find((i) => String(i.inventoryLocationId) === locationId);
      return row ? Number(row.availableForSaleCount ?? 0) : null;
    } catch (e) {
      if (e instanceof CommerceFault && e.kind === "not_found") return null;
      throw e;
    }
  }

  /** ADDITIVE inventory adjustment (delta), the ONLY outbound write. Exact endpoint confirmed in Unit 0;
   *  isolated here so a change is one edit. Never an absolute reset (would race an oversell). */
  async adjustInventory(ctx: ProviderCallContext, variantId: string, locationId: string, delta: number): Promise<void> {
    await this.request(ctx, "POST", `product-variant/${encodeURIComponent(variantId)}/inventory`, {
      body: { type: "Adjustment", inventoryLocationId: locationId, quantity: delta },
    });
  }

  async getCustomerRef(ctx: ProviderCallContext, id: string): Promise<{ id: string } | null> {
    try {
      const r = await this.request<{ id?: string }>(ctx, "GET", `customer/${encodeURIComponent(id)}`);
      return r?.id ? { id: r.id } : null; // opaque id ONLY — never keep name/email (D19)
    } catch (e) {
      if (e instanceof CommerceFault && e.kind === "not_found") return null;
      throw e;
    }
  }

  async createWebhook(ctx: ProviderCallContext, input: { deliveryUrl: string; topics: string[] }): Promise<{ webhookId: string }> {
    const r = await this.request<{ id?: string }>(ctx, "POST", "webhook", {
      body: { deliveryUrl: input.deliveryUrl, objectType: "Order", action: input.topics },
    });
    if (!r?.id) throw new CommerceFault("unknown", "Commerce7 created a webhook but returned no id.");
    return { webhookId: r.id };
  }

  async deleteWebhook(ctx: ProviderCallContext, webhookId: string): Promise<void> {
    await this.request(ctx, "DELETE", `webhook/${encodeURIComponent(webhookId)}`);
  }

  async getWebhook(ctx: ProviderCallContext, webhookId: string): Promise<{ id: string; active: boolean } | null> {
    try {
      const r = await this.request<{ id?: string; disabled?: boolean }>(ctx, "GET", `webhook/${encodeURIComponent(webhookId)}`);
      return r?.id ? { id: r.id, active: r.disabled !== true } : null;
    } catch (e) {
      if (e instanceof CommerceFault && e.kind === "not_found") return null;
      throw e;
    }
  }
}

/** The Commerce7 implementation of the provider-neutral CommerceAdapter. Thin pass-through to the client. */
export class Commerce7Adapter implements CommerceAdapter {
  private readonly client: Commerce7Client;
  constructor(_opts?: { config?: Commerce7AppConfig; deps?: ClientDeps }) {
    this.client = new Commerce7Client(_opts?.deps);
  }
  listOrdersSince(ctx: ProviderCallContext, cursor: PageCursor) { return this.client.listOrdersSince(ctx, cursor); }
  getOrder(ctx: ProviderCallContext, orderId: string) { return this.client.getOrder(ctx, orderId); }
  listProducts(ctx: ProviderCallContext, cursor: PageCursor) { return this.client.listProducts(ctx, cursor); }
  getVariantInventory(ctx: ProviderCallContext, variantId: string, locationId: string) { return this.client.getVariantInventory(ctx, variantId, locationId); }
  adjustInventory(ctx: ProviderCallContext, variantId: string, locationId: string, delta: number) { return this.client.adjustInventory(ctx, variantId, locationId, delta); }
  getCustomerRef(ctx: ProviderCallContext, id: string) { return this.client.getCustomerRef(ctx, id); }
  createWebhook(ctx: ProviderCallContext, input: { deliveryUrl: string; topics: string[] }) { return this.client.createWebhook(ctx, input); }
  deleteWebhook(ctx: ProviderCallContext, webhookId: string) { return this.client.deleteWebhook(ctx, webhookId); }
  getWebhook(ctx: ProviderCallContext, webhookId: string) { return this.client.getWebhook(ctx, webhookId); }
}

/** Load the app-global call context for a tenant slug (env creds + environment). Node/server only. */
export function commerce7CallContext(tenantSlug: string): ProviderCallContext {
  const cfg = loadCommerce7Config();
  return { appId: cfg.appId, secretKey: cfg.secretKey, tenantSlug, environment: cfg.environment };
}
