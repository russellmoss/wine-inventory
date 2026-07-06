---
title: "Fill level change in topped vessels"
url: "https://support.innovint.us/hc/en-us/articles/204847635-is-the-fill-increasing-in-topped-vessels-"
category: "MAKE"
section: "Topping"
page_type: "article"
lastmod: "2025-11-20"
gist: "The volume of the vessel(s) being topped via a Topping action/task will NOT increase."
tags: ["transfers", "barrels", "blending", "inventory", "work-orders", "reporting"]
---

# Fill level change in topped vessels

The volume of the vessel(s) being topped via a [Topping](https://support.innovint.us/hc/en-us/articles/204177099-using-the-topping-feature?hsLang=en) action/task will NOT increase.

InnoVint assumes that the volume used to top each vessel is replacing volume lost due to evaporation.

Partial vessels will remain at their current fill volume and will not be topped to capacity. (To fill a partial vessel to capacity, use the [Top Off](//innovint-6865708.hs-sites.com/hc/en-us/articles/115002951483-using-the-top-off-feature?hsLang=en) action/task.)

Although the volume is not changing in your topped lots, the composition will change if you are blending a different topping wine into the lot(s) being topped.

The system assumes the same evaporative loss rate across all the lots being topped and distributes the gallonage proportionally across the volume of the lots. The overall loss from the Topping Lot is recorded as normal Inventory Losses (as reported on the TTB Report) due to evaporation and the vessels topped from will decrease in contents.

Example:

- Lot A - 50 gallons
- Lot B - 100 gallons
- Topped with 15 gallons of Lot T

Assuming proportional topping across each lot:

- 5 gallons (33%) of Lot T went into Lot A
- 10 gallons (67%) of Lot T went into Lot B

The volume of Lot A and Lot B will not change. The 15 gallon loss from Lot T will be removed from the corresponding topping vessels and is recorded as normal Inventory Losses due to evaporation.

Find more examples of how topping wines are blended [here](https://support.innovint.us/hc/en-us/articles/205493245-how-are-topping-wines-blended-into-topped-lots-?hsLang=en).
