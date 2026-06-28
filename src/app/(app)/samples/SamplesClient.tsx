"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Eyebrow, Badge, Button, Modal } from "@/components/ui";
import { ReadingRows, emptyReadingRow, toReadingInputs, readingsValid, type ReadingRow } from "@/components/chemistry/ReadingRows";
import { attachSampleResultsAction, markSampleSentAction, cancelSampleAction } from "@/lib/chemistry/actions";
import type { OpenSampleRow } from "@/lib/chemistry/data";

type Tone = React.ComponentProps<typeof Badge>["tone"];

// The dedicated samples surface (Phase 4, design-review IA): a table of open (non-terminal)
// samples — lot · source · status · age — each row opening an attach-results modal that reuses
// the shared ReadingRows form. A "N pending" count also rides the WINERY nav item + lot header.

const STATUS_TONE: Record<string, Tone> = {
  PULLED: "neutral",
  SENT: "neutral",
  PENDING: "neutral",
  RESULT_RETURNED: "gold",
  ATTACHED: "green",
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
      <Eyebrow rule>Lab &amp; bench · Winery</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: "10px 0 6px" }}>Samples</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 20, maxWidth: "64ch" }}>
        Open samples awaiting results. Attach a returned result to flip the sample to attached and
        write the readings onto its lot&rsquo;s timeline and trends.
      </p>

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
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-muted)", fontSize: 12.5 }}>
                <th style={{ padding: "8px 6px" }}>Lot</th>
                <th style={{ padding: "8px 6px" }}>Source</th>
                <th style={{ padding: "8px 6px" }}>Lab</th>
                <th style={{ padding: "8px 6px" }}>Status</th>
                <th style={{ padding: "8px 6px" }}>Age</th>
                <th style={{ padding: "8px 6px" }} />
              </tr>
            </thead>
            <tbody>
              {samples.map((s) => (
                <tr key={s.id} style={{ borderTop: "1px solid var(--border-strong)" }}>
                  <td style={{ padding: "10px 6px" }}>
                    <Link href={`/lots/${s.lotId}`} style={{ color: "var(--text-accent)" }}>
                      {s.lotCode}
                    </Link>
                    {s.varietyName ? <span style={{ color: "var(--text-muted)" }}> · {s.varietyName}</span> : null}
                  </td>
                  <td style={{ padding: "10px 6px", color: "var(--text-secondary)" }}>{s.source || "—"}</td>
                  <td style={{ padding: "10px 6px", color: "var(--text-secondary)" }}>{s.lab || "—"}</td>
                  <td style={{ padding: "10px 6px" }}>
                    <Badge tone={STATUS_TONE[s.status] ?? "neutral"} variant="soft">
                      {statusWord(s.status)}
                    </Badge>
                  </td>
                  <td style={{ padding: "10px 6px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{relAge(s.pulledAt)}</td>
                  <td style={{ padding: "10px 6px", textAlign: "right", whiteSpace: "nowrap" }}>
                    <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {s.status === "PULLED" ? (
                        <Button variant="ghost" size="sm" disabled={pending} onClick={() => act(() => markSampleSentAction({ sampleId: s.id }))} style={{ minHeight: 36 }}>
                          Mark sent
                        </Button>
                      ) : null}
                      <Button variant="secondary" size="sm" disabled={pending} onClick={() => setAttaching(s)} style={{ minHeight: 36 }}>
                        Attach results
                      </Button>
                      <Button variant="ghost" size="sm" disabled={pending} onClick={() => act(() => cancelSampleAction(s.id))} style={{ minHeight: 36 }}>
                        Cancel
                      </Button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
