"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, Button, Badge, Eyebrow } from "@/components/ui";
import { type ParsedFieldNote } from "@/lib/fieldnotes/types";
import { BriefingCard } from "./BriefingCard";
import { VineyardNoteModal } from "./VineyardNoteModal";

export type VineyardSummary = {
  vineyardId: string;
  vineyardName: string;
  latestNote: ParsedFieldNote | null;
  blockLabels: Record<string, string>;
};

export function AdminDashboard({
  vineyards,
  topBriefing,
}: {
  vineyards: VineyardSummary[];
  topBriefing: ParsedFieldNote | null;
}) {
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

  return (
    <div>
      <Eyebrow rule>Vineyard operations</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: "10px 0 6px" }}>Field notes</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "var(--space-5)", maxWidth: "60ch" }}>
        Weekly reports from each vineyard manager, with an AI briefing on the most recent submission.
        Click a vineyard to read the full report.
      </p>

      {topBriefing ? (
        <div style={{ marginBottom: "var(--space-5)" }}>
          <BriefingCard
            note={topBriefing}
            vineyardName={
              vineyards.find((v) => v.vineyardId === topBriefing.vineyardId)?.vineyardName
            }
          />
        </div>
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
                    {note ? `week of ${note.weekOf}` : "—"}
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
