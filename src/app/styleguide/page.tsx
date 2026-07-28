"use client";

import React from "react";
import { deriveStages } from "@/lib/work-orders/stage";
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
  StatusChip,
  STATUS_VARIANTS,
  StageIndicator,
  INPUT_SIZES,
  Select,
  NumericUnitInput,
  DateTimeControl,
  PageHeader,
  Breadcrumbs,
  IconButton,
  ConfirmButton,
  Skeleton,
  EmptyState,
  Alert,
  ActionReceipt,
} from "@/components/ui";

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
  const [dose, setDose] = React.useState("2");

  return (
    <div style={{ maxWidth: "var(--container-lg)", margin: "0 auto", padding: "48px 40px" }}>
      <Eyebrow rule>Design system</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 52, margin: "12px 0 8px" }}>
        Cellarhand
      </h1>
      <p style={{ color: "var(--text-secondary)", maxWidth: "60ch", marginBottom: 40 }}>
        Component and token preview. Warm paper, ink text, a single wine-burgundy accent.
      </p>

      <Section title="StatusChip — the status ramp (v2 §A4, §B17)">
        <div style={{ width: "100%" }}>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 12, maxWidth: "70ch" }}>
            The single status vocabulary, replacing six independent status→colour maps. Glyph +
            mandatory text, so it survives greyscale. Wine is deliberately absent — it means brand
            and primary action only. <code>held</code> is built but unwired: no current status
            produces it.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
            {STATUS_VARIANTS.map((name) => (
              <StatusChip key={name} variant={name}>
                {name}
              </StatusChip>
            ))}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
            {STATUS_VARIANTS.map((name) => (
              <StatusChip key={name} variant={name} size="md">
                {name} md
              </StatusChip>
            ))}
          </div>
          <p style={{ color: "var(--text-meta)", fontSize: 12, marginBottom: 8 }}>
            The same six under <code>grayscale(1)</code> — the glyph is what keeps them apart.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, filter: "grayscale(1)" }}>
            {STATUS_VARIANTS.map((name) => (
              <StatusChip key={name} variant={name}>
                {name}
              </StatusChip>
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
        <Button variant="primary" pending pendingLabel="Saving…">
          Save
        </Button>
      </Section>

      <Section title="Button sizes — 44 / 48 / 56 / 68">
        <Button variant="secondary" size="sm">
          sm 44
        </Button>
        <Button variant="secondary" size="md">
          md 48
        </Button>
        <Button variant="secondary" size="lg">
          lg 56
        </Button>
        <Button variant="secondary" size="xl">
          xl 68
        </Button>
      </Section>

      <Section title="Badges — category labels only">
        <Badge tone="wine">Wine</Badge>
        <Badge tone="green" variant="soft">
          In stock
        </Badge>
        <Badge tone="red" variant="soft">
          Low
        </Badge>
        <Badge tone="neutral" variant="outline">
          Neutral
        </Badge>
        <Badge tone="wine" variant="solid">
          Solid
        </Badge>
        <Badge tone="blue" uppercase>
          Tank
        </Badge>
        <p style={{ width: "100%", color: "var(--text-meta)", fontSize: 12, margin: "4px 0 0" }}>
          Badge is for categories. A status value belongs in StatusChip above — the two are not
          interchangeable, and a static test enforces it.
        </p>
      </Section>

      <Section title="ConfirmButton — two-step, event-disarmed (v2 §B27)">
        <div style={{ width: "100%" }}>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 12, maxWidth: "70ch" }}>
            The confirm label must name its object. It no longer auto-disarms on a 4-second
            timer (WCAG 2.2.1); it disarms on Escape, on the tab being backgrounded, and on
            unmount — events that mean the user has left, not a clock running while they think.
          </p>
          <ConfirmButton confirmLabel="Archive CH-NEUTRAL-14" onConfirm={() => {}}>
            Archive lot
          </ConfirmButton>
        </div>
      </Section>

      <Section title="Alert (v2 §B25)">
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
          <Alert variant="info" title="Two tanks are still warm">
            T-04 and T-07 are above the 16 °C yeast floor.
          </Alert>
          <Alert variant="warning" title="CH-NEUTRAL-14 is 8% over nominal capacity">
            Recorded anyway — barrels are never blocked for being full.
          </Alert>
          <Alert
            variant="danger"
            title="The rack into T-04 was not recorded"
            actions={<Button size="sm" variant="secondary">Try again</Button>}
          >
            Nothing was written to the lot ledger. The source vessel still holds 218 L.
          </Alert>
          <Alert variant="success" title="WO #171 issued to the cellar crew" />
        </div>
      </Section>

      <Section title="ActionReceipt (v2 §B26)">
        <div style={{ width: "100%" }}>
          <ActionReceipt
            summary="Rack recorded — 218 L into T-04"
            provenance="Written to the lot ledger at 12:47 by you."
            onCorrect={() => {}}
            onSeeLedgerLine={() => {}}
            onDismiss={() => {}}
          />
        </div>
      </Section>

      <Section title="Skeleton (v2 §B29)">
        <div style={{ width: 320 }}>
          <Skeleton variant="text" count={3} label="Loading your work orders…" />
        </div>
        <div style={{ width: 200 }}>
          <Skeleton variant="block" label={null} />
        </div>
        <Skeleton variant="chip" label={null} />
      </Section>

      <Section title="EmptyState (v2 §B30)">
        <Card style={{ width: "100%" }}>
          <EmptyState
            title="No open work orders"
            actions={
              <>
                <Button size="sm">Draft a work order</Button>
                <Button size="sm" variant="secondary">
                  See the archive
                </Button>
              </>
            }
          >
            Everything issued this week has been completed and approved. New work appears here
            the moment someone drafts it.
          </EmptyState>
        </Card>
      </Section>

      <Section title="Select — an accessible name is not optional (v2 §B10)">
        <div style={{ width: "100%" }}>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 12, maxWidth: "70ch" }}>
            <code>label</code> is a required prop. <code>hideLabel</code> moves it to{" "}
            <code>.sr-only</code> for dense filter rows — it changes the label&rsquo;s visibility,
            never its existence. Still a native select: the OS picker is the best control on a phone
            in a cellar.
          </p>
        </div>
        <div style={{ width: 240 }}>
          <Select label="Variety" defaultValue="pn">
            <option value="pn">Pinot Noir</option>
            <option value="ch">Chardonnay</option>
          </Select>
        </div>
        <div style={{ width: 240 }}>
          <Select label="Destination vessel" required defaultValue="">
            <option value="" disabled>Choose a vessel</option>
            <option value="t4">T-04</option>
          </Select>
        </div>
        <div style={{ width: 240 }}>
          <Select label="Tax class" error="Pick a class before filing" defaultValue="">
            <option value="">(derived)</option>
            <option value="a5">§A5</option>
          </Select>
        </div>
        <div style={{ width: 240 }}>
          <Select label="Grower" hideLabel defaultValue="g1" hint="Label is sr-only here">
            <option value="g1">Bajo Vineyard</option>
          </Select>
        </div>
      </Section>

      <Section title="NumericUnitInput (v2 §B9)">
        <div style={{ width: "100%" }}>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 12, maxWidth: "70ch" }}>
            The unit sits in its own box, never inside the value. The live derived readout is the
            single best error-prevention device in the product — it is what catches a 10× dosing slip
            before it reaches the ledger. Out of tolerance is a quiet note, never a block: the wine is
            already moving.
          </p>
        </div>
        <NumericUnitInput
          label="Dose rate"
          value={dose}
          onValueChange={setDose}
          unit="g/hL"
          planned={{ value: "2", label: "Planned: 2 g/hL" }}
          nudges={[-1, 1, 5]}
          derived={`${dose || 0} g/hL × 218 L = ${((Number(dose) || 0) * 2.18).toFixed(2)} g`}
          tolerance={{ ok: Number(dose) <= 10, note: "Above the usual range for this additive — recorded anyway." }}
          style={{ width: 340 }}
        />
      </Section>

      <Section title="DateTimeControl (v2 §B12)">
        <div style={{ width: "100%" }}>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 12, maxWidth: "70ch" }}>
            Still the native input — typed entry keeps working, which a hand-rolled picker usually
            breaks. This only normalises the box so it stops being a visible seam beside DS fields.
          </p>
        </div>
        <div style={{ width: 220 }}>
          <DateTimeControl label="From" defaultValue="2026-07-01" />
        </div>
        <div style={{ width: 220 }}>
          <DateTimeControl label="Pulled at" mode="datetime-local" />
        </div>
      </Section>

      <Section title="PageHeader + Breadcrumbs (v2 §B4, §B5)">
        <div style={{ width: "100%" }}>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 16, maxWidth: "70ch" }}>
            One header for every screen, replacing <strong>nine</strong> distinct hand-set{" "}
            <code>h1</code> sizes across 61 headings (the handoff said four). 34px desktop / 30px
            below. The summary is plain text, never a heading — otherwise it lands in the heading
            outline and the page reads as two titles.
          </p>
          <div style={{ border: "1px dashed var(--border-strong)", borderRadius: "var(--radius-md)", padding: 20 }}>
            <PageHeader
              breadcrumbs={[
                { label: "Today", href: "/" },
                { label: "Work orders", href: "/work-orders" },
                { label: "#253" },
              ]}
              eyebrow="Cellar"
              title="Top up Hall C"
              summary="9 of 60 barrels recorded. Two are flagged for a volume that looks high."
              meta="Issued by you · due today"
              actions={
                <>
                  <Button size="sm" variant="secondary">Edit</Button>
                  <Button size="sm">Execute</Button>
                </>
              }
            />
          </div>
          <p style={{ color: "var(--text-meta)", fontSize: 12, marginTop: 10 }}>
            Breadcrumbs collapse the middle past 4 crumbs; the last is never a link and carries
            <code> aria-current=&quot;page&quot;</code>.
          </p>
          <div style={{ marginTop: 10 }}>
            <Breadcrumbs
              items={[
                { label: "Cellar floor", href: "/bulk" },
                { label: "Hall C" },
                { label: "Rack 4" },
                { label: "CH-NEUTRAL-14" },
                { label: "C-1410" },
              ]}
            />
          </div>
        </div>
      </Section>

      <Section title="IconButton (v2 §B7)">
        <div style={{ width: "100%" }}>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 12, maxWidth: "70ch" }}>
            44×44, 20px icon, <code>aria-label</code> required by the type. Universal actions only —
            close, expand, more. <strong>Never a domain action:</strong> &ldquo;Rack&rdquo; and
            &ldquo;Press&rdquo; are words a cellar hand must be able to read.
          </p>
        </div>
        <IconButton aria-label="Close">✕</IconButton>
        <IconButton aria-label="More actions" variant="outline">⋯</IconButton>
        <IconButton aria-label="Expand" variant="outline">⤢</IconButton>
        <IconButton aria-label="Close" disabled>✕</IconButton>
      </Section>

      <Section title="StageIndicator — derived, never stored (v2 §B24)">
        <div style={{ width: "100%" }}>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 14, maxWidth: "70ch" }}>
            Six segments computed from recorded operations. A stored{" "}
            <code>stage</code> column would be a second source of truth that drifts the
            moment anything is corrected — and this app&rsquo;s whole ledger is
            append-only correction-as-event. The <em>current</em> stage is the FURTHEST
            recorded one, not the most recent op: you top a blended wine all the time, and
            that must not drag the lot backwards.
          </p>
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
            <StageIndicator states={deriveStages(["HARVEST_INTAKE", "CRUSH"])} />
            <StageIndicator states={deriveStages(["HARVEST_INTAKE", "CRUSH", "PRESS", "RACK"])} />
            <StageIndicator states={deriveStages(["BLEND", "TOPPING"])} />
            <StageIndicator states={deriveStages([])} />
          </div>
        </div>
      </Section>

      <Section title="Avatars">
        <Avatar name="Bhutan Wine" />
        <Avatar name="Russell Moss" tone="green" />
        <Avatar name="Cellar Master" tone="maroon" size={52} />
      </Section>

      <Section title="Forms — 44 / 48 / 56 / 60">
        <div style={{ width: "100%" }}>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 12, maxWidth: "70ch" }}>
            The hint and the error are wired to the field with <code>aria-describedby</code>; an error
            also sets <code>aria-invalid</code> and announces via <code>role=&quot;alert&quot;</code>; a
            required field carries a visible marker plus a screen-reader word. None of that existed
            before 2026-07-28, across 165 call sites.
          </p>
        </div>
        <div style={{ width: 280 }}>
          <Input label="Wine name" placeholder="Ser Kem Marp Reserve" hint="As it appears on the label" />
        </div>
        <div style={{ width: 280 }}>
          <Input label="Vintage" defaultValue="2025" error="Must be a 4-digit year" />
        </div>
        <div style={{ width: 280 }}>
          <Input label="Lot code" required placeholder="25-PN-04" hint="Required" />
        </div>
        <div style={{ width: 280 }}>
          <Input label="Volume" size="floor" defaultValue="218" adornmentRight="L" inputMode="decimal" />
        </div>
        <div style={{ width: 280 }}>
          <Input label="Disabled" defaultValue="Not editable" disabled hint="A real surface, not opacity" />
        </div>
        <div style={{ width: "100%", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          {(["sm", "md", "lg", "floor"] as const).map((sz) => (
            <div key={sz} style={{ width: 150 }}>
              <Input label={`${sz} ${INPUT_SIZES[sz].px}`} size={sz} defaultValue="000" />
            </div>
          ))}
        </div>
        <Checkbox checked={checked} onChange={setChecked} label="Active in dropdowns (44px target)" />
        <Checkbox checked={false} disabled label="Disabled" />
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
