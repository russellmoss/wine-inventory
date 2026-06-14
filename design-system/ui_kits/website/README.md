# Website UI kit — Savvy Wealth marketing site

A full-screen, brand-applied reference composition of the Savvy Wealth marketing
homepage. It demonstrates the design-system primitives working together in a real
layout.

> **Note on fidelity.** No production website code or Figma was provided with the
> brand package, so this is **not** a pixel recreation of a shipped Savvy page —
> it is an on-brand composition assembled entirely from the system's own
> foundations and components (the honest, non-inventing option). If you share the
> live site's code or design file, this kit can be re-cut to match it exactly.

## Files
- `index.html` — mounts the full page. Loads React UMD + Babel, the compiled DS
  bundle (`_ds_bundle.js`), then `sections.jsx`.
- `sections.jsx` — the page sections, each a small component composed from the DS
  primitives and exported to `window` (`SavvyNav`, `SavvyHero`, `SavvyMetrics`,
  `SavvyValueProps`, `SavvyTestimonial`, `SavvyCTA`, `SavvyFooter`).

## Components used
`Button`, `Eyebrow`, `Metric`, `Quote`, `Card`, `Input` — all from
`window.SavvyDesignSystem_9598d9`. Sections do not re-implement primitives.

## Interactions
- Sticky translucent nav.
- "Book a call" buttons smooth-scroll to the CTA section.
- The CTA email field is controlled state.
- Value-prop cards lift on hover.
