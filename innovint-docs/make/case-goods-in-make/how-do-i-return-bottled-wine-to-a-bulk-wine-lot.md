---
title: "How do I Return Bottled Wine to a Bulk Wine Lot?"
url: "https://support.innovint.us/hc/en-us/how-to-return-bottled-wine-to-a-bulk-wine-lot"
category: "MAKE"
section: "Case Goods in MAKE"
page_type: "page"
lastmod: "2025-11-20"
gist: "In order to return a previously bottled Case Goods lot to your bulk wine inventory, i.e. dump bottled wine back to bulk, we recommend the following steps."
tags: ["packaging", "inventory", "reporting", "ttb", "cost", "transfers"]
---

# How do I Return Bottled Wine to a Bulk Wine Lot?

In order to return a previously bottled Case Goods lot to your bulk wine inventory, i.e. dump bottled wine back to bulk, we recommend the following steps. This is a *two step* process, that requires *two separate volume adjustment actions*: one to remove the bottled volume from your case good lot, and one to add volume back into the bulk wine (Juice/wine lot). By performing both steps, the TTB Report is populated as expected.

- [Volume Adjustment #1:adjust case good lot down](#One)
- [Volume Adjustment #2: adjust juice/wine lot up](#Two)
- [Volume adjustment impacts on lot cost](#lotcost)

#### **Volume Adjustment #1: adjust case good lot down**

1) Remove bottled case good volume from inventory by performing a [Volume Adjustment](https://support.innovint.us/hc/en-us/articles/204178489-volume-adjustment?hsLang=en) action on your Case Goods lot to decrease the inventory.

![How do I Return Bottled Wine to a Bulk Wine Lot-vol adj 1](https://support.innovint.us/hs-fs/hubfs/How%20do%20I%20Return%20Bottled%20Wine%20to%20a%20Bulk%20Wine%20Lot-vol%20adj%201.webp?width=688&height=245&name=How%20do%20I%20Return%20Bottled%20Wine%20to%20a%20Bulk%20Wine%20Lot-vol%20adj%201.webp)

2) Select the reasoning of "Bottled Wine Dumped to Bulk", emptying part of or the entire lot (backdate to the appropriate reporting period as necessary).

This action will remove volume from the TTB 5120.17 report in *Part I, Section B, Line 10*  (Dumped to Bulk). It will not impact the on-hand volumes of the bulk wine in Section A.

![How do I Return Bottled Wine to a Bulk Wine Lot-reason](https://support.innovint.us/hs-fs/hubfs/How%20do%20I%20Return%20Bottled%20Wine%20to%20a%20Bulk%20Wine%20Lot-reason.webp?width=688&height=283&name=How%20do%20I%20Return%20Bottled%20Wine%20to%20a%20Bulk%20Wine%20Lot-reason.webp)

**Volume Adjustment #2: adjust a juice/wine lot up**

3) What did you dump the bottled wine into?  If a bulk wine lot does not already exist for this wine, you will need to create one. If you bottled from a bulk juice/wine lot code into a case goods lot in InnoVint, you can unarchive the bulk wine lot that you originally bottled, and re-use this as long as the composition hasn't changed. Otherwise, create a new lot with the correct composition.

4) Perform a [Volume Adjustment](https://support.innovint.us/hc/en-us/articles/204178489-volume-adjustment?hsLang=en) on the bulk wine lot using the reason "Bottled Wine Dumped to Bulk" in order to increase the volume of the bulk wine lot. Leave a note if desired stating that this was coming from a Case Goods lot (and write in the CG lot code, or copy/paste a link to that lot's url). Backdate to the appropriate reporting period as necessary.

This action adds volume to the TTB 5120.17 report in *Part I, Section A, Line 8*  (Bottled Wine Dumped to Bulk).

![How do I Return Bottled Wine to a Bulk Wine Lot-vol adj 2](https://support.innovint.us/hs-fs/hubfs/How%20do%20I%20Return%20Bottled%20Wine%20to%20a%20Bulk%20Wine%20Lot-vol%20adj%202.webp?width=688&height=435&name=How%20do%20I%20Return%20Bottled%20Wine%20to%20a%20Bulk%20Wine%20Lot-vol%20adj%202.webp)

If you do not perform both actions, the TTB Report will not balance.

Please take care to see that both the Case Goods and Bulk Wine lots are in the **same bond and same tax class**, such that the removal from Section B and addition to Section A appear in the same column on your TTB report.

You can find this information on the lot details page for both bulk wine and case goods lots respectively.

![How do I Return Bottled Wine to a Bulk Wine Lot-bond tax](https://support.innovint.us/hs-fs/hubfs/How%20do%20I%20Return%20Bottled%20Wine%20to%20a%20Bulk%20Wine%20Lot-bond%20tax.webp?width=204&height=238&name=How%20do%20I%20Return%20Bottled%20Wine%20to%20a%20Bulk%20Wine%20Lot-bond%20tax.webp)

#### Volume Adjustment impacts on Lot Cost

Please note that this workflow will not shift cost from the case goods lot back into the bulk lot.

The volume adjustment for the case goods lot *will* remove cost from that lot, but you will need to add any case good lot cost to the bulk lot manually using a cost item (find out more about how volume adjustment reasons impact lot cost [here)](https://support.innovint.us/hc/en-us/articles/204178489-volume-adjustment?hsLang=en).

Check out how to Add costs back onto lots [here](https://support.innovint.us/hc/en-us/allocate-costs-indirect-direct?hsLang=en).
