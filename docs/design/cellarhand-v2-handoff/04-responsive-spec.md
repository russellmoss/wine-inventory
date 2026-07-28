# 04 · Responsive Specification

Breakpoints. These are the approved set; they extend the single 768px switch the app uses today.

| Token | Range | Name | Primary case |
|---|---|---|---|
| `--bp-phone` | 320–429px | Phone | 390px iPhone in a gloved hand, one thumb |
| `--bp-phone-lg` | 430–767px | Large phone | 430px Pro Max, small Android tablet portrait |
| `--bp-tablet` | 768–1023px | Tablet | Shared cellar iPad, landscape phone |
| `--bp-desktop` | 1024–1439px | Desktop | Laptop |
| `--bp-wide` | 1440px+ | Wide | Office monitor, the design's reference width |

**Design target order:** 390 first for capture screens, 1440 first for management screens. Never solve mobile by shrinking desktop — two of the patterns below are genuinely different artifacts at the two ends.

---

## 1. Application shell

| Width | Behaviour |
|---|---|
| 390 / 430 | No sidebar. Sticky top bar (brand mark + search field, 56px). Four labelled bottom tabs, 56px + safe area. |
| 768 | No sidebar. Top bar gains the scan control. Bottom tabs remain — a shared cellar tablet is used standing up. |
| 1024 | 236px sticky sidebar appears; bottom tabs disappear. Top bar keeps search + scan + connection. |
| 1440+ | Same as 1024. Main content caps at `--container-xl` (1320px) and centres. |

**Persistent at every width:** brand, search, connection state, the assistant FAB/dock.
**Never persistent:** group disclosure state (it follows the route).
**Safe area:** bottom tabs add `env(safe-area-inset-bottom)`; sticky primary actions add it too. The assistant FAB sits above both.

## 2. Navigation

- The `☰` drawer is **deleted**. Today's button measures 38×32px, below the minimum, and is the most important control on a phone.
- Bottom tabs: 4 cells, each ≥56px tall, tap target spanning the full cell, label always visible below the 24px icon.
- Long / translated labels: the label truncates at one line with a tooltip and full `aria-label`; it never wraps to two lines and never shrinks below 12px. If a locale cannot fit 4 labelled tabs, drop to 3 tabs plus Find rather than dropping labels.
- `Find` holds the complete destination directory so nothing is unreachable on a phone.

## 3. Work-order queue

This is the pattern that changes shape most.

| Width | Presentation |
|---|---|
| 390 / 430 | **Card list.** One card per work order: number + title, where (group count + barrel count), a progress bar with `9/60`, who, due. Status chip top-right. The card's whole surface is the tap target; the primary verb is a 52px button inside the card for the top item only. Groups are not expanded inline — tapping opens the order. |
| 768 | Two-column card grid; the saved-view chips scroll horizontally with visible overflow shading (no clipped "Barr" — the audit found a chip rendering as "Barr" at 390px). |
| 1024 | Table appears: `Work order · Where · Progress · Who · Due`. Group expansion enabled. |
| 1440+ | Same table, wider `Where` column showing group names in full. |

**Saved views** stay a horizontal chip row at every width; at ≤767px they scroll with momentum and the active chip scrolls into view on load.
**Narrowing** at ≤767px becomes a sheet triggered by a single "Narrow" button showing the active count — never 600px of filter controls above the list, which is what today's phone layout does.
**Page title row** stacks below 768px: title on its own line, actions in a row beneath. Today it does not stack and the h1 is squeezed to ~90px.

## 4. Dense tables generally

Three transformations, chosen per table — not one global rule. The current global rule (`display:block; overflow-x:auto; white-space:nowrap` on every table under `.app-main` at ≤767px) is **removed**: it drops table semantics for assistive tech, forces maximum horizontal scroll and loses row identity.

| Transformation | Use when | Behaviour |
|---|---|---|
| **A · Card list** | ≤6 columns, each row is an object a person acts on | Each row becomes a card; the identity column becomes the card title; other columns become labelled lines. Table semantics are dropped legitimately because the markup is no longer a table. |
| **B · Priority columns** | The table is genuinely tabular and comparison matters | Keep `<table>` semantics. Show identity + 2 highest-priority columns; the rest collapse into an expandable detail row per row. Sticky first column, `scope="col"`/`scope="row"` throughout. |
| **C · Horizontal scroll with a sticky identity column** | Wide numeric grids (compliance worksheets) | Keep the table, pin column 1, allow horizontal scroll, and **do not** apply `white-space: nowrap` to text cells. Announce scrollability. |

The topping capture grid uses **A** at ≤767px (it becomes the one-barrel runner) and the full table at ≥1024px.

## 5. Barrel groups and 8,000 barrels

| Width | Group index | Group members |
|---|---|---|
| 390 | Card list of groups; each card shows name, lot, barrel count, next due | A group opens to the **runner**, not to a list of 60 rows. A "View all barrels" link gives a searchable, virtualised list. |
| 768 | Two-column group cards; settings open in a sheet | Barrel chips wrap, 8 visible, "+52 more" opens a virtualised sheet |
| 1024+ | Table + settings side panel | Inline chips + full member table |

**Rule at every width:** the default view is never a flat list of thousands. Server-side pagination/virtualisation is mandatory — 63 work orders and 8,142 barrels cannot be shipped to the client. See `08-data-dependency-matrix.md` DM-03.

## 6. The rack ribbon

The ribbon (60 barrels in a single 24px strip) is the scale device and is **responsive by column count, not by scaling**:

| Width | Columns | Rows for 60 |
|---|---|---|
| 390 | 20 | 3 |
| 430 | 20 | 3 |
| 768 | 30 | 2 |
| 1024+ | 30 | 2 |

Tiles keep a minimum of 10px width and 14px height. If a group exceeds 120 members, the ribbon paginates by rack rather than shrinking tiles below 10px. Each tile carries an `aria-label` ("C-1410, topped") and the whole ribbon is `role="list"` — but it is **supplementary**: the same information exists in the counts and the member table, so a screen-reader user never depends on it.

## 7. Tank board

| Width | Grid |
|---|---|
| 390 | 2 columns; tile shows tank code, lot code, volume, state glyph |
| 430 | 2 columns, larger type |
| 768 | 4 columns |
| 1024 | 6 columns |
| 1440+ | 6 columns, wider tiles; 40 tanks fit in 7 rows without scrolling |

Fill height is preserved at every size (it is the data). Tile minimum 132×86px so the lot code never truncates below 8 characters; a longer lot code truncates with a tooltip and full accessible name.

## 8. Tank detail

| Width | Behaviour |
|---|---|
| 390 | Full route, not a modal. Tabs scroll horizontally. The chart is 100% width, 180px tall, and is followed immediately by its **data table** (see §9). Actions become a sticky bottom bar of up to 3 buttons + overflow. |
| 768 | Modal at 90vw. Two-column facts. |
| 1024+ | Modal at 660px, or a route. Chart 100%×172px. Analyses and Tasting side by side. |

## 9. Charts

The Brix/temperature chart is pure SVG with a `viewBox` and no fixed pixel width — it scales. Below 768px:

- Axis labels reduce to 3 x-ticks.
- The legend moves below the chart and wraps.
- **The chart is always followed by a disclosure titled "Readings as a table"** containing the same series as a real `<table>`. This is the accessible alternative and it is not optional. At ≥1024px it stays available but collapsed.

## 10. Lineage

Genuinely two artifacts.

| Width | Artifact |
|---|---|
| ≤767 | **Event stream.** A vertical timeline, newest first, where each split or blend is narrated as a sentence with a "Follow it →" link. Not a graph. |
| ≥768 | **Stage-column graph.** Columns per stage, nodes per lot state, edges coloured and legended for split / blend / continuation / planned. |

Both are backed by the same accessible table (`10-accessibility-spec.md` §9). The graph is never simply scaled down; the phone artifact is authored separately.

## 11. Forms and capture

| Width | Behaviour |
|---|---|
| ≤767 | **Single column, always.** The current hard `gridTemplateColumns: "1fr 1fr"` on the execute screen gives ~180px per numeric field at 390px and must collapse. Numeric field 60px tall, unit adornment 60×64px, nudge row 46px, primary action 56–68px and sticky above the safe area. |
| 768 | Two columns permitted for short fields; numeric fields keep 56px. |
| 1024+ | The capture grid table appears; fields drop to 40px inside rows because a mouse is available. |

## 12. Touch targets

| Context | Minimum |
|---|---|
| Any interactive element, any width | **44×44px** |
| Floor capture primary action | 56px (desktop) / 68px (phone tick) |
| Nudge buttons | 46px |
| Bottom tab | 56px + safe area |
| Ribbon tile | 14px tall — **exempt**, because it is supplementary and every tile has a ≥44px equivalent in the member table |

The measured baseline is 78% of controls under 44px at 390px (293 of 376). The root cause is `Button`'s hardcoded 34/42/50px heights — fix the component (see `06-component-migration-map.md`).

## 13. Sticky behaviour

| Element | Sticky at |
|---|---|
| Top bar | All widths |
| Bottom tabs | ≤1023px |
| Capture primary action | ≤767px, bottom, above safe area |
| Table header | ≥1024px, within the scroll container |
| Identity column | Transformation C tables, all widths |
| Assistant FAB/dock | All widths, above everything except a modal dialog |

The assistant FAB must not overlap page content. The audit found it covering the `0 results` counter on `/work-orders` despite `AppShell` reserving bottom padding. Reserve `calc(var(--space-5) * 2 + 52px)` **and** verify against the sticky action bar, which is taller.

## 14. Long labels and localisation tolerance

- Every layout must survive **+40% string length** (German/Finnish worst case) without clipping or overlap.
- Buttons wrap to two lines rather than truncate; their min-height grows, their width does not shrink below the touch minimum.
- Table headers may wrap; row heights are set by content, not fixed.
- Lot codes, barrel codes and tank codes are **never** truncated below 8 characters — they are identity. Truncate the descriptive text instead.
- Numeric values are never truncated. If a value cannot fit, the column widens or the layout changes.
