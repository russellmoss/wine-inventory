---
title: "MAKE: How to Transfer Case Goods between Bonds"
url: "https://support.innovint.us/hc/en-us/managing-offsite-case-goods-inventory-in-innovint"
category: "MAKE"
section: "Case Goods in MAKE"
page_type: "page"
lastmod: "2025-11-20"
gist: "InnoVint's MAKE Case Goods Management module is optimized to manage case goods in on-site inventory, within a single bond."
tags: ["packaging", "transfers", "bond", "inventory", "configuration", "exports"]
---

# MAKE: How to Transfer Case Goods between Bonds

InnoVint's MAKE Case Goods Management module is optimized to manage case goods in on-site inventory, within a single bond. By default, when case good inventory is removed from bond in InnoVint via a B2B Transfer Out (case good) action, the inventory is also transferred out of InnoVint.

If you want to gain deeper insights into the full picture of bottled wines across multiple locations and tax status (and easier movements between bonds), then check out [SUPPLY](https://support.innovint.us/hc/en-us/supply?hsLang=en) - purpose built for case good inventory management.

#### Recommended workflow in MAKE for moving case goods out of/between bond

Use this workflow in order to track Case Goods stored at an offsite location, when tracking taxpaid wine, or transferring case goods *between* bonds in your facility, as InnoVint does not support a B2B within winery action for case good lots.

1. If you want to track case goods offsite or taxpaid (not tracked on your InnoVint TTB Report), contact support@innovint.us to add a bond to your InnoVint account. Please provide the actual legal name and bond number or request a "phantom" bond (for taxpaid inventory). *If you already have the desired bond available in your account, you can skip this step.*
2. *Optional*. Ensure that you have both your location *and* the destination set up as Shipping locations under Settings (you'll need this later). Learn how to add Shipping locations [here](https://support.innovint.us/hc/en-us/locations?hsLang=en).
3. From your Case Goods Explorer, select the Case Goods lot to be transferred and either take note of, or export, the lot composition from the composition tab (you'll need this later).
4. From the lot's details page, *Record action > B2B Transfer Out* *(Case Goods) or Volume Adjustment (Case Goods) with the reason "B2B transfer out".* If you are removing wine taxpaid, *Record action > Remove taxpaid* *(Case Goods) or Volume Adjustment (Case Goods) with the reason "Remove taxpaid"*
   1. Fill this out as you would normally - using the [Shipping location](https://support.innovint.us/hc/en-us/locations?hsLang=en) that you created earlier. This action removes the inventory from your bond, and will report as either Transferred in bond, or Removed taxpaid, in Section B of the TTB Report.
5. From the Case Goods Explorer, select *Add Case Good Lot*
   1. Create a new Case Good lot code for the inventory removed to another bond. **Ensure that you select the correct bond (the bond you are transferring into) during lot creation.**
      1. Be sure to input the same composition as the lot that you transferred out (see lot composition that you saved earlier)
      2. If the composition is large or complex, you may prefer to use the [Lot Import](https://support.innovint.us/hc/en-us/how-to-import-lots-via-csv?hsLang=en) function instead
6. From the Case Goods Explorer, select the new Case Goods lot that you just created
7. From the lot's details page, *Record action > B2B Transfer In* *(Case Goods)*. Select the location that you are transferring *from* (previously set up in step 2 above).

Once the above steps are complete, you will see the case goods inventory that is stored in the new location visible in your Case Goods Explorer. You can now filter by bond to see what is in bond at each location.

#### Additional Notes:

- Use case goods lot *Stages* to further define the status of the case goods lots. If you are using a phantom bond to track taxpaid case goods, you can set these lot stages to "Taxpaid".
- Steps 4 and 7 will populate the TTB reports accordingly, respective to each bond.
- Use the *Volume Adjustment*, *B2B Transfer*, or *Remove Taxpaid* Case Goods actions to adjust or remove off-site inventory moving forward.

Please note that **Lot Packaging History** and **Lot Cost History** do not transfer to the new case goods lot at this time.

- - Packaging history will be retained on the original case goods lot (now archived)
  - [Add a Cost Item](https://support.innovint.us/hc/en-us/articles/360003203451-adding-a-cost-item-indirect-as-an-overhead-cost-?hsLang=en) to populate starting costs on the new Case Goods lot
