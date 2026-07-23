"use client";

import React from "react";
import { Card, Button, Eyebrow } from "@/components/ui";
import { setWineryTimeZone } from "@/lib/settings/actions";
import { browserTimeZone, formatDueAt, zoneAbbreviation } from "@/lib/work-orders/due-at";

/**
 * The winery's OPERATING clock — the zone planned work is read against.
 *
 * The whole point is the mismatch case, so the card leads with it: it shows what the winery's clock
 * says RIGHT NOW next to the viewer's own, and only calls out the difference when there is one.
 * "Not set" is a legitimate state (every reader falls back to their own browser zone), so clearing it
 * is a first-class action rather than something you achieve by picking a wrong value.
 */
export function WineryTimeZoneCard({ initial, zones }: { initial: string | null; zones: string[] }) {
  const [saved, setSaved] = React.useState<string | null>(initial);
  const [choice, setChoice] = React.useState<string>(initial ?? "");
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  // A live clock, as a SUBSCRIPTION rather than setState-in-an-effect. The server snapshot is 0, which
  // renders nothing, so SSR and the first client render agree; after hydration it ticks every 30s.
  //
  // getSnapshot must be STABLE between calls or React re-renders forever — so it returns the time
  // rounded DOWN to the tick, not a raw Date.now().
  const TICK_MS = 30_000;
  const nowMs = React.useSyncExternalStore(
    React.useCallback((onChange: () => void) => {
      const id = setInterval(onChange, TICK_MS);
      return () => clearInterval(id);
    }, []),
    () => Math.floor(Date.now() / TICK_MS) * TICK_MS,
    () => 0,
  );
  const live = nowMs > 0;
  const now = React.useMemo(() => new Date(nowMs), [nowMs]);
  // The viewer's own zone is a client-only fact; before the first tick we have no business guessing it.
  const viewerZone = live ? browserTimeZone() : "UTC";
  const differs = live && !!saved && zoneAbbreviation(now, saved) !== zoneAbbreviation(now, viewerZone);

  const dirty = (saved ?? "") !== choice;

  function save(next: string | null) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await setWineryTimeZone({ timeZone: next });
        setSaved(res.timeZone);
        setChoice(res.timeZone ?? "");
        setMessage(
          res.timeZone
            ? `Saved. Work orders are now planned on ${res.timeZone} time.`
            : "Cleared. Times now show in each person's own timezone.",
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save the timezone.");
      }
    });
  }

  return (
    <Card style={{ maxWidth: 560, marginTop: 16 }}>
      <Eyebrow>Winery timezone</Eyebrow>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8, lineHeight: 1.55 }}>
        The clock cellar work is planned on. A work order due &ldquo;9am&rdquo; means 9am <em>here</em>, at the
        winery — not 9am wherever the person reading it happens to be. This also sets which day counts as
        &ldquo;today&rdquo; for the overdue / due-today lanes and for the assistant.
      </p>

      <label style={{ display: "block", marginTop: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Timezone</span>
        <select
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          disabled={pending}
          style={{
            display: "block",
            width: "100%",
            marginTop: 6,
            padding: "8px 10px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border)",
            background: "var(--paper-0)",
            color: "var(--text-primary)",
            fontSize: 14,
          }}
        >
          <option value="">— not set (use each person&apos;s own timezone) —</option>
          {zones.map((z) => (
            <option key={z} value={z}>
              {z.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </label>

      {/* The mismatch is the reason this setting exists, so show it rather than describing it. */}
      {live && saved ? (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            borderRadius: "var(--radius-md)",
            background: "var(--paper-100)",
            fontSize: 12.5,
            color: "var(--text-secondary)",
            lineHeight: 1.6,
          }}
        >
          <div>
            Winery clock: <strong style={{ color: "var(--text-primary)" }}>{formatDueAt(now, true, saved)}</strong>{" "}
            {zoneAbbreviation(now, saved)}
          </div>
          {differs ? (
            <div style={{ marginTop: 2 }}>
              Yours: {formatDueAt(now, true, viewerZone)} {zoneAbbreviation(now, viewerZone)}{" "}
              &mdash; due times you see are shown on the winery&apos;s clock, not this one.
            </div>
          ) : (
            <div style={{ marginTop: 2 }}>Same as your own timezone.</div>
          )}
        </div>
      ) : null}

      {error ? <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{error}</div> : null}
      {message && !error ? <div style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 10 }}>{message}</div> : null}

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <Button disabled={pending || !dirty} onClick={() => save(choice === "" ? null : choice)}>
          {pending ? "Saving…" : "Save timezone"}
        </Button>
        {saved ? (
          <Button variant="ghost" disabled={pending} onClick={() => save(null)}>
            Clear
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
