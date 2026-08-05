import { describe, expect, it, vi } from "vitest";

/**
 * Feedback cmsg2aphb0000kz04ivugdcn1 — "transfer error": trying to move wine between tanks produced
 * *"this weird error at the bottom. I don't know what it means."* The network trail carries one
 * non-200: `POST /work-orders/new -> 500`.
 *
 * The gate was refusing the write for a perfectly good reason and saying so in plain English — then
 * throwing that sentence away. `gateWorkOrderReadinessForWrite` threw a RAW `Error`, and
 * `settleAction` (src/lib/action-result.ts) converts ONLY `ActionError` into `{ok:false, error}`.
 * Anything else it rethrows, and Next.js replaces the message of a thrown server-action error with an
 * opaque digest in production. So the user got a 500 and a meaningless string, when the app already
 * knew the answer was "a transfer's source and destination must be different vessels".
 *
 * The gate gates FIVE write paths — createWorkOrderFromTemplateAction, createWorkOrderFromBuildsAction,
 * updateWorkOrderFromBuildsAction, the composer, and the assistant's confirm — all `safeAction`, so
 * every one of them failed this way.
 *
 * These tests assert the CONTRACT the user actually experiences: a refusal comes back as data with a
 * readable message, not as a 500. They fail against a raw `Error`.
 */

// loadState() hits the DB. Stub it flat so the gate runs on empty tenant state — a task pointing at a
// vessel that "no longer exists" is then a blocker, with no fixtures needed.
const empty = { findMany: async () => [], findFirst: async () => null, groupBy: async () => [] };
vi.mock("@/lib/prisma", () => ({
  prisma: { vessel: empty, lot: empty, appSettings: empty, reservation: empty, supplyLot: empty, vesselLot: empty, cellarMaterial: empty },
  prismaBase: {},
}));
vi.mock("@/lib/cellar/materials", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  listMaterials: async () => [],
}));

const META = { source: "manual" as const, title: "transfer", assigneeEmail: null, dueDate: null };
const RACK = [{ taskType: "RACK", title: "Rack / transfer", values: { fromVesselId: "gone", toVesselId: "also-gone", drawL: 200 } }];

describe("readiness write gate — a refusal must reach the user, not become a 500", () => {
  it("throws ActionError (which settleAction can convert), not a bare Error", async () => {
    const { gateWorkOrderReadinessForWrite } = await import("@/lib/work-orders/proposal-readiness");
    const { ActionError } = await import("@/lib/action-error");

    const err = await gateWorkOrderReadinessForWrite(RACK as never, META).then(
      () => null,
      (e: unknown) => e,
    );
    // The precise regression: this was `new Error(...)`, so settleAction rethrew it -> HTTP 500.
    expect(err).toBeInstanceOf(ActionError);
  });

  it("settles into {ok:false} carrying the REAL reason — the whole point of the fix", async () => {
    const { gateWorkOrderReadinessForWrite } = await import("@/lib/work-orders/proposal-readiness");
    const { settleAction } = await import("@/lib/action-result");

    const res = await settleAction(() => gateWorkOrderReadinessForWrite(RACK as never, META));

    expect(res.ok).toBe(false);
    if (res.ok) return;
    // Not an opaque digest — the sentence the operator needs, naming what to change.
    expect(res.error).toContain("This work order can't be created yet");
    expect(res.error.length).toBeGreaterThan("This work order can't be created yet:".length);
  });

  it("does the same for a stale proposal, and codes it CONFLICT", async () => {
    const { gateWorkOrderReadinessForWrite } = await import("@/lib/work-orders/proposal-readiness");
    const { settleAction } = await import("@/lib/action-result");

    // A fingerprint that cannot match forces the stale branch before any blocker check.
    const res = await settleAction(() =>
      gateWorkOrderReadinessForWrite(RACK as never, META, "a-fingerprint-from-an-earlier-preview"),
    );

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("This work-order proposal is stale. Regenerate it before confirming.");
    expect(res.code).toBe("CONFLICT");
  });

  it("assertFreshReadiness settles too — the assistant's confirm path shares this gate", async () => {
    const { assertFreshReadiness } = await import("@/lib/work-orders/proposal-readiness");
    const { settleAction } = await import("@/lib/action-result");

    const res = await settleAction(() => assertFreshReadiness(RACK as never, "stale"));

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("This work-order proposal is stale. Regenerate it before confirming.");
  });
});
