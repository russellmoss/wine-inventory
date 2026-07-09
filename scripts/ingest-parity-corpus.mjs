#!/usr/bin/env node
// -----------------------------------------------------------------------------
// ingest-parity-corpus — generate the Capability-Parity register from the
// competitor corpus indexes (vintrace-docs/INDEX.md + innovint-docs/INDEX.md).
//
// One note per incumbent help-center article, defaulting to `status: gap`, so
// docs/architecture/parity/ is CORPUS-COMPLETE and the dashboard shows an honest
// coverage ratio (a real, small numerator against the full ~1000-article universe)
// instead of a hand-picked subset that looks done. (council C4.)
//
// IDEMPOTENT: re-running preserves hand-enrichment. Precedence for the mutable
// fields (status / ourApproach / aiNativeEdge / evidence):
//     existing hand-edited note  >  the ENRICHMENT map below  >  gap default
// The immutable stubs (id / incumbent / capability / group / corpus source) are
// always regenerated from the index, so re-scraping the corpus keeps them fresh.
//
// Pure Node, no deps. Run: node scripts/ingest-parity-corpus.mjs
// -----------------------------------------------------------------------------
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontmatter, readNote } from "./lib/vault-notes.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const PARITY_DIR = join(REPO, "docs", "architecture", "parity");

const SOURCES = [
  { incumbent: "vintrace", abbr: "VT", dir: "vintrace-docs" },
  { incumbent: "innovint", abbr: "IV", dir: "innovint-docs" },
];

// Hand-enrichment, keyed by corpus path (relative to the incumbent's dir). Only
// list capabilities we can back with a resolving code path. Everything else is a
// gap by default. This map is the version-controlled, auditable "we cover this".
// `evidence` for a covered entry MUST resolve to a real file inside the repo.
//
// `overlap` records the cross-incumbent verdict — "both" (BOTH products ship it =
// TABLE STAKES), "vintrace-only", or "innovint-only". Unlisted articles default to
// overlap "unknown". `counterpart` is the matching article in the OTHER corpus for
// an overlap="both" row (informational; need not resolve to a generated note).
// The overlap verdicts + code-coverage below were produced by the by-domain
// Vintrace↔InnoVint crosswalk (docs/analysis/vintrace-vs-innovint-crosswalk.md).
const ENRICHMENT = {
  "vintrace-docs/vintrace-web/barrel-management/rack-and-return-of-barrels.md": {
    overlap: "both",
    status: "covered",
    ourApproach: "RACK op / transferWineCore (rack out to barrels, then back)",
    aiNativeEdge: "rack tank 1 into barrel 14",
    evidence: "src/lib/vessels/rack-core.ts",
  },
  "vintrace-docs/vintrace-web/barrel-management/transferring-wine-to-barrel.md": {
    overlap: "both",
    status: "covered",
    ourApproach: "RACK op / transferWineCore (vessel-to-barrel transfer)",
    aiNativeEdge: "transfer 200 L from tank 3 to barrel 8",
    evidence: "src/lib/vessels/rack-core.ts",
  },
  // Known gaps called out in the incumbent teardown (SYNTHESIS.md §B.2) — keep
  // them visible as PARTIAL so the register captures gaps, not just wins.
  "vintrace-docs/vintrace-web/barrel-management/setting-up-a-barrel-group.md": {
    overlap: "both",
    status: "partial",
    ourApproach: "barrel fills exist in the cost DAG; no first-class barrel-GROUP CRUD affordance yet",
    aiNativeEdge: "parity only",
  },
  "vintrace-docs/vintrace-web/barrel-management/combining-barrels-or-barrel-groups.md": {
    overlap: "both",
    status: "partial",
    ourApproach: "no first-class barrel-group combine/break; tracked as a Phase-3-family gap",
    aiNativeEdge: "parity only",
  },

  // ── Crosswalk enrichment (Vintrace↔InnoVint by-domain analysis) ───────────────
  // Compliance / TTB
  "vintrace-docs/reporting/ttb-usa/ttb-report-5120-17.md": {
    overlap: "both", status: "covered", evidence: "src/lib/compliance/generate.ts",
    counterpart: "innovint-docs/make/compliance/generate-and-download-the-ttb-report.md",
    ourApproach: "foldPeriod folds the append-only ledger through GATE-validated arithmetic, fills the real TTB F 5120.17 AcroForm from a frozen snapshot, files per bond; markReportFiled freezes an immutable ComplianceReport as the legal record + carry-forward source.",
    aiNativeEdge: "Assistant drives §A tax-determination inputs; a direct generate/file tool is an open AI add.",
  },
  "vintrace-docs/reporting/ttb-usa/amending-a-previously-submitted-5120-17.md": {
    overlap: "both", status: "covered", evidence: "src/lib/compliance/amend.ts",
    counterpart: "innovint-docs/make/compliance/declare-or-edit-tax-class.md",
    ourApproach: "AMENDED ComplianceReport rows (amendsReportId) re-fold with corrections; cascadeAmendmentsForWrite synchronously marks the downstream FILED chain NEEDS_AMENDMENT in the same tx.",
    aiNativeEdge: "NEEDS_AMENDMENT is machine-readable → proactive 'period X needs re-filing' nudge.",
  },
  "vintrace-docs/vintrace-web/winemaking/blending-in-bond-and-taxpaid-wines.md": {
    overlap: "both", status: "covered", evidence: "src/lib/compliance/form-map.ts",
    counterpart: "innovint-docs/guidance-faqs/frequently-asked-questions/blending-across-tax-classes.md",
    ourApproach: "BLEND with crossesTaxClass auto-posts child +delta to §A5 and each parent -delta to §A20 plus a Part X anomaly; BOND-1 refuses a straddling blend.",
    aiNativeEdge: "Cross-class posting is derived server-side, so any assistant-created blend is compliance-correct.",
  },
  "vintrace-docs/vintrace-web/compliance/transferring-wines-between-bonds-us.md": {
    overlap: "both", status: "covered", evidence: "src/lib/compliance/transfer-in-bond-core.ts",
    counterpart: "innovint-docs/make/movement-actions/bond-to-bond-transfers-b2b.md",
    ourApproach: "Dedicated op stamps per-leg source/destBondId; fold posts received leg →§A7/§B3 on dest and removed leg →§A15/§B9 on source as a matched pair.",
    aiNativeEdge: "Reversible via undo_operation (mirror posting swaps legs).",
  },
  "vintrace-docs/vintrace-web/compliance/declaring-wine.md": {
    overlap: "both", status: "covered", evidence: "src/lib/compliance/tax-class.ts",
    counterpart: "innovint-docs/make/compliance/declare-or-edit-tax-class.md",
    ourApproach: "deriveTaxClass auto-picks the class from point-in-time ABV bands; an append-only ChangeOfTaxClassEvent is the dated override.",
    aiNativeEdge: "changeTaxClassCore is a deferred assistant tool — a ready declare_tax_class win.",
  },
  "vintrace-docs/reporting/ttb-usa/california-winegrower-tax-return-supplemental-report.md": {
    overlap: "both", status: "gap",
    counterpart: "innovint-docs/make/compliance/what-is-the-state-compliance-by-bond-report.md",
    ourApproach: "Federal 5000.24 + CBMA ladder only; no state winegrower return or state classification report.",
    aiNativeEdge: "We own the federal excise engine — generating actual state returns for top wine states is an open moat neither fills.",
  },
  // Costing
  "innovint-docs/finance/guidance-faq/tracking-oak-costs-in-innovint.md": {
    overlap: "both", status: "covered", evidence: "src/lib/cost/barrel.ts",
    counterpart: "vintrace-docs/vintrace-web/costing/adding-storage-costs-for-wines-in-vessel.md",
    ourApproach: "BarrelAsset + BarrelFill drive sum-of-years-digits depreciation over fills, allocated to resident wine by time×space; posts a BARREL CostLine at fill close. Neither incumbent auto-computes this.",
    aiNativeEdge: "Barrel cost is a clean queryable number the assistant surfaces per lot.",
  },
  "vintrace-docs/vintrace-web/costing/cost-console.md": {
    overlap: "both", status: "covered", evidence: "src/lib/cost/rollup.ts",
    counterpart: "innovint-docs/finance/getting-started/how-does-innovint-distribute-costs.md",
    ourApproach: "Folds ledger-order CostEvents; TRANSFER moves parent→child cost by volume ratio, normal loss keeps cost, abnormal loss writes off pro-rata; conservation asserted per op.",
    aiNativeEdge: "blend/rack/transfer assistant tools trigger cost movement with no extra step.",
  },
  "vintrace-docs/vintrace-web/costing/bottling-and-dry-good-costing.md": {
    overlap: "both", status: "partial", evidence: "src/lib/cost/cogs-write.ts",
    counterpart: "innovint-docs/finance/getting-started/how-to-add-dry-goods-cost-packaging-and-additives.md",
    ourApproach: "buildCogsSnapshot freezes a BottlingCostSnapshot with costPerBottle + componentBreakdown; packagingCost is passed 0 today so per-bottle COGS captures liquid only.",
    aiNativeEdge: "Once packaging depletion is wired, the assistant explains full per-bottle COGS — a number neither incumbent's API backs.",
  },
  "vintrace-docs/vintrace-web/costing/managing-fruit-costs.md": {
    overlap: "both", status: "partial", evidence: "src/lib/transform/crush-core.ts",
    counterpart: "innovint-docs/finance/getting-started/how-to-add-and-remove-fruit-costs.md",
    ourApproach: "Fruit cost enters at CRUSH as lump or per-kg (per-kg wins) → FRUIT CostLine; a no-cost lot reads UNKNOWN not $0.",
    aiNativeEdge: "No fruit-cost assistant tool yet; an event-native correctable fruit cost tied to the correction chain is the AI opening.",
  },
  "vintrace-docs/setup-and-admin/integrations-accounting/syncing-invoices-and-billing-items-to-quickbooks.md": {
    overlap: "vintrace-only", status: "covered", evidence: "src/lib/accounting/ap-emit.ts",
    ourApproach: "Transactional outbox emits an immutable ApExportEvent (DR inventory / CR A/P) inside the receive tx; exactly-once poster raises a QBO Bill. Beats InnoVint (no ERP integration).",
    aiNativeEdge: "A credit purchase recorded by receive_supply auto-produces the QBO Bill.",
  },
  // Fruit intake / crush / ferment
  "vintrace-docs/harvest-vintage/fruit-bookings/managing-fruit-intakes-and-fruit-intake-bookings.md": {
    overlap: "both", status: "covered", evidence: "src/lib/harvest/pick-core.ts",
    counterpart: "innovint-docs/harvest/harvest-workflow-fermentation-tracking/how-to-receive-fruit.md",
    ourApproach: "writeHarvestPickTx records the weigh-in (weightKg + brix/pH/TA at pick) as a first-class HarvestPick anchoring later crush consumption.",
    aiNativeEdge: "Same tx backs the action, the log_harvest_pick tool, and HARVEST_WEIGH_IN WO completion — hands-free crush-pad weigh-in.",
  },
  "vintrace-docs/harvest-vintage/crush-and-press/crush-and-extraction.md": {
    overlap: "both", status: "covered", evidence: "src/lib/transform/crush-core.ts",
    counterpart: "innovint-docs/harvest/harvest-workflow-fermentation-tracking/process-fruit-to-volume.md",
    ourApproach: "crushLotCore consumes HarvestPicks and originates a MUST lot at measured liters (kg is op metadata), multi-vessel via destinations[].",
    aiNativeEdge: "complete_task completes a simple crush by chat.",
  },
  "vintrace-docs/harvest-vintage/crush-and-press/using-the-press-cycle.md": {
    overlap: "both", status: "covered", evidence: "src/lib/transform/press-core.ts",
    counterpart: "innovint-docs/harvest/harvest-workflow-fermentation-tracking/drain-and-press.md",
    ourApproach: "pressLotCore runs the 1-parent→N-child split (free-run + press fractions), lees as a typed LOSS, a SPLIT lineage edge per child, expectedRevision guard.",
    aiNativeEdge: "complete_task completes a press by chat; complex cuts deep-link the execute form.",
  },
  "vintrace-docs/harvest-vintage/fermentation-and-cap-management/managing-ferments.md": {
    overlap: "both", status: "covered", evidence: "src/lib/ferment/stuck.ts",
    counterpart: "innovint-docs/make/lots/how-to-change-lot-stage.md",
    ourApproach: "Ferment = LotForm × AlcoholicFermState × MalolacticState with a legal-transition engine; detectStuck derives a stuck/sluggish signal from the Brix trend (never stored).",
    aiNativeEdge: "transition_lot_state advances AF/MLF by chat; the stuck signal is the predictive edge both incumbents lack.",
  },
  // Bulk cellar ops
  "innovint-docs/make/movement-actions/how-to-record-a-rack.md": {
    overlap: "both", status: "covered", evidence: "src/lib/vessels/rack-core.ts",
    counterpart: "vintrace-docs/vintrace-web/barrel-management/rack-and-return-of-barrels.md",
    ourApproach: "rackWineCore writes one append-only RACK op in a SERIALIZABLE tx, auto-computes loss to lees, guards capacity, records a 1:1 VesselTransfer; revertTransferCore is a LIFO-guarded correction.",
    aiNativeEdge: "rack_wine + revert_transfer + query_transfers by chat/voice.",
  },
  "innovint-docs/make/movement-actions/how-to-record-a-rack-and-return.md": {
    overlap: "innovint-only", status: "gap",
    ourApproach: "No dedicated rack-and-return action, holding-vessel abstraction, or no-net-gain guard — two separate racks today.",
    aiNativeEdge: "A compound assistant tool sequencing out+back racks with a no-net-gain assertion would close it.",
  },
  "innovint-docs/make/movement-actions/how-to-record-filtration-the-filter-action.md": {
    overlap: "innovint-only", status: "covered", evidence: "src/lib/cellar/treatments.ts",
    ourApproach: "filterVesselCore writes a dedicated FILTRATION op with proportional loss + a LotTreatment carrying filter-media taxonomy + micron; beats Vintrace (loss-reason only).",
    aiNativeEdge: "filter_vessel tool; also completable as a WO filtration task.",
  },
  // Blending / lineage
  "innovint-docs/make/movement-actions/how-to-record-a-blend.md": {
    overlap: "both", status: "covered", evidence: "src/lib/blend/blend-core.ts",
    counterpart: "vintrace-docs/vintrace-web/winemaking/blending-in-bond-and-taxpaid-wines.md",
    ourApproach: "blendLotsCore draws partial/full from N parents into one child (NEW_LOT or GROW_EXISTING), conserves volume, records parent→child LotLineage fractions.",
    aiNativeEdge: "blend_lots handles simple blends by chat; complex blends deep-link /blend.",
  },
  "innovint-docs/make/lots/lot-details-page.md": {
    overlap: "both", status: "covered", evidence: "src/lib/lot/lineage.ts",
    counterpart: "vintrace-docs/api/MIGRATION-STRATEGY.md",
    ourApproach: "First-class LotLineage edge table (fraction, kind SPLIT|BLEND|TRANSFORM), cycle-guarded ancestry/descendants. Neither incumbent stores a queryable parentage DAG.",
    aiNativeEdge: "Assistant answers forward + backward recall the incumbents' APIs cannot serve.",
  },
  "innovint-docs/make-advanced-features/general/blend-trials.md": {
    overlap: "both", status: "partial", evidence: "src/lib/blend/trials.ts",
    counterpart: "vintrace-docs/vintrace-web/winemaking/managing-trial-blends.md",
    ourApproach: "BlendTrial/Component + scaleTrialToVolume + live rollup + PROMOTE bridge; missing predicted analysis, cost preview, and max-blend-volume calc.",
    aiNativeEdge: "calc_blending covers the math; the iterate-taste-promote bench flow is deliberately UI.",
  },
  // Sparkling
  "vintrace-docs/vintrace-web/sparkling-wine/disgorging-wine.md": {
    overlap: "both", status: "covered", evidence: "src/lib/sparkling/disgorgement-core.ts",
    counterpart: "innovint-docs/make-advanced-features/sparkling-wine-module/disgorge-dosage-packaging.md",
    ourApproach: "Dedicated DISGORGEMENT op ejects the lees plug as reason-coded per-bottle loss, distinguishes sacrificial vs breakage, peels a new child lot on a partial run.",
    aiNativeEdge: "sparkling_disgorge by chat; reverses via undo_operation.",
  },
  "vintrace-docs/vintrace-web/sparkling-wine/adding-hfcs-and-dosage-for-sparkling-wines.md": {
    overlap: "both", status: "covered", evidence: "src/lib/sparkling/dosage-core.ts",
    counterpart: "innovint-docs/make-advanced-features/sparkling-wine-module/disgorge-dosage-packaging.md",
    ourApproach: "First-class DOSAGE op adds liqueur, computes final RS off a measured pre-dosage RS, classifyStyle derives the EU sweetness band. Neither incumbent has a dosage primitive.",
    aiNativeEdge: "Disgorge→dosage→finish flow deep-linked to the En Tirage screen.",
  },
  "vintrace-docs/vintrace-web/sparkling-wine/tiraging-wine.md": {
    overlap: "both", status: "partial", evidence: "src/lib/sparkling/tirage-core.ts",
    counterpart: "innovint-docs/make-advanced-features/sparkling-wine-module/bottling-en-tirage.md",
    ourApproach: "First-class TIRAGE op: multi-tank draw of one cuvée into a continuable BOTTLED_IN_PROCESS lot + optional liqueur; packaging dry-goods NOT depleted at tirage.",
    aiNativeEdge: "sparkling_tirage by chat/voice; also drives the pét-nat path.",
  },
  // Bottling / finished goods
  "vintrace-docs/vintrace-web/bottling-and-inventory/recording-a-bottling-packaging-operation.md": {
    overlap: "both", status: "covered", evidence: "src/lib/bottling/run.ts",
    counterpart: "innovint-docs/make/movement-actions/how-to-record-a-bottling.md",
    ourApproach: "executeBottling draws proportionally across multiple source vessels, writes a balanced BOTTLE op, materializeFinishedGoods creates the SKU + BottlingRun + provenance + RECEIVE movement.",
    aiNativeEdge: "No still-bottling assistant tool yet (only sparkling tirage) — a bottle_wine tool is an open opportunity.",
  },
  "vintrace-docs/vintrace-web/bottling-and-inventory/decanting-bottles-to-bulk.md": {
    overlap: "both", status: "partial", evidence: "src/lib/bottling/run.ts",
    counterpart: "innovint-docs/make/case-goods-in-make/how-do-i-return-bottled-wine-to-a-bulk-wine-lot.md",
    ourApproach: "reverseBottlingRun atomically removes bottles, restores wine via a SEED op with capacity guard, unwinds cost — but only the exact original run, no standalone arbitrary decant.",
    aiNativeEdge: "undo_operation returns wine to bulk with cost restored by chat.",
  },
  // Lab / analysis
  "vintrace-docs/vintrace-web/lab-work/dynamic-mso2-molecular-sulphur-dioxide-calculation.md": {
    overlap: "vintrace-only", status: "covered", evidence: "src/lib/chemistry/so2.ts",
    ourApproach: "molecularSO2 implements Margalit/Henderson-Hasselbalch (pKa 1.81) read-only within one AnalysisPanel; freeSO2ForMolecularTarget inverts it for target dosing.",
    aiNativeEdge: "calc_so2 exposes the derivation; a parity-win over InnoVint (no MSO2).",
  },
  "vintrace-docs/vintrace-web/lab-work/requesting-lab-analysis-and-viewing-results.md": {
    overlap: "both", status: "covered", evidence: "src/lib/chemistry/measurements.ts",
    counterpart: "innovint-docs/make/analysis/how-to-record-analysis-via-direct-action-or-work-order-task.md",
    ourApproach: "recordMeasurementsCore records a panel of readings against exactly one lot (vessel is snapshot context); edit is a soft-void of the whole panel.",
    aiNativeEdge: "record_measurement + record_sample_results (blend → asks which lot); no live-metric roll-forward yet.",
  },
  "innovint-docs/make/analysis/ai-analysis-import.md": {
    overlap: "innovint-only", status: "gap",
    ourApproach: "No photo/OCR lab-import path; closest primitive is fieldnotes LLM extraction (unrelated to lab readings).",
    aiNativeEdge: "Strongest AI opening: a photo/PDF/handwritten-sheet → readings → lot importer onto our confirm-gated record_measurement core leapfrogs InnoVint's Gemini feature.",
  },
  // Purchases / materials
  "vintrace-docs/vintrace-web/lab-work/setting-up-an-additive.md": {
    overlap: "both", status: "covered", evidence: "src/lib/cellar/materials.ts",
    counterpart: "innovint-docs/make/dry-goods/how-to-create-and-receive-dry-goods-additives-packaging.md",
    ourApproach: "One CellarMaterial with a load-bearing kind + stored main category (isDoseableCategory), editable units (pinned once lots exist), can dose without stock tracking.",
    aiNativeEdge: "create_material + receive_supply stand up and stock a dry-good by chat.",
  },
  "innovint-docs/make/dry-goods/navigating-the-dry-goods-explorer-details-pages.md": {
    overlap: "both", status: "covered", evidence: "src/lib/cost/deplete.ts",
    counterpart: "vintrace-docs/vintrace-web/purchases/purchase-orders.md",
    ourApproach: "SupplyLot is the batch; planDepletion auto-draws oldest-first under WEIGHTED_AVG or FIFO, method stamped per SupplyConsumption. No expiry field yet.",
    aiNativeEdge: "Oldest-first depletion means the assistant never asks which lot to consume.",
  },
  "innovint-docs/make/additions/how-to-record-an-addition.md": {
    overlap: "both", status: "covered", evidence: "src/lib/cellar/addition.ts",
    counterpart: "vintrace-docs/vintrace-web/lab-work/multi-additions-operation.md",
    ourApproach: "addAdditionCore is a volume-neutral ADDITION op + one LotTreatment per resident lot; resolves a catalog material, computes rate×volume, draws stock + records MATERIAL cost in one tx.",
    aiNativeEdge: "add_addition with an additive-scoped picker that refuses non-additives.",
  },
  // Work orders
  "vintrace-docs/vintrace-web/work-orders/work-order-templates.md": {
    overlap: "both", status: "covered", evidence: "src/lib/work-orders/templates.ts",
    counterpart: "innovint-docs/make/work-orders/creating-work-order-templates.md",
    ourApproach: "Versioned WorkOrderTemplate/TemplateVersion (immutable snapshot) + clone-on-customize + seeded system templates + validated typed-field vocabulary; lots/vessels bound at issue.",
    aiNativeEdge: "Assistant authors templates by chat (create/update_spec/clone/archive).",
  },
  "vintrace-docs/vintrace-web/work-orders/completing-work-orders-with-data-discrepancies.md": {
    overlap: "vintrace-only", status: "covered", evidence: "src/lib/work-orders/deviation.ts",
    ourApproach: "deviation.ts diffs planned vs actual; >1% volume or any rate change forces individual review so bulk-approve only offers exact matches (anti-rubber-stamp).",
    aiNativeEdge: "review_task surfaces the deviation and warns it reverses the ledger op before confirming.",
  },
  "vintrace-docs/vintrace-web/winemaking/setting-up-an-equipment-treatment.md": {
    overlap: "both", status: "covered", evidence: "src/lib/work-orders/maintenance.ts",
    counterpart: "innovint-docs/make/recording-actions/using-a-custom-action-or-custom-task.md",
    ourApproach: "MAINTENANCE completion writes a lotless VesselActivityEvent (no ledger op, no wine-cost roll-up) with a typed kind vocabulary + overhead-supply depletion child.",
    aiNativeEdge: "complete_task handles the maintenance lane by chat; barrel-maintenance kinds added in plan 044.",
  },
  "vintrace-docs/vintrace-web/work-orders/using-the-job-calendar.md": {
    overlap: "both", status: "partial", evidence: "src/lib/work-orders/buckets.ts",
    counterpart: "innovint-docs/make/dashboard-calendar/activity-calendar.md",
    ourApproach: "Due-date bucketing (overdue/today/upcoming/unscheduled) dashboard; no calendar grid or drag-drop reschedule.",
    aiNativeEdge: "manage_work_order (schedule) reschedules by chat as a conversational substitute for drag-drop.",
  },
  // Sales / DTC
  "innovint-docs/supply/using-supply/supply-commerce7-integration.md": {
    overlap: "innovint-only", status: "covered", evidence: "src/lib/commerce/ingest.ts",
    ourApproach: "Settled C7 orders diff into append-only SalesExportEvent deltas that deplete finished goods (SALE) AND post DTC revenue through the Phase-15 poster in one SERIALIZABLE tx; refunds are signed reversals. Live sandbox verify pending.",
    aiNativeEdge: "The whole money-loop is assistant-observable; margin.ts gives per-SKU×channel profit.",
  },
  "innovint-docs/finance/reporting/cost-reports-reconciliation.md": {
    overlap: "innovint-only", status: "covered", evidence: "src/lib/commerce/margin.ts",
    ourApproach: "getDtcMargin joins ingested C7 net revenue against Phase-8 absorption COGS by SKU×channel — native COGS-vs-revenue margin (InnoVint gates profitability behind paid WinePulse).",
    aiNativeEdge: "'DTC margin on the 2023 Pinot by channel' answered directly.",
  },
  // Reporting
  "vintrace-docs/reporting/bulk-wine/adding-a-saved-search-to-your-dashboard.md": {
    overlap: "both", status: "partial", evidence: "src/lib/harvest/dashboard.ts",
    counterpart: "innovint-docs/make/reporting/report-explorer.md",
    ourApproach: "Domain dashboards + on-page charts + compliance reminders/alerts; no configurable KPI-tile home or scheduled/threshold delivery.",
    aiNativeEdge: "The assistant IS the NL query layer (report_anomalies + query_* tools) — the exact open moat both incumbents miss.",
  },
  // Custom-crush billing
  "vintrace-docs/vintrace-web/custom-crush-billing/charging-clients-for-winery-work.md": {
    overlap: "both", status: "partial", evidence: "src/lib/cost/data.ts",
    counterpart: "innovint-docs/make-advanced-features/owner-based-permissions-system/setting-up-your-custom-crush-permissions.md",
    ourApproach: "Ops on a CUSTOM_CRUSH_CLIENT lot suppress the CostLine from estate capitalization and record it for bill-back; no billing item, rate, charge object, or service order.",
    aiNativeEdge: "record_bulk_wine_cost posts a manual charge node — the seam to turn any production event into a priced, API-exposed charge (un-extractable from both incumbents).",
  },
  // Integrations / admin
  "vintrace-docs/setup-and-admin/api/api-overview.md": {
    overlap: "both", status: "gap",
    counterpart: "innovint-docs/new-to-innovint/accessing-innovint/accessing-your-innovint-account.md",
    ourApproach: "No public REST API or API-key model; all routes are internal (auth, assistant, webhooks, cron).",
    aiNativeEdge: "The NDJSON assistant tool-use loop (~40 typed write tools) is our programmatic surface — conversational instead of scripted REST, but session-gated.",
  },
  "vintrace-docs/setup-and-admin/integrations-labs-and-tanks/ets-lab-integration.md": {
    overlap: "both", status: "partial", evidence: "src/lib/assistant/tools/pull-sample.ts",
    counterpart: "innovint-docs/make-advanced-features/integrations/innovint-ets-integration-overview.md",
    ourApproach: "Manual Sample workflow (pull → send-to-lab-by-name → record results); 'lab' is free text, no connector, sample-code auto-post, or metric mapping.",
    aiNativeEdge: "pull_sample + manage_sample + record_sample_results make the lab loop conversational.",
  },
};

const STATUSES = new Set(["covered", "partial", "gap", "deliberately-omitted"]);
const OVERLAPS = new Set(["both", "vintrace-only", "innovint-only", "unknown"]);

// djb2 → 8 hex chars. Deterministic short id so filenames stay well under the
// Windows path limit (the parity dir is already deep). Human label lives in
// `capability`; the base dashboard groups on `capability`, not the filename.
function hash8(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// (frontmatter parsing for existing notes reuses the shared scripts/lib/vault-notes.mjs
// parseFrontmatter — one parser, so read/write quote-escaping can't drift.)

// Parse an INDEX.md: track the current `## Category` and collect every
// `- [Title](relpath.md)` bullet (first markdown link only).
function parseIndex(text) {
  const out = [];
  let group = "misc";
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const cat = raw.match(/^##\s+(.+?)\s*(\(\d+[^)]*\))?\s*$/);
    if (cat) { group = slug(cat[1]); continue; }
    const bullet = raw.match(/^-\s+\[(.+?)\]\(([^)]+?\.md)\)/);
    if (bullet) out.push({ title: bullet[1].trim(), rel: bullet[2].trim(), group });
  }
  return out;
}

function esc(v) {
  // Quote scalars that could confuse the minimal frontmatter reader.
  if (v === "" || /[:#"']/.test(v) || /^\s|\s$/.test(v)) return JSON.stringify(v);
  return v;
}

function noteBody(fm, corpusPath) {
  const stance =
    fm.status === "covered" ? "we cover this"
    : fm.status === "partial" ? "partial — see below"
    : fm.status === "deliberately-omitted" ? "deliberately omitted"
    : "gap — not yet built";
  const overlapLabel =
    fm.overlap === "both" ? "both incumbents — TABLE STAKES"
    : fm.overlap === "vintrace-only" ? "Vintrace only"
    : fm.overlap === "innovint-only" ? "InnoVint only"
    : "unknown";
  return `---
id: ${fm.id}
group: ${esc(fm.group)}
incumbent: ${fm.incumbent}
capability: ${esc(fm.capability)}
overlap: ${fm.overlap}
status: ${fm.status}
ourApproach: ${esc(fm.ourApproach)}
aiNativeEdge: ${esc(fm.aiNativeEdge)}
evidence: ${esc(fm.evidence)}
counterpart: ${esc(fm.counterpart)}
tags:
  - parity
---

# ${fm.id} — ${fm.capability}

> [!info] Parity (${fm.incumbent}) — ${stance}.

- **Incumbent:** ${fm.incumbent}
- **Cross-incumbent overlap:** ${overlapLabel}
- **Our approach:** ${fm.ourApproach || "—"}
- **AI-native edge:** ${fm.aiNativeEdge || "—"}
- **Evidence:** \`${fm.evidence}\`${fm.counterpart ? `\n- **Counterpart article:** \`${fm.counterpart}\`` : ""}
- **Source:** \`${corpusPath}\` — see [[assistant-coverage]] / [[system-map]]
`;
}

if (!existsSync(PARITY_DIR)) mkdirSync(PARITY_DIR, { recursive: true });

// Index existing notes by id so we can preserve hand-enrichment on re-run.
const existingById = {};
for (const f of readdirSync(PARITY_DIR)) {
  if (!f.endsWith(".md") || f === "README.md") continue;
  const fm = parseFrontmatter(readNote(join(PARITY_DIR, f)));
  if (fm.id) existingById[fm.id] = { file: f, fm };
}

let created = 0, updated = 0, preserved = 0;
const byStatus = { covered: 0, partial: 0, gap: 0, "deliberately-omitted": 0 };
const byOverlap = { both: 0, "vintrace-only": 0, "innovint-only": 0, unknown: 0 };
const seenIds = new Set();
// Track which ENRICHMENT keys actually matched a corpus article, so a stale or
// mistyped key (e.g. a capability the crosswalk cited that isn't in the INDEX)
// surfaces as a warning instead of silently never applying.
const matchedEnrichmentKeys = new Set();

for (const src of SOURCES) {
  const indexPath = join(REPO, src.dir, "INDEX.md");
  if (!existsSync(indexPath)) {
    console.error(`\x1b[31mMissing corpus index: ${src.dir}/INDEX.md\x1b[0m`);
    process.exit(1);
  }
  for (const art of parseIndex(readFileSync(indexPath, "utf8"))) {
    const corpusPath = `${src.dir}/${art.rel}`; // repo-relative
    // Deterministic id; on the rare djb2 collision, disambiguate (don't wedge the
    // gate with a hard exit). Same corpus order → same suffix on every run.
    let id = `PARITY-${src.abbr}-${hash8(art.rel)}`;
    if (seenIds.has(id)) { let n = 2; while (seenIds.has(`${id}-${n}`)) n++; id = `${id}-${n}`; }
    seenIds.add(id);

    // Precedence: existing hand-edit > ENRICHMENT map > gap default.
    // KNOWN LIMITATION: an existing note with status !== "gap" is treated as
    // hand-enriched and wins; deliberately downgrading a MAPPED article back to
    // `gap` on disk will be re-applied by ENRICHMENT on the next run. The ENRICHMENT
    // map is the curated source of truth for those few entries — edit the map, not
    // the generated note, to change a mapped article's status.
    const enr = ENRICHMENT[corpusPath] || {};
    const prev = existingById[id]?.fm || {};
    const prevEnriched = prev.status && prev.status !== "gap";
    const pick = (field, dflt) =>
      (prevEnriched && prev[field] != null ? prev[field] : enr[field] != null ? enr[field] : dflt);

    if (enr === ENRICHMENT[corpusPath]) matchedEnrichmentKeys.add(corpusPath);
    const fm = {
      id,
      group: art.group,
      incumbent: src.incumbent,
      capability: art.title,
      // cross-incumbent verdict: "both" = table stakes. Unlisted → "unknown".
      overlap: pick("overlap", "unknown"),
      status: pick("status", "gap"),
      ourApproach: pick("ourApproach", ""),
      aiNativeEdge: pick("aiNativeEdge", ""),
      // gap/partial/omitted → corpus link (warn-only); covered → code path.
      evidence: pick("evidence", corpusPath),
      counterpart: pick("counterpart", ""),
    };
    if (!STATUSES.has(fm.status)) fm.status = "gap";
    if (!OVERLAPS.has(fm.overlap)) fm.overlap = "unknown";
    byStatus[fm.status]++;
    byOverlap[fm.overlap]++;

    const file = `${id}.md`;
    const body = noteBody(fm, corpusPath);
    const abs = join(PARITY_DIR, file);
    const before = existsSync(abs) ? readFileSync(abs, "utf8").replace(/\r\n?/g, "\n") : null;
    if (before === body) { preserved++; continue; }
    writeFileSync(abs, body, "utf8");
    if (before == null) created++; else updated++;
  }
}

const unmatched = Object.keys(ENRICHMENT).filter((k) => !matchedEnrichmentKeys.has(k));
if (unmatched.length) {
  console.error(
    `\x1b[33mwarn: ${unmatched.length} ENRICHMENT key(s) matched no corpus article ` +
      `(overlap/status not applied — check the path exists in the INDEX):\x1b[0m\n  ` +
      unmatched.join("\n  ")
  );
}

console.log(
  `parity ingest: ${created} created, ${updated} updated, ${preserved} unchanged, ${seenIds.size} total\n` +
    `  covered ${byStatus.covered} · partial ${byStatus.partial} · gap ${byStatus.gap} · omitted ${byStatus["deliberately-omitted"]}` +
    `  (${((byStatus.covered / seenIds.size) * 100).toFixed(1)}% covered)\n` +
    `  overlap: both ${byOverlap.both} · vintrace-only ${byOverlap["vintrace-only"]} · ` +
    `innovint-only ${byOverlap["innovint-only"]} · unknown ${byOverlap.unknown}`
);
