"use client";

import React from "react";
import { useRouter, usePathname } from "next/navigation";
import { EmptyState, StatusChip } from "@/components/ui";
import { TANK_STATES, TANK_STATE_LABEL, TANK_STATE_VARIANT } from "@/lib/vessels/tank-state";
import {
  applyBoardFilters,
  filterChips,
  hasAnyFilter,
  resultSummary,
  toQueryString,
  toggleState,
  withoutChip,
  EMPTY_FILTERS,
  type BoardFilters,
} from "@/lib/vessels/board-filters";
import { TankTile, TankTileSkeleton, type TankTileData } from "./TankTile";

/**
 * The tank board (v2 SC-10) — the cellar's primary screen, finally showing wine.
 *
 * It replaces two accordions that defaulted to CLOSED, so opening `/bulk` to answer "where
 * is the Syrah" showed two grey bars and a count. That is audit finding S15. Here every tank
 * is a tile, every tile carries its lot code, fill height encodes volume, and state is a
 * glyph plus text so it survives a greyscale screenshot.
 *
 * Narrowing applies live and syncs to the URL, so a filtered board is shareable and survives
 * a reload. No Apply button, same contract as Phase 5's queue.
 */
export function TankBoard({
  tiles,
  filters,
  onOpen,
}: {
  tiles: TankTileData[];
  filters: BoardFilters;
  onOpen: (id: string) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();

  // `replace`, not `push`. Search-as-you-type with push mints a history entry per debounce
  // commit, so Back walks the user character-by-character through their own search instead
  // of returning to the page they came from — unusable on a cellar tablet.
  const go = React.useCallback(
    (next: BoardFilters) => router.replace(`${pathname}${toQueryString(next)}`, { scroll: false }),
    [router, pathname],
  );

  // The URL is the source of truth; the input keeps a draft so typing is not one navigation
  // per keystroke. Committed on a pause, which is what "applies live" means for text.
  const currentQ = filters.q ?? "";
  const currentState = filters.state;
  const [draft, setDraft] = React.useState(currentQ);
  const [syncedQ, setSyncedQ] = React.useState(currentQ);
  // What we last asked the router for. /bulk is a heavy server render, so a navigation can
  // land several keystrokes later; re-syncing the input from the URL then DELETED the
  // characters typed in the meantime and left the board filtered on a prefix. That is the
  // normal case for anyone typing faster than the server, not an edge case.
  const [dispatchedQ, setDispatchedQ] = React.useState(currentQ);

  // Adjusted during render, not in an effect. The URL can change under us (a chip removed,
  // the back button), and an effect for this would setState synchronously and cascade an
  // extra render pass on every navigation.
  if (syncedQ !== currentQ) {
    setSyncedQ(currentQ);
    // Only adopt the URL when the change came from SOMEWHERE ELSE. Our own landing
    // navigation must never overwrite what the user has kept typing.
    // State, not a ref: React forbids touching a ref during render, and adjusting state
    // during render is the sanctioned pattern for "a prop changed under us".
    if (currentQ !== dispatchedQ) {
      setDraft(currentQ);
      setDispatchedQ(currentQ);
    }
  }

  React.useEffect(() => {
    const next = draft.trim();
    if (next === currentQ) return;
    // Primitive deps only. `filters` is rebuilt from search params every render, so
    // depending on the object would clear and restart this timer on each pass and the
    // search would never commit.
    const t = setTimeout(() => {
      setDispatchedQ(next);
      go({ state: currentState, q: next.length > 0 ? next : null });
    }, 300);
    return () => clearTimeout(t);
  }, [draft, currentQ, currentState, go]);

  const shown = applyBoardFilters(tiles, filters);
  const chips = filterChips(filters);
  // Counted over the TEXT-filtered set, state-independent, so each chip predicts exactly
  // what clicking it will show. Counting over every tile promised "Fermenting 12" and
  // delivered one whenever a search was active, contradicting the summary line below it.
  const counts = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const t of applyBoardFilters(tiles, { state: null, q: filters.q })) {
      m.set(t.state, (m.get(t.state) ?? 0) + 1);
    }
    return m;
  }, [tiles, filters.q]);

  if (tiles.length === 0) {
    return (
      <EmptyState title="No tanks set up yet">
        Register tanks in <strong>Setup &rarr; Vessels</strong> and they appear here.
      </EmptyState>
    );
  }

  return (
    <section aria-labelledby="tank-board-heading">
      <h2 id="tank-board-heading" style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 22, margin: "0 0 10px" }}>
        Tanks <span style={{ color: "var(--text-muted)", fontSize: 15 }}>({tiles.length})</span>
      </h2>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 10 }}>
        {TANK_STATES.map((s) => {
          const active = filters.state === s;
          const n = counts.get(s) ?? 0;
          return (
            <button
              key={s}
              type="button"
              onClick={() => go(toggleState(filters, s))}
              aria-pressed={active}
              style={{
                minHeight: "var(--touch-min)",
                padding: "0 12px",
                borderRadius: "var(--radius-pill)",
                border: `1px solid ${active ? "var(--wine-primary)" : "var(--border-strong)"}`,
                background: active ? "var(--accent-soft)" : "var(--surface-raised)",
                color: "var(--text-primary)",
                fontFamily: "var(--font-body)",
                fontSize: 13,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span aria-hidden="true" style={{ display: "inline-flex" }}>
                <StatusChip variant={TANK_STATE_VARIANT[s]} style={{ height: 20, padding: "0 7px", fontSize: 11 }}>
                  {n}
                </StatusChip>
              </span>
              {TANK_STATE_LABEL[s]}
              <span className="sr-only">, {n} tanks</span>
            </button>
          );
        })}

        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
          <span className="sr-only">Search tanks by tank code, lot code or wine</span>
          <input
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Find a tank or lot"
            style={{
              height: "var(--touch-min)",
              minWidth: 190,
              padding: "0 12px",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-md)",
              background: "var(--surface-raised)",
              fontFamily: "var(--font-body)",
              fontSize: 14,
              color: "var(--text-primary)",
            }}
          />
        </label>
      </div>

      {chips.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 10 }}>
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => go(withoutChip(filters, c.key))}
              style={{
                minHeight: "var(--touch-min)",
                padding: "0 12px",
                borderRadius: "var(--radius-pill)",
                border: "1px solid var(--wine-primary)",
                background: "transparent",
                color: "var(--text-primary)",
                fontFamily: "var(--font-body)",
                fontSize: 12.5,
                cursor: "pointer",
              }}
            >
              {c.label} <span aria-hidden="true">&times;</span>
              <span className="sr-only">. {c.removeLabel}</span>
            </button>
          ))}
        </div>
      ) : null}

      <p aria-live="polite" style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 12px" }}>
        {resultSummary(shown.length, tiles.length, filters)}
      </p>

      {shown.length === 0 ? (
        <EmptyState
          title="No tanks match this narrowing"
          actions={
            hasAnyFilter(filters) ? (
              <button
                type="button"
                onClick={() => go(EMPTY_FILTERS)}
                style={{
                  minHeight: "var(--touch-min)",
                  padding: "0 14px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-strong)",
                  background: "var(--surface-raised)",
                  fontFamily: "var(--font-body)",
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                Clear narrowing
              </button>
            ) : null
          }
        >
          {null}
        </EmptyState>
      ) : (
        <div className="bw-tank-board">
          {shown.map((t) => (
            <TankTile key={t.id} tile={t} onOpen={onOpen} />
          ))}
        </div>
      )}
    </section>
  );
}

/** The board's shape while its contents load. Consumed by `/bulk/loading.tsx`. */
export function TankBoardSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="bw-tank-board" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <TankTileSkeleton key={i} />
      ))}
    </div>
  );
}
