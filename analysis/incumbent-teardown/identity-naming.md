# Identity & Naming — Incumbent Teardown (Agent 7, cross-cutting priority)

> How vintrace, InnoVint, and Cellarhand construct, mutate, and reason about lot/batch
> **identity vs. naming**. The target architecture under evaluation: an immutable internal
> surrogate id carries all lineage across every table/event; the user-facing code is a
> **configurable presentation layer** — winery-defined templates, renameable anytime without
> touching history. Every Cellarhand claim is tagged **[IMPLEMENTED] / [PLANNED] / [ABSENT]**
> per `analysis/CELLARHAND-CURRENT-STATE.md` §5. Citations: `vintrace:` / `innovint:` doc paths,
> `cellarhand:` code `file:line`.

---

## 1. vintrace — naming & identity

**The unit of identity is the "wine batch" (batch code).** A batch is the durable production
object; its lifecycle is `New → Active → Archived → Depleted`, where "changed batch, fully
blended out, bottled, or dispatched" all *deplete* a batch
(`vintrace:vintrace-web/winemaking/using-the-batch-explorer.md` status table).

**Code construction is a winery-defined TEMPLATE — vintrace's headline differentiator here.**
"Auto-Code Policies" let a winery *define the pattern* per record type
(`vintrace:setup-and-admin/configuration/configuring-and-using-auto-codes.md`):

- **Configurable per record type** — Batch, Batch Number, Barrel, Barrel group, Bin, Crush load,
  Fruit intake, Trial blend, Tirage group, Sales order, Sample set, Stock item batch, Grower code,
  Wine batch component, and more (auto-codes doc, record-type table).
- **Three code-element kinds**, ordered by the winery: **Attribute** (a property of the record),
  **Inc** (zero-padded incrementing counter — required for uniqueness), **Text** (static literal,
  e.g. `WB`, `-`, `TB-`). Example policy: `Year + "TB-" + 000` → `2020TB-001, 2020TB-002`.
- **Rich attribute vocabulary** for batches: `Year / Year YY / Year Y`, Owner, Grower, Vineyard,
  Block, Block Name, Region, Variety, Grade, Vintage-autocode, Product, Program, Product State,
  **Fraction Type** (`M`/`F`/`P`/`C`/`L`/`H`/`O`/`D`/`S`/`N` = must/free-run/pressings/combined/
  light/heavy/overnight/drainings/saignée/condensate), **Batch Type** (auto `WB`), and **Batch
  Number** (a *universally* unique DB-wide counter) vs **Inc** (resets per batch *type*, e.g.
  `PR25CAS01` then `SL25CAS01` starts fresh). At least one numbering function is mandatory.
- **Multiple policies per type + default + per-user/winery/system override** via a "wand" icon;
  plus **Custom Codes** — a winery-configured literal (e.g. `JE` for "JX2 Estate") folded into the
  template. Full example resolves to `20JECSNV001`.

So vintrace answers the "does auto-code let a winery define the pattern?" question **yes,
emphatically** — it is a first-class, admin-configurable, multi-token template engine spanning far
more than lots.

**But the code is also the reference key — editing it rewrites history.** "Editing the Batch Code"
warns: *"Changing the batch code **updates all historical references to that code.**"*
(`vintrace:vintrace-web/winemaking/changing-a-wine-batch-s-properties.md`). This is the tell that
vintrace's batch code is not a pure label decoupled from a surrogate: renaming propagates as a
find-and-replace across the history (mutate-in-place semantics), and there is a *separate* "Change
Batch" operation to physically **move** wine from one batch to another (distinct from renaming).
During a transfer you can also swap or mint the destination batch code
(`vintrace:vintrace-web/winemaking/changing-a-batch-code-during-transfer.md`).

**Classification lives in a separate Tags layer** (`vintrace:vintrace-web/winemaking/tagging-wines.md`)
— free-form words, searchable, with a defined **blend inheritance rule**: a source wine's tags carry
into a blend only if its volume weighting ≥ the configured "metric merge weighting" (e.g. 0.10);
edits to blend tags don't back-propagate to sources.

---

## 2. InnoVint — naming & identity

**The unit of identity is the "lot"**, and InnoVint cleanly **separates code from name** — the
model closest to the target's presentation-layer split, but built by hand rather than by template.

- **Lot Code** — user-typed, free-form alphanumeric: *"numbers, letters, dashes (-), and underscore
  (\_)"*, no accents (`innovint:make/lots/juice-wine-lot-attributes.md` §2). Example `14PNSC`.
- **Lot Name** — optional, *"generally a written-out version of the Lot Code stating vintage,
  varietal, and vineyard,"* e.g. `20CHSK → 2020 Sky Canyon Chardonnay` (same doc §3).
- **There is NO auto-code template.** At lot creation (standalone or inside an action/task) the user
  *chooses a lot code* and optionally a name by typing them
  (`innovint:make/recording-actions/creating-a-new-lot-within-an-action-or-task.md`). No token
  vocabulary, no incrementing policy, no winery-defined pattern — the opposite of vintrace.
- **Other lot properties are separate attributes** (not baked into the identity string): Bond,
  Color, Style, Tax Class, Stage, Tags, Owner(s), Expected Yield, Notes, Sparkling designation,
  Intended Use (`innovint:make/lots/lot-details-page.md` attributes tile;
  `innovint:make/lots/juice-wine-lot-attributes.md`).

**Rename is a first-class, anytime operation — and it rewrites the display history.** *"You can
change the lot code, lot name, lot color or lot style at any point in time, whether your lot has
contents or not, as long as your lot is not archived. These lot properties will change to display
the new code, name, color or style **throughout the entire history of the lot**."*
(`innovint:make/lots/changing-lot-properties.md`). This is only possible because a stable internal
lot id underlies the display code — the strongest evidence either incumbent has a surrogate/label
split. Two important caveats in that doc:

- Rename is **not** recorded as a timeline action ("not tracked as actions like a Tax Class
  change"); InnoVint recommends manually adding a note.
- It *is* captured in a dedicated **Lot Properties History** (History tab) and a winery-level **Lot
  Properties History Report** — code, name, stage, style, archived-status changes, timestamped
  (`innovint:make/lots/changing-lot-properties.md`; `innovint:make/lots/lot-details-page.md` History
  tab). Owner and Tag changes are **not** timestamped/tracked.

**Lifecycle:** lots can be **Archived** (hidden from default views, full history retained, cannot
archive with contents), or **Deleted** only if they never had activity
(`innovint:make/lots/lot-details-page.md` More menu).

---

## 3. What happens on BLEND / SPLIT / TRANSFER / RE-BATCH / OWNERSHIP CHANGE (both)

| Event | vintrace | InnoVint |
|---|---|---|
| **Blend** | Blend into a new or existing batch; tags inherit by weighting threshold. Blending across tax classes moves batch identity. | Blend action → **"Combine with existing lot"** (keeps that lot's code) **or "Create new lot"** (mint a new code) (`innovint:make/movement-actions/how-to-record-a-blend.md`). |
| **Blend & Return** (blend, then return to same vessels) | supported via change-batch/transfer flows | **NOT a primitive** — 3-step tag+Blend+Barrel-Down workaround (`innovint:guidance-faqs/frequently-asked-questions/how-do-i-record-a-blend-return.md`). |
| **Split** | Break-barrel-out-of-group; batch-change on partial transfer mints/moves a batch code. | **NO split primitive — the "phantom vessel" hack** (see below). |
| **Transfer** | Can **change or add the destination batch code mid-transfer** (`vintrace:.../changing-a-batch-code-during-transfer.md`) — identity can fork/rename at a move. | Transfer/Rack carry the lot; a transfer into a new lot code is how identity forks. |
| **Re-batch / rename** | "Edit the Batch Code" — **rewrites all historical references** (mutate-in-place). | "Change lot properties" — code/name change **displays across entire history** (mutate-in-place, but via stable id + a properties-history log). |
| **Ownership change** | Owner is an address-book attribute usable as an auto-code element and for Estate-wine tracking (`vintrace:vintrace-web/compliance/tracking-estate-wine-us.md`); changing owner is an attribute edit. | **Owner(s)** are lot tags (custom-crush permission); Owner/Tag changes are explicitly **not timestamped** (`innovint:make/lots/changing-lot-properties.md`). |
| **Bond change** | bond attribute; transfer-in-bond flows | **Bond** is a lot property; bond-to-bond (B2B) transfers move wine across bonds (`innovint:make/movement-actions/bond-to-bond-transfers-b2b.md`). |

**InnoVint's lot-split "phantom vessel" hack — traced exactly**
(`innovint:guidance-faqs/frequently-asked-questions/how-to-split-a-lot.md`): to split one vessel off
into its own lot, the winemaker records **two transfer actions**: (1) transfer the vessel's volume
into *any empty vessel* — many wineries keep a dedicated **"phantom" vessel** — and *in that same
transfer* assign the destination a **new lot code** (combine-with-existing or create-new); (2)
transfer the volume **back** out of the phantom vessel into the original physical vessel, retaining
the new lot code. For barrels, tag them first so the return targets the same barrels. Users are told
to attach notes explaining *"no physical wine movement took place."* Identity + naming through this:
splitting is not modeled as a lineage primitive at all — it is emulated with two round-trip moves,
and the new sub-lot's code is minted at the destination step. This is the sharpest example of
**identity being an artifact of vessel moves** rather than a first-class operation, and it produces
two phantom transfer records that pollute the audit trail with movements that never happened.

**Where codes carry SEMANTIC meaning that causes friction when reality changes.** Both systems
embed meaning into the human string that later diverges from reality:

- **Vintage** baked into the code (`20CHSK`, vintrace `Year` attribute) — friction for NV/multi-
  vintage sparkling, reserve, declassification (exactly Cellarhand's D3 rationale).
- **Fraction type** baked into vintrace batch codes (`M/F/P/C/…`) — a free-run lot that later gets
  combined carries a now-wrong `F`.
- **Origin (vineyard/block/variety)** baked in — a lot that gets blended still *reads* single-origin
  unless a new code is minted (vintrace's auto-code has no "blend" guard; Cellarhand explicitly
  strips origin from blend codes — see §4).
- **Bond / ownership / tax-class** — vintrace can fold Owner/Custom-Code into the code; when
  ownership or bond changes the printed code lies. InnoVint keeps these as *attributes* (better) but
  still lets bond move via B2B while the code is unchanged.

Because both allow **rewrite-in-place renames that propagate across all history**, neither preserves
"what the code *was* when this operation happened" — a compliance/audit weakness. InnoVint softens
this with a Lot Properties History log; vintrace's warning ("updates all historical references") is a
blunt propagate.

---

## 4. Cellarhand today vs. the target architecture (3-state, with code cites)

**Target:** immutable internal surrogate id carries all lineage across every table/event **[matched]**;
user-facing code is a configurable, renameable presentation layer with winery templates **[gap]**.

| Target property | Cellarhand state | Evidence |
|---|---|---|
| Surrogate id carries all lineage/FK | **[IMPLEMENTED]** — `Lot.id` is a cuid; `LotLineage`, `LotOperationLine.lotId`, cost, all FKs reference **id**, never code. `@@unique([tenantId, id])` is the composite-FK target. | `cellarhand:prisma/schema.prisma:1139,1207,1263,1277`; `LotLineage.parentLotId/childLotId` `schema:1311-1312` |
| Code is per-tenant unique | **[IMPLEMENTED]** — `@@unique([tenantId, code])` (D16). | `cellarhand:prisma/schema.prisma:1206` |
| Code construction | **[IMPLEMENTED but HARDCODED]** — pure `buildLotCode` fixes the order `YEAR-VINEYARD-BLOCK[-SUBBLOCK]-VARIETY[-TAG]`; blend `[vintage|NV]-BL-<TOKEN>`. Vintage/vineyard/variety required; abbr forced 2–4 alnum. | `cellarhand:src/lib/lot/code.ts:45-64,92-97,16-22`; `generate.ts:23-46` |
| Blend strips origin (avoid false single-origin) | **[IMPLEMENTED]** — blend code *deliberately* has no vineyard/variety segment; `GROW_EXISTING` keeps resident code, `NEW_LOT` mints. **Better than vintrace's origin-in-auto-code default.** | `cellarhand:src/lib/lot/code.ts:86-97` |
| Split mints child codes (no phantom-vessel hack) | **[IMPLEMENTED]** — press/saignée children each get a generated code with a fraction-derived tag; first-class `LotLineage kind:SPLIT`, no round-trip transfers. **Strictly better than InnoVint's phantom vessel.** | `cellarhand:src/lib/transform/press-core.ts:212-239` (per §5 of state brief) |
| Winery-defined naming TEMPLATE | **[ABSENT]** — token order + vocabulary hardcoded in `buildLotCode`; no per-tenant scheme, no token config, no UI. ROADMAP calls the whole feature an "unplanned bonus." | `cellarhand:src/lib/lot/code.ts`; `ROADMAP.md:206` |
| Separate `displayName` (InnoVint's lot name) | **[ABSENT]** — `code` doubles as unique key *and* human label; no display-name column. | `cellarhand:prisma/schema.prisma:1140` (only `code`; no `name`) |
| Renameable anytime | **[ABSENT]** — no app path updates `Lot.code` after creation; **the sole rename is the one-time CLI** `recode-legacy-lots.ts`, a self-declared "DECLARED EXCEPTION" to the immutability invariant, which *also rewrites* the durable `lotCode` snapshots on ledger lines. | `cellarhand:scripts/recode-legacy-lots.ts:3-13,72-76`; `src/lib/lot/code.ts:3-5` |
| Rename decoupled from history | **[ABSENT] / actively contradicted** — INVARIANTS pins *"`code`, origin, `vintageYear` immutable after the first operation"*; line-level `lotCode`/`vesselCode` are durable point-in-time snapshots (good for honesty, but means a naive rename would either desync or require a history rewrite). | `cellarhand:INVARIANTS.md:62-63`; `schema.prisma:1274-1275,1257-1258` |

**Net:** Cellarhand already has the hard half the incumbents lack — a true immutable surrogate id
that carries lineage, plus first-class split and an anti-false-single-origin blend rule. What it
lacks is the *soft* half both incumbents ship in some form: a **presentation layer** (vintrace's
configurable template; InnoVint's code/name split + free rename). Cellarhand's own doctrine (D3 +
INVARIANTS "code immutable after first op") currently points the **opposite** direction from the
target's "renameable anytime."

---

## 5. Recommended naming-template system design

The goal: make today's hardcoded rules **merely the default template a winery can override**, and
add a renameable presentation layer *without* sacrificing Cellarhand's append-only honesty (the one
thing both incumbents give up when they "update all historical references").

### 5a. Token vocabulary (per-tenant `NamingTemplate`)

A per-tenant, versioned template = an ordered list of typed segments, resolved against a lot's
attributes at *generate* time. Superset of `buildLotCode` + vintrace's auto-code attributes:

- **Vintage** — `YYYY` / `YY` / `Y` (vintrace has all three); `NV` sentinel when no single vintage.
- **Vineyard**, **Block**, **Subblock**, **Region**, **Variety** — from origin (abbr, 2–4 alnum).
- **Fraction** — must/free-run/press-light/press-heavy/saignée/lees (Cellarhand already derives this
  tag on split; expose it as a token, mirroring vintrace's fraction codes).
- **Owner / Bond / Tax-class** — as tokens *only if the winery opts in* (default OFF — these change,
  and baking them in is the friction §3 documents). Prefer keeping them as attributes.
- **Sequence** — zero-padded `Inc` (per-scope counter, e.g. resets per base) **or** a tenant-wide
  monotonic `SerialNumber` (vintrace's "Batch Number") — at least one numbering token required, as
  vintrace enforces.
- **Literal text** — static separators/prefixes (vintrace `Text` + "Custom Code").
- **Blend variant** — a separate template that *forbids* origin tokens (preserve today's
  no-false-single-origin rule as a template constraint, not a hardcode).

The **default template** ships as exactly today's scheme, so behavior is unchanged out of the box;
`buildLotCode`/`buildBlendLotCode` become the built-in default template's renderer.

### 5b. Identity vs. presentation — the schema move

1. Keep `Lot.id` (cuid) as the sole identity; **all lineage/FK already use it** — no change.
2. Add **`Lot.displayName String?`** (InnoVint's lot name) — free-form, renameable, never a key.
3. Make **`Lot.code` renameable** (relax the immutability invariant to *id*, not *code*), keep
   `@@unique([tenantId, code])` for scan/search UX.
4. **Do NOT rewrite line-level snapshots on rename** (this is where we beat both incumbents). The
   `lotOperationLine.lotCode`/`vesselCode` snapshots stay as *what the code was at that time*; a new
   append-only **`LotCodeEvent`** (or a `LotStateEvent` kind `CODE_CHANGE`, with `commandId`,
   `fromValue`/`toValue`, actor, `observedAt`) records the rename. Current-state reads resolve
   `id → current code`; historical reads show the code as-recorded plus a "renamed → X" affordance.
   This gives InnoVint's Lot Properties History *and* an honest, non-rewritten ledger.
5. `recode-legacy-lots.ts` stops being a "declared exception" — it becomes the first legitimate
   caller of the rename event.

### 5c. Blend / split inheritance rules

- **Split** (already first-class): children inherit a *fresh* code from the template, fraction token
  auto-filled; `displayName` inherits parent's with a fraction suffix. No phantom vessel.
- **Blend `NEW_LOT`**: mint from the **blend template** (origin tokens forbidden); `displayName`
  defaults to a composed "Vintage Blend <token>" but is editable.
- **Blend `GROW_EXISTING`**: keep the resident lot's id, code, and displayName (unchanged today).
- **Tag/attribute inheritance**: adopt vintrace's **weighting-threshold** rule for any future
  free-tag layer (a source's tags carry into a blend only if its volume share ≥ threshold) — clean,
  already validated in the market.

### 5d. Collision handling

- **Generated codes**: keep `disambiguate(base, existing)` → `-2/-3/…` inside the write tx
  (`cellarhand:src/lib/lot/code.ts:103-110`, `generate.ts:32-33`), P2002 retry.
- **Manual rename/adopt**: on `@@unique([tenantId, code])` violation, **reject with a clear error and
  offer auto-disambiguation** (append `-2`), rather than silently mutating — because a human typed
  it. Identity is the id, so a collision is a *label* problem, never a data-integrity problem.
- Because identity ≠ code, we *could* drop the code uniqueness constraint entirely; recommend
  **keeping** it (per-tenant) for barcode/scan and human legibility, matching D16.

### 5e. Migration mapping (coordinate with the migration agent)

The migration agent's concern — *adopt existing codes as display names without forcing renames* — is
directly served by the surrogate/label split:

- **Ingest both vintrace batch codes and InnoVint lot codes verbatim.** For each incoming lot, mint a
  new `Lot.id` (surrogate), and set:
  - `Lot.code` = the incoming code **if unique in tenant**, else the incoming code auto-disambiguated
    (`-2`), with the original preserved in `displayName`/`legacyCode`.
  - `Lot.displayName` = InnoVint **Lot Name** if present (it already is the human string), else the
    incoming code, else the composed default.
  - **`sourceSystem` + `legacyCode`/`sourceId`** external identifiers (Phase-13 plan already names
    these) so re-imports are idempotent and the winery recognizes their data.
- **No forced rename**: the winery keeps operating under their existing strings on day one; the
  Cellarhand template only governs *newly minted* lots (splits/blends/crush) going forward — the
  winery can adopt the template pattern whenever they choose.
- **Do not import incumbent rename history as ledger ops** (honors D11 "no fake history"): fold a
  vintrace/InnoVint code-change log, if exported, into `LotCodeEvent`s stamped `captureMethod:IMPORT`
  — as *documented past labels*, not fabricated operations.
- **Fraction/vintage/origin semantics** carried in incumbent codes should be **parsed into
  attributes** (originVariety, vintageYear, fraction) where confidently recoverable, so the meaning
  lives in queryable columns — but the *string* is preserved as-is regardless (never re-derive a
  code the winery didn't ask for).

---

## 6. Convergence / divergence / both-fail

**Convergence (table stakes Cellarhand must match):**
- A stable internal identity distinct from the human string (InnoVint proves it via anytime-rename;
  Cellarhand already has the strongest version — a true surrogate id carrying all lineage). ✔ have.
- A separate human **display name** in addition to a short code (InnoVint Lot Name). ✖ Cellarhand
  [ABSENT] — recommend adding.
- **Rename must be possible** — both incumbents allow it freely; Cellarhand forbids it. ✖ [ABSENT] —
  the single biggest UX gap this teardown surfaces.
- Per-tenant/per-DB code uniqueness with disambiguation. ✔ have (D16).
- Tags as a separate classification layer with defined blend inheritance. Partial — Cellarhand has
  `sublotTag` but no general tag layer.

**Divergence (design choices):**
- **Template engine**: vintrace = fully winery-configurable multi-token auto-codes across every
  record type; InnoVint = *no* template (free-typed); Cellarhand = hardcoded single scheme.
  **Recommend Cellarhand adopt vintrace's configurable-template posture** (winery-defined tokens)
  while keeping its own scheme as the default — best of both.
- **Origin-in-code**: vintrace bakes vineyard/variety/fraction into the default auto-code (friction
  on blend); Cellarhand *deliberately strips* origin from blend codes. Keep Cellarhand's guard as a
  template constraint. ✔ Cellarhand better.
- **Split**: InnoVint has no primitive (phantom-vessel hack, pollutes audit trail); Cellarhand has
  first-class `SPLIT` lineage + generated child codes. ✔ Cellarhand strictly better — a marketing
  wedge ("no phantom vessels").

**Both fail (Cellarhand differentiation opportunity):**
- **Renames rewrite history.** vintrace "updates all historical references"; InnoVint changes the
  code "throughout the entire history of the lot." Neither preserves *what the code was when the
  operation happened*. Cellarhand's append-only ledger + point-in-time line snapshots + a
  `LotCodeEvent` can offer **rename-without-rewriting-history** — a genuinely more honest audit
  trail that neither incumbent has. This is the durable moat move for identity/naming.
- **Semantic drift in codes** (vintage/fraction/ownership baked into a supposedly-stable string) is
  unmanaged in both. Cellarhand's attribute-first model (D3 vintage-not-identity) plus opt-in tokens
  can keep meaning in queryable columns instead of a lying string.

---

### Flag for SYNTHESIS — proposed invariant changes

1. **Invariant tension to resolve.** `INVARIANTS.md:62-63` currently pins *"`code`, origin,
   `vintageYear` immutable after the first operation."* The target architecture requires **splitting
   this**: keep **`Lot.id` (surrogate) and the point-in-time line-level `lotCode`/`vesselCode`
   snapshots immutable**, but make **`Lot.code` a renameable presentation label**. Origin/vintage
   immutability (provenance) can stay — only the *label* immutability must be relaxed.
2. **New invariant candidate:** *"A lot rename is an append-only `LotCodeEvent`; it never rewrites
   ledger-line code snapshots (unlike vintrace/InnoVint). Current reads resolve id→current code;
   historical reads show the code as-recorded."* This is the moat-defining rule and should be
   verify-guarded like LEDGER-10.
3. **New invariant candidate:** *"Lot identity is `id`, never `code`; `code`/`displayName` uniqueness
   is a per-tenant UX constraint, not an identity constraint — a code collision is a label error,
   never a lineage error."*
4. **Schema adds needed:** `Lot.displayName`, a per-tenant `NamingTemplate` (versioned, tokenized),
   `LotCodeEvent` (or `LotStateEvent kind=CODE_CHANGE`), and `sourceSystem`/`legacyCode` for the
   Phase-13 import spine. None exist today.
