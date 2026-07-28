"use client";

import React from "react";
import { Card, Button, Checkbox, Badge } from "@/components/ui";
import {
  PHENO_STAGES,
  PHENO_PCT_OPTIONS,
  phenoStageUsesPct,
  SHOOT_TIP_STATES,
  CANOPY_DENSITIES,
  WATER_STRESS_LEVELS,
  WEED_PRESSURE_LEVELS,
  LEAF_CONDITIONS,
  type BlockStatus,
  type PhenoStage,
} from "@/lib/fieldnotes/types";
import {
  CLUSTER_DAMAGE_LEVELS,
  FRUIT_ZONE_LEAF_REMOVAL_LEVELS,
  SHOOT_LENGTH_BANDS,
  VINEGAR_FLY_PRESSURE_LEVELS,
  clusterDamageApplies,
  vinegarFlyApplies,
  type ShootLengthBand,
} from "@/lib/phenology/observation-types";
import { downscaleImage } from "./downscaleImage";

const selectStyle: React.CSSProperties = {
  height: 48,
  width: "100%",
  padding: "0 12px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-raised)",
  fontFamily: "var(--font-body)",
  fontSize: 16,
  color: "var(--text-primary)",
};

const fieldLabel: React.CSSProperties = {
  display: "block",
  fontFamily: "var(--font-body)",
  fontSize: 13,
  fontWeight: "var(--weight-medium)" as unknown as number,
  color: "var(--text-secondary)",
  marginBottom: 6,
};

const sectionGap: React.CSSProperties = { marginBottom: "var(--space-4)" };

function prettyEnum(v: string): string {
  return v
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** A mobile-friendly segmented toggle: large thumb targets, single-select. */
function Segmented<T extends string>({
  options,
  value,
  onChange,
  allowClear = false,
  labelOf,
}: {
  options: readonly T[];
  value: T | null;
  onChange: (v: T | null) => void;
  allowClear?: boolean;
  /** Override the derived label — e.g. a band renders as "10–30 cm", not "Cm 10 30". */
  labelOf?: (v: T) => string;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {options.map((opt) => {
        const selected = value === opt;
        return (
          <Button
            key={opt}
            type="button"
            variant={selected ? "primary" : "secondary"}
            size="sm"
            onClick={() => onChange(allowClear && selected ? null : opt)}
            style={{ fontSize: 13 }}
          >
            {labelOf ? labelOf(opt) : prettyEnum(opt)}
          </Button>
        );
      })}
    </div>
  );
}

/** Human band labels — the enum names are storage keys, not something a grower should read. */
const SHOOT_BAND_LABEL: Record<ShootLengthBand, string> = {
  LT_10: "< 10 cm",
  CM_10_30: "10–30 cm",
  CM_30_60: "30–60 cm",
  GT_60: "> 60 cm",
};

/** Matches `selectStyle`'s metrics so the measured-length field lines up with the selects. */
const numberInputStyle: React.CSSProperties = {
  height: 48,
  width: "100%",
  padding: "0 12px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-raised)",
  fontFamily: "var(--font-body)",
  fontSize: 16,
  color: "var(--text-primary)",
};

type PhotoState = {
  id: string;
  status: "compressing" | "uploading" | "done" | "error";
  url?: string;
  previewUrl?: string;
};

export function BlockCard({
  blockLabel,
  varietyName,
  vineyardId,
  status,
  onChange,
  onAddPhotoUrl,
}: {
  blockLabel: string;
  varietyName: string | null;
  vineyardId: string;
  status: BlockStatus;
  onChange: (next: BlockStatus) => void;
  onAddPhotoUrl: (url: string) => void;
}) {
  const [photos, setPhotos] = React.useState<PhotoState[]>([]);
  // The measured-length input stays behind an affordance: it costs walking the block with a tape,
  // and an always-visible numeric field is form weight most weeks nobody will pay.
  const [measuring, setMeasuring] = React.useState(false);

  // Keep a local map of in-flight photo files so retry can re-upload.
  const filesRef = React.useRef<Map<string, File>>(new Map());

  const update = React.useCallback(
    (patch: Partial<BlockStatus>) => onChange({ ...status, ...patch }),
    [onChange, status],
  );

  const uploadOne = React.useCallback(
    async (photoId: string, file: File) => {
      filesRef.current.set(photoId, file);
      setPhotos((p) =>
        p.map((x) => (x.id === photoId ? { ...x, status: "compressing" } : x)),
      );
      try {
        const blob = await downscaleImage(file);
        setPhotos((p) =>
          p.map((x) => (x.id === photoId ? { ...x, status: "uploading" } : x)),
        );
        const fd = new FormData();
        fd.append("file", blob, "photo.jpg");
        fd.append("vineyardId", vineyardId);
        const res = await fetch("/api/field-notes/upload", { method: "POST", body: fd });
        if (!res.ok) throw new Error("upload failed");
        const data = (await res.json()) as { url?: string };
        if (!data.url) throw new Error("no url");
        setPhotos((p) =>
          p.map((x) => (x.id === photoId ? { ...x, status: "done", url: data.url } : x)),
        );
        // Append via the parent's functional updater so concurrent uploads can't
        // clobber each other's photoUrls.
        onAddPhotoUrl(data.url as string);
      } catch {
        setPhotos((p) =>
          p.map((x) => (x.id === photoId ? { ...x, status: "error" } : x)),
        );
      }
    },
    [vineyardId, onAddPhotoUrl],
  );

  function onFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      const photoId = crypto.randomUUID();
      const previewUrl = URL.createObjectURL(file);
      setPhotos((p) => [...p, { id: photoId, status: "compressing", previewUrl }]);
      void uploadOne(photoId, file);
    }
  }

  const healthyLeaves = status.leafConditions.length === 0;

  return (
    <Card padding="var(--space-4)" style={{ ...sectionGap }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "var(--space-3)", gap: 8 }}>
        <h3 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 20, margin: 0 }}>
          {blockLabel}
        </h3>
        {varietyName ? (
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{varietyName}</span>
        ) : null}
      </div>

      <div style={sectionGap}>
        <label style={fieldLabel}>Phenological stage</label>
        <select
          style={selectStyle}
          value={status.phenoStage ?? ""}
          onChange={(e) => {
            const next = (e.target.value || null) as PhenoStage | null;
            // Drop any % reading if the new stage doesn't take one.
            update({ phenoStage: next, phenoStagePct: phenoStageUsesPct(next) ? status.phenoStagePct : null });
          }}
        >
          <option value="">— Select —</option>
          {PHENO_STAGES.map((s) => (
            <option key={s} value={s}>
              {prettyEnum(s)}
            </option>
          ))}
        </select>
        {phenoStageUsesPct(status.phenoStage) ? (
          <div style={{ marginTop: 10 }}>
            <label style={fieldLabel}>Stage progress</label>
            <select
              style={selectStyle}
              value={status.phenoStagePct ?? ""}
              onChange={(e) =>
                update({ phenoStagePct: e.target.value ? Number(e.target.value) : null })
              }
            >
              <option value="">— Select —</option>
              {PHENO_PCT_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}%
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {/* ── S4: GROWTH ────────────────────────────────────────────────────────────────────
          One section, not three. BlockCard is already a flat stack of ~8 groups and a 6-block
          vineyard renders ~48 of them, so new fields group rather than append. The BAND is the
          one-tap primary (every Segmented control in the live corpus measures 100 % filled);
          the exact measurement hides behind an affordance because it costs walking the block
          with a tape, and the fields that cost real effort do not get filled. */}
      <div style={sectionGap}>
        <span style={fieldLabel}>Shoot growth</span>
        <div style={{ marginBottom: 8 }}>
          <Segmented
            options={SHOOT_LENGTH_BANDS}
            value={status.shootLengthBand}
            onChange={(v) => update({ shootLengthBand: v })}
            allowClear
            labelOf={(b) => SHOOT_BAND_LABEL[b]}
          />
        </div>
        <span style={{ ...fieldLabel, marginTop: 4 }}>Shoot tip</span>
        <Segmented options={SHOOT_TIP_STATES} value={status.shootTip} onChange={(v) => update({ shootTip: v })} allowClear />
        {measuring || status.shootLengthCm !== null ? (
          <div style={{ marginTop: 10 }}>
            <label style={fieldLabel} htmlFor={`shoot-cm-${blockLabel}`}>
              Measured shoot length (cm, mean of ~10 shoots)
            </label>
            <input
              id={`shoot-cm-${blockLabel}`}
              type="number"
              inputMode="decimal"
              min={0}
              value={status.shootLengthCm === null ? "" : String(status.shootLengthCm)}
              onChange={(e) => update({ shootLengthCm: e.target.value === "" ? null : Number(e.target.value) })}
              style={numberInputStyle}
            />
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setMeasuring(true)}
            style={{ marginTop: 8 }}
          >
            + Add a measured length
          </Button>
        )}
      </div>

      {/* ── S4: CANOPY MANAGEMENT ─────────────────────────────────────────────────────────
          Two INDEPENDENT fields, not one enum — both can be true in the same week and they feed
          different models. Hedging is an EVENT with an explicit "no", because clearing it to
          false is a real answer that the growth model needs. */}
      <div style={sectionGap}>
        <span style={fieldLabel}>Hedged this week?</span>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          <Button
            type="button"
            variant={status.hedgedThisWeek === true ? "primary" : "secondary"}
            size="sm"
            onClick={() => update({ hedgedThisWeek: status.hedgedThisWeek === true ? null : true })}
          >
            Yes
          </Button>
          <Button
            type="button"
            variant={status.hedgedThisWeek === false ? "primary" : "secondary"}
            size="sm"
            onClick={() => update({ hedgedThisWeek: status.hedgedThisWeek === false ? null : false })}
          >
            No
          </Button>
        </div>
        <span style={fieldLabel}>Fruit-zone leaf removal</span>
        <Segmented
          options={FRUIT_ZONE_LEAF_REMOVAL_LEVELS}
          value={status.fruitZoneLeafRemoval}
          onChange={(v) => update({ fruitZoneLeafRemoval: v })}
          allowClear
        />
      </div>

      {/* ── S4: SCOUTING ──────────────────────────────────────────────────────────────────
          Stage-gated, using the same conditional pattern as the phenology % select above, so the
          controls are absent most of the year and their PRESENCE is itself a signal.
          `clusterDamage` opens at FRUIT_SET, not veraison: botrytis exploits early wounds
          (powdery scarring, hail, bird damage at pea-size) and those infections stay latent until
          veraison, so a veraison gate would blind the model to the damage that matters most.
          NOT_ASSESSED is an explicit choice — "nobody looked" must never be recorded as "none". */}
      {clusterDamageApplies(status.phenoStage) || vinegarFlyApplies(status.phenoStage) ? (
        <div style={sectionGap}>
          <span style={fieldLabel}>Fruit-zone scouting</span>
          {clusterDamageApplies(status.phenoStage) ? (
            <div style={{ marginBottom: 10 }}>
              <span style={{ ...fieldLabel, fontSize: 12.5 }}>Cluster / berry damage</span>
              <Segmented
                options={CLUSTER_DAMAGE_LEVELS}
                value={status.clusterDamage}
                onChange={(v) => update({ clusterDamage: v })}
                allowClear
                labelOf={(v) => (v === "NOT_ASSESSED" ? "Didn't check" : prettyEnum(v))}
              />
            </div>
          ) : null}
          {vinegarFlyApplies(status.phenoStage) ? (
            <div>
              <span style={{ ...fieldLabel, fontSize: 12.5 }}>Vinegar-fly pressure</span>
              <Segmented
                options={VINEGAR_FLY_PRESSURE_LEVELS}
                value={status.vinegarFlyPressure}
                onChange={(v) => update({ vinegarFlyPressure: v })}
                allowClear
                labelOf={(v) => (v === "NOT_ASSESSED" ? "Didn't check" : prettyEnum(v))}
              />
            </div>
          ) : null}
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "8px 0 0" }}>
            &ldquo;Didn&rsquo;t check&rdquo; and &ldquo;None&rdquo; mean different things. Leaving it blank records that
            nobody looked — which is never read as a clean result.
          </p>
        </div>
      ) : null}

      <div style={sectionGap}>
        <span style={fieldLabel}>Canopy density</span>
        <Segmented options={CANOPY_DENSITIES} value={status.canopyDensity} onChange={(v) => update({ canopyDensity: v })} allowClear />
      </div>

      <div style={sectionGap}>
        <span style={fieldLabel}>Water stress</span>
        <Segmented options={WATER_STRESS_LEVELS} value={status.waterStress} onChange={(v) => update({ waterStress: v })} allowClear />
      </div>

      <div style={sectionGap}>
        <span style={fieldLabel}>Weed pressure</span>
        <Segmented options={WEED_PRESSURE_LEVELS} value={status.weedPressure} onChange={(v) => update({ weedPressure: v })} allowClear />
      </div>

      <div style={sectionGap}>
        <span style={fieldLabel}>Leaf condition</span>
        <div style={{ marginBottom: 8 }}>
          <Checkbox
            checked={healthyLeaves}
            onChange={(c) => {
              if (c) update({ leafConditions: [] });
            }}
            label="Healthy"
          />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {LEAF_CONDITIONS.map((lc) => {
            const selected = status.leafConditions.includes(lc);
            return (
              <Button
                key={lc}
                type="button"
                variant={selected ? "primary" : "secondary"}
                size="sm"
                onClick={() =>
                  update({
                    leafConditions: selected
                      ? status.leafConditions.filter((x) => x !== lc)
                      : [...status.leafConditions, lc],
                  })
                }
                style={{ fontSize: 13 }}
              >
                {prettyEnum(lc)}
              </Button>
            );
          })}
        </div>
      </div>

      <div style={sectionGap}>
        <span style={fieldLabel}>Disease / pest spotted?</span>
        <div style={{ display: "flex", gap: 6 }}>
          <Button
            type="button"
            variant={status.diseasePestSpotted ? "primary" : "secondary"}
            size="sm"
            onClick={() => update({ diseasePestSpotted: true })}
          >
            Yes
          </Button>
          <Button
            type="button"
            variant={!status.diseasePestSpotted ? "primary" : "secondary"}
            size="sm"
            onClick={() => update({ diseasePestSpotted: false, diseaseDescription: null })}
          >
            No
          </Button>
        </div>
      </div>

      {status.diseasePestSpotted ? (
        <div style={sectionGap}>
          <label style={fieldLabel}>What did you see?</label>
          <textarea
            value={status.diseaseDescription ?? ""}
            onChange={(e) => update({ diseaseDescription: e.target.value || null })}
            rows={3}
            placeholder="Describe the disease or pest…"
            style={{ width: "100%",
              padding: 12,
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-md)",
              background: "var(--surface-raised)",
              fontFamily: "var(--font-body)",
              fontSize: 16,
              color: "var(--text-primary)",
              resize: "vertical" }}
          />

          <div style={{ marginTop: "var(--space-3)" }}>
            <label style={fieldLabel}>Photos</label>
            <label
              style={{ display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                height: 48,
                padding: "0 18px",
                border: "1px solid var(--border-strong)",
                borderRadius: "var(--radius-md)",
                background: "var(--surface-raised)",
                color: "var(--text-accent)",
                fontFamily: "var(--font-body)",
                fontSize: 15,
                cursor: "pointer" }}
            >
              + Add photo
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                onChange={(e) => {
                  onFiles(e.target.files);
                  e.target.value = "";
                }}
                style={{ display: "none" }}
              />
            </label>

            {photos.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: "var(--space-3)" }}>
                {photos.map((ph) => (
                  <div
                    key={ph.id}
                    style={{ width: 84,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 4 }}
                  >
                    <div
                      style={{ width: 84,
                        height: 84,
                        borderRadius: "var(--radius-md)",
                        overflow: "hidden",
                        border: "1px solid var(--border-strong)",
                        background: "var(--surface-sunken)",
                        position: "relative" }}
                    >
                      {ph.previewUrl || ph.url ? (
                        // Blob/object-URL field photo — next/image can't optimize these.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={ph.url ?? ph.previewUrl}
                          alt="Field photo"
                          style={{ width: "100%", height: "100%", objectFit: "cover", opacity: ph.status === "done" ? 1 : 0.5 }}
                        />
                      ) : null}
                    </div>
                    {ph.status === "done" ? (
                      <Badge tone="green" variant="soft">saved</Badge>
                    ) : ph.status === "error" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const f = filesRef.current.get(ph.id);
                          if (f) void uploadOne(ph.id, f);
                        }}
                      >
                        retry
                      </Button>
                    ) : (
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {ph.status === "compressing" ? "compressing…" : "uploading…"}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
