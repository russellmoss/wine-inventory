"use client";

// S3a Unit 14 — one form matching the template's shape: header, repeatable material lines,
// mixing order, and block lines with a multi-select that pre-fills treatedAreaHa from the
// spacing-derived default (KD-6) and leaves it editable (recorded as operator-entered).
// Correction reuses this form pre-filled and submits through the correction core — there is
// NO edit path to the original, by construction. Native selects/inputs throughout (QA rules:
// form_input works on native <select>).

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { submitSprayCorrection, submitSprayRecord } from "@/lib/spray/actions";
import type {
  RecordSprayInput,
  SprayApplicationMethod,
  SprayMaterialLineInput,
  SprayQuantityBasis,
  SprayQuantityUnit,
  SprayWindDirection,
} from "@/lib/spray/types";

export interface SprayFormBlock {
  id: string;
  label: string;
  vineyardId: string;
  vineyardName: string;
  defaultAreaHa: number | null;
}

export interface MaterialDraft {
  productName: string;
  epaRegistrationNumber: string;
  /** S2b Unit 5 — a grower-defined product (rule §3.9): resolves via TenantProductFacts, never the
   * EPA registry. Set this OR leave epaRegistrationNumber blank, not both — see /vineyards/sprays/products. */
  tenantProductRef: string;
  materialRole: SprayMaterialLineInput["materialRole"];
  quantityEntered: string;
  quantityUnit: SprayQuantityUnit;
  quantityBasis: SprayQuantityBasis;
  perAreaUnit: "ACRE" | "HECTARE";
  perCarrierValue: string;
  perCarrierUnit: SprayQuantityUnit;
  enteredReiHours: string;
  enteredPhiDays: string;
  enteredActiveIngredient: string;
}

export interface MixDraft {
  materialDescription: string;
  amountPerTankEntered: string;
  amountPerTankUnit: SprayQuantityUnit | "";
  materialLineNo: string; // "" = none (water/compat agent)
}

export interface BlockDraft {
  selected: boolean;
  areaHa: string;
  areaEdited: boolean;
  startedAt: string; // datetime-local
  finishedAt: string;
  volumeUsedL: string;
}

const emptyMaterial = (): MaterialDraft => ({
  productName: "",
  epaRegistrationNumber: "",
  tenantProductRef: "",
  materialRole: "PESTICIDE",
  quantityEntered: "",
  quantityUnit: "OZ",
  quantityBasis: "PER_AREA",
  perAreaUnit: "ACRE",
  perCarrierValue: "100",
  perCarrierUnit: "GAL",
  enteredReiHours: "",
  enteredPhiDays: "",
  enteredActiveIngredient: "",
});

const METHODS: SprayApplicationMethod[] = ["AIRBLAST", "BOOM", "HANDGUN", "BACKPACK", "CHEMIGATION", "AERIAL", "OTHER"];
const WIND: SprayWindDirection[] = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW", "CALM", "VARIABLE"];
const UNITS: SprayQuantityUnit[] = ["GAL", "QT", "PT", "FLOZ", "LB", "OZ", "L", "ML", "KG", "G"];

const num = (s: string): number | null => {
  if (!s.trim()) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const dt = (s: string): Date | null => (s ? new Date(s) : null);

/** A stored UTC instant (ISO, from the correction prefill) → the BROWSER-local wall time a
 * datetime-local input expects. Without this, an untouched correction would silently shift every
 * timestamp by the viewer's UTC offset (QA finding, 2026-07-26). */
const isoUtcToLocalInput = (s: string): string => {
  if (!s) return "";
  const d = new Date(s.endsWith("Z") || s.includes("+") ? s : s + "Z");
  if (Number.isNaN(d.getTime())) return s;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function normalizeInitial(initial: SprayFormInitial | undefined): SprayFormInitial | undefined {
  if (!initial) return undefined;
  return {
    ...initial,
    startedAt: isoUtcToLocalInput(initial.startedAt),
    finishedAt: isoUtcToLocalInput(initial.finishedAt),
    blockDrafts: Object.fromEntries(
      Object.entries(initial.blockDrafts).map(([k, d]) => [
        k,
        { ...d, startedAt: isoUtcToLocalInput(d.startedAt), finishedAt: isoUtcToLocalInput(d.finishedAt) },
      ]),
    ),
  };
}

const inputStyle: React.CSSProperties = {
  padding: "6px 8px",
  borderRadius: 10,
  border: "1px solid var(--border-default, #DED7C6)",
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = { fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 2 };

/** Serializable prefill for the correction path — the predecessor's document mapped to draft
 * shape server-side (loadSprayFormInitial). Editing then submitting produces a FULL new revision. */
export interface SprayFormInitial {
  applicatorName: string;
  applicatorLicense: string;
  method: SprayApplicationMethod;
  startedAt: string;
  finishedAt: string;
  targetPest: string;
  sprayVolumePerHaL: string;
  windDirection: "" | SprayWindDirection;
  windSpeedKph: string;
  airTempC: string;
  notes: string;
  materials: MaterialDraft[];
  mixLines: MixDraft[];
  blockDrafts: Record<string, BlockDraft>;
}

export function SprayForm({
  blocks,
  mode,
  predecessorId,
  initial: rawInitial,
}: {
  blocks: SprayFormBlock[];
  mode: "create" | "correct";
  predecessorId?: string;
  initial?: SprayFormInitial;
}) {
  const initial = normalizeInitial(rawInitial);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const [applicatorName, setApplicatorName] = useState(initial?.applicatorName ?? "");
  const [applicatorLicense, setApplicatorLicense] = useState(initial?.applicatorLicense ?? "");
  const [method, setMethod] = useState<SprayApplicationMethod>(initial?.method ?? "AIRBLAST");
  const [startedAt, setStartedAt] = useState(initial?.startedAt ?? "");
  const [finishedAt, setFinishedAt] = useState(initial?.finishedAt ?? "");
  const [targetPest, setTargetPest] = useState(initial?.targetPest ?? "");
  const [sprayVolumePerHaL, setSprayVolumePerHaL] = useState(initial?.sprayVolumePerHaL ?? "");
  const [windDirection, setWindDirection] = useState<"" | SprayWindDirection>(initial?.windDirection ?? "");
  const [windSpeedKph, setWindSpeedKph] = useState(initial?.windSpeedKph ?? "");
  const [airTempC, setAirTempC] = useState(initial?.airTempC ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [correctionReason, setCorrectionReason] = useState("");

  const [materials, setMaterials] = useState<MaterialDraft[]>(initial?.materials?.length ? initial.materials : [emptyMaterial()]);
  const [mixLines, setMixLines] = useState<MixDraft[]>(initial?.mixLines ?? []);
  const [blockDrafts, setBlockDrafts] = useState<Record<string, BlockDraft>>(initial?.blockDrafts ?? {});

  const byVineyard = useMemo(() => {
    const groups = new Map<string, SprayFormBlock[]>();
    for (const b of blocks) {
      const list = groups.get(b.vineyardName) ?? [];
      list.push(b);
      groups.set(b.vineyardName, list);
    }
    return [...groups.entries()];
  }, [blocks]);

  const setMaterial = (i: number, patch: Partial<MaterialDraft>) =>
    setMaterials((prev) => prev.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const setBlock = (id: string, patch: Partial<BlockDraft>) =>
    setBlockDrafts((prev) => {
      const block = blocks.find((b) => b.id === id)!;
      const current = prev[id] ?? { selected: false, areaHa: block.defaultAreaHa?.toFixed(4) ?? "", areaEdited: false, startedAt: "", finishedAt: "", volumeUsedL: "" };
      return { ...prev, [id]: { ...current, ...patch } };
    });

  function buildInput(): RecordSprayInput | { error: string } {
    if (!startedAt) return { error: "A start date/time is required." };
    const materialLines: SprayMaterialLineInput[] = materials.map((m) => ({
      productName: m.productName.trim(),
      epaRegistrationNumber: m.epaRegistrationNumber.trim() || null,
      tenantProductRef: m.tenantProductRef.trim() || null,
      materialRole: m.materialRole,
      quantityEntered: num(m.quantityEntered) ?? 0,
      quantityUnit: m.quantityUnit,
      quantityBasis: m.quantityBasis,
      perAreaUnit: m.quantityBasis === "PER_AREA" ? m.perAreaUnit : null,
      perCarrierVolume:
        m.quantityBasis === "PER_CARRIER_VOLUME" && num(m.perCarrierValue) != null
          ? { value: num(m.perCarrierValue)!, unit: m.perCarrierUnit }
          : null,
      enteredReiHours: num(m.enteredReiHours),
      enteredPhiDays: num(m.enteredPhiDays),
      enteredActiveIngredient: m.enteredActiveIngredient.trim() || null,
    }));
    const blockLines = Object.entries(blockDrafts)
      .filter(([, d]) => d.selected)
      .map(([blockId, d]) => ({
        blockId,
        // Untouched prefill = let the core derive (provenance stays DERIVED_FROM_SPACING —
        // council CQ2; QA finding: submitting the prefilled number read as operator-entered).
        treatedAreaHa: d.areaEdited ? num(d.areaHa) : null,
        treatedAreaSource: d.areaEdited ? ("OPERATOR_ENTERED" as const) : undefined,
        startedAt: dt(d.startedAt),
        finishedAt: dt(d.finishedAt),
        volumeUsedL: num(d.volumeUsedL),
      }));
    if (!blockLines.length) return { error: "Select at least one block." };
    const mixOrderLines = mixLines
      .filter((x) => x.materialDescription.trim())
      .map((x, i) => ({
        sequence: i + 1,
        materialDescription: x.materialDescription.trim(),
        amountPerTankEntered: num(x.amountPerTankEntered),
        amountPerTankUnit: x.amountPerTankUnit || null,
        materialLineNo: x.materialLineNo ? Number(x.materialLineNo) : null,
      }));
    return {
      applicatorName: applicatorName.trim(),
      applicatorLicense: applicatorLicense.trim() || null,
      applicationMethod: method,
      startedAt: new Date(startedAt),
      finishedAt: dt(finishedAt),
      targetPest: targetPest.trim() || null,
      sprayVolumePerHaL: num(sprayVolumePerHaL),
      windDirection: windDirection || null,
      windSpeedKph: num(windSpeedKph),
      airTempC: num(airTempC),
      notes: notes.trim() || null,
      materialLines,
      mixOrderLines,
      blockLines,
    };
  }

  function submit() {
    setError(null);
    const input = buildInput();
    if ("error" in input) {
      setError(input.error);
      return;
    }
    startTransition(async () => {
      const result =
        mode === "correct" && predecessorId
          ? await submitSprayCorrection(predecessorId, { ...input, correctionReason: correctionReason.trim() || "corrected" })
          : await submitSprayRecord(input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const saved = result.data as { applicationId: string; warnings?: { message: string }[] };
      if (saved.warnings?.length) setWarnings(saved.warnings.map((w) => w.message));
      router.push(`/vineyards/sprays/${saved.applicationId}`);
      router.refresh();
    });
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {error ? <p role="alert" style={{ color: "var(--danger, #B63D35)", margin: 0 }}>{error}</p> : null}
      {warnings.map((w) => (
        <p key={w} style={{ color: "var(--warning, #D79F32)", margin: 0 }}>{w}</p>
      ))}

      <Card style={{ padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Header</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 10 }}>
          <div>
            <label style={labelStyle} htmlFor="sf-applicator">Applicator name *</label>
            <input id="sf-applicator" style={inputStyle} value={applicatorName} onChange={(e) => setApplicatorName(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle} htmlFor="sf-license">Applicator license</label>
            <input id="sf-license" style={inputStyle} value={applicatorLicense} onChange={(e) => setApplicatorLicense(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle} htmlFor="sf-method">Method *</label>
            <select id="sf-method" style={inputStyle} value={method} onChange={(e) => setMethod(e.target.value as SprayApplicationMethod)}>
              {METHODS.map((m) => (
                <option key={m} value={m}>{m.toLowerCase()}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle} htmlFor="sf-start">Start *</label>
            <input id="sf-start" type="datetime-local" style={inputStyle} value={startedAt} onChange={(e) => setStartedAt(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle} htmlFor="sf-finish">Finish</label>
            <input id="sf-finish" type="datetime-local" style={inputStyle} value={finishedAt} onChange={(e) => setFinishedAt(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle} htmlFor="sf-pest">Target pest</label>
            <input id="sf-pest" style={inputStyle} value={targetPest} onChange={(e) => setTargetPest(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle} htmlFor="sf-vol">Spray volume (L/ha)</label>
            <input id="sf-vol" type="number" style={inputStyle} value={sprayVolumePerHaL} onChange={(e) => setSprayVolumePerHaL(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle} htmlFor="sf-wind-dir">Wind direction</label>
            <select id="sf-wind-dir" style={inputStyle} value={windDirection} onChange={(e) => setWindDirection(e.target.value as SprayWindDirection | "")}>
              <option value="">not recorded</option>
              {WIND.map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle} htmlFor="sf-wind-speed">Wind speed (kph)</label>
            <input id="sf-wind-speed" type="number" style={inputStyle} value={windSpeedKph} onChange={(e) => setWindSpeedKph(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle} htmlFor="sf-temp">Air temp (°C)</label>
            <input id="sf-temp" type="number" style={inputStyle} value={airTempC} onChange={(e) => setAirTempC(e.target.value)} />
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <label style={labelStyle} htmlFor="sf-notes">Notes</label>
          <textarea id="sf-notes" style={{ ...inputStyle, minHeight: 60 }} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {mode === "correct" ? (
          <div style={{ marginTop: 10 }}>
            <label style={labelStyle} htmlFor="sf-reason">Correction reason *</label>
            <input id="sf-reason" style={inputStyle} value={correctionReason} onChange={(e) => setCorrectionReason(e.target.value)} placeholder="What was wrong, and why this fixes it" />
          </div>
        ) : null}
      </Card>

      <Card style={{ padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Materials</h3>
        {materials.map((m, i) => (
          <div key={i} style={{ borderTop: i ? "1px solid var(--border-subtle, rgba(20,19,15,0.08))" : undefined, paddingTop: i ? 10 : 0, marginTop: i ? 10 : 0 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
              <div>
                <label style={labelStyle} htmlFor={`sf-m${i}-name`}>Product *</label>
                <input id={`sf-m${i}-name`} style={inputStyle} value={m.productName} onChange={(e) => setMaterial(i, { productName: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle} htmlFor={`sf-m${i}-epa`}>EPA reg. number</label>
                <input id={`sf-m${i}-epa`} style={inputStyle} value={m.epaRegistrationNumber} onChange={(e) => setMaterial(i, { epaRegistrationNumber: e.target.value })} placeholder="blank = unknown, never an error" />
              </div>
              <div>
                <label style={labelStyle} htmlFor={`sf-m${i}-tpr`}>Custom product ref</label>
                <input
                  id={`sf-m${i}-tpr`}
                  style={inputStyle}
                  value={m.tenantProductRef}
                  onChange={(e) => setMaterial(i, { tenantProductRef: e.target.value })}
                  placeholder="no EPA number? see /vineyards/sprays/products"
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor={`sf-m${i}-role`}>Role</label>
                <select id={`sf-m${i}-role`} style={inputStyle} value={m.materialRole} onChange={(e) => setMaterial(i, { materialRole: e.target.value as MaterialDraft["materialRole"] })}>
                  <option value="PESTICIDE">pesticide</option>
                  <option value="ADJUVANT">adjuvant</option>
                  <option value="FERTILIZER">fertilizer</option>
                  <option value="OTHER">other</option>
                </select>
              </div>
              <div>
                <label style={labelStyle} htmlFor={`sf-m${i}-qty`}>Quantity *</label>
                <input id={`sf-m${i}-qty`} type="number" style={inputStyle} value={m.quantityEntered} onChange={(e) => setMaterial(i, { quantityEntered: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle} htmlFor={`sf-m${i}-unit`}>Unit</label>
                <select id={`sf-m${i}-unit`} style={inputStyle} value={m.quantityUnit} onChange={(e) => setMaterial(i, { quantityUnit: e.target.value as SprayQuantityUnit })}>
                  {UNITS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle} htmlFor={`sf-m${i}-basis`}>Quantity is *</label>
                <select id={`sf-m${i}-basis`} style={inputStyle} value={m.quantityBasis} onChange={(e) => setMaterial(i, { quantityBasis: e.target.value as SprayQuantityBasis })}>
                  <option value="PER_AREA">per area</option>
                  <option value="PER_CARRIER_VOLUME">per carrier volume</option>
                  <option value="TOTAL_IN_TANK">total in tank</option>
                </select>
              </div>
              {m.quantityBasis === "PER_AREA" ? (
                <div>
                  <label style={labelStyle} htmlFor={`sf-m${i}-perarea`}>…per *</label>
                  <select id={`sf-m${i}-perarea`} style={inputStyle} value={m.perAreaUnit} onChange={(e) => setMaterial(i, { perAreaUnit: e.target.value as "ACRE" | "HECTARE" })}>
                    <option value="ACRE">acre</option>
                    <option value="HECTARE">hectare</option>
                  </select>
                </div>
              ) : null}
              {m.quantityBasis === "PER_CARRIER_VOLUME" ? (
                <div>
                  <label style={labelStyle} htmlFor={`sf-m${i}-carrier`}>…per carrier *</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input id={`sf-m${i}-carrier`} type="number" style={{ ...inputStyle, width: 80 }} value={m.perCarrierValue} onChange={(e) => setMaterial(i, { perCarrierValue: e.target.value })} />
                    <select aria-label="carrier unit" style={{ ...inputStyle, width: 90 }} value={m.perCarrierUnit} onChange={(e) => setMaterial(i, { perCarrierUnit: e.target.value as SprayQuantityUnit })}>
                      <option value="GAL">GAL</option>
                      <option value="L">L</option>
                    </select>
                  </div>
                </div>
              ) : null}
              <div>
                <label style={labelStyle} htmlFor={`sf-m${i}-rei`}>REI (h, as on label)</label>
                <input id={`sf-m${i}-rei`} type="number" style={inputStyle} value={m.enteredReiHours} onChange={(e) => setMaterial(i, { enteredReiHours: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle} htmlFor={`sf-m${i}-phi`}>PHI (days, as on label)</label>
                <input id={`sf-m${i}-phi`} type="number" style={inputStyle} value={m.enteredPhiDays} onChange={(e) => setMaterial(i, { enteredPhiDays: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle} htmlFor={`sf-m${i}-ai`}>Active ingredient (as on label)</label>
                <input id={`sf-m${i}-ai`} style={inputStyle} value={m.enteredActiveIngredient} onChange={(e) => setMaterial(i, { enteredActiveIngredient: e.target.value })} />
              </div>
            </div>
            {materials.length > 1 ? (
              <Button variant="ghost" size="sm" style={{ marginTop: 6 }} onClick={() => setMaterials((prev) => prev.filter((_, j) => j !== i))}>
                Remove line
              </Button>
            ) : null}
          </div>
        ))}
        <Button variant="secondary" size="sm" style={{ marginTop: 10 }} onClick={() => setMaterials((prev) => [...prev, emptyMaterial()])}>
          Add material line
        </Button>
      </Card>

      <Card style={{ padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Mixing order <span style={{ fontWeight: 400, fontSize: 13, color: "var(--text-muted)" }}>(optional — water and compatibility agents belong here too)</span></h3>
        {mixLines.map((x, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto", gap: 8, alignItems: "end", marginBottom: 6 }}>
            <div>
              <label style={labelStyle} htmlFor={`sf-x${i}-desc`}>{i + 1}. Material</label>
              <input id={`sf-x${i}-desc`} style={inputStyle} value={x.materialDescription} onChange={(e) => setMixLines((prev) => prev.map((y, j) => (j === i ? { ...y, materialDescription: e.target.value } : y)))} />
            </div>
            <div>
              <label style={labelStyle} htmlFor={`sf-x${i}-amt`}>Amount per tank</label>
              <input id={`sf-x${i}-amt`} type="number" style={inputStyle} value={x.amountPerTankEntered} onChange={(e) => setMixLines((prev) => prev.map((y, j) => (j === i ? { ...y, amountPerTankEntered: e.target.value } : y)))} />
            </div>
            <div>
              <label style={labelStyle} htmlFor={`sf-x${i}-unit`}>Unit</label>
              <select id={`sf-x${i}-unit`} style={inputStyle} value={x.amountPerTankUnit} onChange={(e) => setMixLines((prev) => prev.map((y, j) => (j === i ? { ...y, amountPerTankUnit: e.target.value as SprayQuantityUnit | "" } : y)))}>
                <option value="">—</option>
                {UNITS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle} htmlFor={`sf-x${i}-link`}>Material line #</label>
              <select id={`sf-x${i}-link`} style={inputStyle} value={x.materialLineNo} onChange={(e) => setMixLines((prev) => prev.map((y, j) => (j === i ? { ...y, materialLineNo: e.target.value } : y)))}>
                <option value="">none (water/agent)</option>
                {materials.map((_, j) => (
                  <option key={j} value={String(j + 1)}>{j + 1}</option>
                ))}
              </select>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setMixLines((prev) => prev.filter((_, j) => j !== i))}>Remove</Button>
          </div>
        ))}
        <Button variant="secondary" size="sm" onClick={() => setMixLines((prev) => [...prev, { materialDescription: "", amountPerTankEntered: "", amountPerTankUnit: "", materialLineNo: "" }])}>
          Add mix step
        </Button>
      </Card>

      <Card style={{ padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Blocks</h3>
        {byVineyard.map(([vineyardName, list]) => (
          <div key={vineyardName} style={{ marginBottom: 10 }}>
            <p style={{ margin: "6px 0", fontSize: 13, color: "var(--text-secondary)" }}>{vineyardName}</p>
            {list.map((b) => {
              const d = blockDrafts[b.id];
              return (
                <div key={b.id} style={{ display: "grid", gridTemplateColumns: "minmax(160px, 1fr) 130px 190px 190px 130px", gap: 8, alignItems: "end", padding: "4px 0" }}>
                  <label style={{ fontSize: 14, display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={d?.selected ?? false}
                      onChange={(e) => setBlock(b.id, { selected: e.target.checked })}
                    />
                    {b.label}
                  </label>
                  {d?.selected ? (
                    <>
                      <div>
                        <label style={labelStyle} htmlFor={`sf-b-${b.id}-area`}>Area (ha)</label>
                        <input
                          id={`sf-b-${b.id}-area`}
                          type="number"
                          step="0.0001"
                          style={inputStyle}
                          value={d.areaHa}
                          onChange={(e) => setBlock(b.id, { areaHa: e.target.value, areaEdited: true })}
                        />
                      </div>
                      <div>
                        <label style={labelStyle} htmlFor={`sf-b-${b.id}-start`}>Block start</label>
                        <input id={`sf-b-${b.id}-start`} type="datetime-local" style={inputStyle} value={d.startedAt} onChange={(e) => setBlock(b.id, { startedAt: e.target.value })} />
                      </div>
                      <div>
                        <label style={labelStyle} htmlFor={`sf-b-${b.id}-finish`}>Block finish</label>
                        <input id={`sf-b-${b.id}-finish`} type="datetime-local" style={inputStyle} value={d.finishedAt} onChange={(e) => setBlock(b.id, { finishedAt: e.target.value })} />
                      </div>
                      <div>
                        <label style={labelStyle} htmlFor={`sf-b-${b.id}-vol`}>Volume used (L)</label>
                        <input id={`sf-b-${b.id}-vol`} type="number" style={inputStyle} value={d.volumeUsedL} onChange={(e) => setBlock(b.id, { volumeUsedL: e.target.value })} />
                      </div>
                    </>
                  ) : (
                    <span style={{ gridColumn: "2 / -1", fontSize: 12, color: "var(--text-muted)" }}>
                      {b.defaultAreaHa != null ? `${b.defaultAreaHa.toFixed(3)} ha (derived from spacing)` : "no derivable area — enter one if selected"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
          A block&apos;s REI and residual clocks read its OWN finish time. Leaving it blank records honestly — those clocks will read <em>unknown</em> rather than borrowing the pass time.
        </p>
      </Card>

      <div>
        <Button onClick={submit} disabled={pending}>
          {pending ? "Saving…" : mode === "correct" ? "Submit correction (new revision)" : "Record spray"}
        </Button>
      </div>
    </div>
  );
}
