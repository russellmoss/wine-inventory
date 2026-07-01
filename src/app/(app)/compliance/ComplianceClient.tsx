"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Card, Input, Button, Badge, Eyebrow } from "@/components/ui";
import {
  generateComplianceReport,
  recordTaxpaidRemoval,
  recordBottledRemoval,
  fileComplianceReport,
  saveComplianceProfile,
} from "./actions";
import { TAX_CLASS_COLUMNS, SECTION_A_LINES, SECTION_B_LINES } from "@/lib/compliance/form-labels";
import { REMOVAL_DISPOSITION_LABELS } from "@/lib/compliance/removal-reasons";
import { BOTTLED_REMOVAL_LABELS } from "@/lib/compliance/bottled-removal";
import type { AnomalyFinding } from "@/lib/compliance/anomaly";
import type { PerLotClass } from "@/lib/compliance/generate";
import type { WineTaxClass } from "@/lib/compliance/types";

type Cell = { section: "A" | "B"; line: number; column: WineTaxClass; sub: "BF" | "BP" | null; gallons: number };
type Footing = { section: "A" | "B"; column: WineTaxClass; sub: "BF" | "BP" | null; addSideTotal: number; removeSideTotal: number; foots: boolean };

export type ReportView = {
  id: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  cadence: "MONTHLY" | "QUARTERLY" | "ANNUAL";
  status: "DRAFT" | "FILED";
  version: "ORIGINAL" | "AMENDED";
  isFinalBusinessReport: boolean;
  remarks: string;
  cells: Cell[];
  footings: Footing[];
  balanced: boolean;
  a13EqualsB2: boolean;
  perLot: PerLotClass[];
  overrides: Record<string, string>;
  findings: AnomalyFinding[];
};

export type VesselOpt = { id: string; code: string; availableL: number };
export type BottledOpt = { value: string; label: string; bottles: number };

const sel: React.CSSProperties = {
  height: 40, padding: "0 10px", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)",
  background: "var(--surface-raised)", fontFamily: "var(--font-body)", fontSize: 14, color: "var(--text-primary)",
};

const CLASS_LABEL: Record<string, string> = {
  A_LE16: "a · ≤16%", B_16_21: "b · 16–21%", C_21_24: "c · 21–24%", D_CARBONATED: "d · carbonated", E_SPARKLING: "e · sparkling", F_HARD_CIDER: "f · cider",
};

export function ComplianceClient(props: {
  reports: { id: string; label: string }[];
  view: ReportView | null;
  profile: { ein: string; registryNumber: string; operatedByName: string; operatedByAddress: string; operatedByPhone: string };
  vessels: VesselOpt[];
  bottled: BottledOpt[];
  defaults: { year: number; month: number; cadence: "MONTHLY" | "QUARTERLY" | "ANNUAL" };
}) {
  const { view } = props;
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [overrides, setOverrides] = React.useState<Record<string, string>>(view?.overrides ?? {});
  const [remarks, setRemarks] = React.useState(view?.remarks ?? "");
  const [showProfile, setShowProfile] = React.useState(false);
  const [markFinal, setMarkFinal] = React.useState(false);
  // Editable state is seeded from the selected report; the parent remounts this component (key={view.id})
  // when the report changes, so no reset-in-effect is needed.

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

  const blockers = view?.findings.filter((f) => f.severity === "blocker") ?? [];
  const canFile = view != null && view.status === "DRAFT" && view.balanced && blockers.length === 0;

  // Cell lookup.
  const cellMap = new Map<string, number>();
  for (const c of view?.cells ?? []) cellMap.set(`${c.section}.${c.line}.${c.column}.${c.sub ?? "-"}`, c.gallons);
  const footMap = new Map<string, Footing>();
  for (const f of view?.footings ?? []) footMap.set(`${f.section}.${f.column}.${f.sub ?? "-"}`, f);

  function gallons(section: "A" | "B", line: number, column: WineTaxClass, sub: "BF" | "BP" | null): number | null {
    // TOTAL lines come from footings; other lines from cells.
    if ((section === "A" && line === 12) || (section === "B" && line === 7)) return footMap.get(`${section}.${column}.${sub ?? "-"}`)?.addSideTotal ?? null;
    if ((section === "A" && line === 32) || (section === "B" && line === 21)) return footMap.get(`${section}.${column}.${sub ?? "-"}`)?.removeSideTotal ?? null;
    const v = cellMap.get(`${section}.${line}.${column}.${sub ?? "-"}`);
    return v ?? null;
  }

  function regenerate(extra?: Partial<{ amendsReportId: string }>) {
    if (!view) return;
    const fd = new FormData();
    const [y, m] = view.periodLabel.split("-");
    fd.set("year", y);
    fd.set("month", m);
    fd.set("cadence", view.cadence);
    fd.set("overrides", JSON.stringify(overrides));
    fd.set("remarks", remarks);
    if (extra?.amendsReportId) fd.set("amendsReportId", extra.amendsReportId);
    run(() => generateComplianceReport(fd), () => setMsg("Regenerated."));
  }

  return (
    <div>
      <Eyebrow rule>Compliance</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: "10px 0 6px" }}>TTB Report of Wine Premises Operations</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 20, maxWidth: "70ch" }}>
        Auto-generated Form 5120.17 (Part I §A + §B) from the lot ledger, in US gallons. Review the derived numbers,
        override a lot&apos;s tax class if needed, add Part X remarks, then mark it filed and download the filled PDF.
        Nothing is ever auto-submitted.
      </p>

      {error ? <p style={{ color: "var(--danger)", fontSize: 13.5, marginBottom: 12 }}>{error}</p> : null}
      {msg ? <p style={{ color: "var(--positive)", fontSize: 13.5, marginBottom: 12 }}>{msg}</p> : null}

      {/* Generate + select */}
      <Card style={{ marginBottom: 16, padding: 16 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(() => generateComplianceReport(new FormData(e.currentTarget)), () => { router.push("/compliance"); });
            }}
            style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}
          >
            <Input label="Year" name="year" type="number" defaultValue={props.defaults.year} required style={{ width: 100 }} />
            <Input label="Month" name="month" type="number" min="1" max="12" defaultValue={props.defaults.month} style={{ width: 90 }} />
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Cadence</span>
              <select name="cadence" defaultValue={props.defaults.cadence} style={sel}>
                <option value="MONTHLY">Monthly</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="ANNUAL">Annual</option>
              </select>
            </label>
            <Button type="submit" variant="primary" disabled={pending}>{pending ? "Working…" : "Generate report"}</Button>
          </form>
          {props.reports.length > 0 ? (
            <label style={{ display: "flex", flexDirection: "column", gap: 6, marginLeft: "auto" }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>View report</span>
              <select value={view?.id ?? ""} onChange={(e) => router.push(`/compliance?id=${e.target.value}`)} style={{ ...sel, minWidth: 260 }}>
                {props.reports.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </label>
          ) : null}
        </div>
      </Card>

      {view ? (
        <>
          {/* Reconciliation / readiness banner (lead with trust) */}
          <Card style={{ marginBottom: 16, padding: 16, borderLeft: `4px solid ${view.balanced && blockers.length === 0 ? "var(--positive)" : "var(--danger)"}` }}>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{view.balanced ? "Balances ✓" : "Does not balance ✗"}</div>
              <Badge tone={view.balanced ? "green" : "red"} variant="soft">{view.a13EqualsB2 ? "§A13 = §B2 ✓" : "§A13 ≠ §B2"}</Badge>
              <Badge tone="neutral" variant="soft">{view.version}{view.isFinalBusinessReport ? " · FINAL" : ""}</Badge>
              <Badge tone={view.status === "FILED" ? "green" : "neutral"} variant={view.status === "FILED" ? "solid" : "soft"}>{view.status}</Badge>
              <div style={{ marginLeft: "auto", fontSize: 14, color: blockers.length ? "var(--danger)" : "var(--positive)" }}>
                {view.status === "FILED" ? "Filed (immutable)" : blockers.length ? `${blockers.length} blocker(s) before filing` : "Ready to file"}
              </div>
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>
              Period {view.periodStart} → {view.periodEnd} · {view.cadence.toLowerCase()}
            </div>
          </Card>

          {/* Anomaly panel */}
          {view.findings.length > 0 ? (
            <Card style={{ marginBottom: 16, padding: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Checks</div>
              {view.findings.map((f, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "6px 0", borderTop: i ? "1px solid var(--border-subtle)" : undefined }}>
                  <span aria-hidden style={{ color: f.severity === "blocker" ? "var(--danger)" : f.severity === "warning" ? "var(--warning)" : "var(--text-muted)" }}>
                    {f.severity === "blocker" ? "⛔" : f.severity === "warning" ? "⚠" : "ℹ"}
                  </span>
                  <span style={{ fontSize: 13.5 }}>
                    <strong style={{ textTransform: "capitalize" }}>{f.severity}:</strong> {f.message}
                    {f.jumpTo ? <span style={{ color: "var(--text-muted)" }}> (§{f.jumpTo.section} line {f.jumpTo.line})</span> : null}
                  </span>
                </div>
              ))}
            </Card>
          ) : null}

          {/* The grid */}
          <SectionGrid title="Section A — Bulk wines (gallons)" section="A" lines={SECTION_A_LINES} gallons={gallons} />
          <SectionGrid title="Section B — Bottled wines (gallons)" section="B" lines={SECTION_B_LINES} gallons={gallons} />

          {/* Per-lot tax-class override */}
          {view.perLot.length > 0 ? (
            <Card style={{ marginBottom: 16, padding: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Lot tax classes {view.status === "FILED" ? "(filed — read only)" : "(override then regenerate)"}</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--text-muted)" }}>
                      <th scope="col" style={{ padding: "6px 8px" }}>Lot</th>
                      <th scope="col" style={{ padding: "6px 8px" }}>ABV</th>
                      <th scope="col" style={{ padding: "6px 8px" }}>Derived class</th>
                      <th scope="col" style={{ padding: "6px 8px" }}>Override</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.perLot.map((l) => (
                      <tr key={l.lotId} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                        <td style={{ padding: "6px 8px" }}>{l.lotCode}{l.needsAbvReview ? <Badge tone="red" variant="soft" style={{ marginLeft: 6 }}>needs ABV</Badge> : null}</td>
                        <td style={{ padding: "6px 8px", color: "var(--text-muted)" }}>{l.abv == null ? "—" : `${l.abv}%`}</td>
                        <td style={{ padding: "6px 8px" }}>{CLASS_LABEL[l.taxClass] ?? l.taxClass}{l.overridden ? <span style={{ color: "var(--warning)" }}> (overridden)</span> : null}</td>
                        <td style={{ padding: "6px 8px" }}>
                          <select
                            disabled={view.status === "FILED" || pending}
                            value={overrides[l.lotId] ?? ""}
                            onChange={(e) => setOverrides((o) => { const n = { ...o }; if (e.target.value) n[l.lotId] = e.target.value; else delete n[l.lotId]; return n; })}
                            style={{ ...sel, height: 32 }}
                          >
                            <option value="">(derived)</option>
                            {TAX_CLASS_COLUMNS.map((c) => <option key={c.key} value={c.key}>{CLASS_LABEL[c.key]}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}

          {/* Part X + actions */}
          <Card style={{ marginBottom: 16, padding: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Part X — Remarks</div>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              disabled={view.status === "FILED"}
              rows={4}
              style={{ width: "100%", padding: 10, border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)", background: "var(--surface-raised)", fontFamily: "var(--font-body)", fontSize: 14, color: "var(--text-primary)", resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
              {view.status === "DRAFT" ? (
                <Button variant="secondary" disabled={pending} onClick={() => regenerate()}>Save &amp; regenerate</Button>
              ) : null}
              {view.status === "DRAFT" ? (
                <>
                  <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13.5 }}>
                    <input type="checkbox" checked={markFinal} onChange={(e) => setMarkFinal(e.target.checked)} /> Final report for the business
                  </label>
                  <Button variant="primary" disabled={!canFile || pending} onClick={() => run(() => fileComplianceReport(view.id, markFinal), () => setMsg("Report filed."))} title={canFile ? "" : "Resolve blockers first"}>
                    {pending ? "Working…" : "Mark filed"}
                  </Button>
                </>
              ) : (
                <Button variant="secondary" disabled={pending} onClick={() => regenerate({ amendsReportId: view.id })}>Amend (new version)</Button>
              )}
              <a href={`/api/compliance/${view.id}/pdf`} target="_blank" rel="noreferrer">
                <Button variant="ghost" type="button">Download filled PDF</Button>
              </a>
            </div>
          </Card>

          {/* Deferred parts note */}
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 20 }}>
            Parts III, IV, VI–IX (spirits, materials, distilling/vinegar, in-fermenters, nonbeverage) are not computed in v1.
            Excise Form 5000.24, CBMA credits, Pay.gov e-file, and state/DTC are deferred follow-ons.
          </p>
        </>
      ) : (
        <Card style={{ marginBottom: 16, padding: 16, color: "var(--text-muted)" }}>No report yet — pick a period and generate one.</Card>
      )}

      {/* Record a tax-determination removal */}
      <Card style={{ marginBottom: 16, padding: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Record a removal (tax determination)</div>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 10, maxWidth: "70ch" }}>
          Wine is born in-bond; the taxable event is the removal. This appends a reversible <code>REMOVE_TAXPAID</code> operation
          to the ledger — undo it any time from the lot timeline.
        </p>
        <form
          onSubmit={(e) => { e.preventDefault(); run(() => recordTaxpaidRemoval(new FormData(e.currentTarget)), () => { (e.target as HTMLFormElement).reset(); setMsg("Removal recorded."); }); }}
          style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Vessel</span>
            <select name="vesselId" required style={sel}>
              <option value="">Choose vessel</option>
              {props.vessels.map((v) => <option key={v.id} value={v.id}>{v.code} · {v.availableL} L</option>)}
            </select>
          </label>
          <Input label="Volume (L)" name="volumeL" type="number" step="0.01" min="0.01" required style={{ width: 130 }} />
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Disposition</span>
            <select name="disposition" defaultValue="TAXPAID" style={sel}>
              {Object.entries(REMOVAL_DISPOSITION_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </label>
          <Input label="Date" name="date" type="date" style={{ width: 160 }} />
          <Button type="submit" variant="secondary" disabled={pending || props.vessels.length === 0}>Record removal</Button>
        </form>
      </Card>

      {/* Remove BOTTLED wine from finished-goods inventory (§B lines) */}
      <Card style={{ marginBottom: 16, padding: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Remove bottled wine (from inventory)</div>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 10, maxWidth: "70ch" }}>
          Bottled wine leaves finished-goods inventory — a sale, a tasting pour, an export, family use, or breakage.
          Pick the disposition and it lands on the right §B line (taxpaid → B8, tasting → B11, export → B12,
          family → B13, testing → B14, breakage → B18). This is the path a Commerce7 depletion would drive automatically.
        </p>
        {props.bottled.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No bottled inventory on hand yet.</p>
        ) : (
          <form
            onSubmit={(e) => { e.preventDefault(); run(() => recordBottledRemoval(new FormData(e.currentTarget)), () => { (e.target as HTMLFormElement).reset(); setMsg("Bottled removal recorded."); }); }}
            style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}
          >
            <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 320px" }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Bottled wine · location</span>
              <select name="skuLoc" required style={sel}>
                <option value="">Choose bottled wine</option>
                {props.bottled.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
            </label>
            <Input label="Bottles" name="bottles" type="number" min="1" step="1" required style={{ width: 110 }} />
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Disposition</span>
              <select name="disposition" defaultValue="TAXPAID" style={sel}>
                {Object.entries(BOTTLED_REMOVAL_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </label>
            <Button type="submit" variant="secondary" disabled={pending}>Remove bottles</Button>
          </form>
        )}
      </Card>

      {/* Profile */}
      <Card style={{ marginBottom: 16, padding: 16 }}>
        <button onClick={() => setShowProfile((s) => !s)} style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 600, color: "var(--text-primary)", padding: 0 }}>
          {showProfile ? "▾" : "▸"} Compliance profile (form header)
        </button>
        {showProfile ? (
          <form
            onSubmit={(e) => { e.preventDefault(); run(() => saveComplianceProfile(new FormData(e.currentTarget)), () => setMsg("Profile saved.")); }}
            style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}
          >
            <Input label="EIN" name="ein" defaultValue={props.profile.ein} style={{ width: 180 }} />
            <Input label="Registry number" name="registryNumber" defaultValue={props.profile.registryNumber} style={{ width: 200 }} />
            <Input label="Operated by (name)" name="operatedByName" defaultValue={props.profile.operatedByName} style={{ flex: "1 1 240px" }} />
            <Input label="Address" name="operatedByAddress" defaultValue={props.profile.operatedByAddress} style={{ flex: "1 1 240px" }} />
            <Input label="Phone" name="operatedByPhone" defaultValue={props.profile.operatedByPhone} style={{ width: 160 }} />
            <div style={{ display: "flex", alignItems: "flex-end" }}><Button type="submit" variant="secondary" disabled={pending}>Save profile</Button></div>
          </form>
        ) : null}
      </Card>
    </div>
  );
}

/** A faithful §-grid: line-label column + the 6 tax-class columns (BF/BP split rows under e). */
function SectionGrid(props: {
  title: string;
  section: "A" | "B";
  lines: { line: number; label: string; kind: string }[];
  gallons: (section: "A" | "B", line: number, column: WineTaxClass, sub: "BF" | "BP" | null) => number | null;
}) {
  const fmt = (v: number | null) => (v == null || v === 0 ? "" : v.toFixed(2));
  return (
    <Card padding="0" style={{ marginBottom: 16, overflowX: "auto" }}>
      <div style={{ padding: "12px 14px", fontWeight: 600, borderBottom: "1px solid var(--border-subtle)" }}>{props.title}</div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 760 }}>
        <thead>
          <tr style={{ color: "var(--text-muted)", background: "var(--surface-sunken)" }}>
            <th scope="col" style={{ padding: "8px 10px", textAlign: "left", position: "sticky", left: 0, background: "var(--surface-sunken)", minWidth: 220 }}>Item</th>
            {TAX_CLASS_COLUMNS.map((c) => (
              <th key={c.key} scope="col" style={{ padding: "8px 10px", textAlign: "right", fontWeight: 500 }}>
                <div>({c.letter})</div>
                <div style={{ fontSize: 11, fontWeight: 400 }}>{c.band}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.lines.map((ln) => {
            const isTotal = ln.kind === "total";
            return (
              <tr key={ln.line} style={{ borderTop: "1px solid var(--border-subtle)", background: isTotal ? "var(--surface-sunken)" : undefined, fontWeight: isTotal ? 600 : undefined }}>
                <th scope="row" style={{ padding: "7px 10px", textAlign: "left", fontWeight: isTotal ? 600 : 400, position: "sticky", left: 0, background: isTotal ? "var(--surface-sunken)" : "var(--surface-raised)" }}>
                  <span style={{ color: "var(--text-muted)", marginRight: 6 }}>{ln.line}.</span>{ln.label}
                </th>
                {TAX_CLASS_COLUMNS.map((c) => {
                  if (c.key === "E_SPARKLING") {
                    const bf = props.gallons(props.section, ln.line, c.key, "BF");
                    const bp = props.gallons(props.section, ln.line, c.key, "BP");
                    const single = props.gallons(props.section, ln.line, c.key, null);
                    return (
                      <td key={c.key} style={{ padding: "4px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        <div style={{ color: bf ? "var(--text-primary)" : "var(--text-muted)" }}>BF {fmt(bf) || "·"}</div>
                        <div style={{ color: bp ? "var(--text-primary)" : "var(--text-muted)" }}>BP {fmt(bp) || (single ? fmt(single) : "·")}</div>
                      </td>
                    );
                  }
                  const v = props.gallons(props.section, ln.line, c.key, null);
                  return <td key={c.key} style={{ padding: "7px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: v ? "var(--text-primary)" : "var(--text-muted)" }}>{fmt(v) || "·"}</td>;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
