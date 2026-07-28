# 02 · Screen Inventory

Every approved screen and every state that must be built. Reference renders are in `prototype/Direction A at Scale.dc.html` at the frame ids given (S1, S2, S2b, S2c, S3, S4, S5, S6).

State vocabulary used throughout: **loading · empty · partial · saving · success · validation · recoverable error · unrecoverable error · interrupted · conflict · destructive confirm · correction**.

---

## SC-01 · Application shell

**Route** — wraps all `(app)` routes. **Component** — `src/components/AppShell.tsx`.
**User / job** — everyone; "get me where I'm going and tell me if the system is healthy."
**Primary action** — none (it is chrome). **Secondary** — search, scan, assistant, sign out, inbox.

**Information hierarchy** — brand → frequency-ordered nav groups → user/footer. Top bar: search (left, ≤440px), scan, connection state (right).

**Entry** — sign-in. **Exit** — sign out, or any destination.
**Permissions** — nav items gated per `01-information-architecture.md` §3.

| State | Behaviour |
|---|---|
| Loading | Sidebar renders immediately from the server session; badge counts render as a 18×18 skeleton pill until resolved. Never collapse the row height. |
| Empty | A tenant with no data still shows every permitted destination. |
| Partial | If a badge count query fails, the badge is omitted entirely — never `0` and never `?`. |
| Interrupted | Connection indicator flips to the offline treatment (§ caution 1 in the README). `aria-live="polite"` announces the change once. |
| Unrecoverable error | If the session is invalid, redirect to `/login`; do not render a broken shell. |

**Desktop reference** S1 left rail + top bar. **390px reference** S5 header + bottom tabs.

**Non-negotiable** — a skip link as the first focusable element (`Skip to main content`, visible on focus, target `#main`); `aria-current="page"` on the active nav item; `aria-expanded` on group disclosures.

---

## SC-02 · Global search / command palette

**Route** — overlay, no route. **User / job** — everyone; "find the thing."
**Primary action** — open the highlighted result. **Secondary** — `⇧↵` ask; `Esc` close.

**Hierarchy** — input → **Do** → **Go to** → **Ask** (always last).

| State | Behaviour |
|---|---|
| Loading | Results area shows 3 skeleton rows. The input is never blocked. |
| Empty (no query) | Recent objects (last 5 touched by this user) + "Scan a tag". |
| Empty (no matches) | "Nothing matches *sauv blanc*." plus: create a work order, scan a tag, ask the assistant. Never a dead end. |
| Partial | If one result type's query fails, its group is omitted and a quiet line says which. Other groups still render. |
| Error | "Search is unavailable. Use the sidebar, or scan a tag." Sidebar remains fully functional. |
| AI unavailable | The **Ask** row is not rendered. Nothing else changes. |

**Reference** — S1 top bar (closed state). Palette pattern per `05-design-system-v2.md` → Command palette.

---

## SC-03 · Work-order queue (triage at scale)

**Route** `/work-orders` · **Client** `WorkOrdersClient.tsx`
**User / job** — manager: "what's late and who's on it"; cellar hand: "what's mine today".
**Primary action** — Continue / Start the top item. **Secondary** — New work order, Templates, Review queue, narrow, switch saved view.

**Hierarchy** — breadcrumb → day headline (`Monday, 27 July`) → one-sentence state summary → saved views row → grouped table (Overdue / Today / This week / Unscheduled).

**Entry** — sidebar, ⌘K, mobile Work tab, post-issue redirect. **Exit** — a work order, a barrel group, New.
**Permissions** — `user` sees own + team; `admin` sees all and the review queue.

| State | Behaviour |
|---|---|
| Loading | `loading.tsx` with the real page header and 6 skeleton rows at the real row height. No layout shift on resolve. |
| Empty (unfiltered) | Existing copy is already good and is kept: "No open work orders — everything here is caught up. Finalized orders move to the Archive…" plus New / View archive. |
| Empty (narrowed) | "No open work orders match *hall c · rack 12–18*." + Clear narrowing + View archive. |
| Partial | If group-level progress counts fail, rows render without the progress column; the row is still openable. |
| Saving | n/a (read-only screen). |
| Validation | Narrowing chips validate on entry; an unparsable term shows inline "No vessel, group or person called *hall z*". |
| Recoverable error | Inline alert above the table: "Couldn't load work orders. Retry." with the sidebar intact. |
| Unrecoverable | `not-found.tsx` for a bad archive filter route — inside the shell, with a link back. |
| Interrupted | Banner; the list renders from cache if present and is labelled "Showing the list as of 12:41". |
| Conflict | If a row's status changed server-side since load, the row shows a quiet "updated" marker and refreshes in place. Never silently reorder under the cursor. |

**Desktop reference** S1. **390px reference** stacked card list, one card per order (see `04-responsive-spec.md` §3).

**Change from today** — seven filter fields and the inline vessel multi-select are replaced by four saved views plus one narrowing control that applies live. No `Apply filters` button.

---

## SC-04 · Work-order operational brief

**Route** `/work-orders/[id]` · **Client** `WorkOrderDetailClient.tsx`
**User / job** — the person about to do the work: "what am I doing, to what, with what, and what should I watch for."
**Primary action** — Continue / Start (one large wine button, naming the next unit of work).
**Secondary** — Print, Reassign, Edit, Cancel.

**Hierarchy** — breadcrumb → status chip + progress sentence → title → definition list (Moving / From / Into / Equipment / Measure / **Take care**) → compact production context → task or group list.

The **Take care** row is visually distinct (warning tint, `▲` glyph) and is the only tinted row in the list.

| State | Behaviour |
|---|---|
| Loading | Header and definition list skeleton; the primary action is disabled but present at full size. |
| Empty | A work order with no tasks: "This work order has no tasks yet." + Edit (admin) or "Ask your manager" naming the manager. |
| Partial | If production context fails to load, its panel shows "Couldn't load this lot's history. Retry." The brief is still usable. |
| Saving | Issue / Cancel show a pending label on the button, the button stays the same width. |
| Success | Issue → redirect to the queue with a receipt strip: "#318 issued to Joseph Okafor." |
| Validation | Issue is disabled only when a stated blocker exists; the blocker is **visible text next to the button**, never a `title` tooltip. |
| Recoverable error | `role="alert"` region under the action row. |
| Unrecoverable | `not-found.tsx` inside the shell: "Work order #999 doesn't exist, or you don't have access." + back to Work orders. |
| Interrupted | Read-only banner; action buttons disabled with an explanation. |
| Conflict | "Marta cancelled this work order 2 minutes ago." Refresh in place; do not throw away typed input elsewhere on the page. |
| Destructive confirm | Cancel WO opens a dialog restating number, title, task count and what happens to reservations. |

**Desktop reference** S6 (draft variant). **390px** single column, sticky primary action.

---

## SC-05 · Group execution — topping (keg model)

**Route** `/work-orders/[id]/execute` scoped to a group, or `/work-orders/[id]/execute/[groupId]` (new sub-route, additive)
**Client** `ExecuteClient.tsx` + new `ToppingRunner`
**User / job** — cellar hand: "walk me down the rack and record it without typing."
**Primary action** — desktop: `Record row` per row; phone: one 68px **Topped — next barrel**.
**Secondary** — Note, Skip, Scan another barrel, Keg is empty, Tick the next 10, Tick the rest of the group.

**Hierarchy** — WO/group header with counts → **keg panel** (measured object) → explanation of how it becomes a ledger entry → group ribbon (60 barrels in 24px) → tick grid with barrel identity → bulk actions.

| State | Behaviour |
|---|---|
| Loading | Ribbon renders as a row of neutral tiles; grid shows 6 skeleton rows. Keg panel shows its frame with skeleton values. |
| Empty | Group with no members: "CH-NEUTRAL-14 has no barrels yet." + Add barrels (admin) / Ask a manager. |
| Partial | If last-topped dates fail to load, the column shows `—` and a footnote; ticking still works. |
| Saving | The ticked tile animates to the recorded colour optimistically **only after** the server confirms (see `03` §9 — no optimistic ledger writes). Until then the tile shows the in-flight treatment and the button reads "Recording…". |
| Success | Tile turns green; the position advances; a `role="status"` announcement "C-1410 topped, barrel 11 of 60". |
| Validation | Note over 500 chars truncates with a counter. Nothing else on this screen can be invalid — that is the point of the model. |
| Recoverable error | Row-level alert; the tile returns to not-yet; "C-1410 wasn't recorded. Retry." |
| Unrecoverable | Work order cancelled mid-run → full-screen state: "This work order was cancelled by Marta at 13:02. Nine barrels you already recorded are safe." + back. |
| Interrupted | See README caution 1. Approved pre-Phase-28 behaviour: banner "No connection — you can't record right now", primary action disabled, current position and note preserved. |
| Conflict | Barrel already ticked by another user on another device: "Joseph ticked C-1410 four minutes ago." Options: keep his, or add your note to the same tick. Never double-write. |
| Destructive confirm | "Tick the rest of the group" restates: "Mark the remaining 51 barrels of CH-NEUTRAL-14 as topped from K-3?" with Cancel / Tick 51. |
| Correction | Every recorded tile is tappable → "Untick C-1410" (before the keg closes out) or "Correct this entry" (after). See SC-07. |

**Desktop reference** S2. **390px reference** S5.

---

## SC-06 · Keg close-out

**Route** — dialog over the runner. **User / job** — "the keg is empty; make it count."
**Primary action** — Record the keg. **Secondary** — Keg wasn't quite empty, See the barrels, Read the notes.

**Hierarchy** — keg + fill number → headline sentence ("30 litres went into 21 barrels") → fact rows with **measured** / **estimated** badges → the arithmetic in words → "What gets written" → actions.

| State | Behaviour |
|---|---|
| Loading | Dialog opens instantly with the barrel count already known client-side; only the T-22 remaining volume is fetched. |
| Validation | Barrel count must be ≥1. If 0: "This keg didn't serve any barrels. Return it to T-22 instead?" offering that path. |
| Partial | "Keg wasn't quite empty" reveals a numeric field for the remaining volume; the divisor recomputes live. |
| Saving | Button reads "Recording the keg…", dialog cannot be dismissed, `aria-busy`. |
| Success | Dialog closes to a persistent receipt on the runner: "Keg K-3 recorded — 30 L across 21 barrels, about 1.43 L each." with **Correct** and **See the lines**. |
| Recoverable error | In-dialog `role="alert"`; nothing partially written (single transaction, see RFC-002). |
| Interrupted | Same as SC-05 — the close-out cannot be attempted without a connection; the dialog says so and stays open with values intact. |
| Conflict | T-22 no longer has 30 L: "T-22 only shows 18 L. Record 18 L, or check the tank?" |

**Reference** S2b.

---

## SC-07 · Recorded receipt and correction

**Route** — inline on the runner and on any object's history. **User / job** — "I got that wrong."
**Primary action** — Correct this entry. **Secondary** — See the ledger line.

**Copy discipline:** the verb is **Correct**, never Undo. The receipt states that the original stays in history.

| State | Behaviour |
|---|---|
| Success | Green-bordered receipt with the value, the destination and the actor: "B-116 recorded — 218 L into T-04. Written to the lot ledger at 12:47 by you." |
| Correction form | Shows old value → new value, requires a reason (free text, ≥3 chars), states what will change downstream (e.g. "the 20 other barrels on this keg re-estimate to 1.50 L each"). |
| Saving | "Correcting…", both values visible. |
| Success (correction) | History shows both rows; the object is badged "corrected". |
| Blocked (LEDGER-11) | "This entry can't be corrected on its own. A blend on 21 Jul (WO #244) already used this wine. Unwind that blend first and the correction opens up." with a link to WO #244 and an "Unwind the chain" action. Never an opaque error code. |
| Permissions | A `user` may correct their own entry within the open work order; an `admin` may correct any. Everything else is read-only with the reason stated. |

**Reference** S2b receipt, S2c history rows.

---

## SC-08 · Individual barrel

**Route** `/vessels/[id]` (**new**) · **User / job** — "is this the right barrel, and what's happened to it?"
**Primary action** — contextual (Top up / Record a reading / Add). **Secondary** — Move to another group, Edit metadata (admin), Print tag.

**Hierarchy** — breadcrumb (Cellar floor / Hall / Group / Barrel) → title + status chip → definition list (Wine, Volume, Cooperage, Oak origin, Year of cooperage, Toast level, Tag) → the nominal-capacity note → history with measured/estimated badges.

| State | Behaviour |
|---|---|
| Loading | Definition list skeleton at real row heights. |
| Empty | Barrel with no wine: "Empty since 4 Nov. Last held 24-CH-02." + Fill from a tank. |
| Partial | Missing cooperage/oak/toast render as "Not recorded" in muted text with an inline Add (admin only) — never blank, never `null`. |
| Validation | Editing capacity cannot go below current contents (existing rule, kept). |
| Error | Standard inline alert. |
| Unrecoverable | Unknown barrel id → in-shell not-found with "Scan the tag again" and a search box. |
| Destructive | Deactivate uses the existing two-step `ConfirmButton`, restated to name the barrel. |

**Reference** S2c.

---

## SC-09 · Barrel-group index and settings

**Routes** `/cellar/groups`, `/cellar/groups/[id]` (**new**)
**User / job** — manager: "define how this set of barrels gets worked."
**Primary action** — New group / Save. **Secondary** — View all 60 barrels, Edit members, Archive group.

**Settings shown** — Members, Wine (lot), Topping interval, Topping source, Keg preset, SO₂ target, Sampling rule, Default crew. See `rfc/RFC-001-barrel-groups.md` for which exist today.

| State | Behaviour |
|---|---|
| Loading | Table skeleton + settings panel skeleton. |
| Empty | "No barrel groups yet. A group is how work gets assigned — most wineries start with one per rack." + New group + Import from racks. |
| Partial | A group whose members span two lots shows a warning row: "This group holds two wines (25-CH-02, 25-CH-05). Work orders will fan out per wine." — not an error; it's legal. |
| Saving | Field-level pending; the Save button reflects a dirty state. |
| Validation | Name unique per tenant (existing DB constraint). A vessel already in another operational group is flagged with the other group named (OD-3). |
| Conflict | Settings changed by someone else: show both values and ask which to keep. |
| Destructive | Archive restates: "Archive CH-NEUTRAL-14? Its 60 barrels stay in the cellar and keep their history. Open work orders that use this group are unaffected." |

**Reference** S3.

---

## SC-10 · Tank board

**Route** `/bulk` (Cellar floor) · **User / job** — "where is everything, and what needs me."
**Primary action** — open a tank. **Secondary** — filter by state, search by lot, switch to barrels/groups.

**Every tile shows the lot code**, not just the tank code. Fill height encodes volume; the glyph repeats the state so colour is never the only signal.

| State | Behaviour |
|---|---|
| Loading | Tiles render as outlines at the real size, in the real grid. Never a spinner over an empty page. |
| Empty | A tenant with no tanks: "No tanks set up yet." + Add a tank (admin). |
| Partial | A tank whose lot lookup fails shows the code plus "Wine unknown — retry". |
| Error | Page-level alert, tiles still render what they have. |
| Interrupted | Board renders from cache with a timestamp. |

**Change from today** — the audit found `/bulk` renders as three collapsed accordions with no wine visible (S15) and `Export CSV` as the most prominent control. The board replaces that; export moves into an overflow menu.

**Reference** S4 board.

---

## SC-11 · Tank detail

**Route** `/bulk/[vesselId]` or modal over the board (both acceptable; modal preferred on desktop, route on mobile).
**User / job** — "what's in this tank, how is it going, and what do I do to it."
**Primary action** — Record a reading. **Secondary** — Add, Rack, Cap work; tabs.

**Tabs** — Fermentation (default, carries the Brix + temperature chart) · Analyses · Tasting notes · History · Additions. All panels stay mounted (existing `Tabs` behaviour).

| State | Behaviour |
|---|---|
| Loading | Chart area reserves its exact height and shows a skeleton; tabs are usable immediately. |
| Empty (chart) | "No readings yet for this tank. Record one and the curve appears here." + Record a reading. |
| Empty (tasting) | "No tasting notes on this wine yet." + Add a note. |
| Partial | Chart renders with the series it has; a note says which series is missing. |
| Error | Per-panel, not per-page. |
| Colour independence | The chart must also be readable as a table — see `10-accessibility-spec.md` §9. |

**Reference** S4 tank detail.

---

## SC-12 · AI proposal → draft work order

**Route** — dock overlay, then `/work-orders/[id]` with the draft.
**User / job** — "make me the order I just described, then let me fix it."
**Primary action** — Review & create (dock) → lands on the work order → **Issue** (page).
**Secondary** — Edit the draft, Dismiss, keep talking to the dock.

**The approved behaviour change:** *Review & create* **navigates to the created draft work order**. The dock stays open on that object and continues the same conversation, so a wrong draft is fixed by a sentence rather than by starting over. Today the app does not navigate; this is the change.

| State | Behaviour |
|---|---|
| Proposal (recommendation) | Prose in the dock with source chips. Nothing exists server-side. |
| Draft card | Named object, key facts, and two actions. Copy: "Draft — nothing created yet." |
| Creating | "Creating the draft…", the card is not dismissible. |
| Created | Navigate to `/work-orders/[id]`. Page shows `○ Draft — not issued` and "Created from your question, 12:58. Nobody can see it on the floor until you issue it." |
| Iterating | Dock message: "Draft #318 is open in front of you. Change anything here or on the page — I'm working on the same order." |
| AI unavailable | The dock says so; the page and the manual New work order flow are unaffected. |
| Error | "Couldn't create that draft. Nothing was written." + Retry + Build it by hand. |

**Reference** S6.

---

## SC-13 · Grape-to-bottle lineage

**Route** `/lots/[id]` → Lineage tab (**conceptual**; approved as a direction, not scheduled)
**User / job** — "where did this wine come from and what did it feed."

Desktop: a stage-column graph with split and blend edges distinguished by colour **and** by legend text. Phone: a vertical event stream where each fork is narrated as a sentence with a "Follow it →" link — not a shrunken graph.

States: loading skeleton; a lot with no lineage ("This lot originated at crush on 14 Oct and hasn't split or blended."); partial (a parent lot deleted → shown as "a lot that is no longer in the system"); accessible table alternative always available.

**Reference** `prototype/Grape-to-Bottle Lineage.dc.html`.

---

## SC-14 · Reference render index

| Frame | Screen(s) | Viewport |
|---|---|---|
| S1 | SC-01, SC-03 | 1440×900 |
| S2 | SC-05 | 1440×1030 |
| S2b | SC-06, SC-07 | 560 |
| S2c | SC-08 | 560 |
| S3 | SC-09 | 1180 |
| S4 | SC-10, SC-11 | 900 / 660 |
| S5 | SC-05 mobile | 390×844 |
| S6 | SC-04 draft, SC-12 | 1020×1010 |
| Lineage doc | SC-13 | 1352 / 390 |
