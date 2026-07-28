# Cellarhand icon package

16 SVGs: 12 domain icons, 2 supporting domain icons (Lots, Keg) and 2 utility icons (Search, Scan).

## Files

| File | Purpose |
|---|---|
| `ch-*.svg` | Individual assets, ready to import or inline |
| `ch-icons-sprite.svg` | All icons as `<g id="ch-…">` for `<use href="#ch-cellar">` |
| `manifest.json` | Domain mapping, metaphor and note for each icon |

## Grammar

```
viewBox="0 0 24 24"  fill="none"  stroke="currentColor"
stroke-width="1.6"  stroke-linecap="round"  stroke-linejoin="round"
```

No fills, no colour, no gradients, no text. Every icon is drawn from rectangles, circles, straight lines and simple arcs.

## Sizing

| Context | Size |
|---|---|
| Sidebar / menu row | 20px |
| Mobile tab | 24px |
| Inside an input or button | 17px |
| Icon board, empty state | 40px |
| Floor | 16px — below this the family stops being distinguishable |

**Stroke width does not scale with the icon.** It stays 1.6 at a 24 viewBox. Rendering a 40px icon means scaling the SVG, which scales the stroke optically — that is correct and intended.

## Rules of use

1. An icon **reinforces a visible text label**. It never replaces one. Icon-only navigation is prohibited.
2. Icons are reserved for the twelve domain destinations and for act types in a timeline or lineage view.
3. Never on buttons, form labels, section headings or ordinary list rows. Applying the set everywhere is what makes an icon set stop working.
4. Icons inherit `currentColor`. They carry no colour of their own and never encode status — status is carried by `StatusChip`.
5. `aria-hidden="true" focusable="false"` when beside a text label (the normal case). An `aria-label` is required only when an icon is genuinely alone, which should be rare.

## States

| State | Treatment |
|---|---|
| Inactive | `color: var(--ink-600)` |
| Hover | `color: var(--ink-800)` |
| Active / selected | `color: var(--accent-on)` on the wine fill, or `var(--accent)` when the row is not filled |
| Disabled | `color: var(--paper-400)`, paired with disabled label text |
| On dark (dock header, command palette) | `color: rgba(255,248,241,0.62)`; active `#E8B4BA` |

All sixteen remain distinguishable in greyscale and at 16px — verified in `prototype/Icon Concept Board.dc.html`. The closest pair is Cellar and Fermentation, deliberately: they are the same object in two states.

## Licensing

Original work created for Cellarhand. **No third-party or copied assets.** Free to use, modify and redistribute within this product.

## Usage

Sprite (preferred — one network request, easy to recolour):

```html
<!-- once, near the top of the app shell -->
<svg style="display:none" aria-hidden="true">…contents of ch-icons-sprite.svg…</svg>

<a href="/work-orders">
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <use href="#ch-work-orders" />
  </svg>
  Work orders
</a>
```

Or as React components generated from the individual files at build time. Do not paste raw paths into components by hand — the manifest is the source of truth.
