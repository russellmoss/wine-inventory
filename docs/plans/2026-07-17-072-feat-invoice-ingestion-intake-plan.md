---
title: Invoice / Document Ingestion → Deterministic Expendables & Equipment Intake
type: feat
status: completed
date: 2026-07-17
branch: claude/invoice-ingestion-inventory-577580
depth: deep
units: 12
---

## Overview

Let a user drop a pile of supplier documents (PDFs — text or scanned — and images) onto an
`+ Ingest invoice` action, have the system OCR/extract and classify each document, and route only
the *receipts* into intake through one human-reviewed screen per invoice. Every write goes through
today's material/vendor cores (`createStockMaterialCore`, `receiveSupplyCore`, `findOrCreateVendorCore`)
so costing, A/P emission, and tenant/RLS invariants stay intact. The winemaker stops hand-keying
line items off PDFs; the app does the reading, the human confirms the writing.

## Data Flow

```
                 ┌───────────────────────── HUMAN IN THE LOOP ─────────────────────────┐
                 │                                                                     │
  + Ingest       │   upload (Unit 3)        extract+classify (Unit 4)                  │
  invoice ──▶ [PDF/img files] ──▶ private blob ──▶ Anthropic doc/img blocks ──┐        │
                        │                          (1 call / doc, ‖ bounded)  │        │
                        │                                                     ▼        │
                        │                              ┌── ExtractedDocument[] ──┐     │
                        │                              │  docType: invoice |     │     │
                        │                              │   proforma | coa | other│     │
                        │                              └────────────┬────────────┘     │
                        │                                           ▼                  │
                        │                       createIngestedInvoiceCore (Unit 7)     │
                        │                       → IngestedInvoice + lines (staging)    │
                        │                                           │                  │
                        ▼                                           ▼                  │
              LotDocument (INVOICE/COA) ◀──────────────  REVIEW SCREEN (Unit 8)         │
              (provenance, Unit 10)                     • vendor panel (match/new)      │
                        ▲                               • line grid: qty/unit/price/lot │
                        │                               • dedup: add-existing / new     │
                        │                                 (matchMaterials, Unit 6)      │
                        │                               • proforma: "landed receipt?"   │
                        │                               • landed cost preview (Unit 5)  │
                        │                                           │ Confirm           │
                        │                                           ▼                  │
                        │              applyIngestedInvoiceCore (Unit 7, resumable)     │
                        │              per line, skip if createdSupplyLotId set:        │
                        │       ┌───────────────┬───────────────────┬────────────┐     │
                        │   existing →      new material →       COA → attach     skip  │
                        │  receiveSupplyCore  createStockMaterialCore  expiresAt        │
                        │       │                   │              to matched lot       │
                        │       └─────────┬─────────┘                                   │
                        │                 ▼                                             │
                        └──────  SupplyLot (+ currency, landed unitCost)  ◀─────────────┘
                                          │
                                          ▼
                              emitApExportForReceipt  (A/P Bill, amount = qty × unitCost,
                                          │            idempotent postingKey = ap:<lotId>)
                                          ▼
                                 wine COGS (MATERIAL, capitalized)  —  EQUIPMENT never doseable

  Assistant path (Unit 9): "add these to inventory" → same extract + createIngestedInvoiceCore
                            → proposal whose commit NAVIGATES to the review screen (no in-chat edit).
```

## Problem Frame

Today, logging a supplier receipt means opening the expendables modal and the vendor modal and
manually typing every field off a PDF — vendor, each material, quantity, unit, unit cost, lot number.
It's slow, error-prone, and the source document is never linked for audit. Winery invoices are also
messy: the same "pile" mixes real invoices, proformas (pay-in-advance, goods maybe not received yet),
Certificates of Analysis (COAs — batch/expiry certs, not receipts), and legal terms. Parsing "an
invoice" isn't the job; triaging a mixed pile and applying only what's a real landed receipt is.

Do-nothing cost: every receipt stays manual, duplicate materials proliferate (no dedup guard today),
landed cost is understated (shipping never allocated), and there's no document provenance on a lot.

**Product pressure test:** the highest-value slice is the *deterministic write path* + *human review*,
not the OCR. The LLM extraction is a convenience that pre-fills a form; if extraction is wrong, the
human catches it on the review screen and nothing corrupts the ledger. That framing keeps the money
code safe and lets us ship the OCR quality incrementally.

## Requirements

- MUST: `+ Ingest invoice` on the expendables/inventory page accepts one or more files (PDF + image),
  stores each as a **private** blob, and runs extraction server-side (never in the chat loop).
- MUST: classify each document as `invoice | proforma | coa | other` and apply ONLY receipts.
- MUST: one review screen per invoice — vendor + all extracted line items in a single editable panel;
  Confirm writes the vendor and all lots in one action (resumable/idempotent — a partial failure re-runs
  cleanly, never double-charges).
- MUST: proforma prompts "is this a landed receipt?" — Yes → intake as a normal receipt; No → do not intake.
- MUST: before creating a new material, fuzzy-match each line against existing expendables AND equipment
  (name + vendor item code); on a likely match, force a per-line choice: "add to existing stock" vs
  "create new" (dedup guard).
- MUST: allocate shipping/handling/surcharge proportionally across line items into per-unit landed cost
  (flows through `receiveSupplyCore` → `emitApExportForReceipt`).
- MUST: add a non-doseable `EQUIPMENT` material category/family so spare-parts lines (e.g. stainless
  fittings) have a home and can NEVER be dosed into wine / hit wine COGS.
- MUST: COAs attach batch/expiry to the matched lot by Lot No.; T&C/legal stored as a vendor reference
  doc, not intaken.
- MUST: stamp each lot with the invoice currency (no FX conversion); store the source document linked
  to the created lot(s) + vendor for audit.
- MUST: the assistant can trigger the same flow ("add these to inventory") and land the user on the
  review screen (also satisfies the `verify:ai-native` core→tool guard).
- SHOULD: extraction handles image-only/scanned PDFs (Claude vision via native `document`/`image` blocks).
- SHOULD: staging persists so a half-reviewed invoice survives a page reload.
- SHOULD: source-document pane beside the line grid + low-confidence fields flagged (trust/verification —
  elevated from NICE per design review; the human can't verify what they can't see).
- SHOULD: pre-commit summary showing the blast radius (vendor + N lots + A/P count + total) before Confirm.
- SHOULD: human can re-classify a misclassified document so it still reaches the intake gate (council).
- NICE: remember the vendor's item code → material mapping so re-orders auto-match next time.

## Scope Boundaries

**In scope:** upload + private-blob storage of PDFs/images; LLM extraction + classification; one-screen
per-invoice review with edit + dedup decisions; deterministic apply through existing cores; new
`EQUIPMENT` category (non-doseable); landed-cost allocation into unit cost; COA lot/expiry attach;
document provenance; an assistant `ingest_documents` write tool that routes to the review screen.

**Out of scope (and why):**
- **Gmail connector / inbound email** — explicit fast-follow; upload path first (user decision).
- **Shipping as its own A/P GL line** — today `emitApExportForReceipt` emits one event per lot
  (`amount = qty × unitCost`); a distinct shipping line needs an `ApExportEvent` extension. We bake
  shipping into unit cost (correct capitalized inventory cost + correct total payable). Flagged as a
  decision + risk; revisit if the accountant needs shipping broken out.
- **Purchase-order / "expected goods" tracking** for non-landed proformas — a No answer simply doesn't
  intake; we don't build a PO lifecycle.
- **FX conversion** — currency stamped as-is per lot.
- **Equipment maintenance/asset lifecycle** — `EQUIPMENT` is a stock/supply category for parts, not a
  fixed-asset register.
- **Cross-batch / standalone COA attach** — a COA is matched to its lot only within the same ingestion
  session; a COA uploaded in a LATER batch than its invoice won't auto-attach. Fast-follow (manual attach).
- **Mixed-currency within one invoice** — validated/rejected, not supported (one currency per document).
- **Orphaned-blob garbage collection** — an upload whose extraction later fails leaves a private blob;
  no GC job in v1 (cheap; revisit if it accumulates).

## Research Summary

### Codebase Patterns
- **Intake cores** (`src/lib/cellar/materials.ts`): `createStockMaterialCore` (new material + opening
  costed `SupplyLot`), `receiveSupplyCore:428` (restock → new `SupplyLot`, `unitCost` is already
  per-stock-unit, emits A/P inside the same tx at :472), `updateMaterialCore`. `receiveSupplyCore` does
  NOT compute weighted-average — that's read-only display math in `src/lib/cost/intake-cost.ts`
  (`weightedAvgUnitCost:41`, `deriveOpeningLot:22`, all pure/unit-tested, D14 unknown≠$0).
- **A/P emit** (`src/lib/accounting/ap-emit.ts:30`): `emitApExportForReceipt(supplyLotId,{vendorName,terms},tx)`
  writes ONE immutable `ApExportEvent`, `amount = qtyReceived × unitCost` (:61), idempotent
  (`postingKey = ap:<lotId>`), withheld unless `unitCost != null && inv && ap && vendorId`. **No line
  breakdown, no separate shipping line** → shipping baked into `unitCost` flows in cleanly.
- **Vendors** (`src/lib/vendors/vendors.ts`): `findOrCreateVendorCore:47` (dedup by `@@unique[tenantId,name]`),
  `findVendorsByName:175`; pure two-directional matcher `matchVendorsByName` in `vendors-shared.ts:171`.
- **Confirm/human-in-the-loop** (`src/lib/assistant/confirm.ts`): `signProposal`/`signResume` HMAC
  (`BETTER_AUTH_SECRET`), 5-min single-use tokens; committers in `commit.ts` (`COMMITTERS` map, nonce
  burned via `assistantConfirmation` insert). `propose_work_order` proves multi-row payloads carry
  inline with no size ceiling — but for a multi-doc, editable, per-line-dedup batch we prefer DB staging.
- **Anthropic one-shot** (`src/lib/fieldnotes/ai.ts:87`): `messages.create` with
  `output_config.format.type:"json_schema"` (structured output). Model literal `claude-opus-4-8`
  (copy-pasted in `run.ts:19`, `ai.ts:15`, `compliance/llm.ts:10`; no shared helper — factor one).
  Chat loop `run.ts` is **text-only** (no image blocks) → extraction must be its own endpoint.
- **Block builder** (`scripts/feedback-attachment-images.ts`): `selectImagesForModel:58` builds base64
  `image` blocks (caps: 4 imgs / 3.5MB each / 9MB total; PNG+JPEG only; **PDF explicitly rejected**).
  Native Anthropic `document` (base64 PDF) blocks are used nowhere → net-new, but slot next to this
  same blob-fetch/base64 shape.
- **Blob** (`src/lib/attachments/blob.ts`): `putPrivateImage`, `validateAndStripImage`, `getPrivateBlob`
  — **images only**; needs a PDF content-type branch. Upload route pattern:
  `src/app/api/feedback/attachments/route.ts` (`runtime="nodejs"`, private).
- **Multi-row UI models:** in-chat `WorkOrderProposalDetails` (`AssistantChat.tsx:1163`); full-page
  editable multi-row `WorkOrderBuilderClient.tsx`; `Modal`/`Button` primitives via
  `ExpendablesClient.tsx` / `VendorsClient.tsx`.

### Taxonomy landmine (governed cost code)
`src/lib/cellar/material-taxonomy.ts`: `MATERIAL_CATEGORIES:15` = `[ADDITIVE, CLEANING_SANITIZING,
PACKAGING, OTHER]` (all `String` columns — **not** Postgres enums, so no enum migration).
`isDoseableCategory:133` is a **denylist**: `category !== "CLEANING_SANITIZING" && category !== "PACKAGING"`
— so a NEW category is doseable-by-default. **The one load-bearing edit** is adding `EQUIPMENT` to that
exclusion; it transitively protects all ~8 WORKORDER-3 call-sites (the real seam is
`src/lib/work-orders/execute.ts:363`). `CATEGORY_LABELS`, `KIND_TO_CATEGORY`, `KIND_TO_SUBLABEL` are
exhaustive `Record<>`s → TS forces updates. Invariant note:
`docs/architecture/invariants/WORKORDER-3-maintenance-supply-is-overhead.md`.

### Schema facts
`CellarMaterial:1975` has **no** SKU/vendorItemCode field (genuine add; keep OUT of the
`@@unique[tenantId,kind,normalizedKey]`). `SupplyLot:2630` has `lotCode` (supplier lot string) but
**no expiry** field (genuine add). Both models: `vendorId` is a composite-tenant FK enforced in raw
SQL (K11) → any raw-SQL insert MUST run inside `runInTenantTx`/`runInTenantRawTx` (guarded by
`verify:raw-sql`). New columns are RLS-neutral (existing `tenant_isolation` policy covers them); keep
nullable.

### Guardrails that will gate this
- `verify:ai-native` — any file named `*-core.ts` exporting a `*Core` symbol MUST be reachable from an
  assistant tool (or allow-listed). → wire the `ingest_documents` tool to the extraction/apply core.
  Also regenerates `docs/architecture/assistant-coverage.md` (stale = fail).
- `verify:cost` (Demo Winery) — re-prove COST-1/COST-2 after touching `unitCost`/A/P/capitalization.
- `verify:raw-sql` — vendor-FK raw SQL must use tx clients.
- `verify:invariants` / `verify:parity` — new invariant/parity notes need resolvable `verify:`/`evidence`.
- Migration workflow: OWNER via `DATABASE_URL_UNPOOLED`; columns-only `ALTER TABLE ADD COLUMN`; Demo
  Winery for tests; Windows enum rule N/A here (String columns, not DB enums).

### Prior Learnings (from memory index)
- `server-action-actionerror-redacted-in-prod` — RETURN `{ok:false,error}`, never throw ActionError
  from these write actions (prod redacts thrown ActionErrors to opaque render errors).
- `prismabase-rls-zero-rows-gotcha` / `raw-sql-tenant-scoping` — RLS reads need the tenant GUC; use
  `runInTenantTx`, not ALS-only, for the vendor/material raw-SQL FKs.
- `build-in-main-checkout-not-worktrees` + `tsc-working-tree-drift-vs-ci` — build/verify in the MAIN
  checkout (has `.env`); commit the whole tree before pushing (CI checks out HEAD).
- `wo-inbox-assignee-id-resolution` — `assigneeId` canonical pattern; mirror "resolve at the choke
  point" for vendor/material matching.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Extraction location | Own server action + one-shot `messages.create` (json_schema), never the chat loop | Reuse `run.ts` tool loop | Chat loop is text-only; extraction is a single structured call, not a conversation |
| Doc → model input | Native Anthropic `document` (base64 PDF) + `image` blocks | Render PDF→PNG then image blocks | `document` blocks handle text + scanned PDFs directly; avoids a PDF-raster dependency on Windows |
| Review payload transport | **DB staging table** (`IngestedInvoice` + lines) | Inline signed proposal token (à la `propose_work_order`) | Multi-doc batch with per-line dedup edits + reload-survival + no 5-min TTL pressure; token stays fine for the thin assistant proposal |
| Apply atomicity | **One wrapping tx — inject a `tx` into the cores** (all lines + vendor + A/P in a single interactive transaction) | Resumable per-line (`createdSupplyLotId` skip) | REVERSED after council: the per-line marker is written OUTSIDE the core's tx, so a crash between core-commit and marker-write duplicates the lot + A/P (new `lotId` defeats the `postingKey` guard). `emitApExportForReceipt` already takes a `tx`, so thread an optional `tx` through `receiveSupplyCore`/`createStockMaterialCore`. True all-or-nothing. `createdSupplyLotId` stays only as a belt-and-suspenders audit field. |
| A/P bill granularity | **RESOLVED (user): per-lot bills; invoice # carried as a searchable QBO memo (`PrivateNote`), NOT a grouping key** | Aggregate one bill per invoice (new emit path) | Keeps existing per-lot emission (consistent with manual restock), no new aggregate path. Accurate QBO reality: `DocNumber = docNumberFor(ap:<lotId>)` is the per-lot idempotency key (`post-sweep.ts:159`) and rejects duplicates (err 6140) — so the invoice # can only ride in `PrivateNote` (searchable, N bills stay separate). Add `ApExportEvent.vendorInvoiceNumber` (nullable), thread `receiveSupplyCore` → `emitApExportForReceipt`, and map it to the Bill's `PrivateNote` in the QBO builder. Governed → `verify:cost` re-proof. |
| Equipment home + dose safety | New `EQUIPMENT` category (String) **+ flip `isDoseableCategory` to an ALLOWLIST** | Denylist + snapshot test | Council: a denylist on a free-text string is doseable-by-default → any typo/import/admin string bypasses wine-safety. Allowlist of known-doseable categories (`ADDITIVE`, `OTHER` — the current doseable set) preserves behavior for known values and makes EQUIPMENT + all unknowns non-doseable by default. |
| Shipping | Allocate proportionally into per-unit landed cost | Separate A/P shipping line | Baking freight into inventory unit cost is correct absorption costing (both council models confirm). The A/P concern is granularity (row above), not the cost math. |
| Duplicate invoice guard | Extract + store `vendorInvoiceNumber`; soft-warn on re-upload of same (vendor, invoice #) | Doc hash only | LLM/OCR makes hashes unstable; (vendor, invoice#) is the human-meaningful identity. Prevents re-uploading the same PDF minting duplicate lots + bills. |
| Proforma | Per-doc "is this a landed receipt?" gate | Always intake / never intake | Matches real workflow: proforma = pay-in-advance, goods may not be received |
| Writes | Always through existing cores + human confirm | New bespoke write path | Preserves costing/A/P/RLS/COGS invariants; LLM only pre-fills |

## Implementation Units

### Unit 1: Schema + migration (columns + staging tables)

**Goal:** Add the metadata columns and the staging/provenance/join tables the feature needs.
**Files:** `prisma/schema.prisma`, new `prisma/migrations/<ts>_invoice_ingestion/migration.sql`
**Approach:** Add nullable `expiresAt DateTime?` to `SupplyLot`. Add nullable `vendorInvoiceNumber String?`
to `ApExportEvent` (per-lot bill traceability — see A/P decision). **Vendor-scoped item codes (ChatGPT
smaller-improvement):** instead of a single global `CellarMaterial.vendorItemCode`, add a
`VendorMaterialCode` mapping table (tenant, `vendorId`, `materialId`, `code`, unique on
`(tenant, vendorId, code)`) — the same material bought from two vendors has two codes, and dedup match must
be vendor-scoped. **Provenance model (ChatGPT #7):** DROP the single `SupplyLot.sourceDocumentId` in favor of
a `LotDocument` join (tenant, `supplyLotId`, `ingestedInvoiceId`, `role` [INVOICE|COA]) so a lot can carry
its invoice AND one-or-more COAs; add a `sessionId`/`batchId` to `IngestedInvoice` so "same ingestion
session" COA matching is expressible; add a `fileSha256` to `IngestedInvoice` (the blob helper already
computes one — exact-file duplicate guard alongside (vendor, invoice#)). New tenant-scoped +
RLS models: `IngestedInvoice` (header: `blobUrl`, `fileName`, `mimeType`, `docType`, `status`
[pending|applied|discarded|held], `currency?`, `vendorId?`, `vendorNameRaw?`, **`vendorInvoiceNumber?`**
(council: duplicate-upload guard), `extractedJson Json`, `landedReceipt Boolean?`, `createdBy`, `createdAt`,
`appliedAt?`) and `IngestedInvoiceLine` (`ingestedInvoiceId`, `lineNo`, `descriptionRaw`, `vendorItemCodeRaw?`,
`qty?`, `unitRaw?`, `unitPrice?`, `lotNoRaw?`, `allocatedUnitCost?`, `matchDecision` [new|existing|skip],
`matchedMaterialId?`, `resolvedKind?`, `resolvedCategory?`, `createdSupplyLotId?`). Mirror the Phase-12
RLS pattern (`tenantId @default("")` + index + `tenant_isolation` policy) and Plan-069 composite-tenant
FK convention — **`IngestedInvoiceLine.ingestedInvoiceId`, `LotDocument.{supplyLotId,ingestedInvoiceId}`,
and `VendorMaterialCode.{vendorId,materialId}` are composite (tenant, id) FKs** so a system/owner write
can't create a cross-tenant pointer (council P3). The EXISTING-table column adds (`SupplyLot.expiresAt`,
`ApExportEvent.vendorInvoiceNumber`) follow the columns-only, RLS-neutral pattern in
`20260715100000_vendor_management_fields/migration.sql`; **the new tables (`IngestedInvoice`,
`IngestedInvoiceLine`, `LotDocument`, `VendorMaterialCode`) ship full `ENABLE ROW LEVEL SECURITY` +
`tenant_isolation` policy SQL** (NOT RLS-neutral — that phrase applies only to the column adds). Run `db:generate`.
**Tests:** none (schema); `verify:raw-sql` + `verify:naming` + `verify:tenant-isolation` must stay green.
Confirm `ENABLE ROW LEVEL SECURITY` + policy SQL is present for every new table (grep the migration).
**Depends on:** none
**Execution note:** touch `prisma/schema.prisma` in the MAIN checkout; a hook fires on schema/migration edits.
**Patterns to follow:** `prisma/schema.prisma:2630` (SupplyLot), `:3015` (Vendor); migration
`20260715100000_vendor_management_fields/`.
**Verification:** `npm run db:generate` clean; `npm run verify:raw-sql`; new columns nullable, absent from identity uniques.

### Unit 2: `EQUIPMENT` category (non-doseable) — the cost-safety edit

**Goal:** Give spare-parts a home that can never be dosed into wine or capitalized as wine COGS.
**Files:** `src/lib/cellar/material-taxonomy.ts`, `src/lib/cellar/additions-math.ts`, new invariant note
`docs/architecture/invariants/WORKORDER-<n>-equipment-never-doseable.md`, `INVARIANTS.md`
**Approach:** Add `EQUIPMENT` to `MATERIAL_CATEGORIES:15` and a label to `CATEGORY_LABELS:23`. **Critical
(council):** REWRITE `isDoseableCategory:133` from a denylist into an **allowlist** — return `true` only for
the known-doseable set (`ADDITIVE`, `OTHER` — the exact set doseable today), `false` for everything else.
This preserves behavior for all current categories, makes `EQUIPMENT` non-doseable, AND makes any future/typo/
imported/admin-entered category string non-doseable BY DEFAULT (a denylist would silently let it through to
wine COGS). Protects all ~8 WORKORDER-3 call-sites through the `execute.ts:363` seam. Add an `EQUIPMENT` (and optionally
`SPARE_PARTS`) `MaterialKind` to `MATERIAL_KINDS` (`additions-math.ts:24`) and the exhaustive
`KIND_TO_CATEGORY:31` + `KIND_TO_SUBLABEL:50` maps (TS enforces). Verify `materialScopeForTask:161`
never unions equipment into ADDITION/FINING/BOTTLE/CLEAN/SANITIZE pickers. **Close the coercion hole
(ChatGPT #6):** today `coerceMaterialCategory`/`categoryOf` map an unrecognized/typo'd category (`"EQUIPMNET"`)
to `OTHER`, which is doseable — so the allowlist alone still lets a typo become doseable. Add a non-doseable
`UNCLASSIFIED` category and route unknown/unmappable category input there (NOT `OTHER`), so an unrecognized
import is safe-by-default and simply can't be dosed until a human classifies it. Write the invariant note
("equipment + unclassified are non-doseable overhead, never wine COGS") with a resolvable `verify:`.
**Tests:** unit — `isDoseableCategory("EQUIPMENT") === false`; `categoryOf("EQUIPMENT") === "EQUIPMENT"`;
**allowlist semantics: an UNKNOWN/garbage category string (`"WIDGET"`, `""`, `"packaging "`) returns `false`
(non-doseable) — this is the council fix, proving default-deny**; an exhaustive snapshot over EVERY
`MATERIAL_CATEGORIES` value → its doseability (any future category is forced to opt IN to doseable
explicitly); a guard test asserting `execute.ts` rejects an
ADDITION task whose material category is `EQUIPMENT` (mirror existing WORKORDER-3 execute test);
`materialScopeForTask` excludes EQUIPMENT for doseable tasks.
**Depends on:** none
**Execution note:** test-first — write the `isDoseableCategory`/execute-seam assertions before editing.
**Patterns to follow:** `material-taxonomy.ts:133`; existing WORKORDER-3 test; `execute.ts:363`.
**Verification:** `npm run verify:work-orders-enhancements`; `npm run verify:invariants`; typecheck (exhaustive Records).

### Unit 3: Blob PDF branch + upload route

**Goal:** Accept and privately store PDFs (and images) for ingestion.
**Files:** `src/lib/attachments/blob.ts`, new `src/app/api/ingest/documents/route.ts`
**Approach:** Add `application/pdf` to the accepted content types with a `validateDocument` +
`putPrivateDocument(pathPrefix, tenantId, safeName, bytes)` path (size cap ~10MB; keep the metadata-strip
for images, skip it for PDFs). Mirror `feedback/attachments/route.ts` (`runtime="nodejs"`, private,
`hasBlobCredentials` guard → 503 with a clear message when unset). Return `{ blobUrl, mimeType, fileName }`
per file. Enforce a per-request file count cap.
**Tests:** unit — PDF within cap accepted; oversize rejected; disallowed type rejected; image path
unchanged. Route test: multipart of 2 files → 2 private blob refs; no creds → 503.
**Depends on:** none
**Patterns to follow:** `src/lib/attachments/blob.ts`, `src/app/api/feedback/attachments/route.ts`.
**Verification:** upload a sample from `docs/invoice examples/` in dev → private blob URL returned; `getPrivateBlob` round-trips.

### Unit 4: Anthropic document/image blocks + extraction core

**Goal:** Turn stored document blobs into structured, classified extraction results.
**Files:** new `src/lib/ingest/document-blocks.ts` (pure block builder + IO loader), new
`src/lib/ingest/extract-invoice.ts` (extraction orchestration), new `src/lib/ai/one-shot.ts`
(factored non-streaming `messages.create` helper)
**Approach:** In `document-blocks.ts`, port `selectImagesForModel` and add a `document` branch
(`{type:"document",source:{type:"base64",media_type:"application/pdf",data}}`) with PDF size caps; reuse
the Vercel-Blob private fetch. In `one-shot.ts`, factor the `fieldnotes/ai.ts:87` pattern (`model`
constant `claude-opus-4-8`, `output_config.format.type:"json_schema"`, missing-key guard). In
`extract-invoice.ts`, define the JSON schema — per document: `docType` (invoice|proforma|coa|other),
`vendor` {name, address, contactName?, phone?, email?}, `currency`, `invoiceNumber?`, `invoiceTotal?`
(for the reconciliation gate), `lines[]` {description, vendorItemCode?, qty, unit, unitPrice, lineTotal?,
lotNo?}, `charges` {shipping?, handling?, surcharge?, tax?}, and for a `coa` doc `{lotNo, expiry?, batch?}`
(ChatGPT #7 — COAs carry their own expiry/batch), `notes?`. **Extract ONE document per model call, bounded-parallel across the pile** (isolate a
bad/garbled doc so it can't poison the batch; each doc gets its own classification + error state). Return
typed `ExtractedDocument[]`. Also extract `vendorInvoiceNumber` (duplicate guard). **Validate a single
`currency` per document** (reject/flag mixed-currency in one invoice — never silently pick one); **flag any
line whose currency ≠ the tenant base currency for human attention** (no FX conversion — see Risks).
**De-risking spike FIRST:** confirm the Anthropic API accepts native `document` (base64 PDF) blocks for
`claude-opus-4-8`; if not, fall back to server-side PDF→PNG rasterization into `image` blocks (the block
builder abstracts this). Deterministic write? No — read-only extraction; NOT a `*Core` mutation. Name files
`extract-invoice.ts` / `document-blocks.ts` (NOT `*-core.ts`) to avoid over-triggering `verify:ai-native`;
the apply core in Unit 7 carries the ai-native wiring.
**Tests:** unit — schema-mapping + classification over FIXTURE JSON (mock the LLM response) for each
docType; charges/lotNo parsing; missing-key guard returns a typed error not a throw. NOTE these mock the LLM
— they prove schema-mapping, NOT that the real PDFs extract. Real-PDF proof lives in **Unit 12** (verified
snapshots + gated live run over all 8 files in `docs/invoice examples/`).
**Depends on:** Unit 3
**Patterns to follow:** `src/lib/fieldnotes/ai.ts:87`, `scripts/feedback-attachment-images.ts:58`.
**Verification:** live-run the extractor over the two real invoices → correct vendor, line count, lot numbers, currency; COA classified as `coa`; T&C as `other`.

### Unit 5: Landed-cost allocator + UOM normalization (pure) — MONEY-CRITICAL

**Goal:** Fold charges into each line's TOTAL cost, then normalize invoice qty+cost into the material's
canonical STOCK unit and per-stock-unit cost. (ChatGPT review: invoice units ≠ stock units — the #1 blocker.)
**Files:** new `src/lib/ingest/landed-cost.ts`, new `src/lib/ingest/normalize-line.ts`
**Approach — two stages, both pure:**
1. `allocateLandedCost(lines, charges)` distributes total charges proportionally by line subtotal
   (`qty×unitPrice`); returns each line's `landedLineTotal = lineTotal + share`. Handle zero-subtotal lines,
   all-zero charges (passthrough), unknown/absent price (leave unknown per D14 — never fabricate $0), rounding
   residual on the last priced line so Σ(landedLineTotal) == goods + allocatable charges.
2. `normalizeLineToStock({qty, packageUnit, landedLineTotal, stockUnit})` → `{ stockQty, unitCost }` by
   REUSING the existing `convert()` + `deriveOpeningLot` math in `src/lib/cost/intake-cost.ts`: a line of
   "2 × 25 kg" with a stock unit of `g` becomes `50000 g @ (landedLineTotal/50000)/g`. This is what makes
   inventory + cost correct. Unknown price → unknown unitCost (D14). Reject/flag a line whose `packageUnit`
   can't convert to the material's `stockUnit` (dimension mismatch) — never silently pass raw invoice qty.
**Tax:** excluded from capitalized landed cost by default BUT surfaced as an explicit invoice-level figure
that must be accounted for in the reconciliation gate (Unit 7), not silently dropped.
**Tests:** unit — proportional split + conservation incl. residual; **UOM: "2×25kg → 50000 g" qty AND
per-g cost incl. allocated freight (hand-checked)**; dimension-mismatch flagged; single line; zero charges;
unknown price stays unknown and absorbs no charge. Add cases to `verify:cost`.
**Depends on:** none
**Patterns to follow:** `src/lib/cost/intake-cost.ts` (`deriveOpeningLot`, `convert`, round8, D14).
**Verification:** `npm run test` + `npm run verify:cost`; hand-check `Sales Invoice SIV535475` (4 lines in G/KG, shipping $147.99) → correct per-stock-unit landed costs.

### Unit 6: Material dedup matcher (pure)

**Goal:** Surface likely-existing materials (expendables AND equipment) for a line to prevent duplicates.
**Files:** new `src/lib/cellar/material-match.ts`
**Approach:** `matchMaterials(candidates, {name, vendorId, vendorItemCode})` → ranked candidates: exact
**vendor-scoped** `VendorMaterialCode` match first (same vendor + code = highest confidence — ChatGPT: codes
are vendor-specific), then two-directional normalized-substring name match (mirror `matchVendorsByName` in
`vendors-shared.ts:171`), across all categories including EQUIPMENT. Return
`{materialId, name, category, confidence, reason}`. Pure; caller supplies the candidate list + the vendor's
code map (read via tenant-scoped query).
**Tests:** unit — exact SKU wins; two-directional fuzzy ("Lafazym Extract" ↔ stored "LAFFORT LAFAZYM
EXTRACT"); equipment candidate matched; no-match returns empty; ambiguous returns ranked multiple.
**Depends on:** Unit 1 (needs `vendorItemCode`)
**Patterns to follow:** `src/lib/vendors/vendors-shared.ts:171`.
**Verification:** unit suite green; feed the 4 Scott Labs lines against a seeded material list → correct match/no-match split.

### Unit 7: Staging + apply core (governed write)

**Goal:** Persist extracted invoices as editable staging, then apply one invoice through the cores (resumable/idempotent).
**Files:** new `src/lib/ingest/ingest-invoice-core.ts`, new `src/lib/ingest/actions.ts` (server-action wrappers),
`src/lib/cellar/materials.ts` (thread an optional injected `tx` into `receiveSupplyCore` +
`createStockMaterialCore` — governed refactor, keep existing call sites working via default `runInTenantTx`)
**Approach:** `createIngestedInvoiceCore(actor, {documents})` persists `ExtractedDocument[]` as
`IngestedInvoice` + lines (status `pending`; COA/other stored but flagged non-receipt).
`updateIngestedInvoiceLineCore` records human edits + per-line `matchDecision`
(new|existing|skip) + `matchedMaterialId` + resolved kind/category + the `landedReceipt` proforma answer.
`applyIngestedInvoiceCore(actor, {ingestedInvoiceId})`: (a) **concurrency claim (ChatGPT #4)** — at tx start,
compare-and-set `status pending → applying` with an affected-row check; 0 rows → already applying, return
`{ok:false,error}`; auto-revert to `pending` on failure. Enforce a line-count cap + explicit tx timeout.
(b) **proforma gate** — `docType==="proforma"` && `landedReceipt!==true` → `{ok:false,error}`.
(c) **reconciliation gate (ChatGPT #3)** — assert Σ(line `landedLineTotal`) + tax reconciles to the extracted
invoice total within a cent; on mismatch OR if any non-skipped line can't post A/P (unknown cost / missing
accounts), require an explicit human ack to proceed as **inventory-only / partial-A/P** — never silently
commit inventory with a partial payable. (d) `findOrCreateVendorCore(tx)`; then loop receipt lines —
**unified path (ChatGPT #2): `"new"` → `createStockMaterialCore` with ZERO opening stock, then for BOTH
`"new"` and `"existing"` call `receiveSupplyCore({materialId, qty: stockQty, unitCost, lotCode: lotNoRaw,
vendorId, terms, vendorInvoiceNumber}, tx)`** using the Unit-5-normalized `stockQty` + per-stock-unit
`unitCost`, so every line emits A/P uniformly through one UOM/cost path (`createStockMaterialCore` alone
emits NO A/P — verified `materials.ts:290`). The `vendorInvoiceNumber` is stamped on each `ApExportEvent`
and mapped to the QBO Bill's `PrivateNote` memo (searchable; per-lot bills stay separate). `"skip"` → nothing. On a **human-confirmed** `"existing"` match, backfill `vendorItemCode` onto the matched
only if absent (the re-order learning loop — gated on human confirm, never auto, so one bad OCR code can't
poison future dedup — council P2), writing it to `VendorMaterialCode` (vendor-scoped, ChatGPT). Attach COA
`expiresAt` to the matched lot by Lot No.; write a `LotDocument` row (role INVOICE, and COA rows) linking the
created lot to its source docs; stamp `currency`; mark invoice `applied` + `appliedAt`. **Return
`{ok, error?}` — never throw ActionError** (prod redaction learning).

**Atomicity model (REVISED after council — see Key Decisions):** the resumable per-line design is UNSOUND —
`createdSupplyLotId` is written outside the core's tx, so a crash between core-commit and marker-write
duplicates the lot + A/P (new `lotId` defeats the `postingKey` guard) AND later review edits desync the
already-frozen lots' landed-cost basis. Fix: **thread an optional `tx` (interactive Prisma transaction)
through `receiveSupplyCore` + `createStockMaterialCore`** (a small governed refactor: each currently calls
`runInTenantTx` internally → make them accept an injected tx and use it if present; `emitApExportForReceipt`
already takes a `tx`). `applyIngestedInvoiceCore` opens ONE `runInTenantTx` and passes it to vendor find-or-
create + every line's core call → true all-or-nothing (a failure on any line rolls back the whole invoice,
no partial lots/bills). **Pass `vendorInvoiceNumber` through `receiveSupplyCore` → `emitApExportForReceipt`
so every per-lot `ApExportEvent` is stamped with the invoice # (resolved A/P decision — lots group under one
invoice for reconciliation; also update the QBO export mapping to carry it).** `createdSupplyLotId` remains only as an audit field. **Tenant re-verification
(council P3):** before using `matchedMaterialId`/`vendorId` from the staging row, re-assert they belong to
the caller's tenant inside the tx (don't trust IDs a prior step stored). **Duplicate guard:** on
create/apply, if a `pending`/`applied` invoice already exists for the same (`vendorId`, `vendorInvoiceNumber`),
surface a soft warning (human decides). Name this file `ingest-invoice-core.ts` so it's the ai-native anchor
(Unit 9 wires the tool that imports it).
**Tests:** integration (Demo Winery, `runAsTenant`) — apply creates vendor + N lots; `existing` decision
routes to `receiveSupplyCore` (no dup material) and backfills `vendorItemCode` when absent; non-landed
proforma blocked; COA expiry attached to the right lot by lot no.; currency stamped (EUR case);
shipping-inclusive unitCost on lots; A/P amount = qty×landedUnitCost; double-apply rejected;
**atomic rollback — force a throw on line 3 of 4, assert ZERO lots and ZERO A/P events committed (staging
reverts to `pending`)**; **UOM — a "2×25kg" line into a `g`-stock material creates a 50000 g lot at the
freight-inclusive per-g cost (not qty=2)**; **new-material line ALSO emits an A/P bill (unified path, not just
existing)**; **reconciliation gate — line totals + tax ≠ invoice total blocks Confirm until human ack /
inventory-only**; **concurrency — two overlapping applies: the second sees `applying` and is rejected (no
double lots)**; **tenant re-verification — a `matchedMaterialId` from another tenant is rejected**;
**duplicate-invoice — same (vendor, invoiceNumber) OR same `fileSha256` surfaces a warning**; equipment line
lands as `EQUIPMENT` and is non-doseable.
**Depends on:** Units 1, 2, 5, 6
**Execution note:** governed money code → eng review; re-prove `verify:cost`.
**Patterns to follow:** `src/lib/cellar/materials.ts:428`, `src/lib/accounting/ap-emit.ts:30`, `runInTenantTx`.
**Verification:** `npm run verify:cost` green (55/55 class); integration script reads back vendor+lots+A/P for a Demo-Winery apply.

### Unit 8: Review screen UI (`+ Ingest invoice`)

**Goal:** One human-reviewed screen per invoice: edit lines, resolve dedup, answer proforma, confirm.
**Files:** `src/app/(app)/setup/expendables/ExpendablesClient.tsx` (add the `+ Ingest invoice` entry),
new `src/app/(app)/setup/expendables/ingest/*` (upload + review route/client), server-action calls into
`src/lib/ingest/actions.ts`
**Approach:** `+ Ingest invoice` opens a multi-file picker → POST to the Unit-3 route → call
`createIngestedInvoiceCore` (extraction) → navigate to the review screen. Review screen: one panel per
document; non-receipts (COA/other) shown as "attached, not intaken" with the COA→lot match preview.
**Each document's classification is editable — the human can RE-CLASSIFY (e.g. an invoice the model tagged
`other`/`proforma` can be pulled into intake), so a misclassification never silently skips the human gate
(council P3).** Receipts show a vendor panel (matched/existing vs create) + an editable line grid (description,
qty, unit, unit price, lot no., kind/category, dedup control "add to existing X ▾ / create new", allocated
landed cost preview, currency badge — foreign-currency lines flagged). Proforma shows the "Is this a landed
receipt?" toggle gating Confirm, with copy making clear **Yes = goods physically received in full** (guards
the "click yes just to pay in advance → ghost inventory" failure mode; partial receipts are out of scope).
Confirm → `applyIngestedInvoiceCore`; surface returned `{error}` inline (no thrown ActionError). Model
the grid on `WorkOrderBuilderClient.tsx`; reuse `Modal`/`Button` and DESIGN.md tokens (no hardcoded
colors — check `/styleguide`).

**Design-review requirements (folded):**
- **Hierarchy:** receipts primary; COA/other collapsed as "supporting docs (N) — attached", so the human
  isn't scrolling past a T&C PDF to reach the invoice.
- **Trust affordance (elevate to SHOULD):** a source-document pane/toggle beside the grid so the human can
  eyeball qty/price/lot against the original PDF; **low-confidence extracted fields visually flagged** for
  review (don't render LLM output as if it were typed by a human).
- **Pre-commit summary:** before Confirm, show the blast radius — "Create vendor X · 2 new materials · 2
  restocks · N A/P bill(s) · total $Y (currency)" — so the write is legible, not a mystery button.
- **States:** per-document extraction progress ("reading invoice 2 of 5"); per-doc extraction-failure →
  inline "couldn't read this — enter manually / retry"; no-OCR-creds → graceful "OCR unavailable, add
  manually" (never a dead end).
- **Proforma gate:** unmissable, NOT pre-checked, BLOCKS Confirm until answered.
- **Post-commit:** success state links to the created lots + the existing timeline Undo path (reversibility).
- **Responsive:** the dense line grid collapses to per-line cards on tablet/narrow (cellar-floor use).
**Tests:** component/logic tests for the pure view-model bits (repo has no jsdom/RTL — keep UI logic in
pure helpers and test those; UI itself is manual browser QA per repo convention).
**Depends on:** Units 3, 4, 7
**Execution note:** browser QA in Demo Winery only, `QA-*` fixtures, clean up after; `verify:naming` green before+after.
**Patterns to follow:** `WorkOrderBuilderClient.tsx`, `ExpendablesClient.tsx`, `VendorsClient.tsx`.
**Verification:** live browser flow — upload `Sales Invoice SIV535475` → review shows 4 lines + shipping allocated → Confirm → 4 lots + vendor in DB (verify via `runAsTenant` read-back).

### Unit 9: Assistant `ingest_documents` tool (+ ai-native wiring)

**Goal:** Let the assistant trigger ingestion ("add these to inventory") and satisfy `verify:ai-native`.
**Files:** new `src/lib/assistant/tools/ingest-documents.ts`, `src/lib/assistant/registry.ts`,
`src/lib/assistant/commit.ts`, `docs/architecture/assistant-coverage.md` (regen)
**Approach:** A `kind:"write"` tool that accepts references to already-uploaded document blobs, calls the
Unit-4 extractor + `createIngestedInvoiceCore`, and returns a proposal whose commit navigates to the
review screen (`CommitResult.navigate` deep link) rather than doing rich in-chat editing (deterministic
edits belong on the review screen). Register in `ALL_TOOLS`; add the committer to `COMMITTERS`. Importing
`ingest-invoice-core.ts` here puts it in the assistant import closure → `verify:ai-native` satisfied.
Regenerate `docs/architecture/assistant-coverage.md`.
**Tests:** golden eval — tool proposes (does not mutate) and returns a navigate target; committer creates
the staging record; unknown/oversized blob refs rejected cleanly.
**Depends on:** Units 4, 7
**Patterns to follow:** `src/lib/assistant/tools/create-vendor.ts`, `registry.ts:102`, `commit.ts:69`.
**Verification:** `npm run verify:ai-native` green (core reachable; coverage doc not stale); assistant eval passes.

### Unit 10: COA attach + document provenance surfacing

**Goal:** Close the loop — COA lot/expiry lands on the lot; the source document is viewable from the material/lot.
**Files:** `src/lib/ingest/ingest-invoice-core.ts` (COA match already in Unit 7 — here: the read/surface
side), material/lot history UI (`src/app/(app)/setup/expendables/*` or the vessel/material history view)
**Approach:** Match COA `lotNo` → receipt line `lotNoRaw` with a **normalized** comparison (case-fold, strip
spaces/hyphens; tolerate common OCR confusions) and **constrain candidates to the same ingestion session +
same vendor/material** so a colliding lot number can't attach to the wrong stock (council P3); ambiguous or
no-match → leave unattached (manual attach later), never guess. On match set `SupplyLot.expiresAt` and add a
`LotDocument` (role COA) row (a lot can hold its INVOICE + N COA links). Surface all linked docs via a
**tenant-scoped auth check** (not a raw public blob URL — verify the caller's tenant owns the doc before
streaming bytes) and expiry on the material's lot history. Store T&C/other as a vendor-linked reference.
**Tests:** unit — COA→lot match by lot no. (and no-match safe); provenance link resolves for the tenant only.
**Depends on:** Units 7, 8
**Patterns to follow:** existing lot/material history views; `getPrivateBlob`.
**Verification:** apply the Scott Labs invoice + its 3 COAs → matched lots show expiry; source PDF opens (tenant-scoped).

### Unit 11: Verification sweep + registers

**Goal:** Prove the whole thing green and keep the brain honest.
**Files:** `docs/architecture/parity/*.md` (new capability note if claiming coverage),
`docs/architecture/assistant-coverage.md`, `INVARIANTS.md`, `.env.example` (confirm no new vars)
**Approach:** Run the full gate set; write a parity note with a real `evidence:` path if claiming
coverage; confirm `ANTHROPIC_API_KEY` / `BLOB_READ_WRITE_TOKEN` / `BETTER_AUTH_SECRET` already exist in
`.env.example` (they do — no new secrets). Update `NOW.md` per repo convention.
**Tests:** the verify suite is the test.
**Depends on:** Units 1–10
**Verification:** `verify:cost`, `verify:ai-native`, `verify:invariants`, `verify:parity`, `verify:raw-sql`,
`verify:naming`, `verify:work-orders-enhancements`, typecheck, `next build` all green.

### Unit 12: Real-document acceptance suite (the "does it actually work on MY invoices" gate)

**Goal:** Prove the pipeline works end-to-end against the ACTUAL files in `docs/invoice examples/`, not just
mocked fixtures — this is the definition of done. LLM extraction can't run deterministically in CI, so split
it two-tier: a human-verified snapshot drives the deterministic money path in CI; a gated live run guards
extraction quality.
**Files:** new `scripts/ingest-capture-snapshot.ts` (STEP 1 — the FIRST thing, run right after Unit 4), new
`qa/ingest-fixtures/*.json` (per-doc verified extraction snapshots) + `qa/ingest-fixtures/SNAPSHOT-VERIFIED.md`
(human sign-off log), new `test/ingest-acceptance.test.ts` (CI, deterministic), new
`scripts/ingest-live-acceptance.ts` (gated, live)
**Approach:**

**STEP 1 (FIRST — runs the moment Unit 4's extractor exists, BEFORE Units 5/6/7/10 tests are written):
capture-once verified snapshot.** New `scripts/ingest-capture-snapshot.ts` runs the REAL extractor over all
8 files in `docs/invoice examples/` live, writes each raw result to `qa/ingest-fixtures/<file>.json`, and
prints a per-doc summary for review. **STOP — human-verify every snapshot** (does the docType, vendor,
each line's qty/unit/price, lot numbers, currency, shipping match what's actually on the PDF? — especially
the two image-only scans `crush to cellar.pdf` / `Laffort test strips.pdf`, whose expected values ONLY exist
once verified here). Mark each verified file (e.g. a `"_verified": true` field or a checked-in
`SNAPSHOT-VERIFIED.md` log). These verified snapshots become the **source of truth / fixture** that Units
5, 6, 7, and 10 write their deterministic tests against — so the real docs drive the whole money path, not
invented fixtures. Do NOT proceed to steps 2–3 (or trust downstream tests) until the snapshots are verified.

**STEP 2 — deterministic acceptance (CI, no API key):** feed the VERIFIED snapshots through allocate →
normalize → `applyIngestedInvoiceCore` in Demo Winery and assert the EXACT end-state (see matrix below).
Proves the money path on real-doc-derived data every CI run.

**STEP 3 — gated live acceptance (`scripts/ingest-live-acceptance.ts`, needs `ANTHROPIC_API_KEY`):** re-extract
the 8 real docs and assert TOLERANT invariants vs the verified snapshot (docType exact; vendor/lot-numbers/
currency/line-count exact; prices within a small tolerance) → catches extraction drift without brittle
exact-match on every field. Run before ship + on model changes, not in the fast CI path.

**Expected acceptance matrix (from the real files):**
- `Sales Invoice SIV535475` → `invoice`, USD, vendor ≈ Scott Laboratories / Crush2Cellar, **4 lines** with
  lots `{2230517, 2025030373, 2250423, 2240110}`, shipping **$147.99**, subtotal **$533.78**. After apply:
  4 additive materials/lots, each `unitCost` = (line + allocated shipping share) normalized to the material's
  stock unit; 4 A/P events tagged `SIV535475`; Σ reconciles to $533.78.
- `Proforma-W583.1869` → `proforma`, EUR, vendor NexaParts B.V., **2 EQUIPMENT lines** (dairy fittings),
  shipping **€40**, total **€767.16**. Proforma gate blocks until landed-receipt=Yes; on Yes → 2 `EQUIPMENT`
  materials that are **non-doseable**, lots stamped EUR.
- 3 COA files → `coa`, lots `{2230517, 2025030373, 2240110}` → attach `expiresAt` to the matching Scott Labs
  lots; unmatched/colliding lot → left unattached.
- `NexaParts …Terms and Conditions` → `other` → NOT intaken (stored as vendor reference).
- `crush to cellar.pdf`, `Laffort test strips.pdf` (image-only) → prove VISION extraction returns a
  classification + fields; expected values pinned from the human-verified snapshot (step 1).

**Tests:** the deterministic acceptance IS the test; the live script asserts tolerant invariants + prints a
diff vs snapshot.
**Depends on:** STEP 1 (snapshot capture) depends ONLY on Unit 4 and runs FIRST — pull it forward so its
verified output seeds Units 5/6/7/10 tests. STEPS 2–3 depend on Units 5, 6, 7, 10.
**Execution note:** run `scripts/ingest-capture-snapshot.ts` + human-verify BEFORE writing the Unit 5/6/7/10
tests, so those tests assert against real extracted values, not invented fixtures.
**Verification:** verified snapshots checked in + signed off in `SNAPSHOT-VERIFIED.md`; `npm test
test/ingest-acceptance.test.ts` green in CI (no key); `npx tsx scripts/ingest-live-acceptance.ts` passes
against the 8 real docs before ship.

## Test Strategy

**Unit tests (pure, no Prisma):** landed-cost allocation (conservation + rounding), material dedup
matching (two-directional + SKU), taxonomy (`isDoseableCategory("EQUIPMENT")` false + execute-seam
guard), extraction schema-mapping/classification over fixture JSON (LLM mocked).
**Integration (Demo Winery, `runAsTenant`):** `applyIngestedInvoiceCore` end-to-end — vendor + lots +
A/P event + COA expiry + currency + dedup routing + proforma gate + idempotency + equipment non-doseable.
**Real-document acceptance (Unit 12) — the headline gate:** every file in `docs/invoice examples/` drives
the pipeline. Verified extraction snapshots → deterministic CI acceptance (exact DB end-state) + a gated live
run (tolerant invariants) that proves the ACTUAL PDFs — including the two image-only scans — extract and
apply as expected. Not manual vibes: pinned expected values.
**Manual / browser QA (Demo Winery, `QA-*` fixtures):** the two real invoices through the review screen,
plus the COA/T&C/proforma mix; verify DB writes with a `runAsTenant` read-back script.
**Governed re-proof:** `verify:cost` after the unitCost/A/P touch.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Invoice qty/cost passed as stock qty/cost (no UOM normalization) → catastrophic inventory + cost error | ~~HIGH~~→LOW | HIGH | FIXED (ChatGPT #1): Unit 5 `normalizeLineToStock` via `convert`/`deriveOpeningLot`; dimension-mismatch flagged; `verify:cost` cases |
| New-material lines silently skip A/P (asymmetry with restock) | ~~MED~~→LOW | MED | FIXED (ChatGPT #2): unified path — create material @ zero stock, then `receiveSupplyCore` for every line |
| Inventory committed with only partial payable (silent A/P withholding) | ~~MED~~→LOW | MED | FIXED (ChatGPT #3): invoice-level reconciliation gate + explicit inventory-only/partial-A/P human ack; tax surfaced |
| Concurrent double-confirm mints duplicate lots | ~~MED~~→LOW | MED | FIXED (ChatGPT #4): `pending→applying` compare-and-set claim + tx timeout + line cap |
| Typo'd category coerced to `OTHER` (doseable) despite the allowlist | ~~MED~~→LOW | HIGH | FIXED (ChatGPT #6): unknown → non-doseable `UNCLASSIFIED`, never `OTHER` |
| New/unknown category left doseable (allowlist regression) | LOW | HIGH | Unit 2 default-deny allowlist + exhaustive snapshot + execute-seam guard; `verify:work-orders-enhancements` gates |
| LLM mis-extracts qty/price/lot → bad cost | MED | MED | Nothing writes without the human review screen; show extracted vs original; unknown price stays unknown (D14), never $0 |
| Shipping baked into unit cost hides shipping as a GL line (accountant) | MED | MED | Absorption costing is correct (council confirms); real concern is A/P granularity (below), not the cost math |
| A/P bill granularity — one bill per lot (council P1) | HIGH | MED | RESOLVED (user): keep per-lot, stamp each `ApExportEvent` with `vendorInvoiceNumber` so lots group under one invoice downstream; no new emit path |
| Multi-line apply partially commits → some lots/bills created, some not (council P1) | ~~MED~~→LOW | HIGH | FIXED: one wrapping interactive `tx` injected into the cores → atomic all-or-nothing rollback; resumable-marker design was unsound and dropped |
| Proforma "landed receipt? Yes" clicked just to pay-in-advance → ghost inventory (council P2) | MED | MED | UI copy: Yes = goods physically received in full; partial receipts out of scope; provenance + human gate |
| Mixed-currency COGS roll-up (no FX) | LOW | MED | Pre-existing app behavior (lot currency stamped today); foreign-currency lines flagged for human; FX out of scope per user |
| Duplicate invoice re-uploaded → duplicate lots + bills (council P1) | MED | MED | `vendorInvoiceNumber` soft-dedup warning on (vendor, invoice#); human decides |
| LLM extraction cost/latency on a big pile | MED | LOW | One opus call per doc, bounded-parallel; caps on doc size/count; human review is the gate |
| Signed-token / staging size or TTL | LOW | LOW | Chose DB staging over the 5-min token specifically to avoid this |
| Raw-SQL vendor/material FK writes bypass tenant GUC | LOW | HIGH | All FK writes inside `runInTenantTx`; `verify:raw-sql` gates |
| Image-only/scanned PDF extraction weaker than text PDFs | MED | LOW | Native `document` blocks do vision; human review catches gaps; can add per-page image fallback later |
| `verify:ai-native` fails on the new `*-core.ts` | LOW | LOW | Unit 9 wires `ingest_documents` → core in the import closure; regen coverage doc |
| Prod ActionError redaction on the apply action | LOW | MED | Cores/actions RETURN `{ok:false,error}`, never throw (prior learning) |

## Success Criteria

- [ ] `+ Ingest invoice` accepts a mixed pile (PDF text + scanned + image), stores each as a private blob.
- [ ] Each document is classified; only invoices + confirmed-landed proformas intake; COA/T&C do not.
- [ ] One review screen per invoice: edit lines, resolve dedup (existing vs new across expendables AND
      equipment), answer the proforma gate, see allocated landed cost + currency; Confirm writes vendor + all lots (resumable/idempotent).
- [ ] Shipping allocated into per-unit landed cost; A/P `ApExportEvent` total matches goods + shipping.
- [ ] `EQUIPMENT` category exists and is provably non-doseable (test + execute-seam guard).
- [ ] COA lot/expiry attached to the matched lot; source document linked to created lots (tenant-scoped).
- [ ] Assistant `ingest_documents` triggers the flow and lands the user on the review screen.
- [ ] `verify:cost`, `verify:ai-native`, `verify:invariants`, `verify:parity`, `verify:raw-sql`,
      `verify:naming`, `verify:work-orders-enhancements`, typecheck, and `next build` all green.
- [ ] **Real-document acceptance (Unit 12) passes on ALL 8 files in `docs/invoice examples/`:** deterministic
      CI acceptance from verified snapshots (exact DB end-state) green, AND the gated live run reproduces the
      expected classification + extraction (incl. the two image-only scans) before ship.
- [ ] No regressions in existing tests.

## Confidence Check

| Section | Confidence | Notes |
|---------|-----------|-------|
| Problem Frame | HIGH | Real docs inspected; mixed-pile reality confirmed |
| Scope Boundaries | HIGH | User decisions locked; Gmail/PO/FX explicitly deferred |
| Implementation Units | HIGH | Exact cores, schema fields, guard call-sites, and Anthropic plumbing confirmed by research |
| Test Strategy | MEDIUM | Pure/integration strong; UI is manual-QA-only (no jsdom/RTL in repo) — keep logic in pure helpers |
| Risk Assessment | HIGH | Denylist landmine + prod-redaction + raw-SQL FK risks named with concrete mitigations |

## Worktree Parallelization Strategy

| Step | Modules touched | Depends on |
|------|-----------------|-----------|
| U1 schema/migration | `prisma/` | — |
| U2 EQUIPMENT taxonomy | `src/lib/cellar/material-taxonomy.ts`, `additions-math.ts`, `docs/architecture/invariants/` | — |
| U3 blob PDF + upload route | `src/lib/attachments/`, `src/app/api/ingest/` | — |
| U4 extraction + blocks | `src/lib/ingest/`, `src/lib/ai/` | U3 |
| U5 landed-cost | `src/lib/ingest/` | — |
| U6 material matcher | `src/lib/cellar/` | U1 |
| U7 staging + apply core | `src/lib/ingest/` | U1,U2,U5,U6 |
| U8 review UI | `src/app/(app)/setup/expendables/` | U3,U4,U7 |
| U9 assistant tool | `src/lib/assistant/` | U4,U7 |
| U10 provenance/COA | `src/lib/ingest/`, history UI | U7,U8 |
| U11 verify sweep | docs/registers | U1–U10 |
| U12 real-doc acceptance | `qa/ingest-fixtures/`, `test/`, `scripts/` | STEP 1 snapshot: U4 only (runs FIRST); STEPS 2–3: U5,U6,U7,U10 |

- **Lane A:** U1 → U6 → (U7). **Lane B:** U2 (independent). **Lane C:** U3 → U4 → (U7). **Lane D:** U5 (independent).
- Launch A, B, C, D in parallel. **As soon as U4 lands, run U12 STEP 1 (capture + human-verify the real-doc
  snapshots) — it gates the U5/U6/U7/U10 test fixtures.** Barrier at **U7** (needs U1/U2/U5/U6). Then U8 →
  U9/U10 (mostly parallel) → U12 steps 2–3 + U11 last.
- **Conflict flag:** U4, U5, U7, U10 all write under `src/lib/ingest/` — keep them same-lane or coordinate;
  don't run U7 in a separate worktree from U4/U5.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 1 P1 (apply atomicity) + 3 P2/P3 + 5 test gaps — all folded |
| Outside Voice (Council) | Codex gpt-5.4 + Gemini 3.1 Pro | Cross-LLM 2nd opinion | 1 | ISSUES_ADDRESSED | 2 P1 reversed prior decisions (atomicity unsound → inject tx; denylist → allowlist); A/P-per-lot surfaced as open decision; +6 P2/P3 folded; 1 false positive (model-name) discarded |
| Design Review | plan-stage | UI/UX gaps | 1 | ADDRESSED | 7 UX reqs folded into Unit 8 (hierarchy, source pane, pre-commit summary, states, proforma gate, post-commit undo, responsive) |
| Outside Voice 2 (ChatGPT) | user-supplied | Money-critical gaps | 1 | ISSUES_ADDRESSED | 2 money-critical bugs BOTH prior reviews missed (UOM #1, A/P asymmetry #2) + 5 more; all folded; QBO grouping corrected (re-decision) |
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | not run (scope locked with user) |

**OUTSIDE VOICE 2 (ChatGPT) — verified against code + folded:**
- **#1 UOM (money-critical):** invoice qty ≠ stock qty. Unit 5 now normalizes via `convert`/`deriveOpeningLot`. ✅
- **#2 A/P asymmetry:** `createStockMaterialCore` emits no A/P (verified `materials.ts:290`). Unified apply path. ✅
- **#3 reconciliation gate:** Σ lines + tax must tie to invoice total, else explicit inventory-only ack. ✅
- **#4 concurrency:** `pending→applying` compare-and-set claim + timeout + line cap. ✅
- **#5 QBO grouping — I WAS WRONG:** `DocNumber = docNumberFor(ap:<lotId>)` is the per-lot idempotency key
  (`post-sweep.ts:159`); the invoice # can only be a searchable `PrivateNote`, NOT a grouping key (QBO rejects
  duplicate DocNumbers, err 6140). Per-lot + invoice-memo = traceable, NOT one payable. → **re-decision.**
- **#6 category coercion:** typo → `OTHER` (doseable). Now → non-doseable `UNCLASSIFIED`. ✅
- **#7 provenance too thin:** added `LotDocument` join (INVOICE/COA roles) + session id + COA expiry in schema. ✅
- Smaller: vendor-scoped `VendorMaterialCode` table; `fileSha256` exact-file dedup. ✅

**COUNCIL (outside voice) — key resolutions:**
- **P1 atomicity (both models):** resumable per-line marker is written outside the core's tx → duplicate lot+A/P
  on crash. REVERSED → inject one interactive tx into the cores (atomic). ✅ folded.
- **P1 dose safety (both):** denylist is doseable-by-default. REVERSED → allowlist (default-deny). ✅ folded.
- **P1 A/P fragmentation (both):** one bill per lot, not per invoice. → RESOLVED (user): per-lot, each stamped with `vendorInvoiceNumber` (groupable downstream; no new emit path). ✅ folded.
- **P2/P3 folded:** tenant re-verification of injected IDs + composite FKs; reclassification override; constrained/
  normalized COA lot match; vendorItemCode backfill gated on human confirm; duplicate-invoice guard; ghost-inventory copy.
- **Discarded:** Gemini "claude-opus-4-8 doesn't exist / PDF needs 3.5 Sonnet" — training-cutoff artifact; model is real + in use. (Added a document-block support spike as cheap insurance.)

**DECISIONS RESOLVED:**
1. Apply-atomicity → inject one `tx` through the governed cost cores (correctness fix). ✅
2. A/P bill granularity → per-lot bills; invoice # as a searchable QBO `PrivateNote` memo (user, with
   accurate QBO info — N bills stay separate, not one payable). ✅

**VERDICT:** ENG + COUNCIL + DESIGN + ChatGPT outside voice complete; every money-critical finding folded and
verified against source; both decisions resolved. **Build-ready.** Unit 5 (UOM) + Unit 7 (apply) are governed
money code → `/work` must keep `verify:cost` green and treat these as eng-review-on-diff at ship time.
