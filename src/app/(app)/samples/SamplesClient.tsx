"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Button, Modal, StatusChip, ResponsiveTable, DataRow, DataCell, DataHeadCell, PageHeader } from "@/components/ui";
import type { StatusVariant } from "@/components/ui";
import { ReadingRows, emptyReadingRow, toReadingInputs, readingsValid, type ReadingRow } from "@/components/chemistry/ReadingRows";
import { attachSampleResultsAction, markSampleSentAction, cancelSampleAction } from "@/lib/chemistry/actions";
import type { OpenSampleRow } from "@/lib/chemistry/data";

// The dedicated samples surface (Phase 4, design-review IA): a table of open (non-terminal)
// samples — lot · source · status · age — each row opening an attach-results modal that reuses
// the shared ReadingRows form. A "N pending" count also rides the WINERY nav item + lot header.

// RESULT_RETURNED is `review`, not `done`: the schema models RESULT_RETURNED and ATTACHED as two
// distinct states, which is itself the evidence that a human attach step sits between them. A
// returned result is a decision waiting on someone.
const STATUS_TONE: Record<string, StatusVariant> = {
  PULLED: "neutral",
  SENT: "neutral",
  PENDING: "neutral",
  RESULT_RETURNED: "review",
  ATTACHED: "done",
  CANCELLED: "neutral",
};

function relAge(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const days = Math.floor((now - then) / 86400000);
  if (days >= 1) return `pulled ${days}d ago`;
  const hours = Math.floor((now - then) / 3600000);
  if (hours >= 1) return `pulled ${hours}h ago`;
  return "pulled just now";
}

function statusWord(s: string): string {
  return s.toLowerCase().replace(/_/g, " ");
}

export function SamplesClient({ samples }: { samples: OpenSampleRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [attaching, setAttaching] = React.useState<OpenSampleRow | null>(null);

  function act(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "The wine", href: "/lots" }, { label: "Lots", href: "/lots" }, { label: "Samples" }]}
        eyebrow="Lab & bench"
        title="Samples"
        summary={
          samples.length === 0
            ? "No samples are waiting on results."
            : `${samples.length} ${samples.length === 1 ? "sample is" : "samples are"} waiting on results.`
        }
      />

      {error ? <p style={{ color: "var(--danger)", fontSize: 13.5, marginBottom: 14 }}>{error}</p> : null}

      {samples.length === 0 ? (
        <Card>
          <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 14 }}>
            No open samples — pull one from a vessel in{" "}
            <Link href="/bulk" style={{ color: "var(--text-accent)" }}>
              Wine in-progress
            </Link>
            .
          </p>
        </Card>
      ) : (
        <Card>
          {/* First table migrated behind ResponsiveTable. It stamps `data-rt`, which
              opts this table out of the legacy global `display:block` mobile rule —
              the rule that destroys row/column semantics for screen readers. */}
          <ResponsiveTable caption="Open samples awaiting results">
            <thead>
              <tr>
                <DataHeadCell>Lot</DataHeadCell>
                <DataHeadCell>Source</DataHeadCell>
                <DataHeadCell>Lab</DataHeadCell>
                <DataHeadCell>Status</DataHeadCell>
                <DataHeadCell>Age</DataHeadCell>
                <DataHeadCell><span className="sr-only">Actions</span></DataHeadCell>
              </tr>
            </thead>
            <tbody>
              {samples.map((s) => (
                <DataRow key={s.id}>
                  <DataCell identity>
                    <Link href={`/lots/${s.lotId}`} style={{ color: "var(--text-accent)" }}>
                      {s.lotCode}
                    </Link>
                    {s.varietyName ? <span style={{ color: "var(--text-muted)" }}> · {s.varietyName}</span> : null}
                  </DataCell>
                  <DataCell style={{ color: "var(--text-secondary)" }}>{s.source || "—"}</DataCell>
                  <DataCell style={{ color: "var(--text-secondary)" }}>{s.lab || "—"}</DataCell>
                  <DataCell>
                    <StatusChip variant={STATUS_TONE[s.status] ?? "neutral"}>
                      {statusWord(s.status)}
                    </StatusChip>
                  </DataCell>
                  <DataCell style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>{relAge(s.pulledAt)}</DataCell>
                  <DataCell numeric style={{ whiteSpace: "nowrap" }}>
                    <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {s.status === "PULLED" ? (
                        <Button variant="ghost" size="sm" disabled={pending} onClick={() => act(() => markSampleSentAction({ sampleId: s.id }))}>
                          Mark sent
                        </Button>
                      ) : null}
                      <Button variant="secondary" size="sm" disabled={pending} onClick={() => setAttaching(s)}>
                        Attach results
                      </Button>
                      <Button variant="ghost" size="sm" disabled={pending} onClick={() => act(() => cancelSampleAction(s.id))}>
                        Cancel
                      </Button>
                    </span>
                  </DataCell>
                </DataRow>
              ))}
            </tbody>
          </ResponsiveTable>
        </Card>
      )}

      <AttachModal sample={attaching} onClose={() => setAttaching(null)} />
    </div>
  );
}

function AttachModal({ sample, onClose }: { sample: OpenSampleRow | null; onClose: () => void }) {
  if (!sample) return null;
  return (
    <Modal open onClose={onClose} title="Attach results" subtitle={`${sample.lotCode}${sample.source ? ` · ${sample.source}` : ""}`}>
      <AttachPanel key={sample.id} sample={sample} onClose={onClose} />
    </Modal>
  );
}

function AttachPanel({ sample, onClose }: { sample: OpenSampleRow; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<ReadingRow[]>([emptyReadingRow("FREE_SO2")]);
  const reqId = React.useState(() =>
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
  )[0];
  const valid = readingsValid(rows);

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        await attachSampleResultsAction({ sampleId: sample.id, readings: toReadingInputs(rows), clientRequestId: reqId });
        onClose();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {error ? <p style={{ color: "var(--danger)", fontSize: 13.5, margin: 0 }}>{error}</p> : null}
      <p style={{ fontSize: 13.5, color: "var(--text-secondary)", margin: 0 }}>
        Readings attach to lot <strong>{sample.lotCode}</strong> (captured at pull) and flip the sample to attached.
      </p>
      <ReadingRows rows={rows} onChange={setRows} />
      <div>
        <Button variant="primary" size="sm" disabled={pending || !valid} onClick={submit} style={{ minHeight: 44 }}>
          {pending ? "Saving…" : "Attach to lot"}
        </Button>
      </div>
    </div>
  );
}
