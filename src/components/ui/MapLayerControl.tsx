"use client";

import React from "react";

// The on-map layer key: per-layer visibility toggle + up/down reordering, plus an optional expandable
// list of CHILDREN (the individual blocks) that can be switched on and off one at a time. Rows read
// TOP-of-map first, like an image editor's layers panel. Pure presentation — the parent owns the layer
// state and resolves the ordered overlays; `SatelliteMap` positions this over the map canvas.

export type LayerChildRow = {
  id: string;
  label: string;
  visible: boolean;
  swatch?: string;
  note?: string;
};

export type LayerRow = {
  id: string;
  label: string;
  visible: boolean;
  available: boolean; // false → shown greyed with a note, toggle disabled
  swatch?: string; // optional color chip
  note?: string;
  /** Individually toggleable members of this layer (e.g. one row per block). Toggled through `onToggle`. */
  children?: LayerChildRow[];
};

/** A checkbox that can show the third, "some children are off" state. */
function TriCheck({
  checked,
  indeterminate,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onChange: () => void;
  label: string;
}) {
  const ref = React.useRef<HTMLInputElement | null>(null);
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate) && checked;
  }, [indeterminate, checked]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      aria-label={label}
      style={{ accentColor: "var(--wine-primary)", cursor: disabled ? "default" : "pointer", flex: "0 0 auto" }}
    />
  );
}

export function MapLayerControl({
  layers,
  onToggle,
  onMove,
  title = "Layers",
  embedded = false,
}: {
  layers: LayerRow[];
  onToggle: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  title?: string;
  /** Rendered inside a surface that already supplies the card chrome (the map's Menu) — drop ours. */
  embedded?: boolean;
}) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

  return (
    <div
      style={
        embedded
          ? { fontFamily: "var(--font-body)" }
          : {
              // Matches the on-map block key: translucent cream over imagery, token borders.
              background: "rgba(255, 248, 241, 0.94)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              boxShadow: "0 1px 3px rgba(43, 42, 38, 0.18)",
              padding: "6px 8px",
              minWidth: 190,
              maxWidth: 260,
              fontFamily: "var(--font-body)",
            }
      }
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          padding: 0,
          border: "none",
          background: "transparent",
          fontFamily: "var(--font-body)",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-secondary)",
          cursor: "pointer",
        }}
      >
        <span aria-hidden style={{ fontSize: 9 }}>{collapsed ? "▸" : "▾"}</span>
        {title}
      </button>
      {collapsed ? null : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            marginTop: 5,
            // Embedded, the surrounding menu owns the scrolling — a nested scroller inside it traps the wheel.
            ...(embedded ? null : { maxHeight: 300, overflowY: "auto" as const }),
          }}
        >
          {layers.map((l, i) => {
            const kids = l.children ?? [];
            const shownKids = kids.filter((k) => k.visible).length;
            const isOpen = Boolean(expanded[l.id]);
            return (
              <React.Fragment key={l.id}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "2px 0",
                    color: l.available ? undefined : "var(--text-muted)",
                  }}
                >
                  <TriCheck
                    checked={l.visible && l.available}
                    indeterminate={kids.length > 0 && shownKids < kids.length}
                    disabled={!l.available}
                    onChange={() => onToggle(l.id)}
                    label={`Toggle ${l.label} layer`}
                  />
                  {l.swatch ? (
                    <span
                      aria-hidden
                      style={{
                        width: 11,
                        height: 11,
                        borderRadius: "var(--radius-xs)",
                        background: l.swatch,
                        border: "1px solid var(--border-subtle)",
                        flex: "0 0 auto",
                      }}
                    />
                  ) : null}
                  <span style={{ flex: 1, fontSize: 12.5, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
                    {l.label}
                    {l.note ? <span style={{ color: "var(--text-muted)", fontSize: 11 }}> · {l.note}</span> : null}
                  </span>
                  {kids.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setExpanded((e) => ({ ...e, [l.id]: !e[l.id] }))}
                      aria-expanded={isOpen}
                      aria-label={isOpen ? `Hide the ${l.label} list` : `Show the ${l.label} list`}
                      title={isOpen ? "Hide the list" : "Show each one"}
                      style={arrowBtn(false)}
                    >
                      {isOpen ? "▾" : "▸"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onMove(l.id, -1)}
                    disabled={i === 0}
                    aria-label={`Move ${l.label} up`}
                    title="Move up"
                    style={arrowBtn(i === 0)}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => onMove(l.id, 1)}
                    disabled={i === layers.length - 1}
                    aria-label={`Move ${l.label} down`}
                    title="Move down"
                    style={arrowBtn(i === layers.length - 1)}
                  >
                    ▼
                  </button>
                </div>
                {isOpen
                  ? kids.map((k) => (
                      <div
                        key={k.id}
                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "1px 0 1px 18px" }}
                      >
                        <TriCheck
                          checked={k.visible && l.visible && l.available}
                          disabled={!l.visible || !l.available}
                          onChange={() => onToggle(k.id)}
                          label={`Toggle ${k.label}`}
                        />
                        {k.swatch ? (
                          <span
                            aria-hidden
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: "var(--radius-xs)",
                              background: k.swatch,
                              border: "1px solid var(--border-subtle)",
                              flex: "0 0 auto",
                            }}
                          />
                        ) : null}
                        <span
                          style={{
                            flex: 1,
                            fontSize: 12,
                            color: l.visible ? "var(--text-secondary)" : "var(--text-muted)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {k.label}
                          {k.note ? <span style={{ color: "var(--text-muted)" }}> · {k.note}</span> : null}
                        </span>
                      </div>
                    ))
                  : null}
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}

function arrowBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "0 5px",
    fontSize: 10,
    lineHeight: 1.6,
    borderRadius: "var(--radius-xs)",
    border: "1px solid var(--border-subtle)",
    background: "transparent",
    color: disabled ? "var(--text-muted)" : "var(--text-secondary)",
    cursor: disabled ? "default" : "pointer",
    flex: "0 0 auto",
  };
}
