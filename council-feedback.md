# Council Feedback — Weekly Field Notes, Vineyard Reporting & Harvest Ledger

**Date**: 2026-06-24
**Plan**: `docs/plans/2026-06-24-006-feat-weekly-field-notes-plan.md`
**Reviewers**: Codex `gpt-5.4` (types + data layer), Gemini `gemini-3.1-pro-preview` (product logic + UX)

> Note: Codex's first run crashed (its CLI tried to web-search and failed); re-run with web search disabled succeeded.

---

## Critical Issues

### C1. `after()` is not a durable queue (Codex; matches our own open risk)
`after()` is best-effort background work, not a job queue. On Vercel serverless it's unverified whether it survives response finalization or whether `maxDuration` covers post-response work. A non-awaited client `fetch()` is also unreliable if the page navigates away (which it does — manager submits → confirmation). **Fixes offered:** (a) write a durable job row in the same transaction as the `FieldNote`, process via cron/worker; (b) generate synchronously before the redirect; (c) at minimum, `aiSummaryStatus=PENDING` + admin Regenerate is the real safety net, and the client call should use `keepalive`. → **Decision question Q3.**

### C2. Prisma `Decimal` must not cross the server/client boundary (Codex)
`BrixLog.brixValue`, `HarvestRecord.yieldEstimateKg`, `totalWeightKg` are Prisma `Decimal`, not plain numbers. Passing them into client components / returning from server actions will break in App Router. **Fix:** map to `number` (or string) DTOs explicitly at the server edge; never pass raw `Decimal` as props. Applies to Units 14, 15, and any payload. *(Will bake in — clear win.)*

### C3. `AppUser += assignedVineyardId` is a plan-wide type change, not one select (Codex)
Every hand-built `AppUser` / auth-derived user shape that omits the field either fails compile or silently widens. **Fix:** define one canonical `userSelect` + one `toAppUser()` mapper, reuse everywhere, grep all construction sites before touching routes/UI. Hardens Unit 4. *(Will bake in.)*

### C4. `weekOf` is a timezone + late-submission trap (Codex + Gemini)
`@db.Date` + "Friday of current week" computed in local time → off-by-one on readback/uniqueness/draft keys (Codex). Worse (Gemini): a manager who loses signal Friday and submits Saturday 8am gets logged against *next* Friday, skipping a week or colliding with a future one. **Fix:** canonical UTC date-only helper (`YYYY-MM-DD` discipline, DST-tested) AND let the manager pick the week, defaulting to the most-recently-passed Friday. → **Decision question Q2.**

### C5. Pre-populating sprays/fertilizers is agronomically wrong (Gemini) — conflicts with the stated requirement
Vineyards don't apply the same chemicals weekly. Pre-checking last week's sprays means a tired manager forgets to uncheck → the DB shows "sprayed Sulfur 8 weeks straight," which then **feeds false data into the rain-vs-spray AI analysis** (the headline feature). The original spec said "pull forward all toggle values"; Gemini argues carry phenology/canopy status only; weather + chemicals + disease start blank every week. → **Decision question Q1.**

### C6. Harvest model can't handle multiple picks (Gemini)
"One row per (blockId, vintageYear)" forces manual math (add today's 500kg to last week's 1200kg) and destroys the pick timeline. Real vineyards do multiple passes per block. **Fix:** `HarvestPick` 1:M (weightKg + pickDate per row), roll up `totalWeightKg` for the admin view. → **Decision question Q4.**

### C7. Upload route has no real authorization boundary (Codex)
"Authenticated + image/* + 8MB" still lets any valid user store arbitrary blobs anywhere. **Fix (Unit 7):** require vineyard/block context in the request and re-run `canManagerAccessVineyard` server-side before `put()`. *(Will bake in.)*

---

## Should Fix (baking these into the plan unless noted)

- **S1. JSONB block drift on pre-populate (both):** server-side prepopulate must intersect previous-week keys with the *current* active `VineyardBlock` IDs — drop removed blocks, init new ones blank. (Unit 6.) *(Bake in.)*
- **S2. N+1 in "latest Brix per block" (Codex):** use one query with `DISTINCT ON (blockId) ... ORDER BY blockId, recordedAt DESC, id DESC`; don't loop blocks. Same for yields-by-vintage: one query, aggregate in `aggregate.ts`. (Unit 14.) *(Bake in.)*
- **S3. Near-duplicate input names (Gemini):** UPPERCASE alone leaves "NEEM" / "NEEM OIL" / "NEEM-OIL" as 4 rows, fracturing analytics. Compute a normalized key (strip all non-alphanumeric → `NEEMOIL`) for the unique constraint, store the display name separately. (Units 3, 1 — `FieldInput` gets a `normalizedKey` unique col.) *(Bake in.)*
- **S4. Variance divide-by-zero (Gemini):** `(actual-estimate)/estimate` with null/0 estimate → NaN. Render "N/A" when no estimate. (Units 14/15.) *(Bake in.)*
- **S5. "Apply default healthy" wipes edits (Gemini):** as a master toggle it can nuke 10 minutes of tweaks on an accidental tap. Make it a button "Mark remaining/unedited blocks healthy"; never overwrite explicitly-edited blocks without a confirm. (Unit 12.) *(Bake in.)*
- **S6. Stale draft key (Gemini) + schema version (Codex):** keying the draft by `vineyardId:weekOf` orphans a Thursday draft opened Saturday. Key by `vineyardId` only; store `weekOf` + `schemaVersion` *inside* the draft value. (Unit 12.) *(Bake in.)*
- **S7. JSON shapes are loose (Codex):** Prisma `Json` returns `JsonValue`, not a domain type. Validate on write + parse on read with runtime validators; version the stored shape. Codebase has no zod today (ad-hoc validation) — use lightweight validators in `types.ts` to match house style, or adopt zod. (Units 3, 6, 13.) *(Bake in as lightweight validators; zod optional.)*
- **S8. Brix DB range (Gemini):** `Decimal(4,1)` allows 999.9. App validates 0–35; add a DB `CHECK (brixValue >= 0 AND brixValue <= 40)` as a backstop. (Unit 1.) *(Bake in.)*
- **S9. FieldNote.userId delete semantics (Codex):** if Better Auth can delete users, a required FK blocks/cascades badly. Use optional FK + `onDelete: SetNull`, keep the `userEmail` snapshot as provenance. (Unit 1.) *(Bake in.)*
- **S10. Field-specific upserts (Codex):** `recordYieldEstimate` vs `recordHarvest` must each update only their own columns + actor meta — never send sibling nullable fields. (Already specified in Unit 14; reinforced.)
- **S11. Unit-order gate (Codex):** Unit 4 gates everything after Unit 1 — `db:generate` + typecheck/build + auth smoke test must pass with the new `User` shape before Units 6/7/9/12 start. *(Bake in as an explicit gate.)*

---

## Design Questions (answer these → `/refine` or feed to `/work`)

1. **Pre-population scope (C5).** Carry forward *everything* (original spec), or carry block phenology/canopy only and blank chemicals + weather + disease each week (Gemini's data-quality fix), or a middle ground (carry block statuses, blank sprays/fertilizers)? This directly affects AI-briefing accuracy.
2. **`weekOf` selection (C4).** Auto "current Friday", or a manager-selectable week defaulting to the most-recently-passed Friday (handles Saturday submissions)?
3. **AI generation durability (C1).** Keep `after()` + Regenerate (simplest, needs Vercel Pro, occasional manual regen), add a durable job row + cron worker (robust, more infra), or generate synchronously before the confirmation screen (simplest data flow, manager waits ~15s)?
4. **Harvest multiple picks (C6).** One progressive row per block/vintage (simple, matches "final harvest"), or `HarvestPick` 1:M to capture multiple passes with a timeline?

**Lower-stakes design notes (defaulting unless you object):**
- **One note per vineyard per week:** `@@unique([vineyardId, weekOf])` assumes one canonical note per vineyard/week regardless of author. If two managers can share a vineyard and both submit, the second is blocked. Default: keep it (one note per vineyard/week). Switch to `([vineyardId, userId, weekOf])` only if multiple managers per vineyard is real.
- **Admin drill-in modal vs page (Gemini):** modals are cramped for dense per-block tables + photo galleries and aren't shareable links. You explicitly wanted a modal — default: keep the modal but make it URL-addressable (deep-linkable) so an admin can share "this vineyard, this week."
- **Claude as summarizer, not agronomist (Gemini):** prompt Claude to *cite the data* ("Block 4 reported yellowing; no fertilizer logged in 3 weeks") rather than diagnose ("magnesium deficiency"). Default: bake this framing into the Unit 8 system prompt.
- **`weatherData` (Codex):** confirmed it's manual numeric entry (rainfall/max/min), not a vendor payload — already internal-only, no change needed.

---

## Raw Response — Codex (gpt-5.4)

**CRITICAL**
- Unit 9: `after()` + immediate `{status:"accepted"}` is not durable. `after()` is best-effort background work, not a queue; verify it survives response finalization on Vercel and whether `maxDuration` applies to post-response work. Non-awaited client `fetch()` is unreliable if the page navigates away; use `keepalive` if you insist, still weak. Fix: durable job row in the same transaction as `FieldNote`, process via worker/cron/queue; or do the summary synchronously before redirect.
- Unit 14/15: don't let raw Prisma `Decimal` escape the server boundary (`brixValue`, `yieldEstimateKg`, `totalWeightKg`) — bites in App Router/client components and server actions. Map to DTOs explicitly (`toNumber()` or string) at the server edge; same for any client-component props.
- Unit 4: `AppUser += assignedVineyardId: string|null` is a plan-wide type break. Any hand-built `AppUser` omitting it fails compile or silently widens. Define one canonical `userSelect` + `toAppUser()` mapper; grep all construction sites first.
- Unit 1/6/12: `weekOf DateTime @db.Date` is a timezone trap. Computing "Friday of current week" in local time + persisting a JS Date → off-by-one on readback/uniqueness/draft keys. Use one canonical UTC date-only helper, compare/store by `YYYY-MM-DD`; test DST.
- Unit 1/12/13: JSON plan too loose. `blockLevelStatuses`/`spraysApplied`/`fertilizersApplied`/photo URLs will drift; Prisma `Json` = `JsonValue`, not a safe domain type. Define zod codecs now, validate on write, parse on read, version the shape. If `blockLevelStatuses` keeps growing, normalize it.

**SHOULD FIX**
- Unit 14: `getLatestBrixByBlock` is an N+1/incorrect-query trap. Don't loop blocks; don't trust `distinct`. Use `DISTINCT ON (blockId)` or `row_number() over (partition by blockId order by recordedAt desc, id desc)` + tie-breaker index.
- Unit 14/15: yields-by-vintage = one query. Load all `HarvestRecord`s for the vineyard once + block metadata once, aggregate in `aggregate.ts`. No per-block/per-vintage queries.
- Unit 14: `@@unique([blockId,vintageYear])` fine, but upsert must be field-specific. If both actions upsert a shared payload, one nulls the other's columns. Each action updates only its own columns + actor meta.
- Unit 1: explicit delete semantics for authoring refs. `User.assignedVineyardId onDelete:SetNull` right; do same for `FieldNote.userId` / `createdById`. If admin tooling deletes users, required FKs block/cascade badly. Optional FK + `SetNull`, keep email snapshots.
- Unit 7: upload route under-scoped. Authenticated + image/* + 8MB still lets any user store arbitrary blobs. Require vineyard/block context + re-run `canManagerAccessVineyard` before `put()`.
- Unit ordering: Unit 4 gates everything after Unit 1. Don't start 6/7/9/12 until `db:generate` + typecheck/build + auth smoke pass with the new `User` shape.

**DESIGN QUESTIONS**
- Unit 1: `@@unique([vineyardId,weekOf])` only works if exactly one manager note per vineyard per week. Prompt says managers plural. Is one-manager-per-vineyard a hard invariant? If not, use `([vineyardId,userId,weekOf])` and decide how the briefing selects/merges.
- Unit 9: you have `aiSummaryStatus` but no durable executor behind it. If eventual completion matters, model it as a job/state machine, not an HTTP side effect.
- Unit 1/8: `weatherData Json` — do you want vendor response shape in the DB? Persist only internal fields the prompt/UI need.
- Unit 1/4: Better Auth custom `User` columns usually need more than a Prisma migration. Verify the Better Auth config/typegen/CLI workflow before landing `assignedVineyardId`; else Prisma and auth disagree on the `User` model + session typing.
- Unit 12: draft keyed by `vineyardId:weekOf` — if week canonicalization changes, old drafts collide. Put canonical date format + payload `schemaVersion` in the draft from day one.

## Raw Response — Gemini (gemini-3.1-pro-preview)

**CRITICAL**
1. The "Current Friday" Trap: dynamic `weekOf` = "Friday of current week" is fatal for rural users — Saturday submission logs against the *following* Friday. Fix: `weekOf` is a dropdown defaulting to the most-recently-passed Friday; allow manual select so late submissions don't skip/overwrite.
2. Harvest Model Cannot Handle Multiple Picks: "one row per (blockId, vintageYear)" forces manual math and destroys the pick timeline. Fix: `HarvestPick` (1:M per block/vintage), store weightKg + pickDate per row, roll up totalWeightKg.
3. Agronomically Incorrect Pre-Population: carrying forward sprays/fertilizers is wrong — vineyards don't apply the same chemicals weekly; managers forget to uncheck → DB shows sulfur 8 weeks straight. Fix: carry phenology + canopy status only; weather, chemicals, diseases start blank each week.
4. Photo Uploads Will Block Form Submission: waiting for 5 photos to upload synchronously on 3G will hang/timeout and lose the report. Fix: async/background upload the moment a photo is selected; submission only sends string URLs.

**SHOULD FIX**
1. "Apply Default Healthy" Data Loss: a master toggle can wipe overrides on an accidental tap. Fix: make it a button "Mark remaining unedited blocks as healthy"; don't overwrite touched blocks without a loud confirm.
2. Spray Sanitization Too Weak: uppercasing doesn't solve "NEEM"/"NEEM OIL"/"NEEM-OIL"/"NEEM  OIL". Fix: strip all non-alphanumeric for the unique check (`NEEMOIL`), store the original for display.
3. Yield Variance Division by Zero: `(Actual-Estimate)/Estimate` with NULL/0 estimate → NaN. Fix: render "No Estimate"/"N/A"; don't do the math.
4. Stale Draft Autosave: key `(vineyardId:weekOf)` orphans a Thursday draft finished Saturday. Fix: key only by `vineyardId` — one active draft; load it and let them adjust the date.

**DESIGN QUESTIONS**
1. Is Claude playing Agronomist? LLMs are confidently wrong at agronomy; "Block 4 has magnesium deficiency" could trigger the wrong fertilizer order. Fix: prompt Claude strictly as a data summarizer ("Block 4 reported yellowing; no fertilizer applied in 3 weeks"), not a diagnostician.
2. Admin Drill-in Modal: modals are terrible for dense per-block tables + photo galleries and aren't deep-linkable. Fix: dedicated page `/admin/vineyard/[id]/week/[date]`.
3. JSON Block Drift: if Block A is ripped out mid-season, pre-populate keeps carrying it forever. Fix: intersect previous-week JSON keys with the current real-time active block IDs; drop missing, init new blank. Also add a DB check on `brixValue` (0–40) — `Decimal(4,1)` allows 999.9.
