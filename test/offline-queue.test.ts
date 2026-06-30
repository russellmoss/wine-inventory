import { describe, it, expect } from "vitest";
import {
  buildCapture,
  makeEditCapture,
  drainPanel,
  drainAll,
  isRetryable,
  type CaptureInput,
  type SubmitOutcome,
  type PendingPanel,
} from "@/lib/offline/queue";

// A deterministic id generator + clock (the DB layer uses crypto.randomUUID / Date).
const counter = () => {
  let n = 0;
  return () => `id-${++n}`;
};
const fixedClock = () => "2026-09-01T08:00:00.000Z";

const input = (over: Partial<CaptureInput> = {}): CaptureInput => ({
  vesselId: "tank-5",
  lotId: "lot-A",
  occupancyToken: "tank-5:lot-A",
  deviceObservedAt: "2026-09-01T08:00:00.000Z",
  readings: [
    { analyte: "BRIX", value: 22.5, unit: "°Bx" },
    { analyte: "TEMP", value: 24, unit: "°C" },
  ],
  ...over,
});

describe("buildCapture", () => {
  it("mints a pending panel + one reading per analyte with DISTINCT ids", () => {
    const { panel, readings } = buildCapture(input(), counter(), fixedClock);
    expect(panel.status).toBe("pending");
    expect(panel.attempts).toBe(0);
    expect(readings).toHaveLength(2);
    const ids = new Set([panel.panelId, panel.commandId, ...readings.map((r) => r.captureId)]);
    expect(ids.size).toBe(4); // all distinct
    expect(readings.every((r) => r.panelId === panel.panelId)).toBe(true);
  });

  it("rejects an empty capture", () => {
    expect(() => buildCapture(input({ readings: [] }), counter(), fixedClock)).toThrow(/at least one reading/);
  });
});

describe("makeEditCapture — an edit mints a NEW capture, original untouched (S1)", () => {
  it("never reuses the old captureId/panelId", () => {
    const gen = counter();
    const original = buildCapture(input(), gen, fixedClock);
    const edited = makeEditCapture(original, [{ analyte: "BRIX", value: 21.0, unit: "°Bx" }], gen, fixedClock);
    expect(edited.panel.panelId).not.toBe(original.panel.panelId);
    const oldIds = new Set([original.panel.panelId, ...original.readings.map((r) => r.captureId)]);
    for (const r of edited.readings) expect(oldIds.has(r.captureId)).toBe(false);
    // The original object is unchanged.
    expect(original.readings[0].value).toBe(22.5);
  });
});

describe("drainPanel state transitions", () => {
  const cap = () => buildCapture(input(), counter(), fixedClock);

  it("pending → synced on success", async () => {
    const { panel, readings } = cap();
    const after = await drainPanel(panel, readings, async () => ({ ok: true, duplicate: false }));
    expect(after.status).toBe("synced");
    expect(after.attempts).toBe(1);
    expect(after.lastError).toBeNull();
  });

  it("a DUPLICATE is success, not an error (idempotency)", async () => {
    const { panel, readings } = cap();
    const after = await drainPanel(panel, readings, async () => ({ ok: true, duplicate: true }));
    expect(after.status).toBe("synced");
  });

  it("a retryable failure returns to pending and increments attempts", async () => {
    const { panel, readings } = cap();
    const after = await drainPanel(panel, readings, async () => ({ ok: false, retryable: true, error: "NETWORK" }));
    expect(after.status).toBe("pending");
    expect(after.attempts).toBe(1);
    expect(after.lastError).toBe("NETWORK");
    // Re-drain accumulates attempts.
    const again = await drainPanel(after, readings, async () => ({ ok: false, retryable: true, error: "SERVER" }));
    expect(again.attempts).toBe(2);
  });

  it("a terminal failure goes to needs_attention (not pending)", async () => {
    const { panel, readings } = cap();
    const after = await drainPanel(panel, readings, async () => ({ ok: false, retryable: false, error: "STALE_OCCUPANCY" }));
    expect(after.status).toBe("needs_attention");
    expect(after.lastError).toBe("STALE_OCCUPANCY");
  });

  it("a thrown (network) error is retryable", async () => {
    const { panel, readings } = cap();
    const after = await drainPanel(panel, readings, async () => {
      throw new Error("Failed to fetch");
    });
    expect(after.status).toBe("pending");
    expect(after.lastError).toMatch(/fetch/);
  });

  it("the whole panel's readings submit together (Brix+temp never desync)", async () => {
    const { panel, readings } = cap();
    let received: number | null = null;
    await drainPanel(panel, readings, async (_p, rs) => {
      received = rs.length;
      return { ok: true, duplicate: false };
    });
    expect(received).toBe(2); // both analytes in one atomic submit
  });
});

describe("drainAll — a terminal panel does not head-of-line block the rest", () => {
  it("a stuck terminal panel still lets later panels sync", async () => {
    const gen = counter();
    const p1 = buildCapture(input({ lotId: "bad" }), gen, fixedClock);
    const p2 = buildCapture(input({ lotId: "good" }), gen, fixedClock);
    const submit = async (panel: PendingPanel): Promise<SubmitOutcome> =>
      panel.lotId === "bad" ? { ok: false, retryable: false, error: "LOT_NOT_FOUND" } : { ok: true, duplicate: false };
    const [r1, r2] = await drainAll([p1, p2], submit);
    expect(r1.status).toBe("needs_attention");
    expect(r2.status).toBe("synced");
  });
});

describe("isRetryable classification", () => {
  it("terminal reasons are not retryable; unknown defaults to retryable", () => {
    expect(isRetryable("STALE_OCCUPANCY")).toBe(false);
    expect(isRetryable("LOT_NOT_FOUND")).toBe(false);
    expect(isRetryable("VALIDATION")).toBe(false);
    expect(isRetryable("NETWORK")).toBe(true);
    expect(isRetryable("anything-else")).toBe(true);
  });
});
