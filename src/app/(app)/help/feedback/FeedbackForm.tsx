"use client";

import React from "react";
import { Badge, Button, Card, Input, Modal, Textarea } from "@/components/ui";

type Kind = "BUG_REPORT" | "FEATURE_REQUEST";
type PendingImage = { file: File; previewUrl: string };
type MarkupTool = "circle" | "arrow" | "text";
type MarkupShape =
  | { kind: "circle"; x: number; y: number; label: string }
  | { kind: "arrow"; x: number; y: number; label: string }
  | { kind: "text"; x: number; y: number; label: string };

function toPendingImages(files: File[]): PendingImage[] {
  return files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }));
}

export function FeedbackForm({
  compact = false,
  onSubmitted,
  initialKind = "BUG_REPORT",
  initialFiles = [],
  lockKind = false,
}: {
  compact?: boolean;
  onSubmitted?: (id: string) => void;
  initialKind?: Kind;
  initialFiles?: File[];
  lockKind?: boolean;
}) {
  const [kind, setKind] = React.useState<Kind>(initialKind);
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [files, setFiles] = React.useState<PendingImage[]>(() => toPendingImages(initialFiles));
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{ id: string; mode?: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [warnings, setWarnings] = React.useState<string[]>([]);
  const [editingIndex, setEditingIndex] = React.useState<number | null>(null);

  async function submit() {
    if (!title.trim() || !body.trim() || busy) return;
    setBusy(true);
    setError(null);
    setWarnings([]);
    setResult(null);
    try {
      const res = await fetch("/api/feedback/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          title,
          body,
          pageUrl: window.location.href,
          debugContext: { schemaVersion: 1, source: compact ? "assistant-widget" : "help-page" },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Could not submit feedback.");
      const uploadWarnings: string[] = [];
      for (const pending of files) {
        const form = new FormData();
        form.set("ticketId", data.id);
        form.set("captureSource", "MANUAL_UPLOAD");
        form.set("file", pending.file);
        const upload = await fetch("/api/feedback/attachments", { method: "POST", body: form });
        const uploadData = await upload.json().catch(() => ({}));
        if (!upload.ok) {
          uploadWarnings.push(uploadData?.error ?? `Could not upload ${pending.file.name}.`);
        } else if (uploadData?.skipped || uploadData?.warning) {
          uploadWarnings.push(uploadData?.warning ?? `${pending.file.name} was not attached.`);
        }
      }
      setResult({ id: data.id, mode: data.modeAtSubmission });
      setWarnings(uploadWarnings);
      setTitle("");
      setBody("");
      setFiles([]);
      onSubmitted?.(data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const content = (
    <div style={{ display: "grid", gap: "var(--space-4)" }}>
      <div
        role="group"
        aria-label="Feedback type"
        style={{
          display: "inline-flex",
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--radius-md)",
          overflow: "hidden",
          width: "fit-content",
        }}
      >
        {[
          ["BUG_REPORT", "Bug report"],
          ["FEATURE_REQUEST", "Feature request"],
        ].map(([value, label]) => {
          const selected = kind === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => !lockKind && setKind(value as Kind)}
              aria-pressed={selected}
              disabled={lockKind}
              style={{
                border: 0,
                padding: "10px 14px",
                cursor: lockKind ? "default" : "pointer",
                background: selected ? "var(--accent)" : "var(--surface-raised)",
                color: selected ? "var(--accent-on)" : "var(--text-secondary)",
                fontFamily: "var(--font-body)",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
      <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} />
      <Textarea
        label="Details"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={compact ? 4 : 7}
        maxLength={6000}
      />
      <label style={{ display: "grid", gap: 6, fontFamily: "var(--font-body)", color: "var(--text-primary)" }}>
        <span style={{ fontSize: "var(--text-body-sm)", color: "var(--text-muted)" }}>Screenshots/images</span>
        <input
          type="file"
          accept="image/png,image/jpeg"
          multiple
          onChange={(e) => setFiles(toPendingImages(Array.from(e.currentTarget.files ?? []).slice(0, 5)))}
        />
      </label>
      {files.length ? (
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          {files.map((pending, index) => (
            <button
              key={`${pending.file.name}-${pending.file.size}-${index}`}
              type="button"
              onClick={() => setEditingIndex(index)}
              style={{
                display: "grid",
                gap: 6,
                width: 138,
                padding: 8,
                border: "1px solid var(--border-strong)",
                borderRadius: "var(--radius-md)",
                background: "var(--surface-raised)",
                cursor: "pointer",
                textAlign: "left",
                fontFamily: "var(--font-body)",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- local pending upload preview */}
              <img src={pending.previewUrl} alt="" style={{ width: "100%", height: 76, objectFit: "cover", borderRadius: "var(--radius-sm)" }} />
              <span style={{ fontSize: 12, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {pending.file.name}
              </span>
              <Badge tone="neutral">Markup</Badge>
            </button>
          ))}
        </div>
      ) : null}
      {error ? <div style={{ color: "var(--danger)", fontFamily: "var(--font-body)" }}>{error}</div> : null}
      {warnings.length ? (
        <div style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: "var(--text-body-sm)" }}>
          {warnings.map((warning) => <div key={warning}>{warning}</div>)}
        </div>
      ) : null}
      {result ? (
        <div style={{ color: "var(--positive)", fontFamily: "var(--font-body)" }}>
          Submitted ticket {result.id}. Mode: {result.mode ?? "report only"}.
        </div>
      ) : null}
      <div>
        <Button onClick={() => void submit()} disabled={busy || !title.trim() || !body.trim()}>
          {busy ? "Submitting..." : "Submit feedback"}
        </Button>
      </div>
      {editingIndex !== null && files[editingIndex] ? (
        <ImageMarkupModal
          pending={files[editingIndex]}
          onClose={() => setEditingIndex(null)}
          onSave={(next) => {
            setFiles((prev) => prev.map((item, index) => (index === editingIndex ? next : item)));
            setEditingIndex(null);
          }}
        />
      ) : null}
    </div>
  );

  return compact ? content : <Card>{content}</Card>;
}

function ImageMarkupModal({
  pending,
  onClose,
  onSave,
}: {
  pending: PendingImage;
  onClose: () => void;
  onSave: (next: PendingImage) => void;
}) {
  const [tool, setTool] = React.useState<MarkupTool>("circle");
  const [label, setLabel] = React.useState("");
  const [shapes, setShapes] = React.useState<MarkupShape[]>([]);
  const imgRef = React.useRef<HTMLImageElement>(null);

  function addShape(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const text = label.trim() || (tool === "text" ? "Note" : "");
    setShapes((prev) => [...prev, { kind: tool, x, y, label: text } as MarkupShape]);
  }

  async function save() {
    const img = imgRef.current;
    if (!img) return;
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    ctx.strokeStyle = "#8f1d2c";
    ctx.fillStyle = "#8f1d2c";
    ctx.lineWidth = Math.max(4, canvas.width / 240);
    ctx.font = `${Math.max(18, canvas.width / 42)}px sans-serif`;
    for (const shape of shapes) {
      const x = shape.x * canvas.width;
      const y = shape.y * canvas.height;
      if (shape.kind === "circle") {
        ctx.beginPath();
        ctx.arc(x, y, Math.max(28, canvas.width / 16), 0, Math.PI * 2);
        ctx.stroke();
      } else if (shape.kind === "arrow") {
        ctx.beginPath();
        ctx.moveTo(x - 70, y - 45);
        ctx.lineTo(x, y);
        ctx.lineTo(x - 14, y - 34);
        ctx.moveTo(x, y);
        ctx.lineTo(x - 38, y - 2);
        ctx.stroke();
      }
      if (shape.label) {
        ctx.fillText(shape.label, x + 12, y - 12);
      }
    }
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return;
    const file = new File([blob], pending.file.name.replace(/\.[^.]+$/, "") + "-marked.png", { type: "image/png" });
    onSave({ file, previewUrl: URL.createObjectURL(file) });
  }

  return (
    <Modal open onClose={onClose} title="Mark up screenshot" maxWidth={860} fullScreenOnMobile>
      <div style={{ display: "grid", gap: "var(--space-3)" }}>
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center" }}>
          {(["circle", "arrow", "text"] as const).map((t) => (
            <Button key={t} size="sm" variant={tool === t ? "primary" : "secondary"} onClick={() => setTool(t)}>
              {t === "circle" ? "Circle" : t === "arrow" ? "Arrow" : "Text"}
            </Button>
          ))}
          <Input label="Label" value={label} onChange={(e) => setLabel(e.target.value)} style={{ maxWidth: 240 }} />
          <Button size="sm" variant="secondary" onClick={() => setShapes((prev) => prev.slice(0, -1))} disabled={!shapes.length}>Undo</Button>
          <Button size="sm" variant="secondary" onClick={() => setShapes([])} disabled={!shapes.length}>Clear</Button>
        </div>
        <div
          onClick={addShape}
          role="button"
          tabIndex={0}
          style={{ position: "relative", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)", overflow: "hidden", cursor: "crosshair" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- local pending upload preview */}
          <img ref={imgRef} src={pending.previewUrl} alt="Screenshot to mark up" style={{ display: "block", width: "100%", maxHeight: "62vh", objectFit: "contain", background: "var(--surface-sunken)" }} />
          <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
            {shapes.map((shape, index) => (
              <g key={index}>
                {shape.kind === "circle" ? <circle cx={shape.x * 100} cy={shape.y * 100} r="5" fill="none" stroke="var(--accent)" strokeWidth="0.7" /> : null}
                {shape.kind === "arrow" ? <path d={`M ${shape.x * 100 - 9} ${shape.y * 100 - 7} L ${shape.x * 100} ${shape.y * 100}`} stroke="var(--accent)" strokeWidth="0.7" fill="none" /> : null}
              </g>
            ))}
          </svg>
          {shapes.map((shape, index) => shape.label ? (
            <span key={index} style={{ position: "absolute", left: `${shape.x * 100}%`, top: `${shape.y * 100}%`, transform: "translate(10px, -24px)", color: "var(--accent)", fontFamily: "var(--font-body)", fontWeight: 700 }}>
              {shape.label}
            </span>
          ) : null)}
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()}>Save markup</Button>
        </div>
      </div>
    </Modal>
  );
}
