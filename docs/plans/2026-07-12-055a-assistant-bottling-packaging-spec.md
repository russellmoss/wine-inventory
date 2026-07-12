---
title: Assistant coverage spec — bottle a WO with packaging dry-goods (NL authoring)
type: spec
status: scoped (not built)
date: 2026-07-12
refines: docs/plans/2026-07-12-055-feat-work-order-assistant-coverage-gaps-plan.md (Units 1-2, "BOTTLE NL authoring")
depends_on: Plan 056 (packaging dry-goods) — SHIPPED to main (#135/#136/#138)
---

## Why this exists
056 shipped packaging into bottling; the 055-gaps plan said its BOTTLE-NL-authoring units "will be
reworked once packaging lands." This is that rework: the assistant learns to author a bottling work order
**with its packaging BoM** in one pass. Today the assistant can't author bottling at all (no write tool;
`propose_work_order` still lists it unsupported).

## Judgment calls (winemaker) — RECOMMENDED DEFAULTS, pending confirm
The interview questions went unanswered; these are the assistant's recommended defaults. The cost-touching
ones are drafted-then-to-be-tightened (authoring writes NO ledger — the real cost write is at execute via
`runBottlingTx`, already proven by verify:cost — so the risk here is UX legibility, not ledger integrity).

- **J1 — "standard packaging" resolution:** name-driven + copy-from-last-run, else task-only.
  - User NAMES items ("screwcap + estate front/back labels") → resolve each `PACKAGING` (+`OTHER`) material
    (fuzzy; ambiguous → signed choice token, never invent an id); `guessPackagingFactor` auto-fills per/factor.
  - "standard/usual/our packaging" → copy the packaging BoM (lines + factors) from **this SKU's most recent
    bottling run**; if none exists, treat as task-only + tell the user to set packaging in the builder.
  - Neither named nor "standard" → author the BOTTLE task with **no** packaging; summary says packaging is
    added in the builder. (Mirrors CRUSH/PRESS "author now, fill at execute.")
- **J2 — read helper IN scope:** a small read tool `estimate_packaging_needs` (cases×12×factor per line +
  on-hand shortfall) answering "how many corks/bottles for 500 cases?" No write, no confirm.
- **J3 — advisory stock note at authoring:** the confirm card shows a non-blocking "low/no stock: QA-Cork
  500 on hand, ~6,000 needed" note (reuses the reservation ATP + shipped short-stock signal). Never blocks;
  draw-to-zero + reconcile stays a floor decision at execute.

## Tool plan (maps intent → shipped cores; re-implements nothing — WORKORDER-1)
**Primary (write): extend `propose_work_order`** via the established add-a-kind recipe (NOT a new tool).
- `nl-proposal.ts`: `NlWorkOrderIntent` gains `{ kind:"BOTTLE"; vessel?; skuName?; skuVintage?; cases?;
  bottles?; packaging?: "standard" | string[]; note? }`; add `"BOTTLE"` to `SUPPORTED`; canonicalizer
  block (aliases wine/sku, vintage; cases↔bottles; all optional — authoring only).
- `nl-resolve.ts`: a `kind==="BOTTLE"` branch → `taskBuilds.push({ taskType:"BOTTLE", title:"Bottling",
  values:{ skuName?, skuVintage?, packagingBottles? }, plannedPayload.packaging?, taskKey })`. Packaging
  lines resolved per J1 using `packaging-bom.ts` (`guessPackagingFactor`, `theoreticalConsumption`) and the
  packaging picker scope (`materialScopeForTask("BOTTLE")` → PACKAGING+OTHER). `packagingBottles` from
  `cases×12` or `bottles`; per-line `qty` derived.
- `propose-work-order.ts`: add `BOTTLE` to the `tasks[].kind` enum + fields (`skuName`, `skuVintage`,
  `cases`/`bottles`, `packaging`); drop "bottling unsupported" from the description. Commit routes through
  `createWorkOrderFromBuildsAction` (055-gaps Unit 4) — one path with the builder; the real bottling ledger
  write happens later at the execute BOTTLE dispatch → `runBottlingTx`.
- **Confirm-card preview:** "Bottle {vessel} → ~{cases} cases of {sku} {vintage}. Packaging: glass ×{n},
  cork ×{n}, capsule ×{n}, labels ×{n}, case box ×{n} (~{qty} each). Source vessel(s), final bottle count,
  ABV and destination are entered on the floor." + the J3 stock note when short.
- **adminOnly:** no (authoring a WO is a normal cellar action).
- **Deferred to the floor (execute / BottlingTaskForm):** actual bottle count, measured ABV, exact
  destination, actual-consumed + variance, short-stock draw-to-zero. **Refuses:** inventing a packaging
  material id (→ choice token); attaching a non-PACKAGING material as packaging (scope guard); any
  authoring-time ledger/cost write.

**Secondary (read): `estimate_packaging_needs`** — args `{ skuName?, cases?, bottles?, packaging?:string[] }`;
returns per-line theoretical + on-hand + shortfall via `packaging-bom` + the packagingOptions loader. Read
tool, no signProposal.

## Golden cases (add to test/evals/assistant-write-tools.golden.ts at /work time)
```
{ utterance: "Make a work order to bottle tank 6 into 500 cases of the 2024 Estate Cab with our standard packaging",
  tool: "propose_work_order",
  args: { tasks: [{ kind: "BOTTLE", vessel: "tank 6", skuName: "Estate Cab", skuVintage: 2024, cases: 500, packaging: "standard" }] },
  note: "standard → copy this SKU's last-run BoM; source/final count/ABV/dest at execute; no authoring ledger write" }

{ utterance: "Bottle T6 into 6000 bottles of 2024 Estate Cab, screwcap and estate front and back labels",
  tool: "propose_work_order",
  args: { tasks: [{ kind: "BOTTLE", vessel: "T6", skuName: "Estate Cab", skuVintage: 2024, bottles: 6000, packaging: ["screwcap", "estate front label", "estate back label"] }] },
  note: "named packaging → resolve each PACKAGING material, guessPackagingFactor (labels ×1/bottle each); ambiguous name → choice token" }

{ utterance: "bottle tank 6 into the 2024 estate cab",
  tool: "propose_work_order",
  args: { tasks: [{ kind: "BOTTLE", vessel: "tank 6", skuName: "estate cab", skuVintage: 2024 }] },
  note: "terse, no packaging/count → author BOTTLE task only; packaging + count set in the builder/floor" }

{ utterance: "how many corks and bottles do I need to bottle the Estate Cab into 500 cases?",
  tool: "estimate_packaging_needs",
  args: { skuName: "Estate Cab", cases: 500 },
  note: "read-only: theoretical (cases×12×factor) + on-hand shortfall; no write" }
```
Plus a **fleet case**: the BOTTLE utterance is selectable among the full toolset and doesn't blow the
tool-call budget (proves it's chosen over rack/addition and over `remove_bottled_wine`).

## Stop condition (loop "done", machine-checkable)
- `npx tsc --noEmit` clean; `npx eslint` clean on touched files.
- `verify:work-orders` + `verify:work-orders-transform` + `verify:cost` green (cores unchanged).
- `npx vitest run test/evals/assistant-tools.eval.test.ts` green — structural coverage guard passes (new
  golden matches the real `inputSchema`); D26/TRIP-AI-EVAL green.
- `npm run eval:assistant` (gated LLM) green + fleet scorecard no regression vs prior run.
- The BOTTLE branch routes through `createWorkOrderCore`/`createWorkOrderFromBuildsAction` +
  (at execute) `runBottlingTx`; imports **no** `db_*` generic write.
- `gen:assistant-coverage` regenerated + committed; the bottling row flips 🟨→✅.
- Live e2e (extend `scripts/verify-work-order-nl.ts`): author a BOTTLE-with-packaging WO via NL+commit →
  assert one BOTTLE task with `plannedPayload.packaging` + `packagingBottles`, NO ledger op at authoring;
  issue → MATERIAL_QTY holds; complete via the execute BOTTLE path → real BOTTLE op + finished goods +
  PACKAGING cost in the snapshot (reuse the 056 assertions); scrub.

## Notes for /work
- This is Units 1-2 of the 055-gaps plan, reworked for packaging. Units 3-8 (equipment-service NL,
  group_rack_batch tool, per-task assignee/priority) are independent and can ship separately.
- Persist J1-J3 as a `/decision` (assistant bottling-packaging authoring policy) before building, so a
  later loop isn't amnesiac about the "copy-last-run / task-only fallback / advisory-stock" rules.

## Decision record (assistant bottling-packaging authoring policy)
> Recorded in-repo 2026-07-12 (context-ledger MCP was offline this session — file to the ledger inbox
> when it's up). Durability: **precedent**. Scope: assistant / work-orders NL authoring
> (`propose_work_order`, `nl-proposal.ts`, `nl-resolve.ts`), bottling (`runBottlingTx`), packaging-bom.

**Decision.** The assistant authors a bottling WO + its packaging BoM via `propose_work_order` (add-a-kind,
no new write core; the ledger write is deferred to the execute BOTTLE dispatch → `runBottlingTx`). Packaging
resolution = named-items (resolve each, `guessPackagingFactor`; ambiguous → choice token) → else
"standard/usual" copies THIS SKU's most-recent bottling-run BoM → else author the task with no packaging
(builder fills it). A read helper `estimate_packaging_needs` answers "how many will I need." Low-stock is an
advisory note at authoring, never a block. Actual count/ABV/destination/variance/short-stock are floor
(execute) inputs. Refuses: inventing a material id, attaching a non-PACKAGING material, any authoring-time
ledger write. Not admin-only.

**Alternatives considered / why rejected.**
- *Named-items only (no "standard" resolution):* simpler + predictable, but "with our standard packaging"
  authors nothing — misses the assistant wedge. Rejected as too thin.
- *Stored per-SKU default packaging BoM:* the "right" long-term "standard" source, but no such store exists
  (Plan 056 deferred SKU-default BoM as NICE). Rejected NOW; copy-last-run is the cheapest reliable proxy.
- *Task-only (all packaging in the UI):* safest/least surface, but doesn't deliver "tell the assistant your
  packaging." Kept only as the fallback when there's nothing named and no prior run.

**Rationale.** Authoring is confirm-gated and writes NO ledger, so these are UX-legibility rules over an
already-correct core (`verify:cost` proves the cost math), not new ledger invariants. Copy-last-run is the
cheapest reliable "standard" signal absent a stored default.

**Revisit when:** a stored per-SKU/tenant default packaging BoM ships (replace copy-last-run with it); or
rule-based NL phrasing proves unreliable in practice (move packaging authoring behind the visual builder /
D14 draft-into-builder, matching the 055-gaps decision to keep brittle NL structure in the builder).
