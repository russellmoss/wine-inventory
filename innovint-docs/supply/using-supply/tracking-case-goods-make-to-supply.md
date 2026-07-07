---
title: "Tracking Case Goods - MAKE to SUPPLY"
url: "https://support.innovint.us/hc/en-us/tracking-case-goods-make-to-supply"
category: "SUPPLY"
section: "Using SUPPLY"
page_type: "page"
lastmod: "2025-11-20"
gist: "When it comes to tracking movements of cased goods in and out of bond, SUPPLY is intended to be the final source of truth for case goods inventory management, streamlining inventory control and compliance across multiple locations."
tags: ["packaging", "inventory", "bond", "compliance", "reporting", "ttb"]
---

# Tracking Case Goods - MAKE to SUPPLY

When it comes to tracking movements of cased goods in and out of bond, SUPPLY is intended to be the final source of truth for case goods inventory management, streamlining inventory control and compliance across multiple locations. How does it work with InnoVint's MAKE product?

Currently, there is not a linkage between MAKE and SUPPLY. Track your wines from grape to bottle in MAKE, then when the finished good is fully packaged and ready to be sold/stored you move it to SUPPLY. Currently, that process is not seamless, but it *is* simple.

- [Option 1) Immediately move all bottled inventory to SUPPLY & remove from MAKE](#option-1)
- [Option 2) Case Goods require further packaging and cost tracking after bottling](#option-2)
- [When do I start using the TTB export in SUPPLY?](#TTB_timing)

Due to the potential for overlapping reporting in Section B, we strongly recommend establishing a clear protocol and expectations with your compliance professional - whether that is YOU, another internal department, or a third party.

#### **Option 1) Immediately move all inventory into SUPPLY & remove from MAKE**

**Bottle**

Bottle as usual in MAKE. If case goods are active, create a case good lot as normal. This action will populate Section A, Line 13 of the TTB Report in MAKE.

**Move to bottled inventory to SUPPLY**

Create [new SKUs](https://support.innovint.us/hc/en-us/how-to-add-skus?hsLang=en) and perform a single [Add inventory action](https://support.innovint.us/hc/en-us/how-to-add-inventory?hsLang=en) with the reason "Bottling" for all the bottled SKUs and input them into SUPPLY on the same date as the bottling occurred at the in-bond location.  This populates the TTB export Section B in Line 2 as "Bottled" in SUPPLY, and you'll be able to rely on this data for compliance reporting in Section B.

If you are bottling into an existing SUPPLY SKU - even better! Just add inventory to the existing SKU (SUPPLY doesn't care about composition!).

**What about Inventory in the Case Good Explorer?**

If you have case goods activated (and even if you plan to remove taxpaid immediately), record a Volume Adjustment (CG) from MAKE down to 0 gal - you no longer need these case goods lots in inventory in MAKE.

 By tracking case goods inventory completely in SUPPLY, you can use any means to remove volume from the Case Goods Explorer in MAKE, and then use the SUPPLY TTB export for your Section B compliance. Even if you remove taxpaid immediately after bottling, it will be EASY to Remove Taxpaid in SUPPLY, and report all in one place on the TTB Export.

**Creating BOLs**

After removing inventory from MAKE, you do not currently have a way to generate a BOL from SUPPLY. You can still consider using the [Report Explorer](https://support.innovint.us/hc/en-us/articles/360055473151-how-to-create-a-bill-of-lading-bol-?hsLang=en#Reportexplorer) in MAKE to generate any future required BOLs out of or between bonds for the inventory in SUPPLY. In MAKE, just use the lot picker to find and select the archived case good lot, and manually set the volume/case count. By generating the BOL via the Report Explorer, you can also add multiple CG lots!

**Add packaging**

This option does not provide support for adding additional packaging to case goods. We'd recommend following [Option 2](#option-2), (track inventory for a period of time in two locations).

**COGS & FINANCE implications**

This option does not provide support for tracking cost on the case good lot. Unless you have fully packaged your wine, and are comfortable relying on the Bottled Cost Report entirely, we'd recommend following [Option 2](#option-2), (track inventory for a period of time in two locations).

**Compliance outcome**

Section A, Line 13 (Bottled) will be populated in MAKE's TTB Report.  All of Section B, including Line 2 (Bottled) can be accurately populated via [SUPPLY'S TTB export](https://support.innovint.us/hc/en-us/how-does-supply-populate-the-ttb-report?hsLang=en).  Clear out or ignore Section B on MAKE's TTB Report. Be sure to review the Bottling Report in MAKE to double-check your volumes, and confirm that all bottled inventory was recorded in SUPPLY.

When you are first onboarding into SUPPLY, you may need to plan [crossover timing](#TTB_timing) for when you begin using one report or the other.

💡 If you do not need to track cost or packaging in MAKE's Case Goods module, utilizing Case Good lots, [ask us](mailto:support@innovint.us) about turning off Case Goods entirely. This means that the Bottling action would remove bottled volume and cost entirely from MAKE without ever creating a case good (Flashback to 2021!).

#### **Option 2) Case Goods require further packaging and cost tracking**

**Bottle**

Bottle as usual in MAKE. This action will populate Section A, Line 13 of the TTB Report in MAKE.  Plan to continue tracking these case good lots in MAKE.  Volume for these case goods lots will continue to populate on your MAKE TTB report even though you're also going to track them in SUPPLY ⬇

**Move to inventory to SUPPLY**

Even though you plan to leave inventory in the Case Good Explorer: in SUPPLY, create [new SKUs](https://support.innovint.us/hc/en-us/how-to-add-skus?hsLang=en) and perform a single [Add inventory action](https://support.innovint.us/hc/en-us/how-to-add-inventory?hsLang=en) with the reason "Bottling" for all newly bottled SKUs and input them into SUPPLY on the same date as the bottling occurred at the in-bond location.  *This is to ensure that your compliance reporting for Section B remains centralized using the SUPPLY TTB export.*

If you have concerns about mixing unfinished and finished inventory, please contact Support about creating a secondary "Unfinished" location within the desired bond, and track the unfinished inventory in a separate location (but reported on the same bond).

![MAKE-SUPPLY shiners](https://support.innovint.us/hs-fs/hubfs/MAKE-SUPPLY%20shiners.png?width=688&height=299&name=MAKE-SUPPLY%20shiners.png)

You can also use the SKU Stage to help track this information.

![MAKE-SUPPLY stage](https://support.innovint.us/hs-fs/hubfs/MAKE-SUPPLY%20stage.png?width=350&height=301&name=MAKE-SUPPLY%20stage.png)

**What about Inventory in the Case Good Explorer?**

Continue to hold all unfinished and finished case goods in MAKE, but disregard them completely for the purposes of compliance inventory. Add packaging and track costs in MAKE as usual for Dry Goods and COGS Tracking.

Remove from MAKE when the case goods are fully packaged and finished, ideally at the end of a costing period. Consult with your Finance team on when and how to remove the case good lots from your Case Good Explorer.

**Creating BOLs**

By leaving the inventory also in MAKE, you can continue to generate BOLs based on the on-hand inventory via the [Report Explorer](https://support.innovint.us/hc/en-us/how-to-create-a-multi-lot-bol?hsLang=en), as required. As previously mentioned, the compliance reason becomes immaterial as compliance should be tracked in SUPPLY.

**Add packaging**

Add packaging in MAKE as usual. Once the product is finished and ready for sale, be sure to then move the final finished good in SUPPLY into a "regular/active" location to denote completeness and availability. Again, consider using SKU Stages to denote clarity on this.

**COGS & FINANCE implications**

Leave case goods lots in MAKE until you no longer require them for financial reporting. True up MAKE with SUPPLY inventory on a monthly or periodic basis using appropriate volume adjustments. Keep the case goods lot in MAKE until final costs are complete on that lot and then remove it from MAKE.  This enables costs to accumulate if needed but also allows you to clear the case goods lots out to avoid compiling too many to manage over time. Because you are already tracking compliance in SUPPLY, you do not need to worry about how you remove the case goods volume from MAKE, except to ensure that your finance team is happy with the timing and reporting!

**Compliance outcome**

For your TTB report, always ignore the MAKE TTB Report for Section B, and use the numbers on the SUPPLY report export (as it will record the bottling and have all inventory present at the end of the period).

When you are first onboarding into SUPPLY, you may need to plan [crossover timing](#TTB_timing) for when you begin using one report or the other.

#### When do I start using the TTB export in SUPPLY?

Depending on when you begin using SUPPLY to track your case goods, determining the best way to pull compliance reporting for the first "crossover" reporting period may depend on a couple of things.

The 'Onboard inventory' action in SUPPLY will always populate the 'On hand at beginning of period' line on the export for any in-bond inventory that you add to SUPPLY because we are assuming you have been tracking this inventory elsewhere and just need to add it to the system.

When you bottle a new lot and add it to SUPPLY, you can use the 'Add inventory' action and select 'Bottling' as the reason and that will then populate the 'Bottled' line of the TTB report export. If you transfer case goods in bond, you can use the 'Add inventory' action and select 'Bond to bond transfer in' as the reason and that will then populate the 'Received in bond' line of the TTB report export.

*How often do you perform reporting?*

If you are close to the end of your reporting period, it might be easiest to continue your current reporting method (which might be recording MAKE's Case Good actions to populate Section B) and then just ensure that your on-hand end/start of period matches and then begin tracking all compliance out of SUPPLY for the upcoming period.

Otherwise, you may need to manually pull together numbers between two systems for your into/out of bond movements for Section B.  Bottling volumes would come from MAKE, and should match those 'Add inventory' “bottling” totals in SUPPLY. Remove Taxpaid/Transferred in bond volumes may come from either platform, depending on how many or how frequently you move between bonds and locations, and where you recorded the action.

Don't forget! The TTB Export in SUPPLY has its own [Audit tab](https://support.innovint.us/hc/en-us/how-does-supply-populate-the-ttb-report?hsLang=en#Audit) to help you track down transactions for each bond, and InnoVint's MAKE [TTB Report has one](https://support.innovint.us/hc/en-us/understanding-the-ttb-audit-report?hsLang=en), too.
