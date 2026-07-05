"use client";

import React from "react";

export interface TabItem {
  /** Stable id — used for state, aria wiring, and the value/onChange contract. */
  id: string;
  /** The tab label (rendered in the tab strip). Sentence-case. */
  label: React.ReactNode;
  /** The panel content. Stays MOUNTED even when the tab is inactive. */
  content: React.ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  /** Initial active tab when uncontrolled. Defaults to the first tab's id. */
  defaultTab?: string;
  /** Controlled active tab id. Omit for uncontrolled (use `defaultTab`). */
  value?: string;
  /** Fires with the next tab id whenever the active tab changes (both modes). */
  onChange?: (id: string) => void;
  /** Base id for the generated tab/panel ids (defaults to a React useId). */
  idBase?: string;
  style?: React.CSSProperties;
  /** Extra style for the tab strip (role="tablist"). */
  stripStyle?: React.CSSProperties;
}

/**
 * Tabs — accessible, token-styled tab strip + panels. Controlled or uncontrolled.
 *
 * The tab strip is a `role="tablist"` of `role="tab"` buttons with roving tabindex and
 * ArrowLeft/ArrowRight/Home/End keyboard nav; the active tab carries a wine-accent underline.
 *
 * CRITICAL: ALL panels stay mounted — inactive ones are hidden via the `hidden` attribute —
 * so a child chart/form keeps its interactive state when switching tabs (differs from Collapsible,
 * which unmounts). The strip scrolls horizontally (no wrap) on narrow widths.
 */
export function Tabs({
  tabs,
  defaultTab,
  value,
  onChange,
  idBase,
  style,
  stripStyle,
}: TabsProps) {
  const autoId = React.useId();
  const base = idBase ?? autoId;
  const isControlled = value !== undefined;
  const firstId = tabs[0]?.id;
  const [internal, setInternal] = React.useState<string | undefined>(defaultTab ?? firstId);
  const activeRaw = isControlled ? value : internal;
  // Fall back to the first tab if the active id no longer matches a tab.
  const active = tabs.some((t) => t.id === activeRaw) ? activeRaw : firstId;

  const tabRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});

  const select = (id: string) => {
    if (!isControlled) setInternal(id);
    onChange?.(id);
  };

  const tabId = (id: string) => `${base}-tab-${id}`;
  const panelId = (id: string) => `${base}-panel-${id}`;

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (e.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    else if (e.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") nextIndex = 0;
    else if (e.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === null) return;
    e.preventDefault();
    const next = tabs[nextIndex];
    if (!next) return;
    select(next.id);
    tabRefs.current[next.id]?.focus();
  };

  return (
    <div style={style}>
      <div
        role="tablist"
        style={{
          display: "flex",
          alignItems: "stretch",
          gap: "var(--space-3)",
          overflowX: "auto",
          flexWrap: "nowrap",
          borderBottom: "1px solid var(--border-default)",
          ...stripStyle,
        }}
      >
        {tabs.map((tab, index) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[tab.id] = el;
              }}
              type="button"
              role="tab"
              id={tabId(tab.id)}
              aria-selected={isActive}
              aria-controls={panelId(tab.id)}
              tabIndex={isActive ? 0 : -1}
              onClick={() => select(tab.id)}
              onKeyDown={(e) => onKeyDown(e, index)}
              style={{
                flex: "none",
                whiteSpace: "nowrap",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "var(--space-2) var(--space-1)",
                fontFamily: "var(--font-body)",
                fontSize: "var(--text-body-sm)",
                fontWeight: isActive ? 600 : 400,
                color: isActive ? "var(--text-primary)" : "var(--text-muted)",
                // Underline via a bottom border that overlaps the strip's own border.
                borderBottom: isActive
                  ? "2px solid var(--accent)"
                  : "2px solid transparent",
                marginBottom: -1,
                borderRadius: "var(--radius-xs) var(--radius-xs) 0 0",
                transition:
                  "color var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard)",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <div
            key={tab.id}
            role="tabpanel"
            id={panelId(tab.id)}
            aria-labelledby={tabId(tab.id)}
            hidden={!isActive}
            tabIndex={0}
            style={{ paddingTop: "var(--space-3)" }}
          >
            {tab.content}
          </div>
        );
      })}
    </div>
  );
}
