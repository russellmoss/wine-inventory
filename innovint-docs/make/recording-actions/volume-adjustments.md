---
title: "Volume Adjustments"
url: "https://support.innovint.us/hc/en-us/articles/204178489-volume-adjustment"
category: "MAKE"
section: "Recording Actions"
page_type: "article"
lastmod: "2025-11-20"
gist: "The volume adjustment action can be used to remedy errors in data entry, to account for spillage and inventory losses, for initial onboarding of lots into InnoVint, and other miscellaneous reasons in accordance with proper TTB reporting."
tags: ["cost", "inventory", "packaging", "reporting", "ttb", "ux-friction"]
---

# Volume Adjustments

The volume adjustment action can be used to remedy errors in data entry, to account for spillage and inventory losses, for initial onboarding of lots into InnoVint, and other miscellaneous reasons in accordance with proper TTB reporting.

The Volume Adjustment reasons all correspond with lines on the 5120.17 report so you can accurately and easily track your inventory in compliance with the TTB. Find out how InnoVint populates the TTB Report [here](https://support.innovint.us/hc/en-us/articles/360020824392-how-does-innovint-populate-the-ttb-report-?hsLang=en).

This article covers:

- [How to record a volume adjustment for Juice/Wine lots](#volume)
- [How to record a volume adjustment for Case Goods lots](#case_goods)
- [COGS Tracking: Volume adjustment impacts on lot cost](#COGSimpact)
- [Frequently Asked Questions](#faq)

### Volume adjustments for Juice/Wine lots

Select the 'Volume Adjustment' action from the Record Action dropdown in the top bar, or from the Lot details page.

Volume Adjustment actions can only be recorded on juice and wine lots tracked in volume.

![Volume Adjustments-action](https://support.innovint.us/hs-fs/hubfs/Volume%20Adjustments-action.webp?width=688&height=460&name=Volume%20Adjustments-action.webp)

### Volume Adjustments for Case Goods

First, select the Case Goods lot. You can navigate to the lot by going to the Case Goods Explorer and clicking on the Case Goods lot code, or by searching via the global search bar at the top of your screen. From the Lot Details page, click 'Record Action' in the top right and then select the 'Volume Adjustment' action.

![Volume Adjustments-reason](https://support.innovint.us/hs-fs/hubfs/Volume%20Adjustments-reason.webp?width=688&height=349&name=Volume%20Adjustments-reason.webp)

### COGS Tracking: volume adjustment impacts on Lot Costs

The "Reason" you choose for your Volume Adjustment action not only impacts the TTB Report, but it will also impact your lot cost and cost reports if you have COGS Tracking activated.

All of the available reasons for volume adjustments (for Juice/wine **and** Case good lots) are listed here.  Here are a few items to keep in mind when you use this action with COGS Tracking enabled in your account:

- **Inventory gains, "Produced by..." amelioration/sweetening/wine spirit:** *These volume adjustment reasons that result in gains will "dilute" the cost per unit of your lot, and not increase overall lot cost.* In the event that you are following our advice for [fortification, sweetening, and amelioration](https://support.innovint.us/hc/en-us/articles/360018226292-fortification-sweetening-and-amelioration?hsLang=en), if you previously volume adjusted down using the "used for...addition of wine spirits/sweetening/amelioration/effervescent wine," the original lot cost will still reside with the lot code (see **Inventory losses** below) - you will only need to add any additional cost for the added material.
- **Inventory losses, "Used for..." addition of wine spirits/amelioration/effervescent/sweetening:**  *These volume adjustment reasons that result in reduced volume will "concentrate" the cost per unit of your lot.*
  In the event that you fully remove volume from a lot with cost via a volume adjustment, that cost will NOT be removed from your lot. This is OK if you plan to volume adjust up again with a "Produced by..." reason, but less so if you want to remove that last few gallons of a bottling tank - **these reasons can leave cost and no volume on your lot!**
- **Losses other than Inventory:** *This is one of the few volume adjustment reasons that will remove cost from your wine (and the winery!)*.  This reason triggers the cost reduction to be recorded as "shrinkage", and will report as such on the Cost over Time and Roll Forward Reports.
- **Bottled:** *This volume reduction reason will concentrate cost in the remaining gallons, or leave cost on an empty lot.* While this reason will update your TTB Report with the volume reported as bottled, using this reason  will NOT remove cost from the lot/winery as "bottled out."  If you want to consume all remaining volume from a bottled lot, we recommend editing the bottling action in order to take the losses in the bottling action (all bulk costs will transfer to the case good lot).
- **Bottled wine dumped to bulk (Juice/wine lots)**: *This volume adjustment up reason will not adjust cost in any way, or shift cost from the case goods lot back into a bulk lot.* The volume adjustment for the case goods lot *will* *remove* cost from the bottled lot (see the **Bottled wine dumped to bulk (Case Goods)**) below, but you will need to add the cost back to the bulk lot manually using a [cost item](https://support.innovint.us/hc/en-us/allocate-costs-indirect-direct?hsLang=en#costitem). See more about dumping bottled case goods back into bulk wine [here](https://support.innovint.us/hc/en-us/how-to-return-bottled-wine-to-a-bulk-wine-lot?hsLang=en).
- **Removed to DSP/vinegar plant:** *These volume adjustment reasons that result in reduced lot volume will "concentrate" the cost per unit of your lot, but not remove cost*. In the event that you fully remove volume from a lot with cost via these volume adjustment reasons, that cost will NOT be removed from your lot.
- **Remove Taxpaid (Juice/wine lot), and Remove Taxpaid (Case Good lot):** *This is one of the few volume adjustment reasons that will remove cost from your wine (and the winery!)*.  Using the reason Remove Taxpaid on either a bulk wine (Juice/wine lot) or bottled wine (case good lot) will be reported as "Bulk out" volume and cost on the Cost over Time and Roll Forward Reports.
- **Bottled wine dumped to bulk (Case Good):** *This volume adjustment reason (only applicable to case good lots) will remove cost from your case good lot/the winery.* However, when dumping bottled wine back to bulk: remember that this workflow will not shift cost from the case goods lot *back into the bulk lot (per above description of **Bottled wine dumped to bulk (Juice/wine lots)**)*.  This cost and volume will be reported as "Bulk out" volume and cost on the Cost over Time and Roll Forward Reports.  See more about our workflow for dumping bottled case goods back into bulk wine [here](https://support.innovint.us/hc/en-us/how-to-return-bottled-wine-to-a-bulk-wine-lot?hsLang=en).
- **Taxpaid Wine returned to bond (Case Good):***This volume adjustment reason up (only applicable to case good lots) in order to return taxpaid wine to bond (as a bottled case good lot) will not add cost back into the lot.* You must adjust manually using a cost item.
- **Used for tasting/testing, and Removed for export/family use (Case Good):** *These volume adjustment reason (only applicable to case good lots) will remove cost from your case good lot/the winery.* It will be reported as "bulk out" volume and cost on the Cost over Time and Roll Forward Reports.
- **Breakage/inventory shortage (Case Good):** *This is one of the few volume adjustment reasons (only applicable to case good lots) that will remove cost from your wine (and the winery!)*.  This reason triggers the cost reduction to be recorded as "shrinkage", and will report as such on the Cost over Time and Roll Forward Reports.

In the event that your chosen reason does not remove cost as desired, we recommend using [Add/Remove cost actions](https://support.innovint.us/hc/en-us/allocate-costs-indirect-direct?hsLang=en) to true up lot costs.

FAQ

#### Q. Why can't I schedule a Volume Adjustment in a work order?

*Volume adjustment actions are only available as direct actions. InnoVint does not currently support weight and volume adjustment tasks in work orders.*

*If you need to schedule a Weight Transfer or Adjustment, we recommend using a Custom Task in a work order. Once the work order is complete and submitted, then record a Weight Transfer or Adjustment as a direct action.*

#### Q. What reason do I choose for a volume adjustment on a declared wine lot?

*The TTB has provided a guide to the 5120.17 Report [here](https://www.ttb.gov/wine/guide-to-form-5120-17).  We recommend reviewing these documents to determine the best option for your volume adjustment. The reason you choose in InnoVint corresponds with the lines detailed in the documents.*

#### Q. What reason do I choose for a volume adjustment on an undeclared juice lot?

*Any losses or gains, for any reason, recorded as a Volume Adjustment on juice lots will populate the 5120.17 TTB report on Page 2, Part VII - In Fermenters End of Period, Column (a), Line 1. To Receive Juice into your bond, please refer to our Support Center article here: [Receive Juice](//innovint-6865708.hs-sites.com/hc/en-us/receive-juice?hsLang=en).*

![Volume Adjustments-TTB](https://support.innovint.us/hs-fs/hubfs/Volume%20Adjustments-TTB.webp?width=688&height=61&name=Volume%20Adjustments-TTB.webp)

#### Q. I selected the wrong reason! Can I change it?!

*Yes! From the recorded Action details page, click on the blue pencil next to the Reason to edit. Keep in mind that changing the reason will make changes on the TTB report, effective as of the date that the action was recorded. The TTB has provided detailed instructions for each line of the 5120.17 Report [here](https://www.ttb.gov/wine/guide-to-form-5120-17) which correspond to the same 'Reasons' in the dropdown list in InnoVint.*

![Volume Adjustments-edit reason](https://support.innovint.us/hs-fs/hubfs/Volume%20Adjustments-edit%20reason.webp?width=688&height=332&name=Volume%20Adjustments-edit%20reason.webp)
