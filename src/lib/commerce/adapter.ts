// Phase 16 Unit 2 — the provider-neutral commerce adapter. Commerce7 is the only implementation in v1,
// but every type here is WineDirect-ready: we normalize money to major units (Decimal-friendly numbers),
// timestamps to ISO UTC strings, and inventory to a per-(variant, location) count behind one interface.
// No Commerce7 specifics leak into these types — that is the point. Provider auth is app-global Basic
// Auth (App ID + Secret Key, env-resident) + a `tenant:` header (Commerce7 has NO OAuth/tokens).
//
// Sources (cite in client comments): developer.commerce7.com/docs/{commerce7-apis,app-apis-webhooks}.

export type CommerceEnvironment = "sandbox" | "production";

/** The minimum a call needs: the app credentials (env), which winery (tenant slug), which environment.
 *  The secretKey lives ONLY in memory here, sourced from env — never a DB column, never logged. */
export type ProviderCallContext = {
  appId: string;
  secretKey: string;
  tenantSlug: string;
  environment: CommerceEnvironment;
};

/** An opaque page cursor. Commerce7 pages by (updatedAt gte + page); we treat it as an opaque token so
 *  the poller/backfill never has to know the provider's paging scheme. Null = start / done. */
export type PageCursor = { updatedAtGte?: string; page: number } | null;

/** One normalized order line. `skuRef` is the mapping key (the Commerce7 variant id). Money is in MAJOR
 *  units (dollars), converted from Commerce7 cents by the client. NO PII. */
export type ProviderOrderLine = {
  skuRef: string; // externalVariantId — the (variant, location) mapping key
  externalProductId?: string;
  sku?: string;
  inventoryLocationId?: string;
  quantity: number;
  unitPrice: number;
  lineSubtotal: number;
  tax: number;
  discount: number;
};

/** A normalized order (NO PII beyond the opaque customer id). Money in major units; times ISO UTC. */
export type ProviderOrder = {
  orderId: string; // stable Commerce7 order UUID
  orderNumber?: string;
  customerId?: string; // OPAQUE Commerce7 id only (D19) — never a name/email
  channel?: string;
  paymentStatus: string; // "Paid" | "Authorized" | "Cancelled" | …
  fulfillmentStatus?: string;
  currency: string;
  updatedAt: string; // ISO UTC (poll watermark)
  occurredAt: string; // ISO UTC (order placed)
  paidAt?: string; // ISO UTC — drives the accounting/business date
  lines: ProviderOrderLine[];
  subtotal: number;
  tax: number;
  shipping: number;
  discount: number;
  total: number;
};

export type ProviderVariant = {
  productId: string;
  variantId: string;
  sku: string;
  title?: string;
  price: number; // major units
  inventoryLocationId: string;
  availableForSaleCount: number;
};

export type ProviderProduct = {
  productId: string;
  title: string;
  variants: ProviderVariant[];
};

/** A classified provider error. Callers branch on `kind`, not on raw Commerce7 status/body. */
export type CommerceFaultKind =
  | "auth" // 401/403 — bad app creds or tenant not authorized
  | "not_found" // 404 — order/variant gone (a fake webhook id 404s → drop)
  | "rate_limit" // 429 — honor Retry-After, backoff
  | "validation" // 4xx we sent a bad request — don't blindly retry
  | "transient" // 5xx / network — safe to retry (may leave a gap)
  | "unknown";

export class CommerceFault extends Error {
  constructor(
    readonly kind: CommerceFaultKind,
    message: string,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "CommerceFault";
  }
}

/** The provider-neutral surface. Commerce7 implements it; a WineDirect adapter drops in behind it. */
export interface CommerceAdapter {
  /** Settled/updated orders since the cursor (poll + backfill). Returns the page + the next cursor. */
  listOrdersSince(ctx: ProviderCallContext, cursor: PageCursor): Promise<{ orders: ProviderOrder[]; nextCursor: PageCursor }>;
  /** Re-fetch ONE order by id (re-fetch-before-act; a 404 → null so a fake webhook id is dropped). */
  getOrder(ctx: ProviderCallContext, orderId: string): Promise<ProviderOrder | null>;
  /** Products + variants for SKU mapping. */
  listProducts(ctx: ProviderCallContext, cursor: PageCursor): Promise<{ products: ProviderProduct[]; nextCursor: PageCursor }>;
  /** Current available-for-sale count for a (variant, location) — the drift-detector read. */
  getVariantInventory(ctx: ProviderCallContext, variantId: string, locationId: string): Promise<number | null>;
  /** ADDITIVE inventory adjustment (the ONLY outbound write primitive — never an absolute reset). */
  adjustInventory(ctx: ProviderCallContext, variantId: string, locationId: string, delta: number): Promise<void>;
  /** Opaque customer ref (v1 stores nothing; fetch on demand for the UI). */
  getCustomerRef(ctx: ProviderCallContext, id: string): Promise<{ id: string } | null>;
  /** Webhook lifecycle (register at confirm, self-heal on disable — U3/U8). */
  createWebhook(ctx: ProviderCallContext, input: { deliveryUrl: string; topics: string[] }): Promise<{ webhookId: string }>;
  deleteWebhook(ctx: ProviderCallContext, webhookId: string): Promise<void>;
  getWebhook(ctx: ProviderCallContext, webhookId: string): Promise<{ id: string; active: boolean } | null>;
}
