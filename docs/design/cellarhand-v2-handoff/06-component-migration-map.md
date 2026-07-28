# 06 · Component Migration Map

Inventory taken from `src/components/ui/index.ts` (21 exports), `src/components/AppShell.tsx`, `src/components/assistant/AssistantDock.tsx`, `src/components/BrandMark.tsx`, and the work-order clients.

**Risk key:** L = local change · M = touches several call sites · H = API change across many call sites or a behaviour contract.

---

## 1. Existing components

| Component | Disposition | What changes | Known call sites | Risk |
|---|---|---|---|---|
| `Button` | **Extend + fix** | Heights 34/42/50 → 44/48/56, add `xl` 68px; add `focus-visible`; replace `opacity:.45` disabled with a real disabled surface; fix `link` baseline; consume `--text-*`/`--space-*` instead of `14.5`/`"11px 20px"`/`0.005em`; add `pending`/`pendingLabel` | Everywhere (~100+) | **H** — every screen grows vertically by 2–6px per button row; visually re-baseline the app in one pass |
| `Badge` | **Extend + rename** | `tone="gold"` → `tone="wine"`; remove status use entirely; keep for category labels | ~12 files + `/styleguide` | **H** — breaking prop value |
| `Card` | **Keep** | No geometry change. Usage guidance only: objects, not regions; no card-in-card | Many | L |
| `Input` | **Extend** | Add `lg`/`floor` sizes, adornment slots, visible required marker | Many | M |
| `Textarea` | **Keep** | Add to `/styleguide` (currently no preview) | Several | L |
| `Checkbox` | **Extend** | 20px visual inside a 44px target | Several | L |
| `Eyebrow` | **Keep** | Retarget default colour to `--text-meta` where it labels data rather than a brand moment | Many | L |
| `Metric` | **Keep** | Unchanged. Not used in the approved slice | Dashboard | L |
| `Quote` | **Keep** | Reused for tasting notes | Few | L |
| `Avatar` | **Keep** | Unchanged | Shell | L |
| `Modal` | **Extend** | Becomes the base for `ConfirmDialog`, `CorrectionDialog`, keg close-out; add focus-to-heading, `aria-modal`, non-dismiss-on-outside for destructive | Several | M |
| `ConfirmButton` | **Fix** | **Remove the 4s auto-disarm** (WCAG 2.2.1 + layout-shift mis-click trap); default label must name its object | 12 files | **H** — behaviour contract |
| `Tabs` | **Keep** | Already correct: `role="tablist"`, roving tabindex, panels stay mounted. Reuse for tank detail. Add to `/styleguide` | Several | L |
| `Collapsible` | **Keep** | Reuse for group expansion where it unmounts acceptably; **not** for capture rows (state must survive) | Several | L |
| `InfoHint` | **Keep** | Good pattern. Add to `/styleguide` | Several | L |
| `LocalTime` | **Keep** | Unchanged | Many | L |
| `ExportCsvButton` | **Extend** | CSV headers must honour tenant unit preferences — currently hardcoded `(L)` while the UI honours prefs | `/reports`, others | M |
| `BrixChart` | **Extend** | Reuse the pure-SVG approach for the tank fermentation chart; add a second axis for temperature, threshold lines, the `--viz-*` palette, dash/marker encodings, and the mandatory data-table alternative | Harvest | M |
| `AnalyteTrendChart` | **Consolidate** | Merge with `BrixChart` into one `TimeSeriesChart` with a series config. Two components do one job | Lots/analysis | M |
| `MapLegend`, `MapLayerControl`, `SatelliteMap*` | **Keep** | Out of scope | Vineyards | L |
| `AppShell` | **Replace internals** | New nav model (3 groups, 13 destinations), top bar with search + scan + connection, skip link, `aria-current`, `aria-expanded`, bottom tabs ≤1023px, drawer deleted | 1 | **H** — but a single file |
| `AssistantDock` | **Keep unchanged** | Geometry, drag/resize, expand, Esc precedence, voice orb, FAB all stay. Only the *outcome* of "Review & create" changes (navigate to the draft) — that lives in the chat/tool layer, not the dock | 1 | L for the dock, M for the tool handler |
| `BrandMark` / `BrandEmblem` | **Keep** | Unchanged | Shell, login | L |
| `WorkOrderFilterBar` | **Replace** | → `SavedViews` + `Narrow`. Live application, URL-synced, no Apply, mobile sheet | `/work-orders` open + archive | M |
| `WorkOrdersTabs` | **Extend** | Becomes `SectionNav` with Open / Review / Templates / Archive; segments to 44px (36px today) | `/work-orders` | L |
| `VesselMultiSelect` | **Deprecate** | The inline scrolling multi-select is ~450px of chrome above the list. Replaced by narrowing chips with type-ahead | `/work-orders`, `/work-orders/new` | M |
| `statusTone()` / `STATUS_TONE` | **Restyle** | Same signature, new six-value ramp (`neutral/active/held/done/attention/review`) | 3+ files incl. lot timeline | M |
| `DueAt` | **Keep** | Unchanged | WO screens | L |
| `MaterialFilterPicker` | **Keep** | Already the right pattern for >10 options; reuse as the combobox base | Execute, builder | L |
| `WorkOrderReadinessPanel` | **Keep** | Feeds the brief's blocker text; move blockers out of `title` tooltips into visible text | Builder | L |
| Cellar forms (`src/components/cellar/forms/`, e.g. `DoseForm`) | **Keep as the model** | The live `rate × volume = total` `aria-live` readout is the best error-prevention device in the product. Generalise it into `NumericUnitInput`'s `derived` slot | `/bulk` | L |
| `GroupMaintenanceUndo` | **Rename + generalise** | Becomes `ActionReceipt` + `CorrectionDialog`; the word "Undo" is retired in favour of "Correct" | Execute | M |

---

## 2. New components required

| Component | Why it doesn't exist today | Depends on |
|---|---|---|
| `PageHeader` | `h1` is hand-set per page at 40/36/32/22px; two different header templates exist | — |
| `Breadcrumbs` | No breadcrumb component anywhere in `src/` | — |
| `MobileTabBar` | Drawer only | Icon package |
| `SectionNav` | Only the WO Open/Archive toggle exists | — |
| `CommandPalette` | No `cmdk`, no palette, no global search of any kind | Search API |
| `IconButton` | Icon buttons are hand-rolled inline | Icon package |
| `NumericUnitInput` | Execute and `/bulk` use raw `<input style={big}>` and bypass the DS | `Input` |
| `DataRow` | Rows are hand-rolled per screen | — |
| `ResponsiveTable` | One global CSS rule does it badly for every table | — |
| `SavedViews` + `Narrow` | `WorkOrderFilterBar` | Server-side filtering |
| `StatusChip` | `Badge` is misused for status | Status ramp tokens |
| `ProvenanceBadge` | No measured/estimated concept in the UI | RFC-003 |
| `VesselIdentityBlock` | Vessel identity is re-composed per screen | — |
| `FillIndicator` | A bar exists inline in `VesselsClient`; not a component | — |
| `GroupRibbon` | New pattern | — |
| `StageIndicator` | New pattern | — |
| `ActionReceipt` | No app-wide toast/receipt; ~69 ad-hoc success sites | — |
| `ConfirmDialog` | Only the inline `ConfirmButton` exists | `Modal` |
| `CorrectionDialog` | Correction is per-screen | Ledger correction APIs |
| `Skeleton` | 1 `loading.tsx` across 57 routes | — |
| `EmptyState` | Hand-rolled per screen | — |
| `AIProposalCard` | Draft cards exist inside the chat, not as a component | — |
| `ProvenancePanel` | No provenance UI | — |
| `TimeSeriesChart` | Two overlapping chart components | `BrixChart` + `AnalyteTrendChart` |
| `LineageNode` / `LineageEdge` | New | RFC/lineage model |
| `EventHistoryItem` | Timeline rows are hand-rolled | — |
| `ScanButton` / `ScanSheet` | No `BarcodeDetector` or NFC anywhere | RFC-004 |
| `KegPanel` / `KegCloseOutDialog` | New domain UI | RFC-002 |

---

## 3. Duplication and bypass to resolve

| Problem | Evidence | Resolution |
|---|---|---|
| **Screens bypass the design system.** Execute and `/bulk`'s add-row use raw `<input style={big}>` and `selectStyle` | `ExecuteClient.tsx` `big`/`lbl` consts | Route all capture through `Input` / `NumericUnitInput` |
| **Two work-order creation clients** — which one you land in depends on the entry point | `WorkOrderBuilderClient` (755 lines) + `NewWorkOrderClient` (472) | Unify. Out of this slice's scope but blocked on the same components |
| **Two chart components** doing one job | `BrixChart`, `AnalyteTrendChart` | `TimeSeriesChart` |
| **Status expressed three ways** | `Badge tone`, inline coloured text, raw status strings | `StatusChip` only |
| **Success feedback re-implemented ~69 times**; live-region coverage 29 `aria-live` / 12 `role="alert"` / 12 `role="status"` | grep | `ActionReceipt` + `Alert` |
| **12 of 21 components have no `/styleguide` preview; 9 undocumented in DESIGN.md** | audit §2.2 | Every component in this map gets a `/styleguide` entry and a DESIGN.md line — treat the styleguide as the visual-regression surface |
| **Confirmation applied by habit, not by reversibility** — `ConfirmButton` in 12 files, one-click destructive verbs in ~11 others | grep | Apply the `03-interaction-spec.md` §13 classes |
| **Native date inputs beside DS fields** | `/work-orders` From/To | `DateTimeControl` |

---

## 4. Migration sequencing within the component layer

1. **Tokens first** (`05-design-system-v2.md` Part A) — no visual change until consumed.
2. **`Button`, `Badge`/`StatusChip`, focus rule, reduced-motion rule.** This re-baselines the whole app; do it in one commit and take full-page visual-regression snapshots before and after.
3. **`Input` / `NumericUnitInput` / `Select`.**
4. **`PageHeader`, `Breadcrumbs`, `Skeleton`, `EmptyState`, `Alert`, `ActionReceipt`.**
5. **`AppShell`** (nav model + `MobileTabBar` + skip link + `aria-current`).
6. **`DataRow`, `ResponsiveTable`, `SavedViews`.**
7. Screen work begins.

Steps 1–4 are safe to ship independently and improve every existing screen. Step 5 is the first user-visible IA change and should ship behind a flag if the team wants a rollback path.
