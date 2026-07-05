"use client";

import React from "react";
import Link from "next/link";
import { Card, Button } from "@/components/ui";
import { NewWorkOrderClient, type NewWorkOrderIssued } from "@/app/(app)/work-orders/new/NewWorkOrderClient";
import {
  getVesselWorkOrderComposerData,
  createAndIssueWorkOrderAction,
  type VesselWorkOrderComposerData,
} from "@/lib/work-orders/composer-actions";

// Plan 045 Unit 9 — the Actions-tab "Issue work order" surface. Loads the composer data on mount, renders
// the existing NewWorkOrderClient in LOCKED-VESSEL mode (vessel pre-selected + locked), and on submit runs
// create → issue in one step. On success it surfaces any reservation warnings, then tells the parent to
// refetch the vessel History and close. Token-driven; no new visual language.

type Props = {
  vesselId: string;
  vesselLabel: string;
  onClose: () => void;
  /** Called after a successful issue so the parent can refetch the vessel's History timeline. */
  onIssued: () => void;
};

const muted: React.CSSProperties = { fontSize: 14, color: "var(--text-muted)" };

export function IssueWorkOrderPanel({ vesselId, vesselLabel, onClose, onIssued }: Props) {
  const [data, setData] = React.useState<VesselWorkOrderComposerData | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [issued, setIssued] = React.useState<NewWorkOrderIssued | null>(null);

  // Retry handler (a user click — synchronous setState here is fine, unlike inside an effect).
  const load = React.useCallback(() => {
    setLoading(true);
    setLoadError(null);
    getVesselWorkOrderComposerData(vesselId)
      .then((d) => setData(d))
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Couldn't load work-order templates."))
      .finally(() => setLoading(false));
  }, [vesselId]);

  // Load on mount without a synchronous setState prelude (loading initializes to true); cancel-guarded.
  React.useEffect(() => {
    let cancelled = false;
    getVesselWorkOrderComposerData(vesselId)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setLoadError(e instanceof Error ? e.message : "Couldn't load work-order templates."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [vesselId]);

  // Create + issue, then hold on the warnings screen; the user dismisses when they've read them.
  const handleCreateAndIssue = React.useCallback(
    async (input: Parameters<typeof createAndIssueWorkOrderAction>[0]): Promise<NewWorkOrderIssued> => {
      const res = await createAndIssueWorkOrderAction(input);
      setIssued(res);
      onIssued(); // let the parent refresh History now; the panel stays open to show warnings.
      return res;
    },
    [onIssued],
  );

  // ── Success: show the issued number + any reservation warnings, then done. ──
  if (issued) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 15 }}>
          Work order #{issued.number} issued against {vesselLabel}.
        </div>
        {issued.reservationWarnings.length > 0 ? (
          <Card style={{ padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--wine-primary)" }}>Reservation warnings</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: 4 }}>
              {issued.reservationWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </Card>
        ) : null}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
          <Link href={`/work-orders/${issued.workOrderId}`} style={{ fontSize: 13.5, color: "var(--wine-primary)" }}>
            View work order
          </Link>
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    );
  }

  // ── Loading ──
  if (loading) {
    return <div style={muted}>Loading work-order templates…</div>;
  }

  // ── Error ──
  if (loadError) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 14, color: "var(--danger)" }}>Couldn&apos;t load templates — {loadError}</div>
        <div>
          <Button variant="secondary" size="sm" onClick={load}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // ── Empty (no templates) ──
  if (!data || data.templates.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={muted}>
          No templates yet — create one in{" "}
          <Link href="/work-orders/templates" style={{ color: "var(--wine-primary)" }}>
            Work orders
          </Link>
          .
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  // ── Ready: the existing WO creation flow, vessel locked, wired to create + issue. ──
  return (
    <NewWorkOrderClient
      templates={data.templates}
      pickers={data.pickers}
      lockedVessel={{ id: vesselId, label: vesselLabel }}
      onCreateAndIssue={handleCreateAndIssue}
      onCancel={onClose}
    />
  );
}
