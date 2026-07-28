# 13 · Collapsible sidebar (rail mode)

**Approved addition, 28 July 2026.** Reference: `prototype/Direction A at Scale.dc.html` frame **S0**.

---

## 1. What it is

The desktop sidebar collapses from **236px** to a **64px icon rail** and back, on a control in the rail header. Collapsing pushes the main canvas wider — it never overlays it. The brand lockup collapses with it: the full `cellarhand-logo-full.svg` becomes the mark alone (`cellarhand-mark.svg`, the existing `BrandEmblem`, which the codebase already provides "for compact spots").

| | Expanded | Collapsed |
|---|---|---|
| Width | 236px | 64px |
| Brand | Full lockup, 28px tall | Mark only, 28px tall |
| Nav item | 20px icon + label + badge count, 44px tall, full width | 20px icon centred in a 44×44px target |
| Group heading | Uppercase label | A 28px hairline rule |
| Badge | Pill with the number | 7px dot; the count moves into the tooltip and the accessible name |
| Label | Visible | Tooltip on hover or focus, 400ms delay, to the right |
| Footer | Avatar + name + role | Avatar only |

## 2. Why it is worth having

At 1280px the sidebar is 18% of the viewport, and the densest things in the product — the tank board, the capture grid, the barrel-group member table — are exactly what a manager wants more room for. 172px is one more column of tanks, or two more columns of barrel data. It is a real trade, and it is reversible in one click.

## 3. The condition it comes with

A rail of unlabelled icons **is** icon-only navigation, which `05-design-system-v2.md` otherwise prohibits and which the audit flagged. Four rules make this legitimate rather than a regression. All four are mandatory.

1. **Expanded is the default.** A new or seasonal user never meets the rail unless they choose it. The preference is stored per user per device (`localStorage`, tenant-scoped key) and persists across sessions. It is never the server default and never set by an admin for someone else.
2. **The label is always the accessible name.** Every rail item carries `aria-label="Work orders"` in both states. A screen-reader user hears an identical navigation whether the rail is open or closed. The tooltip is *not* the accessible name.
3. **Tooltips answer to keyboard focus, not just hover.** `role="tooltip"`, associated by `aria-describedby`, shown on `:hover` and `:focus-visible`, dismissible with `Esc` while the trigger keeps focus (WCAG 2.2 *Content on Hover or Focus*).
4. **Desktop only.** Below 1024px there is no rail and no hamburger — the four labelled bottom tabs stand. Collapsing is a power-user affordance on a pointer device, not a mobile pattern. There is no state in which a phone user meets an unlabelled icon.

## 4. The control

- Lives in the **rail header**, right-aligned when expanded, centred below the mark when collapsed — the same place in both states, so it is never hunted for.
- 44×44px target. Chevron-into-bar glyph, mirrored by state.
- `aria-expanded` reflects the state; accessible name `Collapse the sidebar` / `Expand the sidebar`.
- Keyboard shortcut `⌘\` / `Ctrl-\`, announced once in an `aria-live` region on toggle: "Sidebar collapsed."
- **Not** a floating hamburger over the canvas. A control that moves is a control that gets lost.

## 5. Behaviour

| Trigger | Response |
|---|---|
| Click / `⌘\` | Width transitions 236 ⇄ 64 over `--duration-normal` (220ms, `--ease-standard`). Labels cross-fade over the first 120ms. Main content reflows; it is not overlaid or scaled. |
| Hover a rail item | Tooltip after 400ms, to the right, `--ink-900` surface, `--radius-sm`, `--shadow-lg`. Immediate for subsequent items while the pointer stays in the rail. |
| Focus a rail item | Tooltip immediately, no delay. |
| Active route | Wine fill on the 44px target, exactly as expanded. |
| `prefers-reduced-motion` | No width transition — the change is instant. No cross-fade. |
| Viewport crosses below 1024px | The rail is irrelevant; bottom tabs take over. The preference is remembered for when the viewport grows again. |
| Group with a badge | Dot only; the number is in the tooltip and the `aria-label` ("Compliance, 2 filing deadlines due soon"). |

**Never:** auto-collapse based on viewport width, auto-expand on hover (a rail that grows under the pointer is a rail that eats clicks), or animate the main content's *contents* — only its width changes.

## 6. Tokens

```css
--rail-w-expanded: 236px;
--rail-w-collapsed: 64px;
--rail-item: 44px;              /* the icon target in collapsed mode */
--rail-divider: 28px;           /* the hairline that replaces a group heading */
--tooltip-delay-hover: 400ms;
--tooltip-delay-focus: 0ms;
--tooltip-bg: var(--ink-900);
--tooltip-fg: var(--cream);
```

## 7. Acceptance criteria

Append to `12-acceptance-criteria.md`:

| ID | Criterion |
|---|---|
| AC-S31 | The sidebar defaults to expanded for a user with no stored preference |
| AC-S32 | Collapsing changes the main content's width, not its scale, and causes no horizontal overflow at 1024, 1280 and 1440 |
| AC-S33 | Every rail item exposes the same accessible name collapsed as expanded — asserted by comparing the accessibility tree in both states |
| AC-S34 | A rail tooltip appears on keyboard focus, not only on hover, and is dismissible with `Esc` without moving focus |
| AC-S35 | A collapsed badge's count is present in the item's accessible name |
| AC-S36 | Below 1024px no rail and no hamburger exists in the DOM |
| AC-S37 | The collapse preference survives a reload and is scoped per tenant and user |
| AC-S38 | Under `prefers-reduced-motion` the width change is instant |
| AC-S39 | `aria-current="page"` is present on the active item in both states |
| AC-S40 | The rail's icon targets measure ≥44×44px |

## 8. Implementation note

This lands in **Phase 3** (`11-implementation-sequence.md`), with the rest of the shell work. It needs no database change and no new API — it is a client preference plus a CSS width. Build the expanded state first and add the rail once the nav model is settled; a rail built against an unstable nav gets rebuilt.
