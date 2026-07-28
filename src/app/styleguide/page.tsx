"use client";

import React from "react";
import {
  Button,
  Card,
  Badge,
  Avatar,
  Input,
  Checkbox,
  Eyebrow,
  Metric,
  Quote,
} from "@/components/ui";

const STATUS_RAMP = ["neutral", "active", "held", "done", "attention", "review"] as const;

const VIZ_SERIES = ["Brix", "Temperature", "pH", "Free SO₂", "TA", "Malic"] as const;

const DENSITY_SAMPLES = [
  { token: "--row-h-dense", label: "dense 38" },
  { token: "--row-h-default", label: "default 46" },
  { token: "--row-h-comfortable", label: "comfortable 56" },
  { token: "--touch-min", label: "touch-min 44" },
  { token: "--touch-floor", label: "floor 56" },
  { token: "--touch-floor-lg", label: "floor-lg 68" },
] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 48 }}>
      <Eyebrow rule>{title}</Eyebrow>
      <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
        {children}
      </div>
    </section>
  );
}

export default function StyleguidePage() {
  const [checked, setChecked] = React.useState(true);

  return (
    <div style={{ maxWidth: "var(--container-lg)", margin: "0 auto", padding: "48px 40px" }}>
      <Eyebrow rule>Design system</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 52, margin: "12px 0 8px" }}>
        Cellarhand
      </h1>
      <p style={{ color: "var(--text-secondary)", maxWidth: "60ch", marginBottom: 40 }}>
        Component and token preview. Warm paper, ink text, a single wine-burgundy accent.
      </p>

      <Section title="Status ramp (v2 §A4)">
        <div style={{ width: "100%" }}>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 12, maxWidth: "70ch" }}>
            The single status vocabulary. Wine is deliberately absent — it means brand and primary
            action only. <code>held</code> is built but unwired: no current status produces it.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {STATUS_RAMP.map((name) => (
              <span
                key={name}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 12px",
                  borderRadius: "var(--radius-pill)",
                  background: `var(--status-${name}-bg)`,
                  color: `var(--status-${name}-fg)`,
                  fontSize: 12.5,
                  fontWeight: 500,
                }}
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Provenance (v2 §A5)">
        <div style={{ width: "100%" }}>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 12, maxWidth: "70ch" }}>
            Required on every derived quantity. The words carry the meaning; colour only reinforces.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            {(["measured", "estimated"] as const).map((kind) => (
              <span
                key={kind}
                style={{
                  padding: "4px 10px",
                  borderRadius: "var(--radius-pill)",
                  background: `var(--provenance-${kind}-bg)`,
                  color: `var(--provenance-${kind}-fg)`,
                  fontSize: 11.5,
                  fontWeight: 600,
                }}
              >
                {kind === "measured" ? "measured" : "≈ estimated"}
              </span>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Data-viz series (v2 §A6)">
        <div style={{ width: "100%", display: "flex", flexWrap: "wrap", gap: 14 }}>
          {VIZ_SERIES.map((label, i) => (
            <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <span
                style={{
                  width: 28,
                  height: 3,
                  borderRadius: 2,
                  background: `var(--viz-${i + 1})`,
                }}
              />
              {label}
            </span>
          ))}
        </div>
      </Section>

      <Section title="Density and touch targets (v2 §A8, §A14)">
        <div style={{ width: "100%", display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
          {DENSITY_SAMPLES.map(({ token, label }) => (
            <div key={token} style={{ textAlign: "center" }}>
              <div
                style={{
                  width: 96,
                  height: `var(${token})`,
                  background: "var(--paper-200)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: "var(--radius-sm)",
                }}
              />
              <div style={{ fontSize: 11, color: "var(--text-meta)", marginTop: 6 }}>{label}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Buttons">
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="link">Link</Button>
        <Button variant="primary" disabled>
          Disabled
        </Button>
        <Button variant="primary" size="sm">
          Small
        </Button>
        <Button variant="primary" size="lg">
          Large
        </Button>
      </Section>

      <Section title="Badges">
        <Badge tone="gold">Wine</Badge>
        <Badge tone="green" variant="soft">
          In stock
        </Badge>
        <Badge tone="red" variant="soft">
          Low
        </Badge>
        <Badge tone="neutral" variant="outline">
          Neutral
        </Badge>
        <Badge tone="gold" variant="solid">
          Solid
        </Badge>
        <Badge tone="blue" uppercase>
          Tank
        </Badge>
      </Section>

      <Section title="Avatars">
        <Avatar name="Bhutan Wine" />
        <Avatar name="Russell Moss" tone="green" />
        <Avatar name="Cellar Master" tone="maroon" size={52} />
      </Section>

      <Section title="Forms">
        <div style={{ width: 280 }}>
          <Input label="Wine name" placeholder="Ser Kem Marp Reserve" hint="As it appears on the label" />
        </div>
        <div style={{ width: 280 }}>
          <Input label="Vintage" defaultValue="2025" error="Must be a 4-digit year" />
        </div>
        <Checkbox checked={checked} onChange={setChecked} label="Active in dropdowns" />
      </Section>

      <Section title="Metrics">
        <Card>
          <Metric value="12,480 L" caption="Bulk wine at the winery" />
        </Card>
        <Card>
          <Metric value="1,932" caption="Cases bottled" serif />
        </Card>
        <Card interactive>
          <Metric value="48" caption="Finished-good SKUs" />
        </Card>
      </Section>

      <Section title="Quote">
        <Card padding="var(--space-7)">
          <Quote name="Cellar notes" role="Cellarhand">
            Every bottle is traceable to the barrel it came from.
          </Quote>
        </Card>
      </Section>
    </div>
  );
}
