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
