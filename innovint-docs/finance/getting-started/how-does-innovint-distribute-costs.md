---
title: "How does InnoVint Distribute Costs?"
url: "https://support.innovint.us/hc/en-us/cost-distribution-rules"
category: "FINANCE"
section: "Getting Started"
page_type: "page"
lastmod: "2026-01-05"
gist: "Direct fruit costs are applied to a lot at the time of the Process action (ie Process to Volume and Process to Weight)."
tags: ["cost", "harvest", "getting-started", "packaging", "vineyard", "additives"]
---

# How does InnoVint Distribute Costs?

#### Topics Covered

- [Cost Distribution Rules](#direct)
  - [Direct Fruit Costs](#direct)
  - [Direct Dry Goods Costs](#direct_dry_goods_costs) (Packaging & Additives)
  - [Juice Bleed/Saignée costs](#bleed-saignee)
  - [Volume Gains and Losses](#volumegainslosses)
  - [Shrinkage](#shrinkage)
- [Timing to Update Cost Distributions](#timing)

- [FAQs](#FAQs)

### Cost Distribution Rules

#### Direct Fruit Costs

Direct fruit costs are applied to a lot at the time of the Process action (ie [Process to Volume](//innovint-6865708.hs-sites.com/hc/en-us/articles/360006828911-process-fruit-to-volume?hsLang=en) and [Process to Weight](//innovint-6865708.hs-sites.com/hc/en-us/articles/360006478872-process-fruit-to-tons?hsLang=en)).

**Cost per ton**

Fruit costs are determined by the total weight processed from a fruit lot, and then distributed to the juice or must lot(s) in the Process action.

InnoVint calculates direct fruit costs using the following formulas:

*1. Total fruit cost = (Tons removed from fruit lot) \* (cost/ton)*

*2. Fruit cost per lot = (Total fruit cost/Total tons processed) \* (Tons processed to juice lot)*

\*\* This calculation accounts for any difference between the tons removed from the fruit lot and the tons that are processed into the juice lot. For example, 10 tons might be removed from a fruit lot in a process action, but only 9 tons are processed into the juice lot. In this case, InnoVint will proportionally distribute the cost of the 10 tons into the 9 tons, essentially concentrating the overall cost per ton.

*![How Does InnoVint Distribute Costs-distribute map](https://support.innovint.us/hs-fs/hubfs/How%20Does%20InnoVint%20Distribute%20Costs-distribute%20map.webp?width=670&height=503&name=How%20Does%20InnoVint%20Distribute%20Costs-distribute%20map.webp)*

**Cost per block and Cost per acre**

InnoVint proportionally distributes the cost per block or acre according to the total tonnage received from the block per vintage and the distribution of that tonnage at the process step.

Please note that InnoVint will distribute and apply costs using all the submitted information available at the time of the process step.

For example, if 3 tons from Block X is received and processed into Lot A, the system will apply the total cost per block to Lot A as of the date and time of the process action. If later, an additional 7 tons from Block X is received and processed into Lot B, the system will then proportionally distribute the total cost per block according to the tonnage processed into both Lot A and Lot B. This will require the system to recalculate and update the costs that it previously applied to Lot A.

#### Direct Dry Goods Costs

The cost per unit of a dry goods batch is determined by the total amount received and the total costs across all 'Receive' actions for the batch. Cost per unit is not affected by on hand inventory or batch adjustments. If on hand inventory is negative, the batch will also show a negative cost on hand; all subsequent actions using the dry goods batch will continue to remove costs and inventory from the on hand values, and the costs will continue to be added to involved lots.

**Packaging (Direct)**

Packaging costs are calculated and reported as part of the Finished Goods costs for each recorded 'Bottle' action. The used and scrap values entered per batch are combined for a total Packaging (Direct) cost. To view the breakdown of used vs scrap costs per 'Bottle' action, download the Bottled Costs report from the Cost Explorer. The Bottled Cost report will show separate columns for used and scrap.

Note: Since Packaging (Direct) costs are only added to the Finished Goods costs associated with a specific 'Bottle' action, the Packaging (Direct) costs are not distributed to any remaining, un-bottled volume of the wine lot. Packaging (Direct) costs will not be reported as part of the lot cost history.

Keep in mind that Packaging costs added as a cost item will behave differently than direct costs, and are distributed proportionally as part of the total lot cost.  Packaging (indirect) costs are distributed to any remaining, un-bottled volume of the wine lot.This is the same for all cost items.

**Additives (Direct)**

As additives are used via 'Addition' actions, the cost per unit of the additive batch is directly applied to the involved lot(s). As the wine lot is subsequently transferred and blended, the direct additive costs are proportionally distributed downstream.

#### Juice Bleed/Saignée

If a juice bleed/saignée is recorded on a lot, InnoVint will wait to apply costs to the bleed volume until the parent lot is in volume (ie after Drain and Press). The cost of the bleed volume is proportional to the cost of the total volume produced by the lot. The total volume produced is equal to the bleed volume plus the drain and press volume.

*Lot Cost = (Total cost/ Total volume produced) \* (Volume produced per lot)*

For example, a juice/must lot has a total lot cost of $10,000. A bleed action recorded on the lot produces 50 gallons. Later, the drain and press action produces 750 gallons, resulting in a total volume of 800 gallons produced.

*Lot cost for Bleed volume = ($10,000/ 800 gal) \* 50 gal = $625*

*Lot cost for D&P volume = ($10,000/ 800 gal) \* 750 gal = $9,375*

#### Volume Gains and Losses

Lot costs are distributed proportionally by volume as wine is moved, blended, or split into other lots. Volume gains and losses are expected as a result of these movements.

Inventory gains and losses do not carry any costs. In the case of losses, the lot costs are concentrated into the remaining volume and the cost per gallon increases. The opposite occurs when there is a volume gain (ie the lot costs are spread across the new volume).

If a Volume Adjustment with the reason Inventory Losses is used to fully deplete a lot, cost will not be removed from the lot, and cost will be associated with an empty lot.

#### Shrinkage

In the event that a volume loss needs to carry costs, the loss must be recorded via [Volume Adjustment action](//innovint-6865708.hs-sites.com/hc/en-us/articles/204178489-volume-adjustment?hsLang=en) with the reason 'Losses other than inventory'. This action will reflect as 'Losses other than inventory' on the InnoVint-generated TTB 5120.17 and the costs will be classified as 'shrinkage' in the *Cost Over Time* and other cost reports.

Due to the compliance implications, please check with your compliance team on whether and how to use this Volume Adjustment reason.

### Timing to Update Cost Distributions

InnoVint has a very complex way of tracking all your costs across all your lots, retaining the integrity of the cost category breakdown from fruit to current inventory. To calculate all these cost changes over time we have to crunch these numbers through all your movements across your entire winery (including granular movements such as when 30+ lots are topped with the same topping wine).

Costs applied today will update in near real time. However, please allow a few extra minutes for **backdated** entries to populate the reports. To ensure you have accurate cost data in a timely manner, we will routinely scan your account for updates and push forward any changes that are pending.

Please keep in mind that editing or adding direct fruit costs, especially to older vintages, profoundly impacts costs across your account, and that these cost recalculations will take some time.   For example, changes to your Fruit Cost Worksheet will always trigger a rebuild of your costs for all lots in your winery.  This rebuild will also be triggeredwhen you edit vineyard contracts.

If you or your accounting team are making cost changes (either applied today or backdated) in your account, you will also see a clear indication in most reports that a recalculation is taking place.
![](https://support.innovint.us/hs-fs/hubfs/image-png-Feb-26-2025-08-25-59-9343-PM.png?width=670&height=44&name=image-png-Feb-26-2025-08-25-59-9343-PM.png)
This is to help you avoid running reports on out-of-date costs.  If you are finding that this banner is lingering a long time (more than an hour) after completing a series of costing entries or edits, please reach out to support@innovint.us and we may be able to trigger a quicker rebuild once you are completely done with cost entries or edits.

If you have any questions about the last time we checked for updates, please view the **Cost Cache** at the bottom of the Costing Explorer.

![How Does InnoVint Distribute Costs-cost cache](https://support.innovint.us/hs-fs/hubfs/How%20Does%20InnoVint%20Distribute%20Costs-cost%20cache.webp?width=420&height=271&name=How%20Does%20InnoVint%20Distribute%20Costs-cost%20cache.webp)

If you hover over the (i) you can find the explanation for why InnoVint is displaying a certain date and time.

![How Does InnoVint Distribute Costs-last checked expl](https://support.innovint.us/hs-fs/hubfs/How%20Does%20InnoVint%20Distribute%20Costs-last%20checked%20expl.webp?width=424&height=238&name=How%20Does%20InnoVint%20Distribute%20Costs-last%20checked%20expl.webp)

### Additional Resources

1. [COGS Tracking in InnoVint (Overview)](https://support.innovint.us/hc/en-us/cogs-tracking-in-innovint?hsLang=en)
2. [Learn how to allocate costs (direct, indirect)](https://support.innovint.us/hc/en-us/allocate-costs-indirect-direct?hsLang=en)
3. [Onboard starting costs and update your Settings](https://support.innovint.us/hc/en-us/onboard-starting-costs-and-cost-settings?hsLang=en)
4. [Review cost reports and reconciliation](https://support.innovint.us/hc/en-us/cost-reports?hsLang=en)
