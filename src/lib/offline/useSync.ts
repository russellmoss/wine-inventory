"use client";

import { useCallback, useEffect, useState } from "react";
import { buildCapture, drainPanel, type CaptureInput, type Capture, type SubmitFn } from "@/lib/offline/queue";
import {
  enqueueCapture,
  listOpenPanels,
  savePanel,
  pendingCount,
  needsAttentionPanels,
  discardPanel,
  pruneSynced,
} from "@/lib/offline/db";
import { submitPanelAction } from "@/lib/ferment/round-actions";

// Phase 6 Unit 6: the foreground sync loop (NO Background Sync — absent on iOS). Drains on
// mount, on the `online` event, on an interval while open, and on a manual "Sync now". The
// Dexie outbox is the source of truth (survives reload); React state is a view of it.

const submit: SubmitFn = async (panel, readings) => {
  const res = await submitPanelAction({
    panelId: panel.panelId,
    commandId: panel.commandId,
    vesselId: panel.vesselId,
    lotId: panel.lotId,
    occupancyToken: panel.occupancyToken,
    deviceObservedAt: panel.deviceObservedAt,
    note: panel.note,
    vesselReadingGroupId: panel.vesselReadingGroupId,
    readings: readings.map((r) => ({ captureId: r.captureId, analyte: r.analyte, value: r.value, unit: r.unit })),
  });
  if (res.ok) return { ok: true, duplicate: res.duplicate };
  return { ok: false, retryable: res.retryable, error: res.error };
};

const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

export type UseSync = {
  pending: number;
  attention: Capture[];
  syncing: boolean;
  capture: (input: CaptureInput) => Promise<Capture>;
  drain: () => Promise<void>;
  refresh: () => Promise<void>;
  discard: (panelId: string) => Promise<void>;
};

export function useSync(): UseSync {
  const [pending, setPending] = useState(0);
  const [attention, setAttention] = useState<Capture[]>([]);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    if (typeof indexedDB === "undefined") return;
    setPending(await pendingCount());
    setAttention(await needsAttentionPanels());
  }, []);

  const drain = useCallback(async () => {
    if (typeof indexedDB === "undefined") return;
    setSyncing(true);
    try {
      const open = await listOpenPanels();
      for (const { panel, readings } of open) {
        if (panel.status === "needs_attention") continue; // terminal — don't head-of-line block
        const next = await drainPanel(panel, readings, submit);
        await savePanel(next);
      }
      await pruneSynced();
      await refresh();
    } finally {
      setSyncing(false);
    }
  }, [refresh]);

  const capture = useCallback(
    async (input: CaptureInput) => {
      const cap = buildCapture(input, newId);
      await enqueueCapture(cap); // never network-gated — durable immediately
      await refresh();
      void drain(); // best-effort background flush
      return cap;
    },
    [drain, refresh],
  );

  const discard = useCallback(
    async (panelId: string) => {
      await discardPanel(panelId);
      await refresh();
    },
    [refresh],
  );

  useEffect(() => {
    // Bootstrap: load the outbox + flush once on mount. refresh()/drain() only setState AFTER
    // an await (an async microtask), so this isn't the synchronous render cascade the rule
    // guards against — it's the intended "kick off background sync when the page opens".
    void (async () => {
      await refresh();
      await drain();
    })();
    const onOnline = () => void drain();
    window.addEventListener("online", onOnline);
    const iv = window.setInterval(() => {
      if (navigator.onLine) void drain();
    }, 30_000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.clearInterval(iv);
    };
  }, [drain, refresh]);

  return { pending, attention, syncing, capture, drain, refresh, discard };
}
