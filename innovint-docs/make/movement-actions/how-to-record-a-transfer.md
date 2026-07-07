---
title: "How to Record a Transfer"
url: "https://support.innovint.us/hc/en-us/articles/360028194371-using-the-transfer-action"
category: "MAKE"
section: "Movement Actions"
page_type: "article"
lastmod: "2025-11-20"
gist: "The Transfer feature allows you to move volume between lots and vessels and can be performed:."
tags: ["transfers", "barrels", "work-orders", "inventory", "packaging", "blending"]
---

# How to Record a Transfer

The Transfer feature allows you to move volume between lots and vessels and can be performed:

- as a direct action on a lot (Juice/Wine and Case Good Lots)
- as a task within a work order (Juice/Wine Lots)
- as a work order in [InnApp](https://support.innovint.us/hc/en-us/innoapp-how-to-filter-transfer-rack-and-barrel-down?hsLang=en) (Juice/Wine Lots)

This article covers:

- [Transferring Juice/Wine Lots](#xferjuicewine)
- [Transferring Case Goods Lots](#xfercg)

### Transferring Juice/Wine Lots

![How to Record a Transfer-how to](https://support.innovint.us/hs-fs/hubfs/How%20to%20Record%20a%20Transfer-how%20to.webp?width=688&height=437&name=How%20to%20Record%20a%20Transfer-how%20to.webp)

1. **Transfer from**

1. 1. **Lot** - Select your lot from the dropdown or lot picker
   2. **Vessels** - Select one or move vessels to remove volume from
      - InnoVint defaults to remove the entire contents of each vessel. If you need to remove a partial volume from a vessel, adjust the remaining value in the "Ending Fill" columns.
2. **Transfer to**
   1. **Lot** - Select a lot to transfer volume into:
      1. Retain lot code - to keep the volume in the same lot, but transfer to new vessels
      2. Combine with existing lot- to move the volume into another lot that already exists (this creates a new blend)
      3. Create new lot- to move the volume into a new, separate lot
   2. **Vessels**  - Select one or more vessels to transfer the volume into. Adjust the "Ending Fill" columns as needed.
3. **Save lees** - Select to save the lees to a different lot or not.

\* To transfer volume into multiple lots, click on **+ Add Lot** under the Transfer to header.

![How to Record a Transfer-summary](https://support.innovint.us/hs-fs/hubfs/How%20to%20Record%20a%20Transfer-summary.webp?width=688&height=210&name=How%20to%20Record%20a%20Transfer-summary.webp)

Double check the action summary for correctness. Any losses or gains as a result of the transfer will be calculated as the Net Change. Volume losses and gains for declared lots are reported on the TTB 5120.17 report as Inventory Losses and Inventory Gains.

The **Transfer** and **Rack** functions perform the same task and allow for the same movements, the only major difference being what terminology you are most comfortable with.

Both functions allow movements of lots from one origin to one or multiple destinations, with the option to move the lot from some or all of the original vessels. There also exists the option to maintain the lot code, combine with an existing lot, or create and new lot code, as well as to save or discard lees.

### Transferring Case Goods Lots

![How to Record a Transfer-case goods](https://support.innovint.us/hs-fs/hubfs/How%20to%20Record%20a%20Transfer-case%20goods.webp?width=688&height=398&name=How%20to%20Record%20a%20Transfer-case%20goods.webp)

1. **Transfer from** - Select your case goods lot from the dropdown or lot picker

1. - **Remove** - Check the box to transfer the entire lot, or enter the number of pallets, cases, and bottles
2. **Transfer to** - Select to 'Combine with an existing Case Goods lot' (both lots must have the exact same composition and format), or 'Create new Case Goods lot.'

Do not use the Transfer (Case Good) action to move lots between bonds.  This is will not be recorded as a bond transfer on the InnoVint TTB Report.
