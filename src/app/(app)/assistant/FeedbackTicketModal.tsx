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
  // "Is this about the assistant?" — default No, so the shot hides the assistant to reveal the page
  // behind it. Yes keeps the assistant dock in the frame. Either way the report dialog itself
  // is always excluded (its backdrop + title bar would otherwise occlude the whole screenshot).
  const [inAssistant, setInAssistant] = React.useState(false);
  const [prevOpen, setPrevOpen] = React.useState(open);

  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setStep("consent");
      setFiles([]);
      setPreview(null);
      setError(null);
      setInAssistant(false);
    }
  }

  async function capture() {
    setCapturing(true);
    setError(null);
    try {
      const { toPng } = await import("html-to-image");
      // html-to-image can occasionally stall while serializing a page (embedding fonts/resources).
      // Race it against a timeout so a stall surfaces the "submit anyway" fallback below instead of
      // leaving the button stuck on "Capturing…" forever. cacheBust is off on purpose: the resources
      // are already rendered on-screen, so there's no need to re-fetch them (re-fetching is one more
      // way the capture can stall).
      const dataUrl = await Promise.race([
        toPng(document.body, {
          cacheBust: false,
          pixelRatio: 1,
          filter: (node) => {
            if (!(node instanceof HTMLElement)) return true;
            // Always drop the bug-report dialog (its own subtree) from the shot.
            if (node.closest("[data-feedback-capture-exclude]")) return false;
            // Drop the assistant (dock panel / FAB / expand backdrop) unless the bug is in it.
            if (!inAssistant && node.closest("[data-assistant-surface]")) return false;
            return true;
          },
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("capture timed out")), 15000)),
      ]);
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
    <Modal
      open={open}
      onClose={onClose}
      title="Report a bug or request a feature"
      maxWidth={720}
      fullScreenOnMobile
      overlayProps={{ "data-feedback-capture-exclude": "" }}
    >
      <div data-feedback-capture-exclude style={{ display: "grid", gap: "var(--space-4)" }}>
        {step === "consent" ? (
          <>
            <p style={{ margin: 0, fontFamily: "var(--font-body)", color: "var(--text-secondary)" }}>
              Attach a screenshot of the current page to help explain it?
            </p>

            <div style={{ display: "grid", gap: "var(--space-2)" }}>
              <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-body-sm)", color: "var(--text-primary)", fontWeight: 500 }}>
                Is this about the assistant?
              </span>
              <div
                role="group"
                aria-label="Is this about the assistant?"
                style={{ display: "inline-flex", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-pill)", overflow: "hidden", width: "fit-content" }}
              >
                {([["No", false], ["Yes", true]] as const).map(([label, value]) => {
                  const selected = inAssistant === value;
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setInAssistant(value)}
                      aria-pressed={selected}
                      disabled={capturing}
                      style={{
                        padding: "6px 20px",
                        minWidth: 64,
                        border: "none",
                        cursor: capturing ? "default" : "pointer",
                        fontFamily: "var(--font-body)",
                        fontSize: "var(--text-body-sm)",
                        fontWeight: 500,
                        background: selected ? "var(--accent)" : "transparent",
                        color: selected ? "var(--accent-on)" : "var(--text-muted)",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-body-sm)", color: "var(--text-muted)" }}>
                {inAssistant
                  ? "The assistant stays in the shot. The report dialog is hidden."
                  : "The assistant and the report dialog are hidden so the page behind them is visible."}
              </span>
            </div>

            {error ? <div style={{ color: "var(--danger)", fontFamily: "var(--font-body)" }}>{error}</div> : null}
            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <Button onClick={() => void capture()} disabled={capturing}>
                {capturing ? "Capturing..." : "Capture"}
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
            {/* Kind is NOT locked: the widget is the primary in-app reporting path, so a
                reporter must be able to file a feature request here, not only a bug. */}
            <FeedbackForm
              compact
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
