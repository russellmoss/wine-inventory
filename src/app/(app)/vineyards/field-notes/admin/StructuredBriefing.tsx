"use client";

import React from "react";
import type {
  Briefing,
  BriefingPriority,
  BriefingTone,
} from "@/lib/fieldnotes/prompt";

// Shared, styled rendering of a structured briefing: an agenda up top (priority
// colored), then toned section items with block chips. Colors come from tokens.

const PRIORITY_META: Record<BriefingPriority, { label: string; color: string }> = {
  high: { label: "High", color: "var(--danger)" },
  medium: { label: "Med", color: "var(--warning)" },
  low: { label: "Low", color: "var(--text-muted)" },
};

const TONE_COLOR: Record<BriefingTone, string> = {
  alert: "var(--danger)",
  watch: "var(--warning)",
  info: "var(--text-muted)",
};

const TONE_SYMBOL: Record<BriefingTone, string> = {
  alert: "▲",
  watch: "●",
  info: "○",
};

/** The 3-question agenda, priority-colored. The headline action of the briefing. */
export function AgendaList({ briefing, dense = false }: { briefing: Briefing; dense?: boolean }) {
  if (briefing.agenda.length === 0) return null;
  return (
    <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: dense ? 8 : 10 }}>
      {briefing.agenda.map((item, i) => {
        const meta = PRIORITY_META[item.priority];
        return (
          <li
            key={i}
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              padding: dense ? "8px 10px" : "10px 12px",
              background: "var(--surface-raised)",
              border: "1px solid var(--border-subtle)",
              borderLeft: `3px solid ${meta.color}`,
              borderRadius: "var(--radius-md)",
            }}
          >
            <span
              style={{
                flex: "0 0 auto",
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: meta.color,
                border: `1px solid ${meta.color}`,
                borderRadius: "var(--radius-xs)",
                padding: "2px 6px",
                marginTop: 1,
              }}
            >
              {meta.label}
            </span>
            <span style={{ fontSize: dense ? 13.5 : 14.5, lineHeight: 1.5, color: "var(--text-primary)" }}>
              {item.question}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function SectionItem({ tone, text, block }: { tone: BriefingTone; text: string; block: string }) {
  return (
    <li style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "3px 0" }}>
      <span aria-hidden style={{ flex: "0 0 auto", color: TONE_COLOR[tone], fontSize: 11, lineHeight: 1.6, marginTop: 1 }}>
        {TONE_SYMBOL[tone]}
      </span>
      <span style={{ fontSize: 14, lineHeight: 1.55, color: "var(--text-secondary)" }}>
        {block ? (
          <span
            style={{
              display: "inline-block",
              fontSize: 11.5,
              fontWeight: 600,
              color: "var(--text-primary)",
              background: "var(--surface-sunken)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-xs)",
              padding: "1px 6px",
              marginRight: 7,
            }}
          >
            {block}
          </span>
        ) : null}
        {text}
      </span>
    </li>
  );
}

/** Full structured briefing: headline → agenda → sections. */
export function StructuredBriefing({ briefing }: { briefing: Briefing }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {briefing.headline ? (
        <p style={{ fontSize: 15.5, lineHeight: 1.55, color: "var(--text-primary)", margin: 0, fontFamily: "var(--font-heading)", fontWeight: 300 }}>
          {briefing.headline}
        </p>
      ) : null}

      <div>
        <SectionLabel>Call agenda</SectionLabel>
        <AgendaList briefing={briefing} />
      </div>

      {briefing.sections.map((section) => (
        <div key={section.key}>
          <SectionLabel>{section.title}</SectionLabel>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {section.items.map((it, i) => (
              <SectionItem key={i} tone={it.tone} text={it.text} block={it.block} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11.5,
        fontWeight: 600,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: "var(--text-muted)",
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}
