"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Card, Input, Button, Badge, Eyebrow } from "@/components/ui";
import { generateComplianceReport, fileComplianceReport } from "./actions";
import { returnPeriodsForYear } from "@/lib/compliance/return-cadence";
import type { ReturnCadence } from "@/lib/compliance/types";
import type { ExciseComputed } from "@/lib/compliance/excise";
import type { AnomalyFinding } from "@/lib/compliance/anomaly";
import { ExciseWorksheet } from "./ExciseWorksheet";

// plan-026 Unit 10 — the wine EXCISE return experience (TTB 5000.24). Lead with the amount owed (D1),
// then the worksheet + CBMA ladder + Pay.gov panel (ExciseWorksheet). Reuses the shipped shell idioms
// (banner/anomaly/file/download) + DESIGN.md tokens. The 5120.17 operations screen is ComplianceClient.

export type ExciseView = {
  id: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  dueDate: string;
  cadence: ReturnCadence;
  status: "DRAFT" | "FILED";
  version: "ORIGINAL" | "AMENDED";
  isFinalBusinessReport: boolean;
  remarks: string;
  computed: ExciseComputed;
  findings: AnomalyFinding[];
};

const sel: React.CSSProperties = {
  height: 40, padding: "0 10px", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)",
  background: "var(--surface-raised)", fontFamily: "var(--font-body)", fontSize: 14, color: "var(--text-primary)",
};

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

function daysUntil(iso: string): number {
  const due = new Date(iso).getTime();
  return Math.ceil((due - Date.now()) / 86_400_000);
}

export function ExciseClient(props: {
  reports: { id: string; label: string }[];
  view: ExciseView | null;
  defaults: { year: number; cadence: ReturnCadence; isEftPayer: boolean; periodIndex: number };
}) {
  const { view } = props;
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [markFinal, setMarkFinal] = React.useState(false);

  // Generate-form state (client-computed period options via the pure period calendar).
  const [year, setYear] = React.useState(props.defaults.year);
  const [cadence, setCadence] = React.useState<ReturnCadence>(props.defaults.cadence);
  const [isEftPayer, setIsEftPayer] = React.useState(props.defaults.isEftPayer);
  const [periodIndex, setPeriodIndex] = React.useState(props.defaults.periodIndex);

  const periodOptions = React.useMemo(
    () => returnPeriodsForYear(year, cadence, isEftPayer),
    [year, cadence, isEftPayer],
  );
  // Derive a safe index during render (changing year/cadence can shrink the option list) — no effect.
  const safeIndex = periodIndex < periodOptions.length ? periodIndex : 0;

  function run(fn: () => Promise<unknown>, after?: (r: unknown) => void) {
    setError(null);
    setMsg(null);
    startTransition(async () => {
      try {
        const r = await fn();
        after?.(r);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  function generate(extra?: { amendsReportId?: string }) {
    const fd = new FormData();
    fd.set("formType", "TTB_5000_24");
    fd.set("year", String(year));
    fd.set("cadence", cadence);
    fd.set("periodIndex", String(safeIndex));
    fd.set("isEftPayer", String(isEftPayer));
    if (extra?.amendsReportId) fd.set("amendsReportId", extra.amendsReportId);
    run(() => generateComplianceReport(fd), (r) => {
      const res = r as { reportId?: string };
      if (res?.reportId) router.push(`/compliance?formType=TTB_5000_24&id=${res.reportId}`);
      setMsg("Generated.");
    });
  }

  const blockers = view?.findings.filter((f) => f.severity === "blocker") ?? [];
  const canFile = view != null && view.status === "DRAFT" && blockers.length === 0;
  const isZero = view != null && view.computed.classRows.length === 0;
  const remaining = view ? daysUntil(view.dueDate) : 0;

  return (
    <div>
      <Eyebrow rule>Compliance</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: "10px 0 6px" }}>Wine Excise Tax Return</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 20, maxWidth: "70ch" }}>
        TTB Form 5000.24 (wine line + CBMA small-producer credit), computed from the same taxpaid removals
        as the operations report. Review what you owe, then file + pay on Pay.gov. Nothing is auto-submitted.
      </p>

      {error ? <p role="alert" style={{ color: "var(--danger)", fontSize: 13.5, marginBottom: 12 }}>{error}</p> : null}
      {msg ? <p style={{ color: "var(--positive)", fontSize: 13.5, marginBottom: 12 }}>{msg}</p> : null}

      {/* Generate + select */}
      <Card style={{ marginBottom: 16, padding: 16 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <Input label="Year" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 100 }} />
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Return cadence</span>
              <select value={cadence} onChange={(e) => setCadence(e.target.value as ReturnCadence)} style={sel}>
                <option value="SEMIMONTHLY">Semimonthly</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="ANNUAL">Annual</option>
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Period</span>
              <select value={safeIndex} onChange={(e) => setPeriodIndex(Number(e.target.value))} style={{ ...sel, minWidth: 200 }}>
                {periodOptions.map((p) => (
                  <option key={p.index} value={p.index}>{p.label}</option>
                ))}
              </select>
            </label>
            {cadence === "SEMIMONTHLY" ? (
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13.5, paddingBottom: 10 }} title="EFT payers file three differently-split returns in September (27 CFR 24.271)">
                <input type="checkbox" checked={isEftPayer} onChange={(e) => setIsEftPayer(e.target.checked)} /> EFT payer
              </label>
            ) : null}
            <Button variant="primary" disabled={pending} onClick={() => generate()}>{pending ? "Working…" : "Generate return"}</Button>
          </div>
          {props.reports.length > 0 ? (
            <label style={{ display: "flex", flexDirection: "column", gap: 6, marginLeft: "auto" }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>View return</span>
              <select value={view?.id ?? ""} onChange={(e) => router.push(`/compliance?formType=TTB_5000_24&id=${e.target.value}`)} style={{ ...sel, minWidth: 280 }}>
                {props.reports.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </label>
          ) : null}
        </div>
      </Card>

      {view ? (
        <>
          {/* D1 — payment banner: lead with the number owed */}
          <Card style={{ marginBottom: 16, padding: 20, borderLeft: `4px solid ${blockers.length ? "var(--danger)" : "var(--positive)"}` }}>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "baseline" }}>
              <div>
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Amount to pay</div>
                <div style={{ fontSize: 40, fontWeight: 700, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{usd(view.computed.netTax)}</div>
              </div>
              <div style={{ flex: "1 1 auto" }}>
                <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>{view.periodLabel}</div>
                <div style={{ fontSize: 13, color: remaining < 0 ? "var(--danger)" : remaining <= 3 ? "var(--warning)" : "var(--text-muted)" }}>
                  Due {view.dueDate.slice(0, 10)} · {remaining < 0 ? `${Math.abs(remaining)} day(s) overdue` : `${remaining} day(s) left`}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <Badge tone="neutral" variant="soft">{view.version}{view.isFinalBusinessReport ? " · FINAL" : ""}</Badge>
                  <Badge tone={view.status === "FILED" ? "green" : "neutral"} variant={view.status === "FILED" ? "solid" : "soft"}>{view.status}</Badge>
                  {view.computed.cbmaCredit > 0 ? <Badge tone="green" variant="soft">CBMA −{usd(view.computed.cbmaCredit)}</Badge> : null}
                </div>
              </div>
              <div style={{ fontSize: 14, color: blockers.length ? "var(--danger)" : "var(--positive)", fontWeight: 500 }}>
                {view.status === "FILED" ? "Filed (immutable)" : blockers.length ? `${blockers.length} blocker(s) before filing` : "Ready to file"}
              </div>
            </div>
          </Card>

          {/* Anomaly panel (D6 states surface here as findings) */}
          {view.findings.length > 0 ? (
            <Card style={{ marginBottom: 16, padding: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Checks</div>
              {view.findings.map((f, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "6px 0", borderTop: i ? "1px solid var(--border-subtle)" : undefined }}>
                  <span aria-hidden style={{ color: f.severity === "blocker" ? "var(--danger)" : f.severity === "warning" ? "var(--warning)" : "var(--text-muted)" }}>
                    {f.severity === "blocker" ? "⛔" : f.severity === "warning" ? "⚠" : "ℹ"}
                  </span>
                  <span style={{ fontSize: 13.5 }}><strong style={{ textTransform: "capitalize" }}>{f.severity}:</strong> {f.message}</span>
                </div>
              ))}
            </Card>
          ) : null}

          {isZero ? (
            /* D6 — calm $0 empty state (folds council Q2: semimonthly $0 needn't be filed) */
            <Card style={{ marginBottom: 16, padding: 20, color: "var(--text-secondary)" }}>
              <div style={{ fontWeight: 600, marginBottom: 4, color: "var(--text-primary)" }}>No taxpaid removals — no excise tax due</div>
              Semimonthly filers generally need not file a $0 return (27 CFR 24.271(i)). Generate anyway only
              if you want the filed record for this period.
            </Card>
          ) : (
            <ExciseWorksheet computed={view.computed} />
          )}

          {/* Actions */}
          <Card style={{ marginBottom: 16, padding: 16 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              {view.status === "DRAFT" ? (
                <>
                  <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13.5 }}>
                    <input type="checkbox" checked={markFinal} onChange={(e) => setMarkFinal(e.target.checked)} /> Final return for the business
                  </label>
                  <Button variant="primary" disabled={!canFile || pending} onClick={() => run(() => fileComplianceReport(view.id, markFinal), () => setMsg("Return filed."))} title={canFile ? "" : "Resolve blockers first"}>
                    {pending ? "Working…" : "Mark filed"}
                  </Button>
                </>
              ) : (
                <Button variant="secondary" disabled={pending} onClick={() => generate({ amendsReportId: view.id })}>Amend (new version)</Button>
              )}
              <a href={`/api/compliance/${view.id}/pdf`} target="_blank" rel="noreferrer">
                <Button variant="ghost" type="button">Download filled PDF (for your records)</Button>
              </a>
            </div>
          </Card>

          <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 20 }}>
            Wine line only. The combined form&apos;s spirits/beer/tobacco lines are left blank — we do not compute them.
            Pay.gov e-file, the TTB Pilot Combined Return, and state/DTC excise are deferred follow-ons.
          </p>
        </>
      ) : (
        <Card style={{ marginBottom: 16, padding: 16, color: "var(--text-muted)" }}>No excise return yet — pick a period and generate one.</Card>
      )}
    </div>
  );
}
