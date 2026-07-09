"use client";

import Link from "next/link";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { Badge, Button, Card, Eyebrow, Tabs } from "@/components/ui";
import {
  acceptReconciliationItemAction,
  confirmMigrationEntityMappingAction,
  confirmMigrationFieldMappingAction,
  createMigrationBatchAction,
  discardMigrationBatchAction,
  publishMigrationBatchAction,
  runMigrationPreflightAction,
  signOffMigrationBatchAction,
} from "@/lib/migration/actions";

type Batch = {
  id: string;
  sourceSystem: string;
  sourceName: string | null;
  status: string;
  cutoverAt: string;
  createdAt: string;
  counts: { seedLots: number; positions: number; legacyOperations: number; analysisReadings: number; reconciliationOpen: number };
};

type DetailBatch = {
  id: string;
  sourceSystem: string;
  sourceName: string | null;
  status: string;
  cutoverAt: string;
  formatVersion?: string | null;
  [key: string]: unknown;
};

type DetailRow = {
  id?: string;
  status?: string;
  severity?: string;
  kind?: string;
  unit?: string | null;
  deltaValue?: number | null;
  occurredAt?: string | null;
  publishedAt?: string | null;
  [key: string]: unknown;
};

type Detail = {
  batch: DetailBatch;
  lots: DetailRow[];
  positions: DetailRow[];
  legacyOperations: DetailRow[];
  panels: DetailRow[];
  readings: DetailRow[];
  reconciliation: DetailRow[];
  fieldMappings: DetailRow[];
  entityMappings: DetailRow[];
};

type Props = {
  batches: Batch[];
  selectedBatchId: string | null;
  detail: Detail | null;
  proofMappings: { sourceDataset: string; sourceObjectType: string; sourceField: string; targetField: string }[];
  entitySources: { vessels: string[]; bonds: string[]; analytes: string[]; lotCodes: { sourceLotKey: string; code: string }[] };
  reference: { vessels: { id: string; label: string }[]; bonds: { id: string; label: string }[]; analytes: { id: string; label: string }[] };
};

const statusTone: Record<string, "neutral" | "gold" | "green" | "blue" | "red"> = {
  DRAFT: "neutral",
  PREFLIGHT_BLOCKED: "red",
  READY_FOR_REVIEW: "gold",
  SIGNED_OFF: "blue",
  PUBLISHED: "green",
  DISCARDED: "neutral",
};

function shortDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString() : "-";
}

function RowAction({ label, run, variant = "secondary" }: { label: string; run: () => Promise<unknown>; variant?: "primary" | "secondary" | "ghost" }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <Button
        size="sm"
        variant={variant}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            try {
              await run();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Action failed");
            }
          })
        }
      >
        {pending ? "Working..." : label}
      </Button>
      {error ? <span style={{ color: "var(--danger)", fontSize: 12 }}>{error}</span> : null}
    </span>
  );
}

function DataTable<T extends object>({ rows, columns }: { rows: T[]; columns: { key: string; label: string; render?: (row: T) => ReactNode }[] }) {
  if (rows.length === 0) return <p style={{ color: "var(--text-muted)", fontSize: 14 }}>No rows.</p>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, fontVariantNumeric: "tabular-nums" }}>
        <thead>
          <tr style={{ textAlign: "left", color: "var(--text-secondary)" }}>
            {columns.map((c) => (
              <th key={c.key} style={{ padding: "7px 8px", borderBottom: "1px solid var(--border)" }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={(r as { id?: string }).id ?? JSON.stringify(r)} style={{ borderTop: "1px solid var(--border)" }}>
              {columns.map((c) => (
                <td key={c.key} style={{ padding: "8px", verticalAlign: "top" }}>{c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? "-")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MappingPanel({ detail, proofMappings, entitySources, reference }: Pick<Props, "detail" | "proofMappings" | "entitySources" | "reference">) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const sourceSystem = detail?.batch.sourceSystem ?? "generic-proof";
  const formatVersion = detail?.batch.formatVersion ?? "phase3-v1";

  const confirmProofFields = () =>
    startTransition(async () => {
      setError(null);
      try {
        for (const m of proofMappings) {
          await confirmMigrationFieldMappingAction({ sourceSystem, formatVersion, ...m });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Mapping failed");
      }
    });

  const entityRows = [
    ...entitySources.vessels.map((sourceKey) => ({ sourceObjectType: "vessel", sourceKey, targetType: "vessel", options: reference.vessels })),
    ...entitySources.bonds.map((sourceKey) => ({ sourceObjectType: "bond", sourceKey, targetType: "bond", options: reference.bonds })),
    ...entitySources.analytes.map((sourceKey) => ({ sourceObjectType: "analyte", sourceKey, targetType: "analyte", options: reference.analytes })),
  ];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontFamily: "var(--font-heading)" }}>Field mappings</h3>
            <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", fontSize: 13 }}>{detail?.fieldMappings.length ?? 0} confirmed</p>
          </div>
          <Button size="sm" disabled={pending} onClick={confirmProofFields}>{pending ? "Confirming..." : "Confirm proof fields"}</Button>
        </div>
        {error ? <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p> : null}
        <DataTable rows={proofMappings} columns={[
          { key: "sourceDataset", label: "Dataset" },
          { key: "sourceField", label: "Source field" },
          { key: "targetField", label: "Target field" },
        ]} />
      </Card>

      <Card>
        <h3 style={{ margin: "0 0 12px", fontSize: 17, fontFamily: "var(--font-heading)" }}>Entity resolutions</h3>
        <div style={{ display: "grid", gap: 10 }}>
          {entityRows.map((row) => (
            <form
              key={`${row.sourceObjectType}:${row.sourceKey}`}
              action={async (formData) => {
                const targetId = String(formData.get("targetId") ?? "");
                if (!targetId) return;
                const selected = row.options.find((o) => o.id === targetId);
                await confirmMigrationEntityMappingAction({
                  sourceSystem,
                  sourceDataset: "current-state",
                  formatVersion,
                  sourceObjectType: row.sourceObjectType,
                  sourceKey: row.sourceKey,
                  targetType: row.targetType,
                  targetId,
                  targetCode: selected?.label.split(" ")[0] ?? targetId,
                });
              }}
              style={{ display: "grid", gridTemplateColumns: "140px minmax(180px, 1fr) auto", gap: 10, alignItems: "center" }}
            >
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{row.sourceObjectType}:{row.sourceKey}</span>
              <select name="targetId" defaultValue="" style={{ height: 36, border: "1px solid var(--border-strong)", borderRadius: 6, padding: "0 8px", background: "var(--surface-raised)" }}>
                <option value="">Select target</option>
                {row.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
              <Button size="sm" type="submit" variant="secondary">Confirm</Button>
            </form>
          ))}
          {entitySources.lotCodes.map((lot) => (
            <form
              key={`lot-code:${lot.sourceLotKey}`}
              action={async (formData) => {
                const targetCode = String(formData.get("targetCode") ?? "").trim();
                if (!targetCode) return;
                await confirmMigrationEntityMappingAction({
                  sourceSystem,
                  sourceDataset: "current-state",
                  formatVersion,
                  sourceObjectType: "lot-code",
                  sourceKey: lot.sourceLotKey,
                  targetType: "lot-code",
                  targetCode,
                });
              }}
              style={{ display: "grid", gridTemplateColumns: "140px minmax(180px, 1fr) auto", gap: 10, alignItems: "center" }}
            >
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>lot-code:{lot.sourceLotKey}</span>
              <input name="targetCode" defaultValue={lot.code} style={{ height: 36, border: "1px solid var(--border-strong)", borderRadius: 6, padding: "0 8px", background: "var(--surface-raised)" }} />
              <Button size="sm" type="submit" variant="secondary">Resolve</Button>
            </form>
          ))}
        </div>
      </Card>
    </div>
  );
}

export function MigrationClient({ batches, selectedBatchId, detail, proofMappings, entitySources, reference }: Props) {
  const selected = selectedBatchId ?? batches[0]?.id ?? null;
  const groupedRecon = useMemo(() => {
    const rows = detail?.reconciliation ?? [];
    return [...rows].sort((a, b) => {
      const status = String(a.status).localeCompare(String(b.status));
      if (status) return status;
      const severity = String(a.severity).localeCompare(String(b.severity));
      if (severity) return severity;
      return String(a.kind).localeCompare(String(b.kind));
    });
  }, [detail]);

  return (
    <div>
      <Eyebrow rule>Admin</Eyebrow>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 34, margin: "10px 0 6px" }}>Migration</h1>
          <p style={{ color: "var(--text-secondary)", margin: "0 0 22px", maxWidth: "65ch" }}>Generic proof import control room.</p>
        </div>
        <RowAction label="New proof batch" variant="primary" run={() => createMigrationBatchAction()} />
      </div>

      <Card style={{ marginBottom: 18 }}>
        <DataTable
          rows={batches}
          columns={[
            { key: "sourceName", label: "Source", render: (r) => <Link href={`/migration?batch=${r.id}`} style={{ color: "var(--text-accent)" }}>{r.sourceName ?? r.sourceSystem}</Link> },
            { key: "status", label: "Status", render: (r) => <Badge tone={statusTone[r.status] ?? "neutral"}>{r.status}</Badge> },
            { key: "cutoverAt", label: "Cutover", render: (r) => shortDate(r.cutoverAt) },
            { key: "counts", label: "Rows", render: (r) => `${r.counts.seedLots} lots / ${r.counts.positions} positions / ${r.counts.reconciliationOpen} open` },
          ]}
        />
      </Card>

      {detail && selected ? (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16 }}>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <Badge tone={statusTone[detail.batch.status] ?? "neutral"}>{detail.batch.status}</Badge>
                <h2 style={{ fontFamily: "var(--font-heading)", margin: "10px 0 0", fontSize: 22 }}>{detail.batch.sourceName ?? detail.batch.sourceSystem}</h2>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <RowAction label="Run preflight" run={() => runMigrationPreflightAction(selected)} />
                <RowAction label="Sign off" run={() => signOffMigrationBatchAction(selected)} />
                <RowAction label="Publish" variant="primary" run={() => publishMigrationBatchAction(selected)} />
                <RowAction label="Discard" variant="ghost" run={() => discardMigrationBatchAction(selected)} />
              </div>
            </div>
          </Card>

          <Tabs
            tabs={[
              {
                id: "overview",
                label: "Overview",
                content: (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
                    {[
                      ["Cutover", shortDate(detail.batch.cutoverAt)],
                      ["Seed lots", detail.lots.length],
                      ["Positions", detail.positions.length],
                      ["Legacy rows", detail.legacyOperations.length],
                      ["Chemistry", detail.readings.length],
                      ["Open items", detail.reconciliation.filter((r) => r.status === "OPEN").length],
                    ].map(([label, value]) => (
                      <Card key={String(label)} padding="14px">
                        <div style={{ color: "var(--text-secondary)", fontSize: 12 }}>{label}</div>
                        <div style={{ fontSize: 20, fontWeight: 650, marginTop: 4 }}>{value}</div>
                      </Card>
                    ))}
                  </div>
                ),
              },
              { id: "mapping", label: "Mapping", content: <MappingPanel detail={detail} proofMappings={proofMappings} entitySources={entitySources} reference={reference} /> },
              {
                id: "reconciliation",
                label: "Reconciliation",
                content: (
                  <DataTable
                    rows={groupedRecon}
                    columns={[
                      { key: "severity", label: "Severity", render: (r) => <Badge tone={r.severity === "BLOCKER" ? "red" : r.severity === "WARNING" ? "gold" : "neutral"}>{String(r.severity ?? "-")}</Badge> },
                      { key: "status", label: "Status", render: (r) => <Badge tone={r.status === "OPEN" ? "red" : r.status === "ACCEPTED" ? "blue" : "green"}>{String(r.status ?? "-")}</Badge> },
                      { key: "kind", label: "Kind" },
                      { key: "label", label: "Subject" },
                      { key: "deltaValue", label: "Delta", render: (r) => r.deltaValue == null ? "-" : `${r.deltaValue} ${r.unit ?? ""}` },
                      { key: "message", label: "Message" },
                      {
                        key: "action",
                        label: "",
                        render: (r) =>
                          r.status === "OPEN" ? (
                            <RowAction
                              label="Accept"
                              variant="secondary"
                              run={async () => {
                                const reason = window.prompt("Reason");
                                if (!reason) return;
                                await acceptReconciliationItemAction({ itemId: String(r.id), reason });
                              }}
                            />
                          ) : null,
                      },
                    ]}
                  />
                ),
              },
              {
                id: "activity",
                label: "Activity",
                content: (
                  <DataTable
                    rows={detail.legacyOperations}
                    columns={[
                      { key: "sourceActionType", label: "Type" },
                      { key: "occurredAt", label: "Occurred", render: (r) => shortDate(r.occurredAt) },
                      { key: "sourceLotKey", label: "Source lot" },
                      { key: "canonicalVolumeL", label: "Volume L" },
                      { key: "publishedAt", label: "Published", render: (r) => shortDate(r.publishedAt) },
                    ]}
                  />
                ),
              },
            ]}
          />
        </div>
      ) : (
        <Card><p style={{ color: "var(--text-muted)", margin: 0 }}>No migration batch selected.</p></Card>
      )}
    </div>
  );
}
