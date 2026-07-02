"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Card, Eyebrow, Badge, Input, Button } from "@/components/ui";
import { AddressFields } from "@/components/address/AddressFields";
import type { AddressParts } from "@/lib/address/format";
import { setSparklingEnabled, saveCostSettings } from "@/lib/settings/actions";
import type { CostSettings } from "@/lib/cost/policy";
import { saveComplianceProfile } from "@/app/(app)/compliance/actions";

export type ComplianceProfileFields = {
  ein: string;
  registryNumber: string;
  operatedByName: string;
  address: AddressParts;
  operatedByPhone: string;
  defaultCadence: "MONTHLY" | "QUARTERLY" | "ANNUAL";
  defaultReturnCadence: "SEMIMONTHLY" | "QUARTERLY" | "ANNUAL";
  isEftPayer: boolean;
};

// Component capitalization toggles surfaced in the UI (MATERIAL + DOSAGE_LIQUEUR are always
// capitalized and have no toggle — see isComponentCapitalized). Copy explains what "off" means.
const CAPITALIZATION_TOGGLES: { key: keyof CostSettings; label: string; hint: string }[] = [
  { key: "capitalizeFruit", label: "Fruit / grapes", hint: "Harvest cost captured at crush." },
  { key: "capitalizeBarrel", label: "Barrel", hint: "Cooperage amortization (Phase 8b)." },
  { key: "capitalizePackaging", label: "Packaging / dry goods", hint: "Glass, cork, capsule, label, case." },
  { key: "capitalizeLabor", label: "Labor", hint: "Recorded now; allocation lands in Phase 11." },
  { key: "capitalizeOverhead", label: "Overhead", hint: "Recorded now; allocation lands in Phase 11." },
];

export function SettingsClient({
  sparklingEnabled,
  cost,
  complianceProfile,
}: {
  sparklingEnabled: boolean;
  cost: CostSettings;
  complianceProfile: ComplianceProfileFields;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = React.useState(sparklingEnabled);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [profileMsg, setProfileMsg] = React.useState<string | null>(null);
  const [profilePending, startProfile] = React.useTransition();

  // Phase 8 U9 — costing policy form state (method + capitalization toggles).
  const [costForm, setCostForm] = React.useState(cost);
  const [costMsg, setCostMsg] = React.useState<string | null>(null);
  const [costPending, startCost] = React.useTransition();
  const costDirty =
    costForm.costingMethod !== cost.costingMethod ||
    CAPITALIZATION_TOGGLES.some((t) => costForm[t.key] !== cost[t.key]);

  function saveCost() {
    setCostMsg(null);
    setError(null);
    startCost(async () => {
      try {
        const saved = await saveCostSettings({
          costingMethod: costForm.costingMethod,
          capitalizeFruit: costForm.capitalizeFruit,
          capitalizeBarrel: costForm.capitalizeBarrel,
          capitalizeLabor: costForm.capitalizeLabor,
          capitalizeOverhead: costForm.capitalizeOverhead,
          capitalizePackaging: costForm.capitalizePackaging,
        });
        setCostForm(saved);
        setCostMsg("Saved.");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save the costing policy.");
      }
    });
  }

  function toggle(next: boolean) {
    setError(null);
    setEnabled(next); // optimistic
    startTransition(async () => {
      try {
        await setSparklingEnabled(next);
        router.refresh(); // reveal/hide the gated nav + routes
      } catch (e) {
        setEnabled(!next);
        setError(e instanceof Error ? e.message : "Couldn't save that setting.");
      }
    });
  }

  return (
    <div>
      <Eyebrow rule>Winery</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: "10px 0 6px" }}>Settings</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 24, maxWidth: "60ch" }}>
        Winery-level capabilities. These change what shows up across the app.
      </p>

      <Card style={{ maxWidth: 560 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, justifyContent: "space-between" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 18, margin: 0 }}>Sparkling program</h2>
              <Badge tone={enabled ? "gold" : "neutral"}>{enabled ? "On" : "Off"}</Badge>
            </div>
            <p style={{ color: "var(--text-secondary)", margin: "6px 0 0", fontSize: 14.5, maxWidth: "48ch" }}>
              Traditional-method (méthode champenoise) tracking: tirage, riddling, disgorgement,
              dosage, and finalize, plus the En Tirage worklist. Off by default; turning it on
              reveals the full flow. Tank-method and pét-nat ride the same primitives.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={enabled}
            aria-label="Toggle sparkling program"
            disabled={pending}
            onClick={() => toggle(!enabled)}
            style={{
              flexShrink: 0,
              width: 56,
              height: 32,
              minWidth: 44,
              borderRadius: "var(--radius-pill)",
              border: "1px solid var(--border-strong)",
              background: enabled ? "var(--accent)" : "var(--surface-sunken)",
              position: "relative",
              cursor: pending ? "wait" : "pointer",
              transition: "background 120ms ease",
              padding: 0,
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 3,
                left: enabled ? 27 : 3,
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: "var(--surface-raised)",
                boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
                transition: "left 120ms ease",
              }}
            />
          </button>
        </div>
        {error && <p style={{ color: "var(--danger)", marginTop: 12, fontSize: 14 }}>{error}</p>}
      </Card>

      {/* Phase 8 U9 — costing policy: depletion method + which components fold into cost-per-bottle. */}
      <Card style={{ maxWidth: 560, marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 18, margin: 0 }}>Cost accounting</h2>
          <Badge tone="neutral">Policy v{costForm.policyVersion}</Badge>
        </div>
        <p style={{ color: "var(--text-secondary)", margin: "6px 0 16px", fontSize: 14.5, maxWidth: "50ch" }}>
          How supply cost depletes and which cost components capitalize into cost-per-bottle. Turning a
          component off still records its cost — it just doesn&apos;t roll into the capitalized total.
          Changing anything here bumps the policy version; already-recorded history keeps its old version
          and is never re-valued.
        </p>

        <label style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Depletion method</span>
          <select
            value={costForm.costingMethod}
            onChange={(e) => setCostForm((f) => ({ ...f, costingMethod: e.target.value as CostSettings["costingMethod"] }))}
            style={{ height: 44, maxWidth: 260, padding: "0 12px", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)", background: "var(--surface-raised)", fontFamily: "var(--font-body)", fontSize: 15, color: "var(--text-primary)" }}
          >
            <option value="WEIGHTED_AVG">Weighted average</option>
            <option value="FIFO">FIFO (first in, first out)</option>
          </select>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Which supply lot a draw-down consumes first. Changing this applies going forward — past
            consumption keeps the method it was recorded under.
          </span>
        </label>

        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 8 }}>
          Capitalized components
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {CAPITALIZATION_TOGGLES.map((t) => (
            <label key={t.key} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14.5 }}>
              <input
                type="checkbox"
                checked={costForm[t.key] as boolean}
                onChange={(e) => setCostForm((f) => ({ ...f, [t.key]: e.target.checked }))}
                style={{ marginTop: 3, width: 16, height: 16, flexShrink: 0 }}
              />
              <span style={{ minWidth: 0 }}>
                {t.label}
                <span style={{ display: "block", fontSize: 12.5, color: "var(--text-muted)" }}>{t.hint}</span>
              </span>
            </label>
          ))}
        </div>
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "12px 0 0", maxWidth: "50ch" }}>
          Materials and dosage liqueur always capitalize and can&apos;t be turned off.
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
          <Button variant="primary" disabled={costPending || !costDirty} onClick={saveCost}>
            {costPending ? "Saving…" : "Save costing policy"}
          </Button>
          {costMsg && <span style={{ color: "var(--positive)", fontSize: 14 }}>{costMsg}</span>}
        </div>
      </Card>

      {/* TTB compliance profile — the filer identity that heads Form 5120.17. */}
      <Card style={{ maxWidth: 560, marginTop: 16 }}>
        <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 18, margin: 0 }}>TTB compliance profile</h2>
        <p style={{ color: "var(--text-secondary)", margin: "6px 0 16px", fontSize: 14.5, maxWidth: "48ch" }}>
          The filer identity printed on the Report of Wine Premises Operations (Form 5120.17) header —
          EIN, registry number, and who the premises are operated by. Set once; it auto-populates every
          generated report.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setProfileMsg(null);
            setError(null);
            startProfile(async () => {
              try {
                await saveComplianceProfile(fd);
                setProfileMsg("Saved.");
                router.refresh();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Couldn't save the profile.");
              }
            });
          }}
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Input label="EIN" name="ein" defaultValue={complianceProfile.ein} placeholder="00-0000000" style={{ flex: "1 1 180px" }} />
            <Input label="Registry number" name="registryNumber" defaultValue={complianceProfile.registryNumber} placeholder="BWN-XX-00000" style={{ flex: "1 1 200px" }} />
          </div>
          <Input label="Operated by (name)" name="operatedByName" defaultValue={complianceProfile.operatedByName} />
          <AddressFields initial={complianceProfile.address} />
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <Input label="Phone" name="operatedByPhone" defaultValue={complianceProfile.operatedByPhone} style={{ maxWidth: 220 }} />
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Filing cadence</span>
              <select
                name="defaultCadence"
                defaultValue={complianceProfile.defaultCadence}
                style={{ height: 44, padding: "0 12px", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)", background: "var(--surface-raised)", fontFamily: "var(--font-body)", fontSize: 15, color: "var(--text-primary)" }}
              >
                <option value="MONTHLY">Monthly</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="ANNUAL">Annual</option>
              </select>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Operations report (5120.17)</span>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Excise return cadence</span>
              <select
                name="defaultReturnCadence"
                defaultValue={complianceProfile.defaultReturnCadence}
                style={{ height: 44, padding: "0 12px", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)", background: "var(--surface-raised)", fontFamily: "var(--font-body)", fontSize: 15, color: "var(--text-primary)" }}
              >
                <option value="SEMIMONTHLY">Semimonthly</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="ANNUAL">Annual</option>
              </select>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Excise tax return (5000.24)</span>
            </label>
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
            <input type="checkbox" name="isEftPayer" value="true" defaultChecked={complianceProfile.isEftPayer} />
            Pays federal excise tax by EFT (changes the September semimonthly split — 27 CFR 24.271)
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Button type="submit" variant="primary" disabled={profilePending}>{profilePending ? "Saving…" : "Save compliance profile"}</Button>
            {profileMsg && <span style={{ color: "var(--positive)", fontSize: 14 }}>{profileMsg}</span>}
          </div>
        </form>

        {/* plan-027 Unit 9 — export the filing calendar. Reflects the SAVED cadence above. */}
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--border-strong)" }}>
          <div style={{ fontSize: 14.5, fontWeight: 500, marginBottom: 4 }}>Filing deadline calendar</div>
          <p style={{ color: "var(--text-secondary)", fontSize: 13.5, margin: "0 0 10px", maxWidth: "52ch" }}>
            Download an .ics of your upcoming 5120.17 and 5000.24 filing deadlines — each with reminders
            one week, two days, and the day before. Import it into Google Calendar, Apple Calendar, or Outlook.
            To also get email nudges, opt users in under Users.
          </p>
          <a
            href="/api/compliance/calendar"
            style={{
              display: "inline-flex", alignItems: "center", height: 40, padding: "0 16px", borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-strong)", background: "var(--surface-raised)", color: "var(--text-primary)",
              fontFamily: "var(--font-body)", fontSize: 14.5, textDecoration: "none",
            }}
          >
            Add filing deadlines to calendar
          </a>
        </div>
      </Card>
    </div>
  );
}
