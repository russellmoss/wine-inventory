# Cellarhand — Production Handoff

**Approved direction:** Direction A at Scale (v2)
**Prototype of record:** `prototype/Direction A at Scale.dc.html`
**Status:** approved for implementation
**Prepared:** 27 July 2026
**Target repository:** `Wine-inventory` (Next.js 16 App Router, React 19, Prisma/Neon, Better Auth)
**Source branch/commit:** not captured — the working tree was mounted as a local folder, not a git checkout. Record the commit you branch from at the top of your implementation plan.

---

## 1. What was approved

Direction A at Scale is an evolution of the existing warm-editorial identity, restructured for wineries operating up to **~8,000 barrels and ~40 tanks**. It keeps DESIGN.md's cream paper, Big Caslon display face, Inter/Inter Tight UI stack and the single wine accent, and changes four things:

1. **Wine stops being a status colour.** `--accent` now means brand + the one primary action. A five-tone status ramp with glyphs takes over status.
2. **The unit of display becomes the group.** Barrel groups, racks, lots and tanks are what you browse; an individual barrel is a leaf reached by scan, search or a task runner.
3. **The unit of measurement becomes the keg.** Topping is captured as a tick per barrel plus one measured keg close-out, which fans out as *estimated* per-barrel additions.
4. **Modes are removed from capture.** The "Edit" gate on the execute screen is deleted; planned values are the default values of live fields.

The approved package also covers a domain icon family, a compact production-context pattern, a conceptual grape-to-bottle lineage view, and confirmed changes to the assistant's write flow.

## 2. Product goal

Maximum ease of use under real winery conditions — cellar floor, bright sun, gloves, one hand, harvest time pressure, patchy connectivity — followed closely by beauty and coherence. The system must serve a first-day seasonal worker without slowing an experienced cellar master.

## 3. Primary users and environments

| Persona | Role in the app | Environment | Devices |
|---|---|---|---|
| Cellar hand | `user` | Barrel halls, crush pad, tank farm. Gloves, wet hands, poor light or direct sun. Signal drops in Hall B/C. | Phone at 390px, occasionally a shared tablet |
| Vineyard staff | `user` + `vineyardIds` | Blocks, outdoors, full sun, patchy cellular | Phone |
| Production manager | `admin` | Office + floor, moves constantly | Desktop 1440px, phone |
| Winemaker | `admin`/`owner` | Bench, cellar, office | Desktop, phone |
| Accounting / compliance | `admin`/`owner` | Office, reliable network | Desktop 1440px+ |

## 4. Design principles (as applied)

These restate `docs/architecture/ux-principles.md` in the terms this redesign was graded against. Where a principle is newly enforced by a specific mechanism, the mechanism is named.

1. **Show what needs attention and what comes next.** — The day headline plus a one-sentence state summary on every index screen.
2. **Recognition over recall.** — Barrel identity always carries cooperage/oak/toast; tank tiles always carry the lot code.
3. **Minimise modes.** — No Edit gate. Planned values are field defaults.
4. **Winery language.** — See `09-content-terminology.md`. No `LotOperationLine`, no `(v3, was …)`, no slug ids, no raw actor emails in user-facing prose.
5. **Make state explicit.** — Measured vs. estimated is a visible badge on every derived quantity.
6. **Never claim a guarantee the system cannot honour.** — "Held on this phone" is only shown if an outbox actually exists; until Phase 28 lands, the honest state is *"No connection — don't record yet"* with the primary action disabled. See §7 caution 1.
7. **Fast routine, deliberate danger.** — One tap to tick a barrel; a restated confirmation for compliance filing and for anything irreversible.
8. **Progressive disclosure.** — Group rows expand to members; briefs expand to lineage; the barrel is always reachable but never in the way.
9. **Accessibility is foundational.** — See `10-accessibility-spec.md`. Skip link, `aria-current`, 44px targets, colour-independent status.
10. **AI increases clarity without being required.** — Conventional search and navigation work with AI switched off.

## 5. Scope of the approved redesign

**In scope**

- Application shell: sidebar regrouped by frequency, top bar with global search and scan, honest connection indicator.
- Global search / command surface (⌘K) and a scan entry point.
- Mobile navigation: four labelled bottom tabs, replacing the hamburger drawer.
- Work-order queue at scale (group-level rows, saved views, live narrowing).
- Work-order operational brief with compact production context.
- Work-order execution: keg-based topping, tick capture, per-barrel notes, keg close-out.
- Recorded / correction receipts; correction, not undo.
- Barrel groups as a configurable operational layer, with drill-down to individual barrels.
- Tank board with lot identity, and a tabbed tank detail (fermentation chart, analyses, tasting notes, history, additions).
- Domain icon family (14 domain + 2 utility icons).
- Status ramp replacing `Badge tone="gold"` for status.
- Assistant behaviour change: *Review & create* navigates to the created draft work order and the dock continues on that object.
- Conceptual grape-to-bottle lineage view (desktop graph + phone event stream).

**Explicitly out of scope**

- Any change to the audit log's data model or retention. The existing `AuditLog` stays as built. (The *dashboard rendering* of audit prose is a separate content fix, see `09`.)
- Accounting, compliance, reports, settings, users, vineyard and spray surfaces — untouched by this slice beyond the shell and shared components.
- Dark mode. Still light-only by decision.
- Multi-tenant theming. Tokens stay; per-tenant values remain a future capability.
- Replacing the assistant. The dock's geometry, drag/resize, expand, voice orb and FAB stay exactly as `src/components/assistant/AssistantDock.tsx` builds them today.
- Any rewrite of the ledger, RLS, tenancy or auth.

## 6. Terminology

| Term | Meaning in this package | Never say |
|---|---|---|
| **Barrel group** | A named, configurable operational working set of vessels (the existing `VesselGroup`, extended). Not a vessel, not a lot. | "barrel lot", "rack object" |
| **Lot** | The identity of a homogeneous body of wine. | "batch" |
| **Batch action** | One user intent fanned out to N member vessels, sharing `LotOperation.batchId`. | "bulk edit" |
| **Keg** | The portable vessel used to carry topping wine to the barrels. Measured once per fill. | "carboy" (unless the tenant's own term) |
| **Top up / topping** | Replacing evaporative loss in a barrel. | "fill" |
| **Tick** | Marking a barrel topped without entering a volume. | "check off" |
| **Measured** | A quantity a person or instrument actually read. | — |
| **Estimated** | A quantity derived by division or inference. Always badged. | "actual" |
| **Correct** | Amend a recorded value; the original stays in history. | "undo", "delete", "revert" |
| **Recorded** | Written to the ledger on the server. | "saved", "submitted" |
| **Issue** | Release a work order to the floor. | "publish", "assign out" |
| **Nominal capacity** | A barrel's stated size. A label, never a ceiling. | "max volume" |

## 7. Implementation cautions

1. **Do not ship the queued-sync language before the queue exists.** The prototype shows a *Held* state, an outbox count and a "Hold" verb. That copy is only permitted once a real durable outbox (Phase 28 / D25) is implemented and drains. Until then the approved honest fallback is: banner *"No connection — you can't record right now"*, primary action disabled, and the entered values preserved in the form. This is the single highest-risk place to over-promise; see `03-interaction-spec.md` §11 and the audit's S1.
2. **Do not copy the prototype's markup.** The `.dc.html` files are inline-styled single files with no component boundaries, by design. They are a behavioural and visual reference. Implement against the existing `src/components/ui/` library, extended per `06-component-migration-map.md`.
3. **Do not treat a barrel group as a vessel or as a lot.** See `rfc/RFC-001-barrel-groups.md`. The existing `VesselGroup` + `VesselGroupMember` + `LotOperation.batchId` fan-out is the foundation; the RFC only adds configuration, lifecycle and rollups.
4. **Do not invent a new estimation field on `LotOperationLine` without reading RFC-003.** There is already a `CaptureMethod` enum on `LotOperation` and a `metadata` Json column; the RFC recommends which to use and why.
5. **`Badge tone="gold"` renders wine.** Renaming it is a breaking API change across ~12 call sites. It is sequenced deliberately in `11-implementation-sequence.md` phase 1, ahead of any screen work, because every screen depends on it.
6. **`Button` hardcodes 34/42/50px heights.** No default-size button reaches 44px. Fix the component, not the call sites.
7. **Barrel nominal capacity must not gate topping.** Any existing capacity validation applied to `VesselType.BARREL` on a `TOPPING` operation must be downgraded to a soft warning. See `08-data-dependency-matrix.md` row DM-22.

## 8. Known open decisions (owner input required)

| # | Decision | Blocks | Recommendation |
|---|---|---|---|
| OD-1 | Is `Setup` and `Audit log` visibility intentional for role `user`? | Shell nav gating | Gate `Setup` to admin; leave `Audit log` visible (transparency) but move it under a "Records" grouping |
| OD-2 | Which of the 11 orphaned routes are real destinations? | IA map completion | See `01-information-architecture.md` §6 for a proposed disposition of each |
| OD-3 | Can a vessel belong to more than one barrel group at a time? | RFC-001 membership model | Recommend: one *operational* group at a time, enforced; unlimited *tag*-style groups deferred |
| OD-4 | Is keg volume nominal (30 L stamped) or measured per fill? | RFC-002 | Recommend: nominal default, overridable per fill, with the override badged |
| OD-5 | Does a corrected topping estimate re-fan across all barrels on that keg, or only adjust the one? | RFC-002 §correction | Recommend: re-fan, because the divisor changed |
| OD-6 | Barcode/NFC hardware: phone camera only, or dedicated scanners? | RFC-004 | Recommend: `BarcodeDetector` + Web NFC on Android; camera fallback on iOS |
| OD-7 | Does a work order issued from an AI draft require a second human approver? | Interaction spec §16 | Recommend: no — issuing *is* the human act |

## 9. Artifact index

| # | Artifact | Purpose |
|---|---|---|
| — | `README-HANDOFF.md` | This file |
| — | `prototype/` | The approved interactive prototype and supporting exploration |
| 01 | `01-information-architecture.md` | Domains, destinations, roles, route mapping |
| 02 | `02-screen-inventory.md` | Every approved screen and state |
| 03 | `03-interaction-spec.md` | Trigger → response → feedback → data → error → a11y |
| 04 | `04-responsive-spec.md` | 390 / 430 / 768 / 1280 / 1680 behaviour |
| 05 | `05-design-system-v2.md` | Tokens and component specs with exact values |
| 06 | `06-component-migration-map.md` | Existing library → keep / restyle / extend / replace |
| 07 | `07-production-lineage-model.md` | State vs. stage vs. lineage vs. history |
| 08 | `08-data-dependency-matrix.md` | Every UI element → data source → A/B/C/D/E class |
| 09 | `09-content-terminology.md` | Approved production copy |
| 10 | `10-accessibility-spec.md` | WCAG target and per-pattern requirements |
| 11 | `11-implementation-sequence.md` | Phased order, dependencies, safe stopping points |
| 12 | `12-acceptance-criteria.md` | Testable criteria per screen and component |
| 13 | `13-collapsible-sidebar.md` | Rail mode, and the four rules that keep it accessible |
| — | `rfc/RFC-001-barrel-groups.md` | Barrel group as configurable working set |
| — | `rfc/RFC-002-topping-keg-measurement.md` | Keg close-out and estimate fan-out |
| — | `rfc/RFC-003-measured-vs-estimated.md` | Provenance of derived quantities |
| — | `rfc/RFC-004-vessel-tags-qr-nfc.md` | Scan-to-context |
| — | `icons/` | 16 production SVGs + sprite + manifest |
| — | `CLAUDE-CODE-START-HERE.md` | Entry point for the implementing agent |

## 10. Prototype files

| File | Contents | Status |
|---|---|---|
| `prototype/Direction A at Scale.dc.html` | **The approved experience.** Shell, triage at scale, keg-based topping, keg close-out, barrel detail, barrel groups, tank board, tank detail, phone runner, AI draft → work order | Approved |
| `prototype/Icon Concept Board.dc.html` | Icon metaphors, sizes, greyscale check, in-context | Approved |
| `prototype/Grape-to-Bottle Lineage.dc.html` | Lineage graph, phone event stream, event history | Approved (conceptual) |
| `prototype/Current State.dc.html` | Pixel recreation of today's screens, for before/after reference | Reference |
| `prototype/rejected/` | Directions B and C, and the comparison page | **Rejected — do not implement** |

To view: open any `.dc.html` in a browser. They are self-contained apart from `brand/` and `assets/fonts/`, which are copied alongside.
