---
title: "Chaptalization"
url: "https://support.innovint.us/hc/en-us/articles/360021173511-chaptalization"
category: "MAKE"
section: "Additions"
page_type: "article"
lastmod: "2025-11-20"
gist: "This article covers how to add sugar or concentrate to juice/must in order to increase potential alcohol for fermentation."
tags: ["additives", "inventory", "bond", "packaging", "reporting", "tax-class"]
---

# Chaptalization

This article covers how to add sugar or concentrate to juice/must in order to increase potential alcohol for fermentation. The juice/must lot should be in the tax class "Fermenting Juice" for this process.

- [How to chaptalize with sugar](#sugar)
- [How to chaptalize with concentrate](#conc)

To add concentrate to declared wine lot (i.e. Sweetening) please see our article on [sweetening.](https://support.innovint.us/hc/en-us/sweetening?hsLang=en)

### How to chaptalize with sugar

1. Create Additive.

- - [Create a new Additive](//innovint-6865708.hs-sites.com/hc/en-us/articles/115000825066-how-to-create-additives-and-additive-batches?hsLang=en) via the Dry Goods Explorer for the weight of sugar you currently have in inventory.

2. Record an Addition action to add the sugar to your juice/must lot.

3. The addition action will update the sugar inventory in your dry goods. This action will not track on-hand sugar in Part IV of the TTB Report.  Please use the dry goods/product details for sweetening sugar in order to manually update the TTB Report.

**Tip:** To increase the volume of a lot after the addition of sugar, use a [Volume Adjustment](https://support.innovint.us/hc/en-us/articles/204178489-volume-adjustment?hsLang=en) action.

### How to chaptalize with concentrate

1. Receive Concentrate.

1. 1. Create a new juice/wine lot for your concentrate lot and set the tax class to "Concentrate". For unknown vineyard sources, we recommend setting up a [BULK vineyard](https://support.innovint.us/hc/en-us/how-to-enter-bulk-wine-and-unknown-lot-composition?hsLang=en).
   2. Record a Bond to Bond transfer on the new concentrate lot to bring the volume into your bond. With the tax class on the lot set to "Concentrate", the transfer will populate in Part IV of the TTB Report (Line 2, column d).

2. Perform a Transfer action moving the desired volume of concentrate into your juice or must lot. The amount removed from the concentrate lot will populate in Part IV, Line 5 (column d) as used for wine production. The amount added to the lot in tax class "Fermenting Juice" will be added in Part VII, Line 1 "In Fermenters".
