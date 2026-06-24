"use client";

import React from "react";
import { SCHEMA_VERSION } from "@/lib/fieldnotes/types";
import type {
  WeatherData,
  InputApplication,
  BlockStatus,
} from "@/lib/fieldnotes/types";

// Debounced localStorage autosave for the weekly report. The draft is keyed by
// vineyardId ONLY (a manager only ever fills one vineyard), and the chosen
// weekOf + schemaVersion are stored INSIDE the value so a stale week can be
// detected on restore. The pure serialize/parse/key helpers are exported so the
// round-trip can be unit-tested without React or a real localStorage.

/** Mutable form state we autosave. Mirrors the shape FieldNoteForm holds. */
export type DraftFormState = {
  weekOf: string;
  weatherData: WeatherData;
  spraysApplied: InputApplication[];
  fertilizersApplied: InputApplication[];
  blockLevelStatuses: Record<string, BlockStatus>;
  generalNotes: string;
};

/** What actually lands in localStorage: the form plus version metadata. */
export type StoredDraft = {
  schemaVersion: number;
  savedAt: string; // ISO timestamp
  form: DraftFormState;
};

/** Minimal localStorage surface so the pure functions can take an in-memory stub. */
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Draft key — by vineyardId only (NOT by week). */
export function draftKey(vineyardId: string): string {
  return `bwc:field-note-draft:${vineyardId}`;
}

/** Serialize form state into the stored envelope JSON string. */
export function serializeDraft(form: DraftFormState, now: Date = new Date()): string {
  const stored: StoredDraft = {
    schemaVersion: SCHEMA_VERSION,
    savedAt: now.toISOString(),
    form,
  };
  return JSON.stringify(stored);
}

/** Parse a stored draft string. Returns null on missing/corrupt/wrong-version. */
export function parseDraft(raw: string | null): StoredDraft | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  if (obj.schemaVersion !== SCHEMA_VERSION) return null;
  if (typeof obj.form !== "object" || obj.form === null) return null;
  const form = obj.form as Record<string, unknown>;
  if (typeof form.weekOf !== "string") return null;
  return {
    schemaVersion: SCHEMA_VERSION,
    savedAt: typeof obj.savedAt === "string" ? obj.savedAt : "",
    form: form as unknown as DraftFormState,
  };
}

/** Persist a draft (pure over the storage handle). */
export function saveDraftTo(
  storage: StorageLike,
  vineyardId: string,
  form: DraftFormState,
  now: Date = new Date(),
): void {
  storage.setItem(draftKey(vineyardId), serializeDraft(form, now));
}

/** Restore a draft (pure over the storage handle). */
export function restoreDraftFrom(
  storage: StorageLike,
  vineyardId: string,
): StoredDraft | null {
  return parseDraft(storage.getItem(draftKey(vineyardId)));
}

/** Clear a draft (pure over the storage handle). */
export function clearDraftIn(storage: StorageLike, vineyardId: string): void {
  storage.removeItem(draftKey(vineyardId));
}

function getBrowserStorage(): StorageLike | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

const DEBOUNCE_MS = 600;

/**
 * React hook wrapping the pure draft helpers. Debounced save, one-shot restore.
 * `onStaleWeek(stored)` fires once on mount if a saved draft's weekOf differs
 * from the current default week, letting the caller offer "keep editing?".
 */
export function useDraft(
  vineyardId: string,
  form: DraftFormState,
  currentDefaultWeekOf: string,
  opts: { enabled: boolean; onRestore: (stored: StoredDraft, stale: boolean) => void },
) {
  const { enabled, onRestore } = opts;
  const restoredRef = React.useRef(false);
  const onRestoreRef = React.useRef(onRestore);
  React.useEffect(() => {
    onRestoreRef.current = onRestore;
  }, [onRestore]);

  // One-shot restore on mount.
  React.useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const storage = getBrowserStorage();
    if (!storage) return;
    const stored = restoreDraftFrom(storage, vineyardId);
    if (stored) {
      const stale = stored.form.weekOf !== currentDefaultWeekOf;
      onRestoreRef.current(stored, stale);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vineyardId]);

  // Debounced save whenever the form changes.
  React.useEffect(() => {
    if (!enabled) return;
    const storage = getBrowserStorage();
    if (!storage) return;
    const t = setTimeout(() => saveDraftTo(storage, vineyardId, form), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [enabled, vineyardId, form]);

  const clear = React.useCallback(() => {
    const storage = getBrowserStorage();
    if (storage) clearDraftIn(storage, vineyardId);
  }, [vineyardId]);

  return { clear };
}
