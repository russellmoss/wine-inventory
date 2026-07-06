# Competitive Documentation Corpus — Navigation Guide

Retrieval infrastructure for the two incumbent help-center corpora in this repo. This guide is an **index**, not analysis — it tells an agent *where to read*, with no comparative judgments. Both corpora carry per-article `gist` + `tags` frontmatter (controlled vocabulary below) and machine-readable `_manifest.json`.

| Corpus | Path | Source |
| --- | --- | --- |
| **vintrace** | [`vintrace-docs/`](../vintrace-docs/) | Zendesk Help Center REST API |
| **InnoVint** | [`innovint-docs/`](../innovint-docs/) | HubSpot knowledge base (sitemap + server-rendered HTML) |

## Corpus stats

| Corpus | Categories | Sections | Articles | Page types | Empty/near-empty |
| --- | ---: | ---: | ---: | --- | --- |
| **vintrace** | 7 | 56 | 567 | article=567 | 0 |
| **InnoVint** | 13 | 54 | 430 | article=178, page=252 | 1 |

> vintrace articles carry `created_at`/`updated_at`; InnoVint pages carry `lastmod` and a `page_type` of `article` (knowledge-base) or `page` (landing / webinar / academy). InnoVint's 2 non-content system pages (404 + search template) are skipped; see its manifest `skipped_system_pages`.

## Controlled tag vocabulary

A closed set of topic tags. Every article gets 3–6 (a minority of narrow stubs get fewer). Counts are the number of articles carrying each tag per corpus — use them to gauge how much each incumbent documents a theme, and as a retrieval filter (`grep -l 'tags:.*\bttb\b'`).

| Tag | vintrace | InnoVint | Meaning |
| --- | ---: | ---: | --- |
| `naming` | 15 | 23 | Naming conventions for lots, batches, wines, labels, codes |
| `lot-identity` | 78 | 63 | Lot/batch identity: split, combine, merge, stage, sub-lot, phantom vessel |
| `blending` | 44 | 37 | Blending and assemblage of wines |
| `work-orders` | 106 | 127 | Work orders, jobs, tasks, scheduling of cellar work |
| `corrections` | 40 | 24 | Correcting, editing, undoing, reversing, or voiding recorded actions |
| `fermentation` | 39 | 52 | Fermentation: yeast, cap management, punchdown, MLF, maceration |
| `additives` | 71 | 82 | Additions/additives: SO2, acid, enzyme, nutrient, fining, tannin, dosing |
| `transfers` | 78 | 85 | Transfers, racking, topping, draining, pressing between vessels |
| `barrels` | 194 | 172 | Barrels, cooperage, barrel groups, cellar/vessel management |
| `lab` | 120 | 99 | Lab analysis, chemistry, samples, readings, metrics (pH/TA/Brix/SO2/VA) |
| `harvest` | 147 | 114 | Harvest/vintage: fruit intake, weigh tags, picks, crush, destem, press |
| `vineyard` | 84 | 87 | Vineyards, blocks, viticulture, fruit sources, vineyard contracts |
| `packaging` | 99 | 109 | Bottling, packaging, dry goods, SKUs, cases, closures, finished goods |
| `inventory` | 156 | 93 | Inventory: stock, on-hand, reconciliation, adjustments, dispatch |
| `cost` | 73 | 96 | Cost/COGS: pricing, overheads, WIP, valuation, financials |
| `reporting` | 158 | 145 | Reports, dashboards, analytics, report explorer/builder |
| `exports` | 143 | 90 | Exporting/downloading/printing data (CSV, PDF, spreadsheets) |
| `ttb` | 44 | 35 | US TTB federal reporting (5120.17 ops report, 5000.24 excise, gauge) |
| `tax-class` | 47 | 28 | Tax class/state/status, taxable vs in-bond determination |
| `bond` | 37 | 46 | Bonded winery, bond periods, transfers in bond |
| `compliance` | 34 | 31 | Compliance & regulatory: crush report, COLA, audit, recordkeeping |
| `permissions` | 52 | 37 | Permissions, roles, members, capabilities, access control |
| `configuration` | 268 | 70 | Settings, setup, admin, defaults, customization |
| `migration` | 58 | 39 | Data migration/onboarding: imports, CSV upload, starting inventory/costs |
| `integrations` | 53 | 29 | Third-party integrations (QuickBooks, Commerce7, scales, DMA, sync) |
| `api` | 24 | 3 | API / developer surface: endpoints, tokens, webhooks |
| `mobile` | 56 | 68 | Mobile apps (InnoApp / vintrace mobile), tablet, offline |
| `dtc-sales` | 34 | 11 | DTC/sales: wine club, tasting room, POS, shipments, depletions |
| `getting-started` | 52 | 123 | Getting-started / overview / onboarding introductions |
| `release-notes` | 94 | 110 | Release notes, changelogs, version/product updates |
| `ux-friction` | 48 | 100 | Troubleshooting, errors, workarounds, FAQs, tips, known limitations |

## Start-here reading lists (per teardown topic)

The highest-signal articles per topic, ranked by tag relevance (changelogs and video stubs de-prioritized). Each entry: **title** — one-line gist. Follow the link to the full source.

### Naming & lot identity

Tags: `naming`, `lot-identity`, `blending`

**vintrace** (18 of 117 tagged):

- [Bulk Wine Search](../vintrace-docs/vintrace-web/winemaking/bulk-wine-search.md) — The Bulk Wine Search allows you to quickly find bulk products using criteria such as the batch code, batch owner, and vintage.
- [Managing Trial Blends](../vintrace-docs/vintrace-web/winemaking/managing-trial-blends.md) — You can manage your trial blends from the Trial Blend Console.
- [Tiraging Wine](../vintrace-docs/vintrace-web/sparkling-wine/tiraging-wine.md) — You can access the Tirage operation from the following:.
- [Transferring a Trial Blend to Multiple Tanks](../vintrace-docs/vintrace-web/winemaking/transferring-a-trial-blend-to-multiple-tanks.md) — This functionality is available starting with vintrace 9.4.3.
- [Using the Batch Explorer](../vintrace-docs/vintrace-web/winemaking/using-the-batch-explorer.md) — The Batch Explorer lets you view your current and depleted bulk wines by batch so that you can follow their journey from production to finished goods.
- [Changing a Wine Batch's Properties](../vintrace-docs/vintrace-web/winemaking/changing-a-wine-batch-s-properties.md) — You can change a wine batch’s properties, or edit its batch code.
- [Changing a Batch Code During Transfer](../vintrace-docs/vintrace-web/winemaking/changing-a-batch-code-during-transfer.md) — To change a wine’s batch code during a transfer:.
- [Configuring and Using Auto-Codes](../vintrace-docs/setup-and-admin/configuration/configuring-and-using-auto-codes.md) — Auto-code policies make it easy to automatically generate an identifier (e.g. name, ID) for a large number of records such as barrels or tanks using a pre-defined convention.
- [Tagging Wines](../vintrace-docs/vintrace-web/winemaking/tagging-wines.md) — This feature is only available in the new vintrace.
- [Tracking Estate Wine (US)](../vintrace-docs/vintrace-web/compliance/tracking-estate-wine-us.md) — You can enable Estate wine tracking from the Winery Setup window (Setup Options > Infrastructure > Winery):.
- [Breaking Barrel Out of a Barrel Group](../vintrace-docs/vintrace-web/barrel-management/breaking-barrel-out-of-a-barrel-group.md) — If you need to take a particular barrel out of a barrel group, you can use the Break Barrel operation.
- [Blended, Moved or Used Wines](../vintrace-docs/reporting/bulk-wine/blended-moved-or-used-wines.md) — There are several reports that you can run to report on blended, moved, and used wines.
- [Bulk Cost Movement by Posted Date Report](../vintrace-docs/reporting/bulk-wine/bulk-cost-movement-by-posted-date-report.md) — This functionality is available starting with vintrace 9.4.3.
- [Days on Skins](../vintrace-docs/harvest-vintage/crush-and-press/days-on-skins.md) — There may be times when you want to know how long a wine has been on skins.
- [Improved Lab Entry Workflows](../vintrace-docs/vintrace-web/lab-work/improved-lab-entry-workflows.md) — vintrace’s improved lab entry workflows give you the flexibility to decide when to enter lab data.
- [Lot Tracking Traceability](../vintrace-docs/vintrace-web/winemaking/lot-tracking-traceability.md) — This functionality is only available to users with the Inventory module.
- [Receiving Bottled Wine into Inventory](../vintrace-docs/vintrace-web/bottling-and-inventory/receiving-bottled-wine-into-inventory.md) — This article assumes that the Inventory module is enabled.
- [RTD Production: Bottling](../vintrace-docs/vintrace-web/distilled-spirits-plant/rtd-production-bottling.md) — Prior to recording the Bulk Dispatch operation, change the batch and ensure its designated variety is set to Cocktails and Mixed Drinks so that it’s correctly reported in Part IV of the Processing Report.

**InnoVint** (18 of 100 tagged):

- [How do I record a Blend & Return?](../innovint-docs/guidance-faqs/frequently-asked-questions/how-do-i-record-a-blend-return.md) — Blend and Return. We’re received a few requests to be able to blend multiple lots and then return the blend to the original vessels.
- [Lot Details Page](../innovint-docs/make/lots/lot-details-page.md) — The Lot Details Page is the home base for all details regarding a specific lot and there is a huge amount of data to explore.
- [How to Split a Lot](../innovint-docs/guidance-faqs/frequently-asked-questions/how-to-split-a-lot.md) — Maybe you drained and pressed into a tank, and then wanted half the lot to go to barrel, and half to a wood tank; maybe you want to age part of your Chardonnay in stainless and part in barrels.
- [Changing Lot Properties](../innovint-docs/make/lots/changing-lot-properties.md) — You can change the lot code, lot name, lot color or lot style at any point in time, whether your lot has contents or not, as long as your lot is not archived.
- [How to Add Packaging to Case Goods](../innovint-docs/make/case-goods-in-make/how-to-add-packaging-to-case-goods.md) — Need to add labels to your shiners in MAKE after bottling?
- [Juice/Wine Lot Attributes](../innovint-docs/make/lots/juice-wine-lot-attributes.md) — When creating a new juice or wine lot, users can designate the properties of that lot.
- [Lot Properties History Report](../innovint-docs/make/reporting/lot-properties-history-report.md) — The Lot Properties History Report gives you a winery-level view of all lot property and attribute changes over time.
- [InnoVint + VinWizard Integration](../innovint-docs/make-advanced-features/integrations/innovint-vinwizard-integration.md) — If you have mapped all your vessels, and see the Failure Reason "Vessel not assigned to any lot," that just means your tanks are empty in InnoVint.
- [How to print Lot Labels](../innovint-docs/make/printing-labels-from-innovint/how-to-print-lot-labels.md) — Lot labels can be printed in bulk for many lots at once or one lot at a time.
- [InnoApp: Vessels](../innovint-docs/innoapp/innoapp/innoapp-vessels.md) — By clicking on one of the vessels on the InnoApp Vessel Explorer, you are taken to the Vessel Details Page, which gives more detailed information on that particular vessel.
- [Tank Maps](../innovint-docs/make-advanced-features/general/tank-maps.md) — The Tank Map feature allows users to build a digital replica of their winery's tank map.
- [Creating a New Lot within an Action or Task](../innovint-docs/make/recording-actions/creating-a-new-lot-within-an-action-or-task.md) — You can create a new lot via the +Add lot button on the Lot Explorer.
- [How to Track Fruit Sold During Harvest](../innovint-docs/harvest/harvest-workflow-fermentation-tracking/how-to-track-fruit-sold-during-harvest.md) — Go to your Vineyard Explorer > Fruit Lot Explorer.
- [Vessel Details Page](../innovint-docs/make/vessels/vessel-details-page.md) — Navigate to the Vessel Details page by selecting a vessel from the Vessel Explorer.
- [Bottling Report](../innovint-docs/make/reporting/bottling-report.md) — The Bottling report lives under the Reporting tab in the left navigation bar.
- [How to Record a Rack](../innovint-docs/make/movement-actions/how-to-record-a-rack.md) — The Rack action can be performed:.
- [How to Record a Weight Transfer](../innovint-docs/harvest/harvest-workflow-fermentation-tracking/how-to-record-a-weight-transfer.md) — The Weight Transfer action can be used to move weight from one lot into one or multiple other lots.
- [Blend Trials](../innovint-docs/make-advanced-features/general/blend-trials.md) — The Blend Trials feature is a way for users to mock up potential blends in the winery to see if they meet composition, production, cost, analysis and taste targets.

### Corrections & audit

Tags: `corrections`

**vintrace** (18 of 40 tagged):

- [Dispatching, Correcting, and Reversing Packaged Goods](../vintrace-docs/vintrace-web/bottling-and-inventory/dispatching-correcting-and-reversing-packaged-goods.md) — After you’ve packaged wine into bottles, cases, and kegs, you can use the Dispatch operation to enter details for stock items leaving the winery.
- [Fixing a Wine's Composition](../vintrace-docs/vintrace-web/winemaking/fixing-a-wine-s-composition.md) — vintrace enables you to update a wine’s composition.
- [Correcting a Fruit Intake](../vintrace-docs/harvest-vintage/fruit-bookings/correcting-a-fruit-intake.md) — It’s easy to correct most things on a fruit intake such as the wrong weight, wrong fruit source information, or even the truck/delivery details.
- [Correcting a Sample Set](../vintrace-docs/harvest-vintage/fruit-maturity-sampling/correcting-a-sample-set.md) — To make corrections to a sample set's measurements:.
- [Correcting Received Fruit After It's Processed](../vintrace-docs/vintrace-web/winemaking/correcting-received-fruit-after-it-s-processed.md) — The details for fruit that you’ve received and processed can be corrected.
- [Cost Console](../vintrace-docs/vintrace-web/costing/cost-console.md) — The Costs Console makes managing your day-to-day cost operations easier to track and manage.
- [Reversing a Stock Action](../vintrace-docs/vintrace-web/bottling-and-inventory/reversing-a-stock-action.md) — As with bulk wine and dispatches, you may occasionally need to reverse a stock action.
- [Using the Scalehouse for Commodity Intakes and Dispatches](../vintrace-docs/vintrace-web/compliance/using-the-scalehouse-for-commodity-intakes-and-dispatches.md) — This feature is currently being piloted.
- [Correcting Inventory Dispatch Details](../vintrace-docs/vintrace-web/bottling-and-inventory/correcting-inventory-dispatch-details.md) — To correct the details of an inventory dispatch:.
- [Removing a Fruit Booking and Fruit Intake](../vintrace-docs/harvest-vintage/fruit-bookings/removing-a-fruit-booking-and-fruit-intake.md) — If you haven’t received any fruit against a booking, you can mark the booking as inactive:.
- [Editing, Reversing, and Backdating Labs on the Mobile App](../vintrace-docs/mobile-app/labs/editing-reversing-and-backdating-labs-on-the-mobile-app.md) — You can edit, reverse, and backdate labs from the mobile app.
- [Amending a Previously Submitted 5120.17](../vintrace-docs/reporting/ttb-usa/amending-a-previously-submitted-5120-17.md) — If you find a mistake in the TTB Report (5120.17) after you’ve filed it, you’ll need to file an amended report.
- [Updating Costs for Inventory Stock Items](../vintrace-docs/vintrace-web/costing/updating-costs-for-inventory-stock-items.md) — If you discover a data entry error for cost or quantity, or receive a revision such as a credit memo, you can easily update the costs for additives, dry goods, or packaged goods.
- [Deleting Lab Analysis Jobs](../vintrace-docs/vintrace-web/lab-work/deleting-lab-analysis-jobs.md) — Deleting an analysis job deletes it permanently so be sure that you’re deleting the correct job.
- [How do I use rollback and replay to fix data entry errors?](../vintrace-docs/faq/common-questions/how-do-i-use-rollback-and-replay-to-fix-data-entry-errors.md) — The rollback and rollback & replay functions in vintrace enable you to fix data entry errors.
- [Fixing an Incorrect Wine Declaration](../vintrace-docs/vintrace-web/compliance/fixing-an-incorrect-wine-declaration.md) — It’s possible for a wine to be accidentally declared with the wrong tax class and/or bond (most common in a custom crush facility).
- [TTB Report (5120.17)](../vintrace-docs/reporting/ttb-usa/ttb-report-5120-17.md) — You can generate a TTB Report (5120.17) from vintrace.
- [About Fruit Sampling in vintrace](../vintrace-docs/harvest-vintage/fruit-maturity-sampling/about-fruit-sampling-in-vintrace.md) — In vintrace, you'll need to create a sample set for every block that you record fruit samples for.

**InnoVint** (18 of 24 tagged):

- [How do I record Reverse Osmosis filtration in InnoVint?](../innovint-docs/guidance-faqs/frequently-asked-questions/how-do-i-record-reverse-osmosis-filtration-in-innovint.md) — Reverse Osmosis (RO) filtration can be recorded using the Filter action in the Record Action drop-down on the Lot Detail page, or as a Filter task in a work order.
- [Best Practices to Bring Inventory up to Current](../innovint-docs/guidance-faqs/best-practices/best-practices-to-bring-inventory-up-to-current.md) — If you stepped away for just a few weeks or during a time of low activity in the winery, then please continue data entry right where you left off.
- [How to Edit or Delete Recorded Actions](../innovint-docs/make/recording-actions/how-to-edit-or-delete-recorded-actions.md) — Direct actions immediately record a movement or piece of data to InnoVint when they are submitted.
- [How to Edit or Delete Inventory Actions](../innovint-docs/supply/actions-in-supply/how-to-edit-or-delete-inventory-actions.md) — All submitted inventory actions can easily be edited and deleted using the “Edit Action” and “Delete Action” buttons in the top right corner.
- [Change or Edit Vessel Details](../innovint-docs/make/vessels/change-or-edit-vessel-details.md) — After creation of a vessel, if you find that one or more of the vessel characteristics are incorrect, have changed, or need to be updated, you can edit the vessel details to correct the vessel information.
- [How InnoVint calculates SO₂ additions](../innovint-docs/make/additions/how-innovint-calculates-so-additions.md) — InnoVint determines your rate of SO₂ addition based on the SO₂ type: Liquid, Dry/Powder, or Tablet.
- [Weight and Volume Adjustments for Undeclared Fruit or Juice](../innovint-docs/harvest/harvest-workflow-fermentation-tracking/weight-and-volume-adjustments-for-undeclared-fruit-or-juice.md) — Adjustments to weight or volume of your undeclared lots may be necessary after you receive fruit or juice.
- [How to Edit a Work Order](../innovint-docs/make/work-orders/how-to-edit-a-work-order.md) — Open work orders can be edited to change the title, due date, and assigned to, as well as instructions, and vessel & lot selections within the tasks.
- [Troubleshooting printer settings for labels](../innovint-docs/make/printing-labels-from-innovint/troubleshooting-printer-settings-for-labels.md) — Q: My labels are not aligning correctly when I print from the PDF.
- [Depleting and Adjusting On Hand Dry Goods Inventory](../innovint-docs/make/dry-goods/depleting-and-adjusting-on-hand-dry-goods-inventory.md) — Additive and packaging batches can be depleted within an Addition or Bottle action or task...
- [How to create a Fruit Lot](../innovint-docs/harvest/harvest-workflow-fermentation-tracking/how-to-create-a-fruit-lot.md) — Fruit lots in InnoVint are required to receive fruit during harvest and can also be used to track vineyard and maturity analytics.
- [How to Receive Fruit](../innovint-docs/harvest/harvest-workflow-fermentation-tracking/how-to-receive-fruit.md) — The Receive Fruit action in InnoVint is your first step when bringing fruit weight into your facility from a vineyard.
- [Declare or Edit Tax Class](../innovint-docs/make/compliance/declare-or-edit-tax-class.md) — InnoVint makes it easy to declare and edit tax classes on lots, which map directly to the TTB Report.
- [Fortification and Amelioration](../innovint-docs/make/additions/fortification-and-amelioration.md) — To fortify, or ameliorate your wine lot requires a few simple Volume Adjustments.
- [How do I Remove Destroyed Wine from my Inventory?](../innovint-docs/guidance-faqs/frequently-asked-questions/how-do-i-remove-destroyed-wine-from-my-inventory.md) — To remove "destroyed" gallons, record a Volume Adjustmentand select reason: Losses (Other than inventory) or Inventory Losses.
- [How to Import Analyses via .csv file](../innovint-docs/make/analysis/how-to-import-analyses-via-csv-file.md) — The Analysis Import action allows you to import analysis data in bulk via a csv file for one or more lots or vessels.
- [InnoVint + Onafis Integration](../innovint-docs/make-advanced-features/integrations/innovint-onafis-integration.md) — Onafis and InnoVint have partnered to enable two-way data synchronization between your InnoVint winery account and your Onafis densimeters.
- [Sweetening Workflows](../innovint-docs/make/additions/sweetening-workflows.md) — This article discusses three different workflows to add sweetening material (sugar, concentrate or sweetening juice) to declared wine:.

### Compliance (TTB / tax / bond)

Tags: `ttb`, `tax-class`, `bond`, `compliance`

**vintrace** (18 of 87 tagged):

- [Returning Shipped Juice to Fermenter](../vintrace-docs/vintrace-web/compliance/returning-shipped-juice-to-fermenter.md) — This article is for US customers.
- [California Winegrower Tax Return (Supplemental Report)](../vintrace-docs/reporting/ttb-usa/california-winegrower-tax-return-supplemental-report.md) — This article is specifically for U.S. customers in California.
- [State Government Tax Class Report](../vintrace-docs/reporting/ttb-usa/state-government-tax-class-report.md) — The State Government Tax Class Report shows tax movements for state government tax classes.
- [Amending a Previously Submitted 5120.17](../vintrace-docs/reporting/ttb-usa/amending-a-previously-submitted-5120-17.md) — If you find a mistake in the TTB Report (5120.17) after you’ve filed it, you’ll need to file an amended report.
- [Bottled Wine Movements in the TTB Report without the Inventory Module](../vintrace-docs/reporting/ttb-usa/bottled-wine-movements-in-the-ttb-report-without-the-inventory-module.md) — Users without the Inventory module can view bottled wine movements in the TTB Report.
- [Distillation: Moving Distilling Material from a Bonded Winery to a DSP Bond](../vintrace-docs/vintrace-web/distilled-spirits-plant/distillation-moving-distilling-material-from-a-bonded-winery-to-a-dsp-bond.md) — This functionality is part of our Distilled Spirits Plant functionality and is not enabled by default.
- [Fixing an Incorrect Wine Declaration](../vintrace-docs/vintrace-web/compliance/fixing-an-incorrect-wine-declaration.md) — It’s possible for a wine to be accidentally declared with the wrong tax class and/or bond (most common in a custom crush facility).
- [Juice and Concentrate Classes on TTB Report (US)](../vintrace-docs/vintrace-web/compliance/juice-and-concentrate-classes-on-ttb-report-us.md) — This article is specifically for grape juice and concentrate.
- [Managing Tax-Paid Wines](../vintrace-docs/vintrace-web/compliance/managing-tax-paid-wines.md) — Tax-paid wines are those that have had the excise tax paid and which must now be kept separate from wines that are in bond (i.e., taxes not yet paid).
- [TTB Report (5120.17)](../vintrace-docs/reporting/ttb-usa/ttb-report-5120-17.md) — You can generate a TTB Report (5120.17) from vintrace.
- [Declaring Wine from the Product Page](../vintrace-docs/vintrace-web/compliance/declaring-wine-from-the-product-page.md) — Sometimes you may want to declare a single wine.
- [Managing Wines for Your Tasting Room](../vintrace-docs/vintrace-web/compliance/managing-wines-for-your-tasting-room.md) — When you receive your basic bond from the TTB, you have a concurrent bond which covers your tasting room if it’s part of the winery bonded area.
- [Spirits Used in Wine Production on TTB Report (US)](../vintrace-docs/vintrace-web/compliance/spirits-used-in-wine-production-on-ttb-report-us.md) — This article explains spirits used in Part III - Summary of Distilled Spirits of the TTB Report on Wine Premises Operations in vintrace.
- [Tax Event Console](../vintrace-docs/reporting/ttb-usa/tax-event-console.md) — In addition to the Tax Breakdown Report, the Tax Event Console provides a way to troubleshoot your TTB Report.
- [Transferring Wines Between Bonds (US)](../vintrace-docs/vintrace-web/compliance/transferring-wines-between-bonds-us.md) — By default, all wines will come under a winery bond in vintrace that’s derived from the wine’s location.
- [TTB Report Inclusions and Exclusions](../vintrace-docs/reporting/ttb-usa/ttb-report-inclusions-and-exclusions.md) — This article details what is and isn’t covered by a TTB Report (5120.17) either because the TTB doesn’t consider a product as reportable, or because vintrace doesn’t support certain product classes.
- [Using vintrace for Hard Seltzer](../vintrace-docs/vintrace-web/hard-seltzer/using-vintrace-for-hard-seltzer.md) — You can easily use vintrace for hard seltzers by doing the following:.
- [Receiving Stock](../vintrace-docs/vintrace-web/bottling-and-inventory/receiving-stock.md) — If you’re tracking stock levels on any of your non-bulk items, you’ll want to start by receiving some into inventory.

**InnoVint** (18 of 92 tagged):

- [Generate and Download the TTB Report](../innovint-docs/make/compliance/generate-and-download-the-ttb-report.md) — InnoVint is working behind the scenes of every action you perform in the system to provide an accurate 5120.17 TTB export report (previously the 702) for your winery.
- [How InnoVint populates the TTB report](../innovint-docs/make/compliance/how-innovint-populates-the-ttb-report.md) — This article outlines how each section of the TTB report is populated by specific actions in InnoVint.
- [Declare or Edit Tax Class](../innovint-docs/make/compliance/declare-or-edit-tax-class.md) — InnoVint makes it easy to declare and edit tax classes on lots, which map directly to the TTB Report.
- [Juice/Wine Lot Attributes](../innovint-docs/make/lots/juice-wine-lot-attributes.md) — When creating a new juice or wine lot, users can designate the properties of that lot.
- [The TTB 5120.17: Getting to know your InnoVint TTB Report](../innovint-docs/make/compliance/the-ttb-5120-17-getting-to-know-your-innovint-ttb-report.md) — Whether you report monthly, quarterly or annually, InnoVint can streamline your reporting process… as long as you and your team understand how InnoVint populates the TTB Report.
- [Understanding the TTB Audit Report](../innovint-docs/make/compliance/understanding-the-ttb-audit-report.md) — This article covers how to use the Audit Report in InnoVint:.
- [What is the State Compliance by Bond Report?](../innovint-docs/make/compliance/what-is-the-state-compliance-by-bond-report.md) — A wine's tax class determines how much excise tax is paid per gallon of wine as defined by the percentage of alcohol in the wine.
- [Tax Cuts & Jobs Act Impact](../innovint-docs/make/compliance/tax-cuts-jobs-act-impact.md) — "On December 27, 2020, the President signed the Taxpayer Certainty and Disaster Tax Act of 2020 (Division EE of the Consolidated Appropriations Act, 2021), which made permanent most CBMA provisions of the Tax Cuts and Jobs Act of 2017.
- [Compliance Reporting: How does SUPPLY populate the TTB Report?](../innovint-docs/supply/using-supply/compliance-reporting-how-does-supply-populate-the-ttb-report.md) — SUPPLY provides a comprehensive export to help you populate Section B - Bottled Wines for the TTB Report 5120.17.
- [Why gallons are showing in "Produced by Blending" in your 5120.17](../innovint-docs/make/compliance/why-gallons-are-showing-in-produced-by-blending-in-your-5120-17.md) — If you are seeing gallons populate in the "Produced by Blending" or "Used for Blending" sections of your TTB 5120.17 report that you feel shouldn't be there, this may be the result of a tax class blend action.
- [Tracking Case Goods - MAKE to SUPPLY](../innovint-docs/supply/using-supply/tracking-case-goods-make-to-supply.md) — When it comes to tracking movements of cased goods in and out of bond, SUPPLY is intended to be the final source of truth for case goods inventory management, streamlining inventory control and compliance across multiple locations.
- [How to create a Bill of Lading (BOL) in MAKE](../innovint-docs/make/compliance/how-to-create-a-bill-of-lading-bol-in-make.md) — Create and print a Bill of Lading document from within InnoVint using your lot data and information that is tracked within the platform.
- [How to Receive Juice](../innovint-docs/harvest/harvest-workflow-fermentation-tracking/how-to-receive-juice.md) — In order to bring unfermented juice into your facility, follow a 2-step process:.
- [Tracking Brandy or Distilled Spirits in InnoVint](../innovint-docs/guidance-faqs/specialized-workflows/tracking-brandy-or-distilled-spirits-in-innovint.md) — This article covers how to add a source component in InnoVint to track your high proof alcohol and report the volume on the 5120.17 TTB report.
- [Which B2B Action should I use?](../innovint-docs/guidance-faqs/frequently-asked-questions/which-b2b-action-should-i-use.md) — Do you have more than one bond in your winery?
- [Blending Across Tax Classes](../innovint-docs/guidance-faqs/frequently-asked-questions/blending-across-tax-classes.md) — InnoVint's system allows you to blend across different tax classes.
- [How do I Remove Destroyed Wine from my Inventory?](../innovint-docs/guidance-faqs/frequently-asked-questions/how-do-i-remove-destroyed-wine-from-my-inventory.md) — To remove "destroyed" gallons, record a Volume Adjustmentand select reason: Losses (Other than inventory) or Inventory Losses.
- [SKU Explorer](../innovint-docs/supply/getting-started-with-supply/sku-explorer.md) — The SKU Explorer is the homepage for SUPPLY.

### Configuration & permissions

Tags: `configuration`, `permissions`

**vintrace** (18 of 290 tagged):

- [Address Book Contacts](../vintrace-docs/setup-and-admin/configuration/address-book-contacts.md) — There are four types of contacts that you can add to your Address Book:.
- [Configuration for Multi-Winery Support](../vintrace-docs/setup-and-admin/configuration/configuration-for-multi-winery-support.md) — vintrace has improved support for users with a multi-winery license.
- [Roles and Permissions](../vintrace-docs/setup-and-admin/configuration/roles-and-permissions.md) — If your account has single sign-on (SSO) enabled, refer to our Managing System Users (SSO enabled) article for details on managing system users and the available roles and permissions.
- [Setting Up AP02 Licenses](../vintrace-docs/setup-and-admin/configuration/setting-up-ap02-licenses.md) — Under US law, clients who make wine at your facility under bond can be set up as an Alternating Proprietorship (AP02).
- [Managing Owner/Client Logins](../vintrace-docs/setup-and-admin/configuration/managing-owner-client-logins.md) — An owner (client) login is a contact who’s associated with an owner organization.
- [Setting Up Service Orders](../vintrace-docs/vintrace-web/custom-crush-billing/setting-up-service-orders.md) — A service order represents a client’s winemaking contract with you and links them to a price list that represents your fee schedule for the client.
- [Managing Owner/Client Logins (SSO enabled)](../vintrace-docs/setup-and-admin/configuration/managing-owner-client-logins-sso-enabled.md) — An owner (client) login is a contact who’s associated with an owner organization.
- [Removing a Contact](../vintrace-docs/setup-and-admin/configuration/removing-a-contact.md) — De-activating a contact prevents them from being included in any of vintrace’s lists.
- [Starting Your Sandbox](../vintrace-docs/setup-and-admin/configuration/starting-your-sandbox.md) — The sandbox lets you create a copy of your production environment so that you can learn and try vintrace’s features.
- [Managing SSO Methods](../vintrace-docs/setup-and-admin/configuration/managing-sso-methods.md) — You can configure vintrace to enable the following sign-on methods:.
- [Managing System Users](../vintrace-docs/setup-and-admin/configuration/managing-system-users.md) — Users with the Local vintrace Administrator permission can add, edit, and remove vintrace users.
- [Managing User Accounts (Central Authorisation/SSO enabled)](../vintrace-docs/setup-and-admin/configuration/managing-user-accounts-central-authorisation-sso-enabled.md) — System users are the individuals who will use vintrace to perform tasks and operations for your winery.
- [Baker Lab Integration](../vintrace-docs/setup-and-admin/integrations-labs-and-tanks/baker-lab-integration.md) — Vintrace has a direct link to Baker Lab that enables their customers to get their analysis data without having to download or upload files.
- [Managing Stock Allocations for Cased Goods](../vintrace-docs/vintrace-web/finished-goods-allocations/managing-stock-allocations-for-cased-goods.md) — You can manage the stock allocation for your customers’ and sales regions’ cased goods from the Products page.
- [Enabling Custom Print Templates](../vintrace-docs/setup-and-admin/custom-print-templates/enabling-custom-print-templates.md) — Only local vintrace administrators, or senior members of the winemaking/cellar team should enable custom print templates.
- [Mapping a Lab's Metric Names](../vintrace-docs/vintrace-web/lab-work/mapping-a-lab-s-metric-names.md) — The steps detailed below apply to WineScan, Priority ERP, Konelab, OenoFoss, ETS, Baker Labs, Thermo Scientific Gallery, ChemWell, Admeo/BioSystems Y15 and SPICA, and Anton Paar DMA 35.
- [Prevent Overfilling Vessels](../vintrace-docs/vintrace-web/winemaking/prevent-overfilling-vessels.md) — This setting is disabled by default.
- [Managing API tokens](../vintrace-docs/setup-and-admin/api/managing-api-tokens.md) — API tokens linked to a user account can now be generated in vintrace for use with the vintrace API.

**InnoVint** (18 of 88 tagged):

- [Managing and Using Shipping Locations in InnoVint](../innovint-docs/new-to-innovint/settings-make-grow-finance/managing-and-using-shipping-locations-in-innovint.md) — Destination locations can be saved to your InnoVint account to help you quickly fill in the 'Shipped to' details within a Bill of Lading.
- [Member Management: How to Add, Edit or Remove Users](../innovint-docs/new-to-innovint/settings-make-grow-finance/member-management-how-to-add-edit-or-remove-users.md) — Do you want to grant access to InnoVint for your cellar crew and winery staff?
- [Overview: User Permissions and Capability Levels](../innovint-docs/new-to-innovint/settings-make-grow-finance/overview-user-permissions-and-capability-levels.md) — Winery members and users can be granted 1 of 4 different capability levels.
- [Owner-based Permissions and Member Capabilities (Overview/Highlight)](../innovint-docs/make-advanced-features/owner-based-permissions-system/owner-based-permissions-and-member-capabilities-overview-highlight.md) — Activating owner-based permissions in InnoVint allows your winery to track inventory by Owner and control user accessibility by granting them access to one or more Owners in the account.
- [Setting up your Custom Crush Permissions](../innovint-docs/make-advanced-features/owner-based-permissions-system/setting-up-your-custom-crush-permissions.md) — You have just activated a permission-based system and you're ready to get started setting up your account!
- [Getting Started Checklist for MAKE ✅](../innovint-docs/new-to-innovint/getting-started-make-grow-finance/getting-started-checklist-for-make.md) — Getting your winery up and running with MAKE is a straight-forward process.
- [Winery Lock Backdating](../innovint-docs/new-to-innovint/settings-make-grow-finance/winery-lock-backdating.md) — The Lock Backdating capability allows Admin users to set the earliest date and time at which actions can be backdated in InnoVint.
- [Accessing Your InnoVint Account](../innovint-docs/new-to-innovint/accessing-innovint/accessing-your-innovint-account.md) — InnoVint is committed to ensuring that your data remains safe and secure.
- [Blend Trials](../innovint-docs/make-advanced-features/general/blend-trials.md) — The Blend Trials feature is a way for users to mock up potential blends in the winery to see if they meet composition, production, cost, analysis and taste targets.
- [InnoVint + Onafis Integration](../innovint-docs/make-advanced-features/integrations/innovint-onafis-integration.md) — Onafis and InnoVint have partnered to enable two-way data synchronization between your InnoVint winery account and your Onafis densimeters.
- [Onboard Starting Costs & Cost Settings](../innovint-docs/finance/getting-started/onboard-starting-costs-cost-settings.md) — Admins can add, remove, and edit winery member permissions by going to Settings:.
- [InnoApp: Troubleshooting your scanner](../innovint-docs/innoapp/innoapp/innoapp-troubleshooting-your-scanner.md) — This is never a good look!
- [Skipping a Task within a Work Order](../innovint-docs/make/work-orders/skipping-a-task-within-a-work-order.md) — After a work order has been created, the assignee can choose not to complete one or more of the tasks within the work order by "skipping" them.
- [Bond to Bond Transfers (B2B)](../innovint-docs/make/movement-actions/bond-to-bond-transfers-b2b.md) — InnoVint provides different options for receiving or transferring inventory into or out of bond.
- [How to Add a New Bond in MAKE](../innovint-docs/new-to-innovint/settings-make-grow-finance/how-to-add-a-new-bond-in-make.md) — Need to add a new bond to your InnoVint MAKE account?
- [Display Preferences in Settings](../innovint-docs/new-to-innovint/settings-make-grow-finance/display-preferences-in-settings.md) — What can you set in Display Preferences?
- [Managing and Using Dip Charts in InnoVint](../innovint-docs/new-to-innovint/settings-make-grow-finance/managing-and-using-dip-charts-in-innovint.md) — Dip charts are not available at all subscription levels.
- [Multi-factor Authentication (MFA) Settings](../innovint-docs/new-to-innovint/accessing-innovint/multi-factor-authentication-mfa-settings.md) — Multi-Factor Authentication (MFA) is now an account security option that you opt into at the "user" level.

### Migration & onboarding

Tags: `migration`, `getting-started`

**vintrace** (18 of 107 tagged):

- [Changing Operating System Date and Time Formats for Imports](../vintrace-docs/setup-and-admin/getting-started/changing-operating-system-date-and-time-formats-for-imports.md) — In order to import and export data that contains dates and/or times into vintrace, you’ll need to ensure that the date and time formats in your operating system have leading zeros.
- [Product Notes and Attachments on the Mobile App](../vintrace-docs/mobile-app/getting-started-with-vintrace-mobile/product-notes-and-attachments-on-the-mobile-app.md) — To add notes and attachments to your wine from the mobile app:.
- [Updating Blocks' Micro AVAs in Bulk](../vintrace-docs/harvest-vintage/growers-vineyards-and-blocks/updating-blocks-micro-avas-in-bulk.md) — After you’ve added micro AVAs (either manually or using an import), you can update the blocks in bulk to reflect their micro AVAs.
- [Tank Yield](../vintrace-docs/vintrace-web/winemaking/tank-yield.md) — This functionality is available starting with vintrace 9.4.3, but not enabled by default.
- [Accessing vintrace with Single Sign-On](../vintrace-docs/setup-and-admin/getting-started/accessing-vintrace-with-single-sign-on.md) — Please contact support for more details on the availability for Single sign-on (SSO).
- [Importing Micro AVAs](../vintrace-docs/setup-and-admin/configuration/importing-micro-avas.md) — Instead of manually adding each micro AVA, you can use vintrace’s data import functionality to add the micro AVAs using a spreadsheet.
- [Importing Sub-Regions](../vintrace-docs/setup-and-admin/configuration/importing-sub-regions.md) — Instead of manually adding each sub-region to vintrace, you can use vintrace’s data import functionality to add the sub-regions using a spreadsheet.
- [Importing Sales Orders](../vintrace-docs/vintrace-web/sales/importing-sales-orders.md) — Using data from a third-party point-of-sales (POS) or eCommerce systems, you can import sales orders into vintrace.
- [Viewing Sample Set Analysis Results](../vintrace-docs/harvest-vintage/fruit-maturity-sampling/viewing-sample-set-analysis-results.md) — Once you have recorded some maturity sampling data against a block, there are a number of options for viewing that data.
- [Adding Notes and Attachments to Wine](../vintrace-docs/vintrace-web/winemaking/adding-notes-and-attachments-to-wine.md) — This feature is only available in the new vintrace.
- [Can I save the column mapping for a sales order import?](../vintrace-docs/faq/common-questions/can-i-save-the-column-mapping-for-a-sales-order-import.md) — vintrace lets you import data from third-party point-of-sales or eCommerce systems.
- [Exporting and Importing Allocated Products](../vintrace-docs/vintrace-web/finished-goods-allocations/exporting-and-importing-allocated-products.md) — In order to export and import allocated products, you will need the Can Add/Edit Allocation Products permission.
- [Importing and Exporting Data](../vintrace-docs/setup-and-admin/configuration/importing-and-exporting-data.md) — The ability to import and export data is only available to users with the Import/Export Setup Data permission.
- [Importing Client Billing Invoices into Xero](../vintrace-docs/setup-and-admin/integrations-accounting/importing-client-billing-invoices-into-xero.md) — You can import a CSV file into Xero with your invoice details.
- [Importing OenoFoss Results for Fruit Samples](../vintrace-docs/vintrace-web/lab-work/importing-oenofoss-results-for-fruit-samples.md) — When you process lab samples on your OenoFoss, you’ll need to enter a code to reference the sample.
- [Exporting and Importing Product Allocations](../vintrace-docs/vintrace-web/finished-goods-allocations/exporting-and-importing-product-allocations.md) — In order to export and import product allocations using a CSV file, you will need the Can Manage Product Allocations permission.
- [Set up DYMO label paper sizes](../vintrace-docs/setup-and-admin/hardware/set-up-dymo-label-paper-sizes.md) — To adjust the paper size on your DYMO label printer while using a Windows operating system, open up Printers under the Control Panel.
- [Block Overview Window](../vintrace-docs/harvest-vintage/growers-vineyards-and-blocks/block-overview-window.md) — The Block Overview window lets you view and manage your blocks details, fruit sampling, and viticulture assessments.

**InnoVint** (18 of 148 tagged):

- [How to Onboard Inventory - Overview](../innovint-docs/new-to-innovint/getting-started-make-grow-finance/how-to-onboard-inventory-overview.md) — Have you reached Step Two of the Getting Started Checklist?
- [Pre-Onboarding Guide & Checklist!](../innovint-docs/new-to-innovint/getting-started-make-grow-finance/pre-onboarding-guide-checklist.md) — Your onboarding date is set and we are excited to get you started!
- [The SUPPLY Onboarding Checklist](../innovint-docs/supply/getting-started-with-supply/the-supply-onboarding-checklist.md) — Getting your case goods inventory management up and running with InnoVint is a straight-forward process.
- [How to Access the Support Center and Submit a Help Ticket](../innovint-docs/new-to-innovint/general/how-to-access-the-support-center-and-submit-a-help-ticket.md) — To access the Support Center through InnoVint's desktop app, click the question mark icon in the upper right hand corner of your screen.
- [How to Onboard Inventory in SUPPLY](../innovint-docs/supply/getting-started-with-supply/how-to-onboard-inventory-in-supply.md) — The Onboard inventory action is used when onboarding into SUPPLY and bringing in inventory that was previously tracked somewhere else.
- [MAKE Case Goods: Feature Overview](../innovint-docs/make/case-goods-in-make/make-case-goods-feature-overview.md) — How to Create Case Goods Inventory.
- [Onboard Starting Costs & Cost Settings](../innovint-docs/finance/getting-started/onboard-starting-costs-cost-settings.md) — Admins can add, remove, and edit winery member permissions by going to Settings:.
- [InnoVint on iPad or tablet](../innovint-docs/new-to-innovint/accessing-innovint/innovint-on-ipad-or-tablet.md) — We recommend saving the InnoVint desktop browser app (the one you would normally use on your desktop computer) to your tablet home screen the first time you open it.
- [SKU Details Page](../innovint-docs/supply/getting-started-with-supply/sku-details-page.md) — The SKU Details Page is the home base for all details regarding a specific SKU.
- [Step 2: Add your vessels](../innovint-docs/new-to-innovint/getting-started-make-grow-finance/step-2-add-your-vessels.md) — Every juice/wine lot created in InnoVint needs to be filled into vessels.
- [Step 3: Add your lots](../innovint-docs/new-to-innovint/getting-started-make-grow-finance/step-3-add-your-lots.md) — To begin, go to the Lot Explorer by clicking on Lots in the left navigation bar.
- [Knock Out Your Production Costs!](../innovint-docs/innovint-academy/video-trainings-tutorials/knock-out-your-production-costs.md) — Get started with COGS Tracking in InnoVint, using this recorded webinar.
- [Options to Enter and Track Analysis](../innovint-docs/innovint-academy/video-trainings-tutorials/options-to-enter-and-track-analysis.md) — In this InnoVint Academy session, we review the multiple ways to record analyses into your account.
- [Getting Started Checklist for MAKE ✅](../innovint-docs/new-to-innovint/getting-started-make-grow-finance/getting-started-checklist-for-make.md) — Getting your winery up and running with MAKE is a straight-forward process.
- [How to Add Bonds and Locations in SUPPLY](../innovint-docs/supply/getting-started-with-supply/how-to-add-bonds-and-locations-in-supply.md) — Both bonds and locations must be added on the backend by InnoVint’s Support Team.
- [Intended Use Overview](../innovint-docs/make-advanced-features/intended-use/intended-use-overview.md) — Intended Use is currently a "beta" feature, available to selected subscription levels.
- [New User to InnoVint](../innovint-docs/new-to-innovint/getting-started-make-grow-finance/new-user-to-innovint.md) — We are excited to welcome you to InnoVint and want to give you some resources to be able to dive straight into your winery account.
- [Step 4: Fill lots with volume](../innovint-docs/new-to-innovint/getting-started-make-grow-finance/step-4-fill-lots-with-volume.md) — It's now time to add the contents to your lots.

### UX & friction

Tags: `ux-friction`

**vintrace** (18 of 48 tagged):

- [Accessing the vintrace 'pourtal'](../vintrace-docs/faq/common-questions/accessing-the-vintrace-pourtal.md) — Welcome to the vintrace 'pourtal'—your comprehensive hub for all things support and community.
- [How do I use rollback and replay to fix data entry errors?](../vintrace-docs/faq/common-questions/how-do-i-use-rollback-and-replay-to-fix-data-entry-errors.md) — The rollback and rollback & replay functions in vintrace enable you to fix data entry errors.
- [How do I watch your webinars?](../vintrace-docs/faq/common-questions/how-do-i-watch-your-webinars.md) — We upload all of our recorded webinars to the vintrace Youtube channel.
- [How do I change my password?](../vintrace-docs/faq/common-questions/how-do-i-change-my-password.md) — To change your own password:.
- [How do I launch multiple windows in vintrace?](../vintrace-docs/faq/common-questions/how-do-i-launch-multiple-windows-in-vintrace.md) — To open another vintrace window, click the plus icon located at the bottom of the sidebar.
- [How do I change the date on a completed operation?](../vintrace-docs/faq/common-questions/how-do-i-change-the-date-on-a-completed-operation.md) — In order to change a completed operation's date, you must have the Advanced Data Management permission.
- [How do I reprint a Bill of Lading (BOL)?](../vintrace-docs/faq/common-questions/how-do-i-reprint-a-bill-of-lading-bol.md) — To reprint a bill of lading:.
- [How do I reprint a work order?](../vintrace-docs/faq/common-questions/how-do-i-reprint-a-work-order.md) — To reprint a work order from the Job Management console:.
- [How do I turn off pop-up blockers when PDF’s won’t display?](../vintrace-docs/faq/common-questions/how-do-i-turn-off-pop-up-blockers-when-pdf-s-won-t-display.md) — The most common reason that prevents PDF files from being generated by vintrace is that pop-up blockers are enabled in your browser.
- [Troubleshooting Your TTB report](../vintrace-docs/reporting/ttb-usa/troubleshooting-your-ttb-report.md) — Because errors happen, your TTB Report may not add up perfectly.
- [Can I save the column mapping for a sales order import?](../vintrace-docs/faq/common-questions/can-i-save-the-column-mapping-for-a-sales-order-import.md) — vintrace lets you import data from third-party point-of-sales or eCommerce systems.
- [Prevent Overfilling Vessels](../vintrace-docs/vintrace-web/winemaking/prevent-overfilling-vessels.md) — This setting is disabled by default.
- [How to reprint a weigh tag?](../vintrace-docs/faq/common-questions/how-to-reprint-a-weigh-tag.md) — You can reprint a weigh tag from the Fruit Intake Console, or from the Harvest Calendar.
- [Finding a Work Order After a Rollback and Replay](../vintrace-docs/vintrace-web/work-orders/finding-a-work-order-after-a-rollback-and-replay.md) — The rollback and rollback & replay functions in vintrace enable you to fix data entry errors.
- [Specifying a Winery-Specific Prefix](../vintrace-docs/setup-and-admin/configuration/specifying-a-winery-specific-prefix.md) — You can specify a winery-specific prefix that will be used for new work orders, fruit dockets, and bills of lading.
- [Update your language](../vintrace-docs/setup-and-admin/getting-started/update-your-language.md) — TIP: This only changes the language setting for your individual login.
- [Amending a Previously Submitted 5120.17](../vintrace-docs/reporting/ttb-usa/amending-a-previously-submitted-5120-17.md) — If you find a mistake in the TTB Report (5120.17) after you’ve filed it, you’ll need to file an amended report.
- [Editing and Finalizing Your 5120.17](../vintrace-docs/reporting/ttb-usa/editing-and-finalizing-your-5120-17.md) — Careful record keeping throughout a reporting period increases the likelihood that your TTB Report will be ready for filing.

**InnoVint** (18 of 100 tagged):

- [Troubleshooting & Browser Support Tips](../innovint-docs/guidance-faqs/frequently-asked-questions/troubleshooting-browser-support-tips.md) — Having any trouble? This article reviews some basic troubleshooting tips for data display issues, as well as how to take and send in screenshots to Support for further assistance.
- [Support hours and FAQ](../innovint-docs/support-hours-faqs/general/support-hours-and-faq.md) — Our Support Hours are Monday to Friday 8am - 5pm Pacific Time.
- [How can I add volume to a lot in weight?](../innovint-docs/guidance-faqs/frequently-asked-questions/how-can-i-add-volume-to-a-lot-in-weight.md) — It is very common during harvest for our users to add volume (such as bleed or saignée juice) back into a different lot that is still in weight.
- [Top 3 Recommendations for COGS Tracking Success](../innovint-docs/finance/guidance-faq/top-3-recommendations-for-cogs-tracking-success.md) — InnoVint's FINANCE product provides a powerful mechanism to enter production costs and track wine COGS.
- [Adding and Using Notes in SUPPLY](../innovint-docs/supply/using-supply/adding-and-using-notes-in-supply.md) — You can now add a Note to any action in SUPPLY to record important details — such as bottling information, reasons for depletions, or invoice numbers — directly within the action itself.
- [Best Practices for Entering Overhead Costs](../innovint-docs/finance/guidance-faq/best-practices-for-entering-overhead-costs.md) — Overhead costs (also referred to as soft costs or indirect costs) are the non-material costs associated with your wine's production that usually are capitalized across all or most of your cellar.
- [How to Edit a Work Order](../innovint-docs/make/work-orders/how-to-edit-a-work-order.md) — Open work orders can be edited to change the title, due date, and assigned to, as well as instructions, and vessel & lot selections within the tasks.
- [InnoApp: Navigation & Tips](../innovint-docs/innoapp/innoapp/innoapp-navigation-tips.md) — This article explains the basic organization and navigation for the InnoVint mobile app.
- [InnoApp: Troubleshooting your scanner](../innovint-docs/innoapp/innoapp/innoapp-troubleshooting-your-scanner.md) — This is never a good look!
- [Skipping a Task within a Work Order](../innovint-docs/make/work-orders/skipping-a-task-within-a-work-order.md) — After a work order has been created, the assignee can choose not to complete one or more of the tasks within the work order by "skipping" them.
- [SUPPLY FAQ](../innovint-docs/supply/using-supply/supply-faq.md) — There are some common questions that come up when you are exploring SUPPLY.
- [Tank Maps](../innovint-docs/make-advanced-features/general/tank-maps.md) — The Tank Map feature allows users to build a digital replica of their winery's tank map.
- [Deleting a Work Order](../innovint-docs/make/work-orders/deleting-a-work-order.md) — Work orders can be deleted at any time before they are submitted, but can only be deleted from the web interface/desktop app, and not from the mobile app.
- [How to Reconcile Inventory](../innovint-docs/supply/actions-in-supply/how-to-reconcile-inventory.md) — Taking inventory? The Reconcile Inventory action allows you to true up your inventory after doing a physical count.
- [How to Archive a Vineyard or Vineyard Block](../innovint-docs/make/vineyards/how-to-archive-a-vineyard-or-vineyard-block.md) — If one of your vineyards or a vineyard block is no longer in use, you can archive it to remove it from view.
- [Password Guidelines](../innovint-docs/new-to-innovint/accessing-innovint/password-guidelines.md) — A little while ago, we updated our password policy and we want to take the time to explain the changes, as well as our motivation.
- [COGS Entry Checklist ✅](../innovint-docs/finance/guidance-faq/cogs-entry-checklist.md) — When calculating your true cost of goods, not including the all of the costs contributing to that final bottle will skew your assessment of profit margins.
- [Custom Reports](../innovint-docs/make/reporting/custom-reports.md) — The future of InnoVint reporting is here!

