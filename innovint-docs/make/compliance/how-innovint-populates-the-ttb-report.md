---
title: "How InnoVint populates the TTB report"
url: "https://support.innovint.us/hc/en-us/articles/360020824392-how-does-innovint-populate-the-ttb-report-"
category: "MAKE"
section: "Compliance"
page_type: "article"
lastmod: "2026-01-27"
gist: "This article outlines how each section of the TTB report is populated by specific actions in InnoVint."
tags: ["reporting", "ttb", "tax-class", "compliance", "bond", "getting-started"]
---

# How InnoVint populates the TTB report

This article outlines how each section of the TTB report is populated by specific actions in InnoVint.

- [Part I - Summary of Wines in Bond](#PartI)
  - [Section A - Bulk Wines](#A-BulkWines)
  - [Section B - Bottled Wines](#B-BottledWines)
- [Part III - Summary of Distilled Spirits](#PartIII)
- [Part IV - Summary of Materials Received and Used](#PartIV)
- [Part VII - In Fermenters End of Period](#PartVII)
- [Frequently Asked Questions](#faq)

### PART I - SUMMARY OF WINES IN BOND (GALLONS)

#### SECTION A - BULK WINES

Each line of Section A is segmented by declared tax class.

1.     ON HAND BEGINNING OF PERIOD

Should match Line 31 ON HAND END OF PERIOD from the last submitted TTB report. This line is populated by 1) onboarded volume (Volume Adjustment with reason: Onboarding), and/or 2) any movement action that results in volume change and is backdated prior to the report start date.

2.     PRODUCED BY FERMENTATION

Volume [declared to a tax class](/hc/en-us/articles/207936576-declare-or-edit-tax-class?hsLang=en) from tax class *In Fermenters,* within the date range of the report. To populate column e, BF or BP, please review our [Sparkling workflow article](/hc/en-us/articles/360050744032-sparkling-wine-production-feature-overview#Step_4-Tax_class).

3.     PRODUCED BY SWEETENING

The amount of wine that has had [sweetening materials added to it](https://support.innovint.us/hc/en-us/sweetening?hsLang=en) via Volume Adjustment with reason: Produced by sweetening. This row may also be populated by the final fill volume of wine that had concentrate (from a juice/wine lot with Tax Class = Concentrate) transferred into it. This number should be equal to the number in Line 18 USED FOR SWEETENING plus the volume of sweetening material added.

4.     PRODUCED BY ADDITION OF WINE SPIRITS

The amount of wine that has had [spirits added to it](https://support.innovint.us/hc/en-us/articles/360018226292-fortification-and-amelioration?hsLang=en#fortification) via Volume Adjustment with reason: Produced by addition of wine spirit. This number should be equal to the number in Line 19 USED FOR ADDITION OF WINE SPIRITS plus the volume of spirits added. *Transferring distilled spirits into a declared wine will not populate this row.*

5.     PRODUCED BY BLENDING

Volume that was transferred into a different tax class via any movement action. The volume inherits the tax class of the lot that it is blended *into*. e.g. Topping wine volume inherits the tax class of the topped lot and blended wines inherit the tax class of the blend lot.

There is a warning message that pops up any time you are blending across tax classes:
![How InnoVint populates the TTB report-blend across tax class](https://support.innovint.us/hs-fs/hubfs/How%20InnoVint%20populates%20the%20TTB%20report-blend%20across%20tax%20class.webp?width=538&height=323&name=How%20InnoVint%20populates%20the%20TTB%20report-blend%20across%20tax%20class.webp)

         To properly populate line 5 (and it's counterpart, Line 20), find more information [here](https://support.innovint.us/hc/en-us/articles/208245003-blending-across-tax-classes?hsLang=en).

6.     PRODUCED BY AMELIORATION

The amount of wine which has had [ameliorating materials added to it](https://support.innovint.us/hc/en-us/articles/360018226292-fortification-and-amelioration?hsLang=en#amelioration) via Volume Adjustment with reason: Produced by amelioration. This number should be equal to the number in Line 21 USED FOR AMELIORATION plus the volume of the ameliorating material.

7.     RECEIVED IN BOND

The volume of untaxpaid wine received in bond via 1) [Bond to Bond transfer](https://support.innovint.us/hc/en-us/articles/360018542692-bond-to-bond-transfers?hsLang=en) action, 2) a [B2B within winery or Transfer (Inter-facility)](/hc/en-us/bond-to-bond-b2b?hsLang=en) action and/or 3) any movement action involving multiple bonds. There is a warning message that pops up any time you are blending or transferring volume across bonds:
![How InnoVint populates the TTB report-across bonds](https://support.innovint.us/hs-fs/hubfs/How%20InnoVint%20populates%20the%20TTB%20report-across%20bonds.webp?width=539&height=383&name=How%20InnoVint%20populates%20the%20TTB%20report-across%20bonds.webp)

8.     BOTTLED WINE DUMPED TO BULK

Volume added due to Volume Adjustment with reason: Bottled wine dumped to bulk. Find out more about this workflow [here](https://support.innovint.us/hc/en-us/how-to-return-bottled-wine-to-a-bulk-wine-lot?hsLang=en).

9.     INVENTORY GAINS

Any increase in volume due to 1) movement actions - *e.g. a Barrel Down action that results in a total volume that is greater than what was originally in the lot* - and 2) Volume Adjustment with reason: Inventory Gains.

Inventory gains only include gains on declared wine lots (i.e. lots in tax class *In Fermenters*,*Juice*, etc. are not included). Any gains due to Bottling can be viewed in the [Bottling report](//innovint-6865708.hs-sites.com/hc/en-us/articles/115000028666-bottling-report?hsLang=en).

10.  *Write-in*: CHANGE OF TAX CLASS

The volume of wine that has been transferred from a declared tax class into another tax class via a [tax class change.](https://support.innovint.us/hc/en-us/articles/207936576-declare-or-edit-tax-class?hsLang=en) (Note: Volume that starts as *In Fermenters* that is declared to tax class - eg. <16%, 16-24%, etc - will display the volume as Produced by Fermentation on Line 2.)

12.    TOTAL

Calculated: Sum of Line 1 + the amounts recorded in Lines 2-11

13.    BOTTLED

The total volume bottled within the reporting period. You can review Bottling actions in the [Bottling report.](https://support.innovint.us/hc/en-us/articles/115000028666-bottling-report?hsLang=en)

14.    REMOVED TAXPAID

Volume removed due to Volume Adjustment with reason: Removed tax paid.

15.    TRANSFERS IN BOND

The volume of untaxpaid wine transferred in bond via 1) [Bond to Bond transfer](//innovint-6865708.hs-sites.com/hc/en-us/articles/360018542692-bond-to-bond-transfers?hsLang=en) action, 2) a [B2B within winery or Transfer (Inter-facility)](/hc/en-us/bond-to-bond-b2b?hsLang=en) action and/or 3) any movement action involving multiple bonds.

16.    REMOVED FOR DISTILLING MATERIAL

Volume removed via Volume Adjustment with reason: Removed to distilled spirits plant

17.    REMOVED TO VINEGAR PLANT

Volume removed via Volume Adjustment with reason: Removed to vinegar plant

18.    USED FOR SWEETENING

The amount of wine that has had [sweetening materials added to it](https://support.innovint.us/hc/en-us/sweetening?hsLang=en) via Volume Adjustment with reason: Used for sweetening. This row may also be populated by the starting volume of wine that had concentrate (from a juice/wine lot with Tax Class = Concentrate) transferred into it. This should be the volume *before* the addition of sweetening material.

19.    USED FOR ADDITION OF WINE SPIRITS

The amount of wine that has had [spirits added to it](https://support.innovint.us/hc/en-us/articles/360018226292-fortification-and-amelioration?hsLang=en#fortification) via Volume Adjustment with reason: Used for addition of wine spirit. This should be the volume before the addition of wine spirits. *Transferring distilled spirits into a declared wine will not populate this row.*

20.    USED FOR BLENDING

Volume that was transferred into a lot with a different tax class via any movement action. The volume inherits the tax class of the lot that it is blended *into*. E.g. Topping wine volume inherits the tax class of the topped lot and blended wines inherit the tax class of the blend lot. To properly populate line 20 (and it's counterpart, Line 5), find more information [here](https://support.innovint.us/hc/en-us/articles/208245003-blending-across-tax-classes?hsLang=en).

21.    USED FOR AMELIORATION

The amount of wine which has had [ameliorating materials added to it](https://support.innovint.us/hc/en-us/articles/360018226292-fortification-and-amelioration?hsLang=en#amelioration) via Volume Adjustment with reason: Used for amelioration. This number should be equal to the volume in Line 6 PRODUCED BY AMELIORATION minus the volume of the ameliorating material.

22.    USED FOR EFFERVESCENT WINE

The amount of wine which was removed via Volume Adjustment with reason: Used for effervescent.

23.    USED FOR TESTING

The amount of wine which removed via Volume Adjustment with reason: Used for testing.

24.    *Write-in*: CHANGE OF TAX CLASS

The volume of wine that has been transferred out of tax class via a  [tax class change.](//innovint-6865708.hs-sites.com/hc/en-us/articles/207936576-declare-or-edit-tax-class?hsLang=en)

25.    *Write-in*: RETURNED TO FERMENTERS

1) Any change of tax class to *In Fermenters, Juice or Concentrate,* and/or 2) the volume of declared wine transferred via movement action into a lot in tax class *In Fermenters*,*Juice*, or *Concentrate*, and any associated gains or losses. There is a pop-up warning any time you record an action between a juice/concentrate lot and declared wine lot:
![How InnoVint populates the TTB report-questionable movement](https://support.innovint.us/hs-fs/hubfs/How%20InnoVint%20populates%20the%20TTB%20report-questionable%20movement.webp?width=478&height=299&name=How%20InnoVint%20populates%20the%20TTB%20report-questionable%20movement.webp)

29.    LOSSES (OTHER THAN INVENTORY)

Casualty losses recorded as a Volume Adjustment with reason: Losses other than inventory. These losses must be reported to the TTB and a claim may need to be submitted.

30.    INVENTORY LOSSES

Any decrease in volume due to 1) movement action, and/or 2) Volume Adjustment with reason: Inventory Losses. Most commonly we see inventory losses from Topping, Racking and any movement action where there is a potential for volume loss.
Inventory losses only include losses on declared wine lots (i.e. lots in tax class *In Fermenters*,*Juice*, etc. are not included). Any losses due to Bottling can be viewed in the [Bottling report](/hc/en-us/articles/115000028666-bottling-report?hsLang=en).

31.    ON HAND END OF PERIOD

Calculated. Sum of Line 12 TOTAL minus the amounts given in Lines 13-30.

32. TOTAL

Sum of Lines 13-31. Should be equal to Line 12.

#### SECTION B - BOTTLED WINES

1. ON HAND BEGINNING OF PERIOD
   Should match Section B, Line 20 ON HAND END OF PERIOD from the last submitted TTB report. This line is populated by 1) onboarded volume (Volume Adjustment with reason: Onboarding), and/or 2) any movement action that results in volume change to case goods inventory and is backdated prior to the report start date.
2. BOTTLED
   The total volume bottled within the reporting period. This value matches Part 1, Section A, Line 13 - BOTTLED. You can review Bottling actions in the [Bottling report.](/hc/en-us/articles/115000028666-bottling-report?hsLang=en)
3. RECEIVED IN BOND
   The volume of case goods inventory received in bond within the reporting period. Case goods inventory is received in bond via a B2B Transfer In (Case Good) action.
4. TAXPAID WINE RETURNED TO BOND
   The volume of taxpaid case goods inventory returned to bond within the reporting period. Taxpaid case goods inventory is returned to bond via a Volume Adjustment action with reason: Taxpaid wine returned to bond. Find additional workflow details [here](/hc/en-us/how-to-return-bottled-wine-to-a-bulk-wine-lot?hsLang=en).
5. *Write-in*: INVENTORY GAINS

   Any case goods inventory increase in volume due to 1) movement actions - *e.g. a Transfer action that results in a total volume that is greater than what was originally in the case goods lot* - and 2) Volume Adjustment with reason: Inventory Gains.
   NOTE - PER TTB: Do not report bottled inventory gains unless a complete inventory of all bulk and bottled wine is taken (i.e., during your annual physical inventory).
6. *Write-in*: (blank line)
   InnoVint does not populate this write-in field at this time.
7. TOTAL
   Calculated: Sum of Line 1 plus the amounts recorded in Lines 2-6
8. REMOVED TAXPAID
   The volume of case goods inventory removed taxpaid within the reporting period. This removal is logged using the [Remove Taxpaid](/hc/en-us/taxpaid?hsLang=en) action.
9. TRANSFERRED IN BOND
   The volume of case goods inventory transferred in bond within the reporting period. Case goods inventory is transferred in bond via a B2B Transfer Out (Case Good) action.
10. DUMPED TO BULK
    The volume of case good wines decreased due to Volume Adjustment with reason: Bottled Wine Dumped to Bulk. Find out more about this workflow [here](https://support.innovint.us/hc/en-us/how-to-return-bottled-wine-to-a-bulk-wine-lot?hsLang=en).
11. USED FOR TASTING
    Any case goods inventory decrease in volume due to Volume Adjustment with reason: Used for tasting.
12. REMOVED FOR EXPORT
    Any case goods inventory decrease in volume due to Volume Adjustment with reason: Removed for export.
13. REMOVED FOR FAMILY USE
    Any case goods inventory decrease in volume due to Volume Adjustment with reason: Removed for family use.
14. USED FOR TESTING
    Any case goods inventory decrease in volume due to Volume Adjustment with reason: Used for testing.
15. *Write-in*: DESTROYED
    After receiving approval from the TTB, show the amount of bottled wine destroyed. InnoVint does not populate this write-in field at this time.
16. *Write-in*: (blank line)
    InnoVint does not populate this write-in field at this time.
17. *Write-in*: (blank line)
    InnoVint does not populate this write-in field at this time.
18. BREAKAGE
    Any case goods inventory decrease in volume due to Volume Adjustment with reason: Breakage.
19. INVENTORY SHORTAGE
    Any case goods inventory decrease in volume due to Volume Adjustment with reason: Inventory shortage.

    NOTE - PER TTB: Do not report bottled inventory shortages unless a complete inventory of all bulk and bottled wine is taken (i.e., during your annual physical inventory).
20. ON HAND END OF PERIOD

    Calculated. Sum of Line 7 TOTAL minus the amounts given in Lines 8-19.
21. TOTAL

    Sum of Lines 8-20. Should be equal to Line 7.

### PART III- SUMMARY OF DISTILLED SPIRITS (Proof Gallons)

*InnoVint uses the [TTB-recommended calculation](https://www.ttb.gov/distilled-spirits/distilled-spirits-faqs) (see S2) to convert gallons to proof gallons. Since our system does not know the proof of the spirit we assume 50% ABV. If you wish to calculate this section based on actual proof or ABV you are able to change the exported values by editing the generated report. Re-calculation of proof gallons will not impact other sections of the report.*

*These lines are populated by juice/wine or case goods lot volumes & movements involving the tax class "Brandy or Distilled Spirit."*

### PART IV - SUMMARY OF MATERIALS RECEIVED AND USED

2.     RECEIVED

- Column (a): UNCRUSHED (Pounds)

Weight of fruit, in pounds, 1) received via Receive Fruit action, and/or 2) amended via Fruit Weight Adjustment.

**NOTE**: Any unprocessed weight remaining in Fruit Lots will populate this cell until the tonnage is removed either by Processing action or Fruit Weight Adjustment. See more [here](/hc/en-us/clean-up-your?hsLang=en).

- Column (c): JUICE (Gallons)

Any volume increase in tax class*Juice* due to 1) a movement action into a lot with tax class *Juice*, 2) any changes via Volume Adjustment action with reason: Inventory gains, and/or 3) any Bond to Bond transfer with reason: Received in bond into tax class*Juice*. Also, 4) any change of tax class to*Juice*.

5.     USED IN WINE PRODUCTION

- Column (a): UNCRUSHED (Pounds)

Weight of fruit that is [Processed](//innovint-6865708.hs-sites.com/hc/en-us/articles/360006828911-process-fruit-to-volume?hsLang=en) from a fruit lot into a juice/wine lot.

- Column (c): JUICE (Gallons)

Volume change from tax class*Juice* to *In Fermenters* or *any declared tax class* via 1) tax class change, or 2) movement action into a tax class that is not*Juice*.

8.     REMOVED

- Column (a): UNCRUSHED (Pounds)

Decrease in weight of fruit lot via Fruit Weight Adjustment.

- Column (c): JUICE (Gallons)

Volume change from tax class*Juice* via 1) Volume Adjustment or 2) Bond to Bond transfer out. Also 3) any net losses from movement actions in tax class*Juice*.

### PART VII - IN FERMENTERS END OF PERIOD (Gallons)

1.     IN FERMENTERS (ESTIMATED QUANTITY OF LIQUID)

1) The volume of all inventory in tax class *In Fermenters*. 2) The estimated volume of all lots currently in weight. InnoVint uses an expected yield of the lot (calculated at 150 gal/ton) to convert to estimated volume. Any remaining tonnage in Fruit Lots contributes to this line of the report.

### FAQ

#### Q. What is a "movement action"?

*A movement action is any action or task recorded in InnoVint that receives or transfers volume or weight. These actions include, but are not limited to: Process, Bleed, Drain & Press, Blend, Barrel Down, Rack, Topping, Transfer, Filter, Bottle, Weight and Volume Adjustment, etc.*

*You can view a list of movement actions in the [Winery Activity Feed](//innovint-6865708.hs-sites.com/hc/en-us/articles/115000258166-winery-activity-feed?hsLang=en) by filtering for "all movement actions" in the dropdown, or clicking on* Show only movements *in the top left.*

*Note: Bottling actions displayed in the Winery Activity Feed will include total volumes. To view the difference between the bottled volume and the gains/losses in the action, go to the [Bottling report](//innovint-6865708.hs-sites.com/hc/en-us/articles/115000028666-bottling-report?hsLang=en).*

#### Q. How do I find an action that is contributing to an error in the TTB report?

*Check the [Audit Report](/hc/en-us/understanding-the-ttb-audit-report?hsLang=en)!*

*Also, it might help to narrow down when the action was recorded.*

*For example, if you run the TTB report for the first quarter of the year (Jan 1 - Mar 31) and find an unexpected error, we recommend running the report for shorter intervals, i.e. from Jan 1-31, Feb 1-28, and Mar 1 -31. Try to find in which month the action took place that resulted in the error on the TTB report. Then narrow your search even more by running the report by week, and if necessary day-by-day within the week. You are looking for the specific time period when the error displays on the TTB report.*

*Once you know when the action was recorded, you can reference the Winery Activity Feed and/or Audit Report for actions that were recorded in the same time frame.*
