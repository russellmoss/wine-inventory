"use client";

import React from "react";
import { Modal, Button, Checkbox } from "@/components/ui";
import { VendorPicker } from "@/components/vendors/VendorPicker";
import { getVendorUsageAction, mergeVendorsAction } from "@/lib/vendors/actions";
import { describeVendorUsage, type VendorRow, type VendorUsage } from "@/lib/vendors/vendors-shared";

// Plan 072: merge a duplicate vendor (the LOSER) into a SURVIVOR. Everything the loser touches — materials,
// supply lots, A/P bills, contacts — is re-pointed onto the survivor, then the loser is permanently deleted.
// Admin-only (opened from VendorsClient). The QBO-mapping conflict path reveals an acknowledgement checkbox
// and retries with it set (a local merge doesn't merge the two QuickBooks vendors).

export function MergeVendorModal({
  loser,
  vendors,
  onClose,
  onMerged,
}: {
  loser: VendorRow | null;
  vendors: VendorRow[];
  onClose: () => void;
  onMerged: () => void;
}) {
  const [survivorId, setSurvivorId] = React.useState<string | null>(null);
  const [usage, setUsage] = React.useState<VendorUsage | null>(null);
  const [needsQboAck, setNeedsQboAck] = React.useState(false);
  const [qboAck, setQboAck] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  // Fetch the loser's reference counts for the impact preview when the modal opens. The parent keys this
  // modal by loser id, so each open is a fresh mount (usage starts null) — no synchronous reset needed.
  React.useEffect(() => {
    if (!loser) return;
    let live = true;
    getVendorUsageAction(loser.id)
      .then((u) => { if (live) setUsage(u); })
      .catch(() => { /* leave usage null → preview shows "…" */ });
    return () => { live = false; };
  }, [loser]);

  const survivor = React.useMemo(() => vendors.find((v) => v.id === survivorId) ?? null, [vendors, survivorId]);
  // Survivor candidates = every OTHER vendor (can't merge a vendor into itself).
  const candidates = React.useMemo(() => vendors.filter((v) => v.id !== loser?.id), [vendors, loser]);
  const canSubmit = !!loser && !!survivorId && (!needsQboAck || qboAck) && !pending;

  function submit() {
    if (!loser || !survivorId) return;
    setError(null);
    startTransition(async () => {
      const res = await mergeVendorsAction({ loserId: loser.id, survivorId, acknowledgeQboConflict: qboAck });
      if (res.ok) { onMerged(); return; }
      // A QBO-mapping conflict: reveal the acknowledgement and let the admin confirm + retry.
      if (res.code === "CONFLICT" && /quickbooks/i.test(res.error)) setNeedsQboAck(true);
      setError(res.error);
    });
  }

  return (
    <Modal
      open={!!loser}
      onClose={onClose}
      title={loser ? `Merge · ${loser.name}` : "Merge vendor"}
      subtitle="Move everything onto another vendor, then delete this one"
      maxWidth="min(560px, 96vw)"
    >
      {loser ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 13.5, color: "var(--text-primary)" }}>
            Merge <strong>{loser.name}</strong> into another vendor. Its{" "}
            <strong>{usage ? describeVendorUsage(usage) : "…"}</strong> will move to the vendor you pick, and{" "}
            <strong>{loser.name}</strong> will be permanently deleted.
          </div>

          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
              Keep this vendor (the survivor)
            </label>
            <VendorPicker vendors={candidates} value={survivorId} onSelect={(v) => { setSurvivorId(v?.id ?? null); setNeedsQboAck(false); setQboAck(false); setError(null); }} placeholder="Search the vendor to keep…" />
          </div>

          {survivor ? (
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
              After merging, everything currently under <strong>{loser.name}</strong> will belong to{" "}
              <strong>{survivor.name}</strong>.
            </div>
          ) : null}

          {needsQboAck ? (
            <div style={{ background: "var(--surface-sunken, rgba(0,0,0,0.04))", padding: "10px 12px", borderRadius: "var(--radius-md)" }}>
              <Checkbox
                checked={qboAck}
                onChange={(checked) => setQboAck(checked)}
                label={
                  <span style={{ fontSize: 12.5 }}>
                    These vendors link to different QuickBooks vendors. I understand a local merge won&apos;t merge them
                    in QuickBooks — already-posted bills stay under the old QuickBooks vendor — and I&apos;ll reconcile
                    in QuickBooks if needed.
                  </span>
                }
              />
            </div>
          ) : null}

          {error ? <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p> : null}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
            <Button type="button" variant="primary" onClick={submit} disabled={!canSubmit}>
              {pending ? "Merging…" : "Merge & delete"}
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
