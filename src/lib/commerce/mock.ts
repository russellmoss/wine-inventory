// Phase 16 Unit 2 — an in-memory mock CommerceAdapter for offline tests + the idempotency harness. It
// holds orders/products/inventory the test can MUTATE between polls (to exercise delta ingest), records
// every adjustInventory call (to prove additive-on-increase idempotency), and has a `crashOnce` seam
// (throw a transient fault once per tagged call, to prove crash recovery). No network, deterministic.

import {
  CommerceFault,
  type CommerceAdapter,
  type PageCursor,
  type ProviderCallContext,
  type ProviderOrder,
  type ProviderProduct,
} from "@/lib/commerce/adapter";

export type MockCommerceState = {
  orders: Map<string, ProviderOrder>;
  products: ProviderProduct[];
  /** available-for-sale by `${variantId}:${locationId}` (the drift/inventory surface). */
  inventory: Map<string, number>;
  /** every additive adjustInventory call, in order (assert exactly-once outbound). */
  adjustCalls: Array<{ variantId: string; locationId: string; delta: number }>;
  /** throw a transient fault ONCE for a call tagged with this key (e.g. `adjust:${variantId}`). */
  crashOnce?: Set<string>;
  webhooks: Map<string, { id: string; active: boolean }>;
  webhookSeq?: number;
};

export function emptyMockState(): MockCommerceState {
  return { orders: new Map(), products: [], inventory: new Map(), adjustCalls: [], crashOnce: new Set(), webhooks: new Map(), webhookSeq: 0 };
}

const invKey = (variantId: string, locationId: string) => `${variantId}:${locationId}`;

export function createMockCommerceAdapter(state: MockCommerceState): CommerceAdapter {
  const maybeCrash = (tag: string) => {
    if (state.crashOnce?.has(tag)) {
      state.crashOnce.delete(tag);
      throw new CommerceFault("transient", `simulated crash on ${tag}`);
    }
  };
  return {
    async listOrdersSince(_ctx: ProviderCallContext, cursor: PageCursor) {
      const floor = cursor?.updatedAtGte;
      const orders = [...state.orders.values()]
        .filter((o) => !floor || o.updatedAt >= floor)
        .sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : a.updatedAt > b.updatedAt ? 1 : a.orderId.localeCompare(b.orderId)));
      return { orders, nextCursor: null as PageCursor };
    },
    async getOrder(_ctx, orderId) {
      return state.orders.get(orderId) ?? null;
    },
    async listProducts(_ctx, _cursor) {
      return { products: state.products, nextCursor: null as PageCursor };
    },
    async getVariantInventory(_ctx, variantId, locationId) {
      const v = state.inventory.get(invKey(variantId, locationId));
      return v == null ? null : v;
    },
    async adjustInventory(_ctx, variantId, locationId, delta) {
      maybeCrash(`adjust:${variantId}:${locationId}`);
      state.adjustCalls.push({ variantId, locationId, delta });
      const k = invKey(variantId, locationId);
      state.inventory.set(k, (state.inventory.get(k) ?? 0) + delta);
    },
    async getCustomerRef(_ctx, id) {
      return { id };
    },
    async createWebhook(_ctx, _input) {
      state.webhookSeq = (state.webhookSeq ?? 0) + 1;
      const id = `wh_${state.webhookSeq}`;
      state.webhooks.set(id, { id, active: true });
      return { webhookId: id };
    },
    async deleteWebhook(_ctx, webhookId) {
      state.webhooks.delete(webhookId);
    },
    async getWebhook(_ctx, webhookId) {
      return state.webhooks.get(webhookId) ?? null;
    },
  };
}
