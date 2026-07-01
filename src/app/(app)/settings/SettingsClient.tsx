"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Card, Eyebrow, Badge } from "@/components/ui";
import { setSparklingEnabled } from "@/lib/settings/actions";

export function SettingsClient({ sparklingEnabled }: { sparklingEnabled: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = React.useState(sparklingEnabled);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

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
    </div>
  );
}
