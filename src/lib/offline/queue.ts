// Phase 6 Unit 6: the offline capture queue — PURE logic (no IndexedDB, no network), so it is
// unit-tested directly. db.ts wraps these shapes in Dexie; useSync.ts drives drain(). The
// council offline-correctness cluster lives here:
//  - A row's Brix + temp commit as ONE atomic panel (CaptureSet), children unique (panelId,
//    analyte) — Brix and temp can never desync (S2).
//  - A captured reading is IMMUTABLE: an edit mints a NEW capture (new ids), never reuses a
//    captureId (S1).
//  - Idempotency: a per-reading captureId + a per-panel commandId; a duplicate sync is SUCCESS
//    (S4). The id is minted ONCE at capture, never per-retry.
//  - drain classifies errors retryable-vs-terminal; a terminal panel moves to a "needs
//    attention" tray (re-point/discard) instead of head-of-line blocking the queue (S7).

export type PanelStatus = "pending" | "syncing" | "synced" | "failed" | "needs_attention";

export type ReadingInput = { analyte: string; value: number; unit: string };

export type CaptureInput = {
  vesselId: string;
  lotId: string; // the lot the tablet resolved AS OF capture — immutable, the reading is OF this lot
  occupancyToken: string; // the vessel's resident-lot signature at capture (S5 as-of check)
  deviceObservedAt: string; // ISO, the tablet clock at capture
  readings: ReadingInput[];
  note?: string; // sticky operator/context (a shared tablet has one login, many hands)
};

export type PendingReading = {
  captureId: string;
  panelId: string;
  analyte: string;
  value: number;
  unit: string;
};

export type PendingPanel = {
  panelId: string;
  commandId: string; // panel-level idempotency key for the mutating submit
  vesselId: string;
  lotId: string;
  occupancyToken: string;
  deviceObservedAt: string;
  note: string | null;
  status: PanelStatus;
  attempts: number;
  lastError: string | null;
  createdAt: string;
};

export type Capture = { panel: PendingPanel; readings: PendingReading[] };

export type IdGen = () => string;
export type Clock = () => string;

const defaultClock: Clock = () => new Date().toISOString();

/**
 * Mint a fresh capture from a Round row: one panel + one reading per analyte, each with a
 * distinct client-generated id. Ids are minted HERE, once — never regenerated on retry (a
 * retry that re-mints would defeat idempotency). The panel starts `pending`.
 */
export function buildCapture(input: CaptureInput, idGen: IdGen, clock: Clock = defaultClock): Capture {
  if (input.readings.length === 0) throw new Error("A capture needs at least one reading.");
  const panelId = idGen();
  const commandId = idGen();
  const panel: PendingPanel = {
    panelId,
    commandId,
    vesselId: input.vesselId,
    lotId: input.lotId,
    occupancyToken: input.occupancyToken,
    deviceObservedAt: input.deviceObservedAt,
    note: input.note ?? null,
    status: "pending",
    attempts: 0,
    lastError: null,
    createdAt: clock(),
  };
  const readings: PendingReading[] = input.readings.map((r) => ({
    captureId: idGen(),
    panelId,
    analyte: r.analyte,
    value: r.value,
    unit: r.unit,
  }));
  return { panel, readings };
}

/**
 * Edit-as-new-capture (S1): a captured reading is immutable, so "editing" a row produces a
 * brand-new capture with new ids. The original capture is returned UNTOUCHED for the caller to
 * keep (its server row, if any, stays — a later reconcile/void handles it); the new capture is
 * what gets enqueued. We never mutate an existing captureId.
 */
export function makeEditCapture(original: Capture, newReadings: ReadingInput[], idGen: IdGen, clock: Clock = defaultClock): Capture {
  const fresh = buildCapture(
    {
      vesselId: original.panel.vesselId,
      lotId: original.panel.lotId,
      occupancyToken: original.panel.occupancyToken,
      deviceObservedAt: clock(), // a re-capture observed now
      readings: newReadings,
      note: original.panel.note ?? undefined,
    },
    idGen,
    clock,
  );
  // Sanity: the new capture shares NO ids with the original.
  if (fresh.panel.panelId === original.panel.panelId) throw new Error("Edit must mint a new panelId.");
  return fresh;
}

// ── Drain (send a panel to the server) ──────────────────────────────────────────────

export type SubmitOutcome =
  | { ok: true; duplicate: boolean } // duplicate = the server already had it (idempotent) = SUCCESS
  | { ok: false; retryable: boolean; error: string };

export type SubmitFn = (panel: PendingPanel, readings: PendingReading[]) => Promise<SubmitOutcome>;

/** Terminal server reasons — these will NEVER succeed on retry; route to needs-attention. */
const TERMINAL_REASONS = new Set(["STALE_OCCUPANCY", "LOT_NOT_FOUND", "VESSEL_NOT_FOUND", "VALIDATION"]);

/** Map a thrown/return error code to retryable. Unknown → retryable (safer to retry than drop). */
export function isRetryable(reason: string): boolean {
  return !TERMINAL_REASONS.has(reason);
}

/**
 * Drain ONE panel: pure state transition given the submit result. Whole-panel atomicity — a
 * panel's readings go together, so Brix+temp never desync. Returns the panel with updated
 * status/attempts/lastError (the caller persists it). Never throws.
 */
export async function drainPanel(panel: PendingPanel, readings: PendingReading[], submit: SubmitFn): Promise<PendingPanel> {
  if (panel.status === "synced" || panel.status === "needs_attention") return panel; // terminal, skip
  const attempting: PendingPanel = { ...panel, status: "syncing", attempts: panel.attempts + 1 };
  try {
    const res = await submit(attempting, readings);
    if (res.ok) {
      return { ...attempting, status: "synced", lastError: null }; // duplicate counts as success
    }
    if (res.retryable) {
      return { ...attempting, status: "pending", lastError: res.error }; // back to the queue
    }
    return { ...attempting, status: "needs_attention", lastError: res.error }; // terminal → tray
  } catch (e) {
    // A thrown error (network/unknown) is retryable by default.
    return { ...attempting, status: "pending", lastError: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Drain a batch in order, but a terminal (needs_attention) panel must NOT head-of-line block the
 * rest. Returns the updated panels in the same order. `submit` is injected (the server action in
 * prod, a fake in tests). Already-synced/terminal panels pass through untouched.
 */
export async function drainAll(
  panels: { panel: PendingPanel; readings: PendingReading[] }[],
  submit: SubmitFn,
): Promise<PendingPanel[]> {
  const out: PendingPanel[] = [];
  for (const { panel, readings } of panels) {
    out.push(await drainPanel(panel, readings, submit));
  }
  return out;
}
