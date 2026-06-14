---
name: savvy-design
description: Use this skill to generate well-branded interfaces and assets for Savvy (Savvy Wealth), either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.
If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.
If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Quick orientation
- **Brand:** Savvy / Savvy Wealth — premium, calm, editorial wealth management.
- **Entry stylesheet:** `styles.css` (imports tokens + fonts + base). Link this first.
- **Type:** Big Caslon (display serif / wordmark), Inter Tight (headlines, Light 300), Inter (body/UI).
- **Color:** Vanilla paper `#FFF8F1`, ink black, **Savvy Gold `#8E7E57`** accent, ecru `#C7BCA1`; muted editorial secondaries. No gradients.
- **Motif:** fine gold line-art (spheres, globes, orbits, Venn rings, spirals) in `assets/illustrations/` — gold on light, white on dark.
- **Voice:** warm, advisory, sentence case; uppercase only for tracked eyebrow labels; never emoji.

## Files
- `README.md` — full brand guide (content fundamentals, visual foundations, iconography, manifest).
- `tokens/` — CSS custom properties.
- `assets/` — logos, Big Caslon fonts, line-art illustrations, imagery.
- `components/` — React primitives (`Button`, `Card`, `Badge`, `Avatar`, `Input`, `Checkbox`, `Eyebrow`, `Metric`, `Quote`).
- `slides/` — deck specimen slides (1280×720) + `slide-base.css`.
- `ui_kits/website/` — brand-applied homepage example.
- `guidelines/` — foundation specimen cards.

## Working tips
- For slides/mocks: copy the needed assets (logos, illustrations) alongside your HTML and link `styles.css` (or inline the tokens). The `slides/*.html` files are ready-made starting points.
- For app/UI work: compose the components in `components/`; don't re-implement them.
- Keep accents disciplined — one gold, lots of paper, generous space.
