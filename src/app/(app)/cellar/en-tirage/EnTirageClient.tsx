"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Card, Input, Button, Badge, Eyebrow, Modal, ConfirmButton } from "@/components/ui";
import { tirageAction } from "@/lib/sparkling/actions";
import { riddlingAction, disgorgeAndFinishAction } from "@/lib/sparkling/actions";
import { reverseOperationAction } from "@/lib/ledger/actions";
import { tirageSugarForPressure, dosageSugarGpl, finalRS, classifyStyle, nearStyleBandEdge } from "@/lib/sparkling/sugar";
import type { WorklistRow, TirageCandidate, FinishedSparklingRow } from "@/lib/sparkling/worklist-data";

const num = { fontVariantNumeric: "tabular-nums" } as React.CSSProperties;
const UNDO_LABEL: Record<string, string> = { TIRAGE: "tirage → tank", RIDDLING: "riddling", DISGORGEMENT: "disgorgement", DOSAGE: "dosage" };
const STAGES = ["EN_TIRAGE", "RIDDLING", "DISGORGED", "DOSED"] as const;
const STAGE_LABEL: Record<string, string> = { EN_TIRAGE: "En tirage", RIDDLING: "Riddling", DISGORGED: "Disgorged", DOSED: "Dosed" };

// Stage stepper in semantic hues (blue → green), never the wine accent (reserved for the CTA).
function StageStepper({ stage }: { stage: string }) {
  const idx = STAGES.indexOf(stage as (typeof STAGES)[number]);
  return (
    <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
      {STAGES.map((s, i) => {
        const done = i < idx;
        const cur = i === idx;
        return (
          <Badge key={s} tone={cur ? (i >= 2 ? "green" : "blue") : done ? "neutral" : "neutral"}>
            {STAGE_LABEL[s]}
          </Badge>
        );
      })}
    </span>
  );
}

function StyleChip({ rs, dosageGpl }: { rs: number; dosageGpl: number }) {
  const style = classifyStyle(rs, dosageGpl);
  const near = nearStyleBandEdge(rs);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <Badge tone="maroon">{style.replace("_", " ")}</Badge>
      <span style={{ ...num, fontSize: 13, color: "var(--text-secondary)" }}>{rs} g/L RS</span>
      {near && <span style={{ fontSize: 12.5, color: "var(--warning)" }}>· within 3 g/L of a band edge</span>}
      {dosageGpl === 0 && <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>· Brut Nature (0 g/L)</span>}
    </span>
  );
}

export function EnTirageClient({
  rows,
  candidates,
  locations,
  materials,
  finished,
}: {
  rows: WorklistRow[];
  candidates: TirageCandidate[];
  locations: { id: string; name: string }[];
  materials: { id: string; name: string }[];
  finished: FinishedSparklingRow[];
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [tirageOpen, setTirageOpen] = React.useState(false);
  const [flowRow, setFlowRow] = React.useState<WorklistRow | null>(null);

  function run(fn: () => Promise<string>) {
    setError(null);
    startTransition(async () => {
      try {
        const msg = await fn();
        setToast(msg);
        setTirageOpen(false);
        setFlowRow(null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  return (
    <div>
      <Eyebrow rule>Sparkling · méthode champenoise</Eyebrow>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: "10px 0 6px" }}>En Tirage</h1>
        <Button variant="primary" onClick={() => setTirageOpen(true)}>Start a tirage</Button>
      </div>
      <p style={{ color: "var(--text-secondary)", marginBottom: 20, maxWidth: "64ch" }}>
        Wines aging on lees in bottle. Sorted oldest-first (closest to ready-to-disgorge). Launch
        disgorgement &amp; finishing from a row.
      </p>

      {toast && <p style={{ color: "var(--text-accent)", marginBottom: 12 }}>{toast}</p>}
      {error && <p style={{ color: "var(--danger)", marginBottom: 12 }}>{error}</p>}

      {rows.length === 0 ? (
        <Card>
          <p style={{ margin: 0, color: "var(--text-secondary)" }}>No wines en tirage yet. Start a tirage from a bulk wine lot to bottle a cuvée into glass.</p>
        </Card>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", background: "var(--surface-sunken)" }}>
                  {["Lot", "Method", "Bottles", "Months on lees", "Stage", "AF", "Location", ""].map((h) => (
                    <th key={h} style={{ padding: "10px 12px", fontFamily: "var(--font-heading)", fontSize: 13, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.lotId} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: "10px 12px", fontWeight: 500 }}>{r.code}</td>
                    <td style={{ padding: "10px 12px" }}>{r.method === "PETNAT" ? "Pét-nat" : "Traditional"}</td>
                    <td style={{ padding: "10px 12px", ...num }}>{r.bottleCount.toLocaleString()}</td>
                    <td style={{ padding: "10px 12px", ...num }}>{r.monthsOnLees}</td>
                    <td style={{ padding: "10px 12px" }}><StageStepper stage={r.stage} /></td>
                    <td style={{ padding: "10px 12px" }}>{r.afState}</td>
                    <td style={{ padding: "10px 12px", color: "var(--text-secondary)" }}>{r.locationName ?? "—"}</td>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap", textAlign: "right" }}>
                      {r.lastReversibleOpId != null && (
                        <span style={{ marginRight: 8, display: "inline-block" }}>
                          <ConfirmButton
                            confirmLabel={`Undo ${UNDO_LABEL[r.lastReversibleOpType ?? ""] ?? "step"}`}
                            disabled={pending}
                            onConfirm={() => run(async () => {
                              const res = await reverseOperationAction({ operationId: r.lastReversibleOpId!, lotId: r.lotId });
                              return res.message ?? `Reversed last step on ${r.code}.`;
                            })}
                          >
                            Undo {UNDO_LABEL[r.lastReversibleOpType ?? ""] ?? "step"}
                          </ConfirmButton>
                        </span>
                      )}
                      <button
                        onClick={() => run(async () => { await riddlingAction({ lotId: r.lotId, method: "gyropalette" }); return `Riddling logged for ${r.code}.`; })}
                        disabled={pending}
                        style={{ minHeight: 44, padding: "0 12px", marginRight: 8, background: "none", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: 13.5 }}
                      >
                        Riddle
                      </button>
                      <Button size="sm" variant="secondary" onClick={() => setFlowRow(r)}>Disgorge &amp; finish</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {finished.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <Eyebrow rule>Recently finished · undo</Eyebrow>
          <p style={{ color: "var(--text-secondary)", margin: "8px 0 12px", maxWidth: "64ch", fontSize: 14 }}>
            Finished sparkling bottlings you can still reopen. Undo the finish to pull the bottles back
            and return the lot to the worklist en tirage — then Undo the remaining steps to send it to tank.
            (Blocked if those bottles have since been moved or sold.)
          </p>
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ textAlign: "left", background: "var(--surface-sunken)" }}>
                    {["Lot", "SKU", "Bottles", "Finished", "Style", "Location", ""].map((h) => (
                      <th key={h} style={{ padding: "10px 12px", fontFamily: "var(--font-heading)", fontSize: 13, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {finished.map((fr) => (
                    <tr key={fr.lotId} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 500 }}>{fr.code}</td>
                      <td style={{ padding: "10px 12px" }}>{fr.skuName}</td>
                      <td style={{ padding: "10px 12px", ...num }}>{fr.bottleCount.toLocaleString()}</td>
                      <td style={{ padding: "10px 12px", ...num }}>{fr.finishedAt}</td>
                      <td style={{ padding: "10px 12px" }}>{fr.dosageStyle ? fr.dosageStyle.replace("_", " ") : fr.method === "PETNAT" ? "sur lie" : "—"}</td>
                      <td style={{ padding: "10px 12px", color: "var(--text-secondary)" }}>{fr.locationName ?? "—"}</td>
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap", textAlign: "right" }}>
                        <ConfirmButton
                          confirmLabel="Undo finish"
                          disabled={pending}
                          onConfirm={() => run(async () => {
                            const res = await reverseOperationAction({ operationId: fr.finishOpId, lotId: fr.lotId });
                            return res.message ?? `Reopened ${fr.code} — back en tirage.`;
                          })}
                        >
                          Undo finish
                        </ConfirmButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      <TirageModal open={tirageOpen} onClose={() => setTirageOpen(false)} candidates={candidates} locations={locations} materials={materials} pending={pending} run={run} />
      {flowRow && <DisgorgeFinishModal row={flowRow} onClose={() => setFlowRow(null)} locations={locations} materials={materials} pending={pending} run={run} />}
    </div>
  );
}

// ───────────────────────── Tirage form ─────────────────────────

function TirageModal({ open, onClose, candidates, locations, materials, pending, run }: {
  open: boolean; onClose: () => void; candidates: TirageCandidate[]; locations: { id: string; name: string }[]; materials: { id: string; name: string }[]; pending: boolean; run: (fn: () => Promise<string>) => void;
}) {
  const [lotId, setLotId] = React.useState(candidates[0]?.lotId ?? "");
  // Per-tank selection + draw for the chosen cuvée: vesselId → { checked, draw }.
  const [tankSel, setTankSel] = React.useState<Record<string, { checked: boolean; draw: string }>>({});
  const [bottleCount, setBottleCount] = React.useState("");
  const [nominalFillMl, setNominalFillMl] = React.useState("750");
  const [method, setMethod] = React.useState<"TRADITIONAL" | "PETNAT">("TRADITIONAL");
  const [pressureAtm, setPressureAtm] = React.useState("6");
  const [materialId, setMaterialId] = React.useState("");
  const [locationId, setLocationId] = React.useState("");

  const cand = candidates.find((c) => c.lotId === lotId);
  const suggestedSugar = pressureAtm ? tirageSugarForPressure(Number(pressureAtm)) : null;
  // Default: every tank of the cuvée checked, drawing its full volume.
  const tankOf = (vesselId: string, volumeL: number) => tankSel[vesselId] ?? { checked: true, draw: String(volumeL) };
  const chosen = (cand?.tanks ?? []).map((t) => ({ ...t, ...tankOf(t.vesselId, t.volumeL) }));
  const totalDraw = Math.round(chosen.filter((t) => t.checked).reduce((a, t) => a + (Number(t.draw) || 0), 0) * 100) / 100;
  const fillL = (Number(nominalFillMl) || 750) / 1000;
  const suggestedBottles = fillL > 0 ? Math.floor(totalDraw / fillL) : 0;
  const bottles = bottleCount ? Number(bottleCount) : suggestedBottles;

  function switchLot(id: string) {
    setLotId(id);
    setTankSel({}); // reset selection to defaults for the new cuvée
    setBottleCount("");
  }
  function setTank(vesselId: string, patch: Partial<{ checked: boolean; draw: string }>, volumeL: number) {
    setTankSel((s) => ({ ...s, [vesselId]: { ...tankOf(vesselId, volumeL), ...patch } }));
  }

  if (candidates.length === 0) {
    return (
      <Modal open={open} onClose={onClose} title="Start a tirage">
        <p style={{ color: "var(--text-secondary)" }}>
          No bulk WINE lots are available to bottle. Assemble a cuvée in <strong>Blend</strong> first — combining
          different wines is the assemblage, done before tirage.
        </p>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Start a tirage" subtitle="Bottle one assembled cuvée into an en-tirage bottle lot" maxWidth={640}>
      <div style={{ display: "grid", gap: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)" }}>Cuvée
          <select value={lotId} onChange={(e) => switchLot(e.target.value)} style={selStyle}>
            {candidates.map((c) => (
              <option key={c.lotId} value={c.lotId}>{c.lotCode}{c.vintage ? ` · ${c.vintage}` : " · NV"} · {c.totalL} L across {c.tanks.length} tank{c.tanks.length > 1 ? "s" : ""}</option>
            ))}
          </select>
        </label>

        {cand && (
          <div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 4 }}>Draw from tank(s)</div>
            <div style={{ display: "grid", gap: 6 }}>
              {cand.tanks.map((t) => {
                const row = tankOf(t.vesselId, t.volumeL);
                return (
                  <div key={t.vesselId} style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 44 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 auto", cursor: "pointer" }}>
                      <input type="checkbox" checked={row.checked} onChange={(e) => setTank(t.vesselId, { checked: e.target.checked }, t.volumeL)} style={{ width: 18, height: 18 }} />
                      <span style={{ fontWeight: 500 }}>{t.vesselCode}</span>
                      <span style={{ ...num, color: "var(--text-muted)", fontSize: 13 }}>holds {t.volumeL} L</span>
                    </label>
                    <input type="number" value={row.draw} disabled={!row.checked} onChange={(e) => setTank(t.vesselId, { draw: e.target.value }, t.volumeL)}
                      aria-label={`Draw from ${t.vesselCode}`}
                      style={{ ...selStyle, width: 110, marginTop: 0, opacity: row.checked ? 1 : 0.5 }} />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Input label={`Bottles (suggested ${suggestedBottles})`} type="number" value={bottleCount} onChange={(e) => setBottleCount(e.target.value)} placeholder={String(suggestedBottles)} style={{ flex: "1 1 160px" }} />
          <Input label="Bottle fill (mL)" type="number" value={nominalFillMl} onChange={(e) => setNominalFillMl(e.target.value)} style={{ flex: "1 1 120px" }} />
        </div>

        <label style={{ fontSize: 13, color: "var(--text-secondary)" }}>Method
          <select value={method} onChange={(e) => setMethod(e.target.value as "TRADITIONAL" | "PETNAT")} style={selStyle}>
            <option value="TRADITIONAL">Traditional (méthode champenoise)</option>
            <option value="PETNAT">Pét-nat (bottled mid-ferment)</option>
          </select>
        </label>
        {method === "TRADITIONAL" && (
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
            <Input label="Target pressure (atm)" type="number" value={pressureAtm} onChange={(e) => setPressureAtm(e.target.value)} style={{ flex: "1 1 140px" }} />
            <span style={{ ...num, fontSize: 13.5, color: "var(--text-secondary)", paddingBottom: 10 }}>
              → suggested tirage sugar <strong>{suggestedSugar ?? "—"} g/L</strong>
            </span>
          </div>
        )}
        {method === "TRADITIONAL" && (
          <label style={{ fontSize: 13, color: "var(--text-secondary)" }}>Liqueur de tirage (optional)
            <select value={materialId} onChange={(e) => setMaterialId(e.target.value)} style={selStyle}>
              <option value="">—</option>
              {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
        )}
        <label style={{ fontSize: 13, color: "var(--text-secondary)" }}>Bottle store (optional)
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)} style={selStyle}>
            <option value="">—</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>

        {cand && (
          <p style={{ ...num, fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
            {totalDraw} L from {chosen.filter((t) => t.checked).length || "?"} tank{chosen.filter((t) => t.checked).length === 1 ? "" : "s"} → {bottles} × {nominalFillMl} mL en tirage. Bulk leaves the vessel(s).
          </p>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={pending || !cand || totalDraw <= 0 || bottles <= 0}
            onClick={() => run(async () => {
              const sources = chosen.filter((t) => t.checked && Number(t.draw) > 0).map((t) => ({ vesselId: t.vesselId, drawL: Number(t.draw) }));
              await tirageAction({
                lotId: cand!.lotId, sources, bottleCount: bottles,
                nominalFillMl: Number(nominalFillMl), method, targetPressureAtm: method === "TRADITIONAL" && pressureAtm ? Number(pressureAtm) : undefined,
                liqueurMaterialId: materialId || undefined, locationId: locationId || undefined,
              });
              return `Bottled ${bottles} × ${nominalFillMl} mL of ${cand!.lotCode} en tirage.`;
            })}
          >
            Bottle en tirage
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ───────────────────────── Disgorge & finish flow ─────────────────────────

function DisgorgeFinishModal({ row, onClose, locations, materials, pending, run }: {
  row: WorklistRow; onClose: () => void; locations: { id: string; name: string }[]; materials: { id: string; name: string }[]; pending: boolean; run: (fn: () => Promise<string>) => void;
}) {
  const [bottlesDisgorged, setBottlesDisgorged] = React.useState(String(row.bottleCount));
  const [perBottleLossMl, setPerBottleLossMl] = React.useState("25");
  const [sacrificed, setSacrificed] = React.useState("");
  const [breakage, setBreakage] = React.useState("");
  const [disgorgeOnly, setDisgorgeOnly] = React.useState(false);
  // dose
  const [doseMl, setDoseMl] = React.useState("");
  const [liqueurGPerL, setLiqueurGPerL] = React.useState("600");
  const [preDosageRS, setPreDosageRS] = React.useState("2");
  const [liqMaterialId, setLiqMaterialId] = React.useState("");
  const [addDosage, setAddDosage] = React.useState(true);
  // finish
  const [skuName, setSkuName] = React.useState("");
  const [destinationId, setDestinationId] = React.useState(locations[0]?.id ?? "");
  const [nv, setNv] = React.useState(true);

  const n = Number(bottlesDisgorged) || 0;
  const isPartial = n > 0 && n < row.bottleCount;
  const dosageGpl = addDosage && doseMl ? dosageSugarGpl(Number(doseMl), Number(liqueurGPerL) || 0) : 0;
  const rs = addDosage && doseMl ? finalRS({ baseRS: Number(preDosageRS) || 0, doseMl: Number(doseMl), liqueurGPerL: Number(liqueurGPerL) || 0 }) : Number(preDosageRS) || 0;

  return (
    <Modal open onClose={onClose} title={`Disgorge & finish · ${row.code}`} subtitle={`${row.bottleCount.toLocaleString()} bottles en tirage · ${row.monthsOnLees} months on lees`} maxWidth={640}>
      <div style={{ display: "grid", gap: 14 }}>
        <section>
          <h3 style={sectionH}>Disgorge</h3>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Input label="Bottles" type="number" value={bottlesDisgorged} onChange={(e) => setBottlesDisgorged(e.target.value)} style={{ flex: "1 1 110px" }} />
            <Input label="Loss mL/bottle" type="number" value={perBottleLossMl} onChange={(e) => setPerBottleLossMl(e.target.value)} style={{ flex: "1 1 110px" }} />
            <Input label="Sacrificial" type="number" value={sacrificed} onChange={(e) => setSacrificed(e.target.value)} style={{ flex: "1 1 90px" }} />
            <Input label="Breakage" type="number" value={breakage} onChange={(e) => setBreakage(e.target.value)} style={{ flex: "1 1 90px" }} />
          </div>
          {isPartial && (
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "8px 0 0" }}>
              Disgorges {n.toLocaleString()}, splits off a new child lot, leaves {(row.bottleCount - n).toLocaleString()} en tirage (~{perBottleLossMl || 0} mL/bottle loss).
            </p>
          )}
        </section>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
          <input type="checkbox" checked={disgorgeOnly} onChange={(e) => setDisgorgeOnly(e.target.checked)} style={{ width: 18, height: 18 }} />
          Advanced: disgorge only (dose &amp; finish later)
        </label>

        {!disgorgeOnly && (
          <>
            <section>
              <h3 style={sectionH}>Dose</h3>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, marginBottom: 8 }}>
                <input type="checkbox" checked={addDosage} onChange={(e) => setAddDosage(e.target.checked)} style={{ width: 18, height: 18 }} />
                Add a sugar dosage (uncheck for Brut Nature / no dosage)
              </label>
              {addDosage && (
                <>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <Input label="Dose mL/bottle" type="number" value={doseMl} onChange={(e) => setDoseMl(e.target.value)} style={{ flex: "1 1 110px" }} />
                    <Input label="Liqueur g/L" type="number" value={liqueurGPerL} onChange={(e) => setLiqueurGPerL(e.target.value)} style={{ flex: "1 1 110px" }} />
                    <Input label="Pre-dosage RS g/L" type="number" value={preDosageRS} onChange={(e) => setPreDosageRS(e.target.value)} style={{ flex: "1 1 130px" }} />
                  </div>
                  <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginTop: 8 }}>Liqueur d&apos;expédition (optional)
                    <select value={liqMaterialId} onChange={(e) => setLiqMaterialId(e.target.value)} style={selStyle}>
                      <option value="">—</option>
                      {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </label>
                </>
              )}
              <div style={{ marginTop: 10 }}><StyleChip rs={rs} dosageGpl={dosageGpl} /></div>
            </section>

            <section>
              <h3 style={sectionH}>Finish</h3>
              <Input label="SKU name" value={skuName} onChange={(e) => setSkuName(e.target.value)} />
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8, alignItems: "flex-end" }}>
                <label style={{ fontSize: 13, color: "var(--text-secondary)", flex: "1 1 200px" }}>Destination
                  <select value={destinationId} onChange={(e) => setDestinationId(e.target.value)} style={selStyle}>
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, paddingBottom: 10 }}>
                  <input type="checkbox" checked={nv} onChange={(e) => setNv(e.target.checked)} style={{ width: 18, height: 18 }} />
                  Non-vintage (NV)
                </label>
              </div>
            </section>
          </>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, borderTop: "1px solid var(--border-subtle)", paddingTop: 12 }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={pending || !bottlesDisgorged || (!disgorgeOnly && !skuName)}
            onClick={() => run(async () => {
              await disgorgeAndFinishAction({
                lotId: row.lotId,
                bottlesDisgorged: Number(bottlesDisgorged),
                perBottleLossMl: perBottleLossMl ? Number(perBottleLossMl) : undefined,
                sacrificedBottleCount: sacrificed ? Number(sacrificed) : undefined,
                breakageCount: breakage ? Number(breakage) : undefined,
                disgorgeOnly,
                dose: !disgorgeOnly && addDosage && doseMl ? { perBottleDoseMl: Number(doseMl), liqueurGPerL: Number(liqueurGPerL) || 0, liqueurMaterialId: liqMaterialId || undefined, preDosageRS: Number(preDosageRS) || 0 } : undefined,
                finish: disgorgeOnly ? undefined : { skuName, destinationLocationId: destinationId, isNonVintage: nv, vintage: nv ? null : undefined },
              });
              return disgorgeOnly ? `Disgorged ${bottlesDisgorged} bottles of ${row.code}.` : `Finished "${skuName}" from ${row.code}.`;
            })}
          >
            {disgorgeOnly ? "Disgorge" : "Disgorge, dose & finish"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

const selStyle: React.CSSProperties = {
  display: "block", width: "100%", minHeight: 44, marginTop: 4, padding: "0 12px",
  border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)",
  background: "var(--surface-raised)", fontFamily: "var(--font-body)", fontSize: 15, color: "var(--text-primary)",
};
const sectionH: React.CSSProperties = { fontFamily: "var(--font-heading)", fontSize: 15, margin: "0 0 8px", color: "var(--text-primary)" };
