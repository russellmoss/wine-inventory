# 01 · Information Architecture

## 1. Principle

Navigation is ordered by **frequency of use**, then by role. The audit found the current sidebar inverted against this: `Help / feedback` sits third from the top while every daily cellar workflow is two clicks deep inside a collapsed `WINERY` group (S16).

Three groups replace four. Group labels name the *thing being managed*, not the software area.

## 2. Approved top-level structure

```
TODAY          ← always expanded, highest frequency
  Work orders          /work-orders                      all roles      badge: open count
  Cellar floor         /bulk                             all roles
  Vineyards      /vineyards/field-notes            vineyard+admin
  Fruit intake         /vineyards/harvest                all roles      badge: open weigh-tags

THE WINE       ← expanded by default on desktop ≥1280px
  Lots                 /lots                             all roles      count
  Fermentations        /ferment                          all roles      count
  Blends & trials      /blend                            admin
  Bottling             /bottling                         all roles
  Inventory            /inventory                        all roles

THE BUSINESS   ← collapsed by default
  Compliance           /compliance                       admin          badge: deadlines
  Accounting           /accounting                       admin
  Records              /audit                            all roles      (OD-1)
  Setup                /settings                         admin          (OD-1)
```

**Removed from the sidebar** (still reachable, see §4): `Assistant` (the dock is present on every page; the full page remains at `/assistant` and is reachable from the dock's expand control and from search), `Help / feedback` (moves to the user menu in the sidebar footer), `Reports` (becomes a tab within Accounting and a link from Inventory), `Developer` (unchanged, developer-role only), `De-stem & press` / `Calculator` / `Samples` / `En Tirage` (become contextual — see §4).

Rationale: 31 sidebar entries is not navigable. The approved structure is **13 global destinations**; everything else is reached from the object it belongs to (rule 1), from search, or from a section's own sub-navigation.

**Work orders are not cellar-only.** `Work orders` is the single queue for every kind of work — cellar, vineyard, harvest, bottling, maintenance. A vineyard work order is issued, triaged, briefed and executed through the same screens as a cellar one, using the existing task types (`HARVEST_WEIGH_IN`, observations, notes, maintenance) and block targeting (`WorkOrderTask.blockId`). The barrel-group and keg patterns are *additions* for cellar work; they do not narrow the queue. Nothing in this redesign removes the ability to issue work to the vineyard.

**Nothing is deleted.** Every destination that exists today still exists and keeps its URL. The changes are: which group a destination sits in, whether it is global or contextual, and four label renames. The audit log, spray records, weather and climate, map explorer, planting setup, setup surfaces and the developer tab are all preserved as-is.

## 3. Role visibility

| Destination | `user` | `user` + vineyard | `admin` | `owner` | `developer` |
|---|---|---|---|---|---|
| Work orders | ✓ (own + team) | ✓ | ✓ all | ✓ all | ✓ |
| Cellar floor | ✓ | ✓ | ✓ | ✓ | ✓ |
| Vineyards | — | ✓ scoped | ✓ | ✓ | ✓ |
| Fruit intake | ✓ | ✓ | ✓ | ✓ | ✓ |
| Lots / Fermentations / Bottling / Inventory | ✓ read + act | ✓ | ✓ | ✓ | ✓ |
| Blends & trials | — | — | ✓ | ✓ | ✓ |
| Compliance / Accounting | — | — | ✓ | ✓ | ✓ |
| Records (audit) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Setup | — | — | ✓ | ✓ | ✓ |
| Developer | — | — | — | — | ✓ |

**Programmatic requirement:** the active destination carries `aria-current="page"`. Group disclosure buttons carry `aria-expanded`. Both are absent today across all 24 audited routes (§7.4 of the audit) and are non-negotiable.

## 4. Contextual destinations (not in the global sidebar)

These are reached from the object, from a section sub-nav, or from search. This is the disposition of the audit's 11 orphaned routes plus the four removed above. **Route URLs do not change** unless the "New route" column says otherwise.

| Route | Reached from | Sub-nav home | New route? |
|---|---|---|---|
| `/work-orders/review` | Work orders page header when count > 0; also a Work orders sub-tab | Work orders → Review | no |
| `/work-orders/templates` | Work orders page header; sub-tab | Work orders → Templates | no |
| `/work-orders/task-types` | Setup → Work orders | Setup | no |
| `/work-orders/new` | Primary button on Work orders | — | no |
| `/work-orders/[id]/edit` | Brief → Edit | — | no |
| `/blend/trials` | Blends & trials sub-tab | Blends → Trials | no |
| `/finished-goods`, `/bottled` | Inventory sub-tabs | Inventory | no |
| `/setup/equipment` | Setup | Setup | no |
| `/vineyards/planting-setup` | Setup → Vineyards | Setup | no |
| `/vineyards/sprays/products`, `/vineyards/sprays/planned-harvest` | Spray records sub-nav | Vineyards → Sprays | no |
| `/inbox` | Avatar in sidebar footer (unchanged) | — | no |
| `/ferment/process` (De-stem & press) | Fermentations page primary action; also from a must lot | Fermentations | no |
| `/samples` | Lots → Samples tab; badge surfaces on Lots | Lots | no |
| `/winemaking-calculator` | Contextual button inside any addition form; ⌘K | — | no |
| `/cellar/en-tirage` | Bottling sub-tab when sparkling is enabled | Bottling | no |
| `/reports` | Accounting sub-tab; Export buttons link here | Accounting | no |
| `/help/feedback` | User menu in the sidebar footer | — | no |
| `/assistant` | Dock expand; ⌘K | — | no |
| `/vessels` | Setup → Vessels, **and** a new group/vessel browser at Cellar floor | Setup | no |
| — | **New:** barrel-group index | Cellar floor → Groups | `/cellar/groups` |
| — | **New:** barrel-group detail | from the index and from any WO | `/cellar/groups/[id]` |
| — | **New:** individual barrel detail | scan, search, group drill-down | `/vessels/[id]` |
| — | **New:** keg detail / fill history | topping WO, group settings, search | `/cellar/kegs/[id]` |

**Four new routes total.** All four are additive; none replaces an existing route.

## 5. Old → new navigation mapping

Navigation position changes; URLs are stable. This table is the migration reference for `AppShell.tsx`.

| Today (sidebar) | Approved position | URL change |
|---|---|---|
| MAIN → Dashboard | Removed from sidebar; the brand mark links to `/` | none |
| MAIN → Assistant | Removed; dock + ⌘K | none |
| MAIN → Help / feedback | User menu (footer) | none |
| MAIN → Inventory | THE WINE → Inventory | none |
| MAIN → Reports | Accounting sub-tab | none |
| MAIN → Developer | Unchanged, developer-only, footer | none |
| MAIN → TTB compliance | THE BUSINESS → Compliance | none |
| MAIN → Accounting | THE BUSINESS → Accounting | none |
| MAIN → Audit log | THE BUSINESS → Records | none |
| WINERY → Work orders | **TODAY → Work orders** (position 1) | none |
| WINERY → Wine in-progress | **TODAY → Cellar floor** (renamed) | none |
| WINERY → De-stem & press | Fermentations sub-nav | none |
| WINERY → Blend | THE WINE → Blends & trials | none |
| WINERY → Lot timeline | THE WINE → Lots (renamed) | none |
| WINERY → Samples | Lots sub-tab | none |
| WINERY → Bottling | THE WINE → Bottling | none |
| WINERY → Calculator | Contextual + ⌘K | none |
| WINERY → En Tirage | Bottling sub-tab | none |
| VINEYARDS → Field notes | **TODAY → Vineyards** (renamed) | none |
| VINEYARDS → Harvest | **TODAY → Fruit intake** (renamed) | none |
| VINEYARDS → Weigh-tags | Fruit intake sub-tab | none |
| VINEYARDS → Map Explorer | Vineyards sub-tab | none |
| VINEYARDS → Weather & climate | Vineyards sub-tab | none |
| VINEYARDS → Spray records | Vineyards sub-tab | none |
| SETUP → * | THE BUSINESS → Setup, with sub-nav | none |

**Note on renames:** "Wine in-progress" → "Cellar floor" and "Lot timeline" → "Lots" are content changes only. Keep the old label as a search alias for one release so muscle memory still finds them.

## 6. Breadcrumbs

Present on every screen below a top-level destination. Format: `Group / Destination / Object`, e.g. `Today / Work orders / #253`, `Cellar floor / Hall C / CH-NEUTRAL-14 / C-1410`.

- Rendered as a `<nav aria-label="Breadcrumb">` with an ordered list.
- The final crumb is the current page and is not a link (`aria-current="page"`).
- Maximum 4 crumbs; the middle collapses to `…` with a menu at ≤768px.
- Breadcrumbs are **derived from the route plus the object's own parentage**, not from navigation history.

## 7. Global search and command surface

**Trigger:** `⌘K` / `Ctrl-K` anywhere, or clicking the search field in the top bar, or the "Find" tab on mobile.

**Coverage — deterministic results, always ranked first:**

| Type | Matches on | Result subtitle |
|---|---|---|
| Barrel | code, barrel number, tag id | cooperage · group · lot |
| Barrel group | name, rack label | lot · barrel count · location |
| Tank | code, tag id | lot · volume · state |
| Keg | code | volume · state · last used |
| Lot | lot code, identifiers, blend name | variety · vintage · stage |
| Work order | number, title, assignee | status · due |
| Vineyard block | label | vineyard · variety |
| Material | name, vendor code | on hand · unit |
| Destination | nav label + aliases | the section |

**Rules**

- Results are grouped by type in the order above, capped at 5 per group with "more".
- Every result row shows an icon (typing the result), a primary label, and a subtitle that disambiguates.
- Search works with the assistant disabled or unavailable. It never depends on an LLM call.
- Typing a question (ends in `?`, or starts with a wh-word) surfaces an **Ask** row at the *bottom* of the results, never at the top.
- `⇧↵` on the Ask row opens the dock with that question. It does not run automatically.

**Natural-language commands:** a command intent (e.g. `top rack 14`, `new rack from 25-PN-04`) surfaces under a **Do** heading. Selecting one **creates a draft and navigates to it**; it never executes a write. See `03-interaction-spec.md` §16.

## 8. Scan as a navigation primitive

A **Scan** control sits beside search in the top bar and as a control on the mobile capture screens.

- Scanning a barrel/tank/group/keg tag navigates to that object, or — if the user is inside a task runner — **sets the current position within the runner** rather than navigating away.
- Failure states: no camera permission, unreadable tag, tag not recognised in this tenant, tag belongs to another tenant. Each has approved copy in `09-content-terminology.md`.
- See `rfc/RFC-004-vessel-tags-qr-nfc.md`.

## 9. Mobile navigation

Four labelled bottom tabs replace the `☰` drawer (measured at 38×32px today — the single most important mobile control, below minimum).

| Tab | Icon | Destination |
|---|---|---|
| Work | `work-orders` | `/work-orders` scoped to me |
| Cellar | `cellar` | `/bulk` |
| Vineyard | `vineyard` | `/vineyards/field-notes` |
| Find | `search` | Search + scan sheet, and the full destination directory |

- Tabs are ≥56px tall including label; the tap target spans the full cell.
- Labels are always visible. Icon-only navigation is prohibited.
- `Find` contains the complete destination list, so nothing becomes unreachable on a phone.
- The vineyard tab is hidden for users with no vineyard membership and no admin role; the grid becomes three columns.

## 10. The assistant's relationship to navigation

The assistant is **not** a navigation mechanism and must not be load-bearing for findability (audit §5.3).

- The dock (`AssistantDock.tsx`) is unchanged: 52px wine "Ask" FAB bottom-right at `--space-5`, opening a 440×620 draggable/resizable panel with drag grip, expand-to-centre, voice orb and close.
- Everything the assistant can reach, conventional navigation or search can also reach.
- With the assistant unavailable, no destination becomes unreachable and no capture flow breaks.
- The assistant's *writes* always land the user on the created object. See `03-interaction-spec.md` §16.
