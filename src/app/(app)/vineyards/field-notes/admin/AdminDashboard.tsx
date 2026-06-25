"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, Button, Badge, Eyebrow } from "@/components/ui";
import { type ParsedFieldNote } from "@/lib/fieldnotes/types";
import { parseBriefing } from "@/lib/fieldnotes/prompt";
import { AgendaList } from "./StructuredBriefing";
import { VineyardNoteModal } from "./VineyardNoteModal";

export type VineyardSummary = {
  vineyardId: string;
  vineyardName: string;
  latestNote: ParsedFieldNote | null;
  blockLabels: Record<string, string>;
};

export function AdminDashboard({ vineyards }: { vineyards: VineyardSummary[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const openVineyard = searchParams.get("vineyard");

  const open = React.useCallback(
    (vineyardId: string, week?: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("vineyard", vineyardId);
      if (week) params.set("week", week);
      router.push(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const close = React.useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("vineyard");
    params.delete("week");
    const qs = params.toString();
    router.push(qs ? `?${qs}` : "?", { scroll: false });
  }, [router, searchParams]);

  const selected = openVineyard
    ? vineyards.find((v) => v.vineyardId === openVineyard) ?? null
    : null;

  // Latest agendas: every vineyard whose most recent report has a ready briefing.
  const agendas = vineyards
    .map((v) => ({
      v,
      briefing:
        v.latestNote && v.latestNote.aiSummaryStatus === "READY"
          ? parseBriefing(v.latestNote.aiSummary)
          : null,
    }))
    .filter((x): x is { v: VineyardSummary; briefing: NonNullable<typeof x.briefing> } =>
      Boolean(x.briefing && x.briefing.agenda.length > 0),
    );

  return (
    <div>
      <Eyebrow rule>Vineyard operations</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: "10px 0 6px" }}>Field notes</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "var(--space-5)", maxWidth: "60ch" }}>
        Field reports from each vineyard manager, with an AI briefing on the most recent submission.
        Click a vineyard to read the full report.
      </p>

      {agendas.length > 0 ? (
        <Card padding="var(--space-5)" style={{ marginBottom: "var(--space-5)" }}>
          <Eyebrow rule>Latest call agendas</Eyebrow>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", marginTop: "var(--space-3)" }}>
            {agendas.map(({ v, briefing }) => (
              <div key={v.vineyardId}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                  <Button variant="link" size="sm" onClick={() => open(v.vineyardId, v.latestNote?.weekOf)} style={{ fontSize: 17, fontFamily: "var(--font-heading)" }}>
                    {v.vineyardName}
                  </Button>
                  <span style={{ fontSize: 12.5, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                    {v.latestNote?.weekOf}
                  </span>
                </div>
                <AgendaList briefing={briefing} dense />
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card padding="0">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14.5 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--text-muted)" }}>
              <th style={{ padding: "12px 16px", fontWeight: 500 }}>Vineyard</th>
              <th style={{ padding: "12px 16px", fontWeight: 500 }}>Last report</th>
              <th style={{ padding: "12px 16px", fontWeight: 500 }}>Briefing</th>
              <th style={{ padding: "12px 16px", fontWeight: 500, textAlign: "right" }}></th>
            </tr>
          </thead>
          <tbody>
            {vineyards.map((v) => {
              const note = v.latestNote;
              const tone =
                note?.aiSummaryStatus === "READY"
                  ? "green"
                  : note?.aiSummaryStatus === "FAILED"
                    ? "red"
                    : note
                      ? "blue"
                      : "neutral";
              const label =
                note?.aiSummaryStatus === "READY"
                  ? "ready"
                  : note?.aiSummaryStatus === "FAILED"
                    ? "failed"
                    : note
                      ? "generating"
                      : "no report";
              return (
                <tr key={v.vineyardId} style={{ borderTop: "1px solid var(--border-strong)" }}>
                  <td style={{ padding: "12px 16px" }}>
                    <Button variant="link" size="sm" onClick={() => open(v.vineyardId, note?.weekOf)} style={{ fontSize: 15 }}>
                      {v.vineyardName}
                    </Button>
                  </td>
                  <td style={{ padding: "12px 16px", color: "var(--text-secondary)" }}>
                    {note ? note.weekOf : "—"}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <Badge tone={tone} variant="soft">{label}</Badge>
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }}>
                    <Button variant="ghost" size="sm" onClick={() => open(v.vineyardId, note?.weekOf)}>
                      view
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <VineyardNoteModal
        open={selected !== null}
        onClose={close}
        vineyardName={selected?.vineyardName ?? ""}
        note={selected?.latestNote ?? null}
        blockLabels={selected?.blockLabels ?? {}}
      />
    </div>
  );
}
