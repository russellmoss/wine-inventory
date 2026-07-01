"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Card, Eyebrow, Badge, Input, Button } from "@/components/ui";
import { AddressFields } from "@/components/address/AddressFields";
import type { AddressParts } from "@/lib/address/format";
import { setSparklingEnabled } from "@/lib/settings/actions";
import { saveComplianceProfile } from "@/app/(app)/compliance/actions";

export type ComplianceProfileFields = {
  ein: string;
  registryNumber: string;
  operatedByName: string;
  address: AddressParts;
  operatedByPhone: string;
  defaultCadence: "MONTHLY" | "QUARTERLY" | "ANNUAL";
};

export function SettingsClient({
  sparklingEnabled,
  complianceProfile,
}: {
  sparklingEnabled: boolean;
  complianceProfile: ComplianceProfileFields;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = React.useState(sparklingEnabled);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [profileMsg, setProfileMsg] = React.useState<string | null>(null);
  const [profilePending, startProfile] = React.useTransition();

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
            </label>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Button type="submit" variant="primary" disabled={profilePending}>{profilePending ? "Saving…" : "Save compliance profile"}</Button>
            {profileMsg && <span style={{ color: "var(--positive)", fontSize: 14 }}>{profileMsg}</span>}
          </div>
        </form>
      </Card>
    </div>
  );
}
