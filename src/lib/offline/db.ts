import Dexie, { type Table } from "dexie";
import type { Capture, PendingPanel, PendingReading } from "@/lib/offline/queue";

// Phase 6 Unit 6: the durable outbox (IndexedDB via Dexie). Durability of captured readings
// comes from THIS table, not the service worker (the SW is app-shell only). Two tables: the
// atomic `pendingPanels` (CaptureSet) and its child `pendingReadings`. A panel + its readings
// are written/read together so Brix+temp never desync.

export class CellarDB extends Dexie {
  pendingPanels!: Table<PendingPanel, string>;
  pendingReadings!: Table<PendingReading, string>;

  constructor() {
    super("cellar");
    this.version(1).stores({
      // primary key, then secondary indexes for the drain/list queries.
      pendingPanels: "panelId, status, createdAt",
      pendingReadings: "captureId, panelId",
    });
  }
}

let _db: CellarDB | null = null;

/** The singleton DB. Throws in environments without IndexedDB (SSR, hostile private mode) — the
 * storage probe (Unit 7) gates UI before this is called. */
export function getDb(): CellarDB {
  if (typeof indexedDB === "undefined") throw new Error("IndexedDB is unavailable in this environment.");
  if (!_db) _db = new CellarDB();
  return _db;
}

/** Enqueue a freshly-built capture atomically (panel + all its readings together). */
export async function enqueueCapture(capture: Capture): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.pendingPanels, db.pendingReadings, async () => {
    await db.pendingPanels.put(capture.panel);
    await db.pendingReadings.bulkPut(capture.readings);
  });
}

/** All panels not yet synced (pending + failed + needs_attention + any in-flight), oldest first. */
export async function listOpenPanels(): Promise<Capture[]> {
  const db = getDb();
  const panels = await db.pendingPanels.where("status").notEqual("synced").sortBy("createdAt");
  return Promise.all(
    panels.map(async (panel) => ({
      panel,
      readings: await db.pendingReadings.where("panelId").equals(panel.panelId).toArray(),
    })),
  );
}

export async function savePanel(panel: PendingPanel): Promise<void> {
  await getDb().pendingPanels.put(panel);
}

/** Count of panels still waiting to sync (pending or failed; needs_attention is surfaced separately). */
export async function pendingCount(): Promise<number> {
  const db = getDb();
  return db.pendingPanels.where("status").anyOf("pending", "failed", "syncing").count();
}

export async function needsAttentionPanels(): Promise<Capture[]> {
  const db = getDb();
  const panels = await db.pendingPanels.where("status").equals("needs_attention").sortBy("createdAt");
  return Promise.all(
    panels.map(async (panel) => ({
      panel,
      readings: await db.pendingReadings.where("panelId").equals(panel.panelId).toArray(),
    })),
  );
}

/** Discard a needs-attention capture the operator chose not to re-point. */
export async function discardPanel(panelId: string): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.pendingPanels, db.pendingReadings, async () => {
    await db.pendingReadings.where("panelId").equals(panelId).delete();
    await db.pendingPanels.delete(panelId);
  });
}

/** Drop already-synced panels (housekeeping; iOS evicts storage aggressively so keep it lean). */
export async function pruneSynced(): Promise<void> {
  const db = getDb();
  const synced = await db.pendingPanels.where("status").equals("synced").primaryKeys();
  await db.transaction("rw", db.pendingPanels, db.pendingReadings, async () => {
    for (const panelId of synced) {
      await db.pendingReadings.where("panelId").equals(panelId as string).delete();
      await db.pendingPanels.delete(panelId as string);
    }
  });
}
