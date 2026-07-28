"use client";

import React from "react";
import { useRouter, usePathname } from "next/navigation";
import { Button, IconButton } from "@/components/ui";
import {
  builtInViews,
  chipRemoveLabel,
  chipsFromParams,
  isViewActive,
  resultSummary,
  toQueryString,
  withoutChip,
  type NarrowChip,
} from "@/lib/work-orders/narrow";

/**
 * SavedViews + Narrow — replaces `WorkOrderFilterBar` (v2 §B16).
 *
 * The old bar showed seven equal-weight fields behind an Apply button, so the
 * common question ("what's mine, today") cost exactly as much as the rare one.
 * Here the common case is one click, and the current narrowing is VISIBLE as
 * removable chips rather than hidden inside a collapsed panel.
 *
 * Applies live and syncs to the URL, so a narrowed queue is shareable and
 * survives a reload. No Apply button.
 */
export function SavedViewsBar({
  params,
  count,
  currentUserEmail,
}: {
  params: Record<string, string | undefined>;
  count: number;
  currentUserEmail: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const views = builtInViews(currentUserEmail);
  const chips = chipsFromParams(params);
  const summary = resultSummary(count, chips);

  const go = (next: Record<string, string | undefined>) => {
    router.push(`${pathname}${toQueryString(next)}`);
  };

  return (
    <div style={{ marginBottom: "var(--section-gap)" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {views.map((v) => {
          const active = isViewActive(v, params);
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => go(v.params)}
              aria-pressed={active}
              style={{
                minHeight: "var(--touch-min)",
                padding: "0 14px",
                borderRadius: "var(--radius-pill)",
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: active ? "var(--ink-900)" : "var(--border-strong)",
                background: active ? "var(--ink-900)" : "var(--surface-raised)",
                color: active ? "var(--text-on-dark)" : "var(--text-secondary)",
                fontFamily: "var(--font-body)",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              {v.label}
            </button>
          );
        })}

        <span style={{ marginLeft: "auto" }} />

        {chips.map((chip: NarrowChip) => (
          <span
            key={chip.kind}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              minHeight: "var(--touch-min)",
              padding: "0 4px 0 12px",
              borderRadius: "var(--radius-pill)",
              border: "1px solid var(--accent)",
              color: "var(--text-accent)",
              fontFamily: "var(--font-body)",
              fontSize: 13.5,
            }}
          >
            {chip.label}
            <IconButton
              aria-label={chipRemoveLabel(chip)}
              onClick={() => go(withoutChip(params, chip.kind))}
              style={{ width: 36, height: 36 }}
            >
              ✕
            </IconButton>
          </span>
        ))}

        {chips.length > 0 ? (
          <Button size="sm" variant="ghost" onClick={() => go({})}>
            Clear all
          </Button>
        ) : null}
      </div>

      {/* The count is announced, not just shown. Narrowing to zero must not read
          as "the app is broken". */}
      <p aria-live="polite" style={{ margin: "10px 0 0", fontSize: 13.5, color: "var(--text-secondary)" }}>
        {summary}
      </p>
    </div>
  );
}
