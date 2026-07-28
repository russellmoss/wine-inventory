"use client";

import Link from "next/link";
import {
  Card,
  PageHeader,
  Button,
  StatusChip,
  ResponsiveTable,
  DataRow,
  DataCell,
  DataHeadCell,
  EmptyState,
  type StatusVariant,
} from "@/components/ui";
import type { FermentWorksheetRow } from "@/lib/ferment/worksheet-data";

/**
 * The Fermentation worksheet (OD-8).
 *
 * One row per vessel, matching InnoVint's Ferm Gen and Vintrace's Ferments
 * Console — both incumbents converge on a vessel-row worksheet you ACT from,
 * filtered to live ferments, with Brix and temperature as the at-a-glance
 * columns.
 *
 * Deliberately NOT a tank board. In both products the ferment console and the
 * tank map are separate surfaces: a worksheet is a dense actionable table, a
 * board is a spatial map. The board is Phase 6.
 *
 * Deliberately NOT a linear stage column either. We show all three vectors,
 * because a lot can be DRY on alcohol and mid-MLF at the same time and InnoVint's
 * single `Stage` enum cannot say that.
 */

/** AF/MLF are separate vectors, so each gets its own chip rather than one merged status. */
function afVariant(af: string): StatusVariant {
  if (af === "ACTIVE") return "active";
  if (af === "DRY") return "done";
  return "neutral";
}
function mlfVariant(mlf: string): StatusVariant {
  if (mlf === "ACTIVE") return "active";
  if (mlf === "COMPLETE") return "done";
  return "neutral";
}
const word = (s: string) => s.toLowerCase().replace(/_/g, " ");

export function FermentWorksheetClient({ rows }: { rows: FermentWorksheetRow[] }) {
  const activeAf = rows.filter((r) => r.afState === "ACTIVE").length;
  const inMlf = rows.filter((r) => r.mlfState === "ACTIVE").length;

  return (
    <div>
      <PageHeader
        eyebrow="Winery"
        title="Fermentations"
        summary={
          rows.length === 0
            ? "Nothing is fermenting right now."
            : `${rows.length} ${rows.length === 1 ? "vessel" : "vessels"} fermenting — ` +
              `${activeAf} in alcoholic ferment, ${inMlf} in MLF.`
        }
        actions={
          <Link href="/ferment/process" style={{ textDecoration: "none" }}>
            <Button>De-stem &amp; press</Button>
          </Link>
        }
      />

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            title="No active ferments"
            actions={
              <>
                <Link href="/ferment/process" style={{ textDecoration: "none" }}>
                  <Button size="sm">De-stem &amp; press</Button>
                </Link>
                <Link href="/bulk" style={{ textDecoration: "none" }}>
                  <Button size="sm" variant="secondary">
                    Cellar floor
                  </Button>
                </Link>
              </>
            }
          >
            A vessel appears here as soon as its lot is in alcoholic fermentation or
            malolactic fermentation. Start one by processing fruit, or record a state change
            from the cellar floor.
          </EmptyState>
        </Card>
      ) : (
        <Card>
          <ResponsiveTable caption="Vessels with a fermenting lot">
            <thead>
              <tr>
                <DataHeadCell>Vessel</DataHeadCell>
                <DataHeadCell>Lot</DataHeadCell>
                <DataHeadCell>Form</DataHeadCell>
                <DataHeadCell>Alcoholic</DataHeadCell>
                <DataHeadCell>MLF</DataHeadCell>
                <DataHeadCell numeric>Volume</DataHeadCell>
                <DataHeadCell numeric>Brix</DataHeadCell>
                <DataHeadCell numeric>Temp</DataHeadCell>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <DataRow key={`${r.vesselId}:${r.lotId}`}>
                  <DataCell identity>
                    <Link href="/bulk" style={{ color: "var(--text-accent)", fontFamily: "var(--font-mono)", fontSize: 13 }}>
                      {r.vesselCode}
                    </Link>
                  </DataCell>
                  <DataCell>
                    <Link href={`/lots/${r.lotId}`} style={{ color: "var(--text-accent)" }}>
                      {r.lotCode}
                    </Link>
                    {r.varietyName ? (
                      <span style={{ color: "var(--text-muted)" }}> · {r.varietyName}</span>
                    ) : null}
                  </DataCell>
                  <DataCell style={{ color: "var(--text-secondary)" }}>{word(r.form)}</DataCell>
                  <DataCell>
                    <StatusChip variant={afVariant(r.afState)}>{word(r.afState)}</StatusChip>
                  </DataCell>
                  <DataCell>
                    <StatusChip variant={mlfVariant(r.mlfState)}>{word(r.mlfState)}</StatusChip>
                  </DataCell>
                  <DataCell numeric>{r.volumeL.toLocaleString()} L</DataCell>
                  {/* An em dash, not 0 — "no reading yet" and "measured zero" are
                      different facts, and on a ferment they are very different facts. */}
                  <DataCell numeric>{r.brix == null ? "—" : r.brix.toFixed(1)}</DataCell>
                  <DataCell numeric>{r.tempC == null ? "—" : `${r.tempC.toFixed(1)} °C`}</DataCell>
                </DataRow>
              ))}
            </tbody>
          </ResponsiveTable>
        </Card>
      )}
    </div>
  );
}
