"use client";

import React from "react";
import { Button, Modal } from "@/components/ui";
import { FeedbackForm } from "@/app/(app)/help/feedback/FeedbackForm";

type Step = "consent" | "form";

export function FeedbackTicketModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = React.useState<Step>("consent");
  const [files, setFiles] = React.useState<File[]>([]);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [capturing, setCapturing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [prevOpen, setPrevOpen] = React.useState(open);

  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setStep("consent");
      setFiles([]);
      setPreview(null);
      setError(null);
    }
  }

  async function capture() {
    setCapturing(true);
    setError(null);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(document.body, {
        cacheBust: true,
        pixelRatio: 1,
        filter: (node) => !(node instanceof HTMLElement && node.closest("[data-feedback-capture-exclude]")),
      });
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `screenshot-${Date.now()}.png`, { type: "image/png" });
      setFiles([file]);
      setPreview(dataUrl);
      setStep("form");
    } catch {
      setError("Screenshot capture failed. You can still submit the report.");
      setStep("form");
    } finally {
      setCapturing(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Report a bug" maxWidth={720} fullScreenOnMobile>
      <div data-feedback-capture-exclude style={{ display: "grid", gap: "var(--space-4)" }}>
        {step === "consent" ? (
          <>
            <p style={{ margin: 0, fontFamily: "var(--font-body)", color: "var(--text-secondary)" }}>
              Attach a screenshot of the current page to help explain the bug?
            </p>
            {error ? <div style={{ color: "var(--danger)", fontFamily: "var(--font-body)" }}>{error}</div> : null}
            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <Button onClick={() => void capture()} disabled={capturing}>
                {capturing ? "Capturing..." : "Capture screenshot"}
              </Button>
              <Button variant="secondary" onClick={() => setStep("form")} disabled={capturing}>
                Continue without screenshot
              </Button>
            </div>
          </>
        ) : (
          <>
            {preview ? (
              <div style={{ display: "grid", gap: "var(--space-2)" }}>
                <div style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)", fontSize: "var(--text-body-sm)" }}>
                  Screenshot attached. Review it before submitting.
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element -- data URL preview before upload */}
                <img
                  src={preview}
                  alt="Captured screenshot preview"
                  style={{ width: "100%", maxHeight: 220, objectFit: "contain", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)" }}
                />
              </div>
            ) : null}
            {error ? <div style={{ color: "var(--danger)", fontFamily: "var(--font-body)" }}>{error}</div> : null}
            <FeedbackForm
              compact
              lockKind
              initialKind="BUG_REPORT"
              initialFiles={files}
              onSubmitted={onClose}
            />
          </>
        )}
      </div>
    </Modal>
  );
}
