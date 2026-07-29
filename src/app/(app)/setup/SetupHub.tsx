import React from "react";
import Link from "next/link";
import { Card } from "@/components/ui";
import type { SectionItem } from "@/lib/nav/sections";

/**
 * The Setup index (D4 / OD-3b-1).
 *
 * The legacy sidebar's `SETUP` group held eight entries. `SectionNav`'s own
 * docstring says more than five is a sign the destination should split, so a flat
 * tab strip is the wrong shape — these get grouped cards with a line of "what is
 * this for" copy each, because "Reference" and "Locations" do not tell a new cellar
 * hand which one holds the tanks.
 *
 * Presentational only: the ordering, the grouping and the role/program filtering all
 * come from `src/lib/nav/sections.ts`, the same module the Ctrl-K palette reads (D2).
 */
export function SetupHub({ items }: { items: SectionItem[] }) {
  // Group in the model's declared order rather than alphabetically — "Cellar" before
  // "System" is a statement about how often each is opened.
  const groups: { name: string; items: SectionItem[] }[] = [];
  for (const item of items) {
    const name = item.group ?? "Other";
    const existing = groups.find((g) => g.name === name);
    if (existing) existing.items.push(item);
    else groups.push({ name, items: [item] });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--section-gap)" }}>
      {groups.map((group) => (
        <section key={group.name}>
          <h2
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "var(--text-body-lg)",
              margin: "0 0 var(--space-3)",
              color: "var(--text-primary)",
            }}
          >
            {group.name}
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: "var(--space-4)",
            }}
          >
            {group.items.map((item) => (
              <Card key={item.href} as="div" padding="0" interactive>
                <Link
                  href={item.href}
                  style={{
                    // The whole card is the target, not just the title — a gloved
                    // thumb should not have to find a 14px link.
                    display: "block",
                    padding: "var(--space-4)",
                    minHeight: "var(--touch-min)",
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      fontFamily: "var(--font-heading)",
                      fontSize: "var(--text-body)",
                      color: "var(--text-primary)",
                      marginBottom: item.blurb ? "var(--space-1)" : 0,
                    }}
                  >
                    {item.label}
                  </span>
                  {item.blurb ? (
                    <span
                      style={{
                        display: "block",
                        fontFamily: "var(--font-body)",
                        fontSize: 13.5,
                        lineHeight: "var(--leading-normal)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {item.blurb}
                    </span>
                  ) : null}
                </Link>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
