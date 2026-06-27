"use client";

import React from "react";
import { Card, Button, Badge, Eyebrow } from "@/components/ui";
import { RATE_BASES, RATE_BASIS_LABELS, type RateBasis } from "@/lib/cellar/additions-math";
import type { CellarMaterialDTO } from "@/lib/cellar/materials";
import type { VesselGroupDTO } from "@/lib/vessels/groups";
import type { GroupApplyResult, GroupOpSpec } from "@/lib/cellar/group-apply";
import {
  applyToGroupAction,
  correctBatchAction,
  createGroupAction,
  deactivateGroupAction,
} from "@/lib/cellar/actions";

// Group actions on /bulk (Phase 3, Unit 9, D13). Target a saved group OR an ad-hoc
// multi-select, pick an op, and fan it out — one op per member sharing a batchId. The
// result summary reports "applied / skipped" with a semantic <ul> of per-member
// exceptions; nothing aborts the batch. A small group manager (create from the current
// selection / deactivate) sits alongside. Undo reverts the whole batch.

export type GroupVessel = { id: string; label: string; type: "BARREL" | "TANK"; totalL: number };

const fieldStyle: React.CSSProperties = {
  height: 44,
  padding: "0 10px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-raised)",
  fontFamily: "var(--font-body)",
  fontSize: 14,
  color: "var(--text-primary)",
};

type OpKind = "ADDITION" | "FINING" | "CAP_MGMT" | "FILTRATION" | "LOSS" | "TOPPING";
const OP_LABELS: Record<OpKind, string> = {
  ADDITION: "Addition",
  FINING: "Fining",
  CAP_MGMT: "Cap management",
  FILTRATION: "Filtration",
  LOSS: "Loss",
  TOPPING: "Topping",
};

export function GroupActions({
  groups,
  vessels,
  materials,
}: {
  groups: VesselGroupDTO[];
  vessels: GroupVessel[];
  materials: CellarMaterialDTO[];
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<GroupApplyResult | null>(null);

  // Target: a saved group, or an ad-hoc set of vessel ids.
  const [groupId, setGroupId] = React.useState<string>("");
  const [adhoc, setAdhoc] = React.useState<Set<string>>(new Set());

  // Op + params
  const [op, setOp] = React.useState<OpKind>("ADDITION");
  const [material, setMaterial] = React.useState("");
  const [rate, setRate] = React.useState("");
  const [basis, setBasis] = React.useState<RateBasis>("G_HL");
  const [amount, setAmount] = React.useState(""); // loss / filtration litres, or topping litres
  const [capKind, setCapKind] = React.useState<"PUMPOVER" | "PUNCHDOWN">("PUMPOVER");
  const [fromVesselId, setFromVesselId] = React.useState("");

  // New-group manager
  const [newGroupName, setNewGroupName] = React.useState("");

  const targetVesselIds = groupId ? (groups.find((g) => g.id === groupId)?.members.map((m) => m.id) ?? []) : [...adhoc];
  const targetCount = targetVesselIds.length;

  function buildSpec(): GroupOpSpec | null {
    switch (op) {
      case "ADDITION":
      case "FINING": {
        const r = Number(rate);
        if (!material.trim() || !(r > 0)) return null;
        return { op, materialName: material.trim(), rateValue: r, rateBasis: basis };
      }
      case "CAP_MGMT":
        return { op, kind: capKind };
      case "FILTRATION": {
        const a = Number(amount);
        if (!(a > 0)) return null;
        return { op, lossL: a };
      }
      case "LOSS": {
        const a = Number(amount);
        if (!(a > 0)) return null;
        return { op, lossL: a };
      }
      case "TOPPING": {
        const a = Number(amount);
        if (!fromVesselId || !(a > 0)) return null;
        return { op, fromVesselId, volumeL: a };
      }
    }
  }

  function apply() {
    const spec = buildSpec();
    if (!spec) {
      setError("Fill in the operation details first.");
      return;
    }
    if (targetCount === 0) {
      setError("Pick a group or select at least one vessel.");
      return;
    }
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const target = groupId ? { groupId } : { vesselIds: targetVesselIds };
        const res = await applyToGroupAction(target, spec);
        setResult(res);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  function undoBatch(batchId: string) {
    startTransition(async () => {
      try {
        await correctBatchAction(batchId);
        setResult(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't undo the batch.");
      }
    });
  }

  function createGroup() {
    if (!newGroupName.trim() || adhoc.size === 0) {
      setError("Name the group and select its vessels first.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await createGroupAction({ name: newGroupName.trim(), vesselIds: [...adhoc] });
        setNewGroupName("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't create the group.");
      }
    });
  }

  function toggleAdhoc(id: string) {
    setAdhoc((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const needsMaterial = op === "ADDITION" || op === "FINING";
  const needsAmount = op === "FILTRATION" || op === "LOSS" || op === "TOPPING";

  return (
    <Card style={{ marginBottom: 20 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: 0, background: "transparent", border: "none", cursor: "pointer", textAlign: "left", marginBottom: open ? 14 : 0 }}
      >
        <span style={{ color: "var(--text-muted)", fontSize: 13, transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s ease", display: "inline-block" }}>▸</span>
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 22 }}>Group actions</span>
        <span style={{ color: "var(--text-muted)", fontSize: 13 }}>apply one operation across many vessels</span>
      </button>

      {!open ? null : (
        <div>
          {error ? <p style={{ color: "var(--danger)", fontSize: 13.5, marginBottom: 12 }}>{error}</p> : null}

          {/* Target */}
          <Eyebrow tone="ink">Target</Eyebrow>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "8px 0 12px" }}>
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} style={{ ...fieldStyle, flex: "1 1 220px" }} aria-label="Saved group">
              <option value="">Ad-hoc selection…</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.members.length})
                </option>
              ))}
            </select>
            {groupId ? (
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => undoBatchDeactivate(groupId)} style={{ minHeight: 44 }}>
                Deactivate group
              </Button>
            ) : null}
          </div>

          {!groupId ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
              {vessels.map((v) => {
                const on = adhoc.has(v.id);
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => toggleAdhoc(v.id)}
                    aria-pressed={on}
                    style={{
                      minHeight: 36,
                      padding: "6px 10px",
                      borderRadius: "var(--radius-md)",
                      border: `1px solid ${on ? "var(--accent)" : "var(--border-strong)"}`,
                      background: on ? "var(--accent-soft)" : "var(--surface-raised)",
                      color: "var(--text-primary)",
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    {v.label} · {v.totalL} L
                  </button>
                );
              })}
            </div>
          ) : null}

          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 14px" }}>
            {targetCount} vessel{targetCount === 1 ? "" : "s"} targeted.
          </p>

          {/* Operation */}
          <Eyebrow tone="ink">Operation</Eyebrow>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "8px 0 0" }}>
            <select value={op} onChange={(e) => setOp(e.target.value as OpKind)} style={{ ...fieldStyle, width: 170 }} aria-label="Operation type">
              {(Object.keys(OP_LABELS) as OpKind[]).map((k) => (
                <option key={k} value={k}>
                  {OP_LABELS[k]}
                </option>
              ))}
            </select>

            {needsMaterial ? (
              <>
                <input list="group-materials" value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="Material" style={{ ...fieldStyle, flex: "1 1 150px" }} aria-label="Material" />
                <datalist id="group-materials">
                  {materials.map((m) => (
                    <option key={m.id} value={m.name} />
                  ))}
                </datalist>
                <input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" placeholder="Rate" style={{ ...fieldStyle, width: 84 }} aria-label="Rate" />
                <select value={basis} onChange={(e) => setBasis(e.target.value as RateBasis)} style={{ ...fieldStyle, width: 130 }} aria-label="Basis">
                  {RATE_BASES.map((b) => (
                    <option key={b} value={b}>
                      {RATE_BASIS_LABELS[b]}
                    </option>
                  ))}
                </select>
              </>
            ) : null}

            {op === "CAP_MGMT" ? (
              <select value={capKind} onChange={(e) => setCapKind(e.target.value as "PUMPOVER" | "PUNCHDOWN")} style={{ ...fieldStyle, width: 150 }} aria-label="Cap kind">
                <option value="PUMPOVER">Pump-over</option>
                <option value="PUNCHDOWN">Punch-down</option>
              </select>
            ) : null}

            {op === "TOPPING" ? (
              <select value={fromVesselId} onChange={(e) => setFromVesselId(e.target.value)} style={{ ...fieldStyle, flex: "1 1 150px" }} aria-label="Topping source">
                <option value="" disabled>
                  Top from…
                </option>
                {vessels.filter((v) => v.totalL > 0).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label} ({v.totalL} L)
                  </option>
                ))}
              </select>
            ) : null}

            {needsAmount ? (
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="Litres" style={{ ...fieldStyle, width: 96 }} aria-label="Litres" />
            ) : null}

            <Button variant="primary" size="sm" disabled={pending || targetCount === 0} onClick={apply} style={{ minHeight: 44 }}>
              {pending ? "Applying…" : `Apply to ${targetCount || "—"}`}
            </Button>
          </div>

          {/* Result summary */}
          {result ? <GroupResult result={result} pending={pending} onUndo={undoBatch} /> : null}

          {/* Group manager (create from the current ad-hoc selection) */}
          {!groupId ? (
            <div style={{ borderTop: "1px solid var(--border-strong)", marginTop: 18, paddingTop: 14, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12.5, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)" }}>Save selection as a group</span>
              <input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="Group name" style={{ ...fieldStyle, flex: "1 1 180px" }} aria-label="New group name" />
              <Button variant="secondary" size="sm" disabled={pending || adhoc.size === 0 || !newGroupName.trim()} onClick={createGroup} style={{ minHeight: 44 }}>
                Create group ({adhoc.size})
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );

  function undoBatchDeactivate(id: string) {
    startTransition(async () => {
      try {
        await deactivateGroupAction(id);
        setGroupId("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't deactivate the group.");
      }
    });
  }
}

function GroupResult({ result, pending, onUndo }: { result: GroupApplyResult; pending: boolean; onUndo: (batchId: string) => void }) {
  const exceptions = result.outcomes.filter((o) => o.status !== "applied");
  return (
    <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: "var(--radius-md)", background: "var(--surface-sunken, var(--paper-100))", border: "1px solid var(--border-strong)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Badge tone="green" variant="soft">
          {result.applied} applied
        </Badge>
        {result.skipped > 0 ? (
          <Badge tone="neutral" variant="soft">
            {result.skipped} skipped
          </Badge>
        ) : null}
        {result.errored > 0 ? (
          <Badge tone="red" variant="soft">
            {result.errored} errored
          </Badge>
        ) : null}
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
          Applied to {result.applied} of {result.total}
          {result.skipped + result.errored > 0 ? ` · ${result.skipped + result.errored} skipped` : ""}
        </span>
        {result.applied > 0 ? (
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => onUndo(result.batchId)} style={{ minHeight: 36, marginLeft: "auto" }}>
            Undo batch
          </Button>
        ) : null}
      </div>
      {exceptions.length > 0 ? (
        <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 13, color: "var(--text-secondary)" }}>
          {exceptions.map((o) => (
            <li key={o.vesselId} style={{ marginBottom: 2 }}>
              {o.label} — {o.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
