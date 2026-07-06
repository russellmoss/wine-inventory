---
title: "How Topping wines are blended into topped lots"
url: "https://support.innovint.us/hc/en-us/articles/205493245-how-are-topping-wines-blended-into-topped-lots-"
category: "MAKE"
section: "Topping"
page_type: "article"
lastmod: "2025-11-20"
gist: "The components of the topping wine are blended proportionally across the lot(s) being topped."
tags: ["transfers", "blending", "barrels", "work-orders"]
---

# How Topping wines are blended into topped lots

The components of the topping wine are blended proportionally across the lot(s) being topped.

**Example**, if you used 5 gallons of a topping wine - *LotT* - to top 3 different lots -

- LotA with 5 barrels filled to capacity = *300 gallons*
- LotB with 8 barrels: 7 filled to capacity, 1 partial barrel at 45 gallons = *465 gallons*
- LotC with 7 barrels & 1 15-gallon keg filled to capacity = *425 gallons*
- Total of 19 full barrels, 1 partial barrel, and 1 keg = *1200 gallons total*

Then the topping wine would be distributed as follows:

- LotA
  - Each barrel is topped with 0.25 gallons
  - Lot topped with 1.25 gallons total
- LotB
  - Each full barrel is topped with 0.25 gallons
  - The partial barrel is topped with 0.1875 gallons
    - Note: the Topping action/task does not fill this barrel to capacity. The Fill remains at 45 gallons after topping. To fill this barrel to capacity, use the [Top Off](//innovint-6865708.hs-sites.com/hc/en-us/articles/115002951483-using-the-top-off-feature?hsLang=en) or [Transfer](//innovint-6865708.hs-sites.com/hc/en-us/articles/360028194371-using-the-transfer-action?hsLang=en) actions.
  - Lot topped with 1.9375 gallons total
- LotC
  - Each fill barrel is topped with 0.25 gallons
  - The keg is topped with 0.0625 gallons
    - Note: Because the Topping action/task tops complete *Lots* and not individual vessels, InnoVint assumes that *all* vessels in that lot are topped proportionally
  - Lot topped with 1.7708 gallons total

Now, this is how the components are blended:

- LotA: 300 gallons total
  - 298.75 gallons of LotA
  - 1.25 gallons to LotT
- LotB: 465 gallons total
  - 463.0625 gallons of LotB
  - 1.9375 gallons of LotT
- LotC: 425 gallons total
  - 423.2292 gallons of LotC
  - 1.7708 gallons of LotT
- LotT makes up 0.4167% of the total for each lot
  - 5 gallons Topping wine out of 1200 gallons total = 0.4167%
