"use client";

import React from "react";
import { Card, Button, Input, Checkbox, Badge } from "@/components/ui";
import {
  DEFAULT_HEALTHY_BLOCK_STATUS,
  EMPTY_BLOCK_STATUS,
  type BlockStatus,
  type InputApplication,
  type CreateFieldNoteInput,
  type ParsedFieldNote,
} from "@/lib/fieldnotes/types";
import { buildPrepopulationDefaults } from "@/lib/fieldnotes/prepopulate";
import { todayISODateUTC } from "@/lib/fieldnotes/week";
import { createFieldNote } from "@/lib/fieldnotes/actions";
import { addFieldInput, type FieldInputDTO, type FieldInputLists } from "@/lib/fieldnotes/input-actions";
import { BlockCard } from "./BlockCard";
import { useDraft, type DraftFormState, type StoredDraft } from "./useDraft";

export type FormBlock = { id: string; blockLabel: string; varietyName: string | null };

const fieldLabel: React.CSSProperties = {
  display: "block",
  fontFamily: "var(--font-body)",
  fontSize: 13,
  fontWeight: "var(--weight-medium)" as unknown as number,
  color: "var(--text-secondary)",
  marginBottom: 6,
};

const dateInputStyle: React.CSSProperties = {
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

const sectionStyle: React.CSSProperties = { marginBottom: "var(--space-5)" };

/** Multi-select of master inputs (sprays or fertilizers) with per-input scope. */
function InputSection({
  title,
  options,
  selected,
  onToggle,
  onScopeChange,
  blocks,
  onAdd,
}: {
  title: string;
  options: FieldInputDTO[];
  selected: Record<string, InputApplication>; // keyed by input name
  onToggle: (name: string, on: boolean) => void;
  onScopeChange: (name: string, app: InputApplication) => void;
  blocks: FormBlock[];
  onAdd: (rawName: string) => void;
}) {
  const [adding, setAdding] = React.useState("");
  return (
    <Card padding="var(--space-4)" style={sectionStyle}>
      <h3 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 20, margin: "0 0 var(--space-3)" }}>
        {title}
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        {options.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>None on the list yet.</p>
        ) : (
          options.map((opt) => {
            const app = selected[opt.name];
            const on = !!app;
            return (
              <div key={opt.id} style={{ borderTop: "1px solid var(--border-strong)", paddingTop: "var(--space-3)" }}>
                <Checkbox checked={on} onChange={(c) => onToggle(opt.name, c)} label={opt.name} />
                {on ? (
                  <div style={{ marginTop: 8, marginLeft: 30 }}>
                    <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                      <Button
                        type="button"
                        variant={app.scope === "WHOLE" ? "primary" : "secondary"}
                        size="sm"
                        onClick={() => onScopeChange(opt.name, { ...app, scope: "WHOLE", blockIds: [] })}
                        style={{ height: 38 }}
                      >
                        Whole vineyard
                      </Button>
                      <Button
                        type="button"
                        variant={app.scope === "BLOCKS" ? "primary" : "secondary"}
                        size="sm"
                        onClick={() => onScopeChange(opt.name, { ...app, scope: "BLOCKS" })}
                        style={{ height: 38 }}
                      >
                        Specific blocks
                      </Button>
                    </div>
                    {app.scope === "BLOCKS" ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {blocks.map((b) => {
                          const picked = app.blockIds.includes(b.id);
                          return (
                            <Button
                              key={b.id}
                              type="button"
                              variant={picked ? "primary" : "secondary"}
                              size="sm"
                              onClick={() =>
                                onScopeChange(opt.name, {
                                  ...app,
                                  blockIds: picked
                                    ? app.blockIds.filter((x) => x !== b.id)
                                    : [...app.blockIds, b.id],
                                })
                              }
                              style={{ height: 38, fontSize: 13 }}
                            >
                              {b.blockLabel}
                            </Button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const name = adding.trim();
          if (!name) return;
          onAdd(name);
          setAdding("");
        }}
        style={{ display: "flex", gap: 8, alignItems: "flex-end", marginTop: "var(--space-3)" }}
      >
        <Input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          placeholder="Add new…"
          size="sm"
          style={{ flex: 1 }}
        />
        <Button type="submit" variant="secondary" size="sm">
          + Add new
        </Button>
      </form>
    </Card>
  );
}

export function FieldNoteForm({
  vineyardId,
  vineyardName,
  blocks,
  latestNote,
  editNote = null,
  inputLists,
  onSubmitted,
  onCancel,
}: {
  vineyardId: string;
  vineyardName: string;
  blocks: FormBlock[];
  latestNote: ParsedFieldNote | null;
  /** When set, the form edits this existing report in place instead of creating a new one. */
  editNote?: ParsedFieldNote | null;
  inputLists: FieldInputLists;
  onSubmitted: () => void;
  onCancel: () => void;
}) {
  const isEditing = !!editNote;
  const blockIds = React.useMemo(() => blocks.map((b) => b.id), [blocks]);

  // Initial form state: editing hydrates from the note itself; a new report
  // carries forward slow-changing block phenology from the latest note. Computed
  // once per mount (ManagerView remounts the form per mode via a key).
  const initial = React.useMemo(() => {
    if (editNote) {
      const statuses: Record<string, BlockStatus> = {};
      for (const id of blockIds) statuses[id] = editNote.blockLevelStatuses[id] ?? { ...EMPTY_BLOCK_STATUS };
      const sp: Record<string, InputApplication> = {};
      for (const a of editNote.spraysApplied) sp[a.name] = a;
      const fp: Record<string, InputApplication> = {};
      for (const a of editNote.fertilizersApplied) fp[a.name] = a;
      return {
        weekOf: editNote.weekOf,
        weather: editNote.weatherData,
        statuses,
        generalNotes: editNote.generalNotes ?? "",
        sprays: sp,
        ferts: fp,
      };
    }
    const d = buildPrepopulationDefaults(latestNote?.blockLevelStatuses ?? null, blockIds);
    return {
      weekOf: todayISODateUTC(),
      weather: d.weatherData,
      statuses: d.blockLevelStatuses,
      generalNotes: d.generalNotes,
      sprays: {} as Record<string, InputApplication>,
      ferts: {} as Record<string, InputApplication>,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [weekOf, setWeekOf] = React.useState<string>(initial.weekOf);
  const [weather, setWeather] = React.useState(initial.weather);
  const [statuses, setStatuses] = React.useState<Record<string, BlockStatus>>(initial.statuses);
  const [generalNotes, setGeneralNotes] = React.useState(initial.generalNotes);

  // Input selections keyed by display name.
  const [sprays, setSprays] = React.useState<Record<string, InputApplication>>(initial.sprays);
  const [ferts, setFerts] = React.useState<Record<string, InputApplication>>(initial.ferts);

  // Per-block "touched this session" set (manager edited it).
  const touchedRef = React.useRef<Set<string>>(new Set());

  // Local copies of the master lists so optimistic "add new" appends survive.
  const [sprayOpts, setSprayOpts] = React.useState<FieldInputDTO[]>(inputLists.sprays);
  const [fertOpts, setFertOpts] = React.useState<FieldInputDTO[]>(inputLists.fertilizers);

  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const defaultWeek = React.useMemo(() => todayISODateUTC(), []);
  const maxDate = React.useMemo(() => todayISODateUTC(), []);

  const formState: DraftFormState = React.useMemo(
    () => ({
      weekOf,
      weatherData: weather,
      spraysApplied: Object.values(sprays),
      fertilizersApplied: Object.values(ferts),
      blockLevelStatuses: statuses,
      generalNotes,
    }),
    [weekOf, weather, sprays, ferts, statuses, generalNotes],
  );

  const { clear } = useDraft(vineyardId, formState, defaultWeek, {
    // Editing an existing report hydrates from the note itself, never the
    // local draft — so don't autosave or restore while editing.
    enabled: !isEditing,
    onRestore: (stored: StoredDraft, stale: boolean) => {
      if (isEditing) return;
      const keep = stale
        ? window.confirm(
            `Found a saved draft dated ${stored.form.weekOf}. Keep editing it?`,
          )
        : true;
      if (!keep) return;
      setWeekOf(stored.form.weekOf);
      setWeather(stored.form.weatherData);
      setStatuses(stored.form.blockLevelStatuses);
      setGeneralNotes(stored.form.generalNotes);
      const sp: Record<string, InputApplication> = {};
      for (const a of stored.form.spraysApplied) sp[a.name] = a;
      setSprays(sp);
      const fp: Record<string, InputApplication> = {};
      for (const a of stored.form.fertilizersApplied) fp[a.name] = a;
      setFerts(fp);
    },
  });

  const updateBlock = React.useCallback((blockId: string, next: BlockStatus) => {
    touchedRef.current.add(blockId);
    setStatuses((prev) => ({ ...prev, [blockId]: next }));
  }, []);

  const addPhotoUrl = React.useCallback((blockId: string, url: string) => {
    touchedRef.current.add(blockId);
    setStatuses((prev) => {
      const cur = prev[blockId] ?? EMPTY_BLOCK_STATUS;
      return { ...prev, [blockId]: { ...cur, photoUrls: [...cur.photoUrls, url] } };
    });
  }, []);

  function markRemainingHealthy() {
    const untouched = blockIds.filter((id) => !touchedRef.current.has(id));
    const wouldOverwrite = untouched.filter((id) => {
      const s = statuses[id];
      // an "edited" untouched block: differs from the empty baseline (e.g. carried-forward)
      return s && JSON.stringify(s) !== JSON.stringify(EMPTY_BLOCK_STATUS);
    });
    if (wouldOverwrite.length > 0) {
      const ok = window.confirm(
        `${wouldOverwrite.length} block(s) already have carried-over data. Overwrite them with the healthy baseline?`,
      );
      if (!ok) return;
    }
    setStatuses((prev) => {
      const next = { ...prev };
      for (const id of untouched) next[id] = { ...DEFAULT_HEALTHY_BLOCK_STATUS };
      return next;
    });
  }

  function toggleInput(
    kind: "spray" | "fert",
    name: string,
    on: boolean,
  ) {
    const setter = kind === "spray" ? setSprays : setFerts;
    setter((prev) => {
      const next = { ...prev };
      if (on) next[name] = { name, scope: "WHOLE", blockIds: [] };
      else delete next[name];
      return next;
    });
  }

  function scopeChange(kind: "spray" | "fert", name: string, app: InputApplication) {
    const setter = kind === "spray" ? setSprays : setFerts;
    setter((prev) => ({ ...prev, [name]: app }));
  }

  function addInput(kind: "spray" | "fert", rawName: string) {
    setError(null);
    startTransition(async () => {
      try {
        const dto = await addFieldInput(kind === "spray" ? "SPRAY" : "FERTILIZER", rawName);
        if (kind === "spray") {
          setSprayOpts((p) => (p.some((x) => x.id === dto.id) ? p : [...p, dto].sort((a, b) => a.name.localeCompare(b.name))));
          setSprays((p) => ({ ...p, [dto.name]: { name: dto.name, scope: "WHOLE", blockIds: [] } }));
        } else {
          setFertOpts((p) => (p.some((x) => x.id === dto.id) ? p : [...p, dto].sort((a, b) => a.name.localeCompare(b.name))));
          setFerts((p) => ({ ...p, [dto.name]: { name: dto.name, scope: "WHOLE", blockIds: [] } }));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not add that input.");
      }
    });
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const input: CreateFieldNoteInput = {
          vineyardId,
          weekOf,
          weatherData: weather,
          spraysApplied: Object.values(sprays),
          fertilizersApplied: Object.values(ferts),
          blockLevelStatuses: statuses,
          generalNotes: generalNotes.trim() || null,
        };
        const { id } = await createFieldNote(input);
        // Fire-and-forget the AI briefing; never block or fail submit on it.
        try {
          void fetch(`/api/field-notes/${id}/summarize`, { method: "POST", keepalive: true });
        } catch {
          /* ignore */
        }
        if (!isEditing) clear();
        onSubmitted();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not submit the report.");
      }
    });
  }

  const numField = (
    label: string,
    value: number | null,
    set: (v: number | null) => void,
  ) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <label style={fieldLabel}>{label}</label>
      <Input
        type="number"
        inputMode="decimal"
        value={value === null ? "" : String(value)}
        onChange={(e) => {
          const v = e.target.value;
          set(v === "" ? null : Number(v));
        }}
        size="lg"
        style={{ width: "100%" }}
      />
    </div>
  );

  return (
    <div style={{ maxWidth: 560, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "var(--space-4)", gap: 8 }}>
        <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 24, margin: 0 }}>
          {isEditing ? "Edit report" : "New report"}
        </h2>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
      <p style={{ color: "var(--text-secondary)", marginBottom: "var(--space-4)", fontSize: 14 }}>{vineyardName}</p>

      {error ? (
        <Card padding="var(--space-3)" style={{ marginBottom: "var(--space-4)", borderColor: "var(--danger)" }}>
          <p style={{ color: "var(--danger)", fontSize: 14, margin: 0 }}>{error}</p>
        </Card>
      ) : null}

      {/* (a) REPORT DATE */}
      <Card padding="var(--space-4)" style={sectionStyle}>
        <label style={fieldLabel}>Report date</label>
        <input
          type="date"
          value={weekOf}
          max={maxDate}
          onChange={(e) => setWeekOf(e.target.value)}
          style={dateInputStyle}
        />
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "6px 0 0" }}>
          {isEditing
            ? "Re-saving updates this date’s report."
            : "One report per day — picking a date that already has a report will update it."}
        </p>
      </Card>

      {/* (b) WEATHER */}
      <Card padding="var(--space-4)" style={sectionStyle}>
        <h3 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 20, margin: "0 0 var(--space-3)" }}>Weather</h3>
        <div style={{ display: "flex", gap: 10 }}>
          {numField("Rainfall (mm)", weather.rainfallMm, (v) => setWeather((w) => ({ ...w, rainfallMm: v })))}
          {numField("Max °C", weather.maxTempC, (v) => setWeather((w) => ({ ...w, maxTempC: v })))}
          {numField("Min °C", weather.minTempC, (v) => setWeather((w) => ({ ...w, minTempC: v })))}
        </div>
      </Card>

      {/* (c) INPUTS */}
      <InputSection
        title="Sprays applied"
        options={sprayOpts}
        selected={sprays}
        onToggle={(name, on) => toggleInput("spray", name, on)}
        onScopeChange={(name, app) => scopeChange("spray", name, app)}
        blocks={blocks}
        onAdd={(name) => addInput("spray", name)}
      />
      <InputSection
        title="Fertilizers applied"
        options={fertOpts}
        selected={ferts}
        onToggle={(name, on) => toggleInput("fert", name, on)}
        onScopeChange={(name, app) => scopeChange("fert", name, app)}
        blocks={blocks}
        onAdd={(name) => addInput("fert", name)}
      />

      {/* (d) MARK REMAINING HEALTHY */}
      <div style={sectionStyle}>
        <Button type="button" variant="secondary" fullWidth onClick={markRemainingHealthy} style={{ height: 48 }}>
          Mark remaining blocks healthy
        </Button>
      </div>

      {/* (e) BLOCK CARDS */}
      <div>
        <h3 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 20, margin: "0 0 var(--space-3)" }}>
          Blocks
          <Badge tone="neutral" variant="soft" style={{ marginLeft: 10 }}>
            {blocks.length}
          </Badge>
        </h3>
        {blocks.map((b) => (
          <BlockCard
            key={b.id}
            blockLabel={b.blockLabel}
            varietyName={b.varietyName}
            vineyardId={vineyardId}
            status={statuses[b.id] ?? EMPTY_BLOCK_STATUS}
            onChange={(next) => updateBlock(b.id, next)}
            onAddPhotoUrl={(url) => addPhotoUrl(b.id, url)}
          />
        ))}
      </div>

      {/* GENERAL NOTES */}
      <Card padding="var(--space-4)" style={sectionStyle}>
        <label style={fieldLabel}>General notes</label>
        <textarea
          value={generalNotes}
          onChange={(e) => setGeneralNotes(e.target.value)}
          rows={4}
          placeholder="Anything else worth flagging this week…"
          style={{
            width: "100%",
            padding: 12,
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--radius-md)",
            background: "var(--surface-raised)",
            fontFamily: "var(--font-body)",
            fontSize: 16,
            color: "var(--text-primary)",
            resize: "vertical",
          }}
        />
      </Card>

      <div style={{ position: "sticky", bottom: 0, padding: "var(--space-3) 0", background: "var(--surface-page)" }}>
        <Button type="button" variant="primary" fullWidth onClick={submit} disabled={pending} style={{ height: 52 }}>
          {pending ? "Saving…" : isEditing ? "Save changes" : "Submit report"}
        </Button>
      </div>
    </div>
  );
}
