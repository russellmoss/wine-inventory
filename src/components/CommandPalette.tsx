"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { paletteSearchAction, type PaletteResult } from "@/lib/search/actions";
import { flattenForKeyboard, moveIndex, type SearchHit } from "@/lib/search/rank";
import { KEY_HINT, isPaletteShortcut } from "@/lib/nav/shortcuts";

/**
 * CommandPalette — Ctrl-K global search (doc 01 §7, v2 §B31).
 *
 * ## Keyboard hints say Ctrl, never a Mac glyph
 * Owner instruction, 2026-07-28, and a deliberate deviation from the handoff,
 * which writes `⌘K` throughout. This winery runs Windows; a ⌘ hint points at a
 * key the crew's keyboards do not have. The HANDLER still accepts Cmd so the
 * shortcut works on a Mac — we simply never advertise it.
 *
 * ## Deterministic, never LLM-backed
 * Search works with the assistant disabled or unavailable. A question surfaces an
 * **Ask** row at the BOTTOM of the results, never the top: if "where is the
 * Syrah?" put Ask first, the deterministic answer the user wanted would sit below
 * a model call that might be slow, wrong, or switched off.
 */
const EMPTY: PaletteResult = { groups: [], question: false };

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [result, setResult] = React.useState<PaletteResult>(EMPTY);
  const [active, setActive] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listId = React.useId();

  // Global open shortcut.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isPaletteShortcut(e)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Focus after paint so the caret actually lands in the field. Deliberately no
  // setState here: writing state synchronously inside an effect triggers a
  // cascading render, which the repo lints against. The reset happens in the
  // toggle path instead, where it belongs.
  React.useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  const close = React.useCallback(() => {
    setOpen(false);
    setQ("");
    setActive(0);
    setResult(EMPTY);
  }, []);

  // Debounced search. The palette fires on every keystroke, so an undebounced
  // version would run a multi-table query per character.
  React.useEffect(() => {
    if (!open) return;
    // Too short to search. `shown` below derives the empty state at RENDER time,
    // so there is nothing to write here.
    if (q.trim().length < 2) return;
    let cancelled = false;
    const t = setTimeout(() => {
      // Inside the timeout, not synchronously in the effect: a sync setState here
      // triggers a cascading render, and it also means a fast typist never sees a
      // spinner flash between keystrokes.
      if (!cancelled) setLoading(true);
      paletteSearchAction(q)
        .then((r) => {
          // A stale response must never overwrite a newer one.
          if (cancelled) return;
          setResult(r);
          setActive(0);
        })
        .catch(() => {
          if (!cancelled) setResult(EMPTY);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 160);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, open]);

  // Derived, not stored: a query under two characters shows nothing regardless of
  // whatever the last completed search returned.
  const tooShort = q.trim().length < 2;
  const shown = tooShort ? EMPTY : result;
  const rows = flattenForKeyboard(shown.groups);

  const go = (hit: SearchHit) => {
    close();
    router.push(hit.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => moveIndex(i, 1, rows.length));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => moveIndex(i, -1, rows.length));
      return;
    }
    if (e.key === "Enter" && rows[active]) {
      e.preventDefault();
      go(rows[active]);
    }
  };

  if (!open) return null;

  let rowIndex = -1;

  return (
    <div
      role="presentation"
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(20,19,15,0.45)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "12vh",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        style={{
          width: "min(640px, calc(100vw - 32px))",
          maxHeight: "60vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--ink-900)",
          color: "var(--text-on-dark)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-xl)",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 16px", borderBottom: "1px solid var(--border-inverse)" }}>
          <span aria-hidden="true" style={{ color: "var(--text-on-dark-muted)" }}>
            ⌕
          </span>
          <label htmlFor={`${listId}-input`} className="sr-only">
            Search barrels, tanks, lots, work orders and destinations
          </label>
          <input
            id={`${listId}-input`}
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search, or type a question…"
            role="combobox"
            aria-expanded={rows.length > 0}
            aria-controls={listId}
            aria-activedescendant={rows[active] ? `${listId}-${active}` : undefined}
            autoComplete="off"
            style={{
              flex: 1,
              height: "var(--touch-floor)",
              border: "none",
              outline: "none",
              background: "transparent",
              color: "var(--text-on-dark)",
              fontFamily: "var(--font-body)",
              fontSize: 16,
            }}
          />
          <kbd
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--text-on-dark-muted)",
              border: "1px solid var(--border-inverse)",
              borderRadius: "var(--radius-xs)",
              padding: "2px 6px",
            }}
          >
            {KEY_HINT.close}
          </kbd>
        </div>

        <div id={listId} role="listbox" aria-label="Results" style={{ overflowY: "auto", padding: "8px 0" }}>
          {tooShort ? (
            <p style={{ padding: "12px 16px", margin: 0, fontSize: 13.5, color: "var(--text-on-dark-muted)" }}>
              Type at least two characters. Search finds barrels, tanks, lots, work orders, blocks,
              materials and destinations.
            </p>
          ) : loading && shown.groups.length === 0 ? (
            <p style={{ padding: "12px 16px", margin: 0, fontSize: 13.5, color: "var(--text-on-dark-muted)" }}>
              Searching…
            </p>
          ) : shown.groups.length === 0 ? (
            <p style={{ padding: "12px 16px", margin: 0, fontSize: 13.5, color: "var(--text-on-dark-muted)" }}>
              Nothing matches “{q}”.
            </p>
          ) : (
            shown.groups.map((g) => (
              <div key={g.kind} role="group" aria-labelledby={`${listId}-${g.kind}`}>
                <div
                  id={`${listId}-${g.kind}`}
                  style={{
                    padding: "8px 16px 4px",
                    fontSize: 11,
                    letterSpacing: "var(--tracking-overline)",
                    textTransform: "uppercase",
                    color: "var(--text-on-dark-muted)",
                  }}
                >
                  {g.label}
                  {g.more > 0 ? ` · +${g.more} more` : ""}
                </div>
                {g.hits.map((h) => {
                  rowIndex += 1;
                  const i = rowIndex;
                  const isActive = i === active;
                  return (
                    <div
                      key={`${h.kind}-${h.id}`}
                      id={`${listId}-${i}`}
                      role="option"
                      aria-selected={isActive}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(h)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        minHeight: 48,
                        padding: "0 16px",
                        cursor: "pointer",
                        background: isActive ? "rgba(255,248,241,0.10)" : "transparent",
                      }}
                    >
                      <span style={{ fontSize: 14.5 }}>{h.label}</span>
                      {h.subtitle ? (
                        <span style={{ fontSize: 12.5, color: "var(--text-on-dark-muted)", whiteSpace: "nowrap" }}>
                          {h.subtitle}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))
          )}

          {/* Ask sits LAST, always. The assistant must never be load-bearing for
              findability — see doc 01 §10. */}
          {shown.question ? (
            <div style={{ borderTop: "1px solid var(--border-inverse)", marginTop: 8, paddingTop: 8 }}>
              <div style={{ padding: "8px 16px 4px", fontSize: 11, letterSpacing: "var(--tracking-overline)", textTransform: "uppercase", color: "var(--text-on-dark-muted)" }}>
                Ask
              </div>
              <div style={{ padding: "0 16px 8px", fontSize: 13.5, color: "var(--text-on-dark-muted)" }}>
                Ask the assistant “{q}” — opens the dock. It does not run automatically.
              </div>
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: 14, padding: "8px 16px", borderTop: "1px solid var(--border-inverse)", fontSize: 11.5, color: "var(--text-on-dark-muted)" }}>
          <span>↑↓ move</span>
          <span>Enter open</span>
          <span>Esc close</span>
          <span style={{ marginLeft: "auto" }}>{KEY_HINT.palette}</span>
        </div>
      </div>
    </div>
  );
}
