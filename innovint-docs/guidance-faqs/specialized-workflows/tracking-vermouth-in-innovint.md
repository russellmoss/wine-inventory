---
title: "Tracking Vermouth in InnoVint"
url: "https://support.innovint.us/hc/en-us/tracking-vermouth-in-innovint"
category: "Guidance & FAQs"
section: "Specialized Workflows"
page_type: "page"
lastmod: "2025-11-20"
gist: "This article outlines the step-by-step workflow to track vermouth."
tags: ["additives", "ttb", "harvest", "reporting", "work-orders", "cost"]
---

# Tracking Vermouth in InnoVint

This article outlines the step-by-step workflow to track vermouth.

🚨 InnoVint is not optimized for formula wine production. We recommend consulting with your compliance expert for correctly reporting vermouth on the TTB Report. This workflow is primarily intended to enable production tracking.

- [How to produce vermouth](#how)
- [Tracking costs for vermouth](#cost)
- [TTB reporting for vermouth](#ttb)

#### How to produce vermouth

1. Create a spirits lot for the neutral grape spirit following the instructions [here](https://support.innovint.us/hc/en-us/articles/115003769766-how-to-track-brandy-or-distilled-spirits-in-innovint?hsLang=en). Be sure to create this lot in the *Brandy or Distilled Spirit* tax class.
2. Create botanicals as additives in your Dry Goods Explorer, and [record an Addition action/task](https://support.innovint.us/hc/en-us/articles/204321939-how-to-record-an-addition-additive-batch-tracker-add-on-?hsLang=en) to add them to the grape spirit.
3. Record straining out botanicals as a [Custom Action/Task](https://support.innovint.us/hc/en-us/articles/204848455-using-a-custom-action-or-custom-task?hsLang=en).
4. Add the neutral grape spirits to the wine (fortification) following [these instructions](https://support.innovint.us/hc/en-us/articles/360018226292-fortification-sweetening-and-amelioration?hsLang=en#fortification). These instructions trigger population of Line 4 (Produced by addition of wine spirits)/Line 19 (Used for addition of wine spirits).
5. Sweeten the wine using [this sweetening workflow](/hc/en-us/sweetening#vol_adj). These instructions trigger population of Line 3 (Produced by Sweetening)/Line18 (Used for Sweetening). If sweetening juice or concentrate lots are used, this will cause them to deplete from Part IV.  Note that consumed sugar is a manual entry on our TTB form in Part IV.
6. Change the tax class to Vermouth. This moves the volume produced by addition of wine spirits to Part IX (column a) as Vermouth.
7. Record a Filter action/task, if needed.
8. Record a Bottle action/task. If your account has the case good module activated, we recommend reviewing Part IX after bottling vermouth to ensure manually that the correct volume is tracked in inventory.

#### Tracking costs for vermouth

Due to the volume adjustments that may take place with fortification and sweetening, tracking costs for vermouth is somewhat manual. Please note that [volume adjustments do not remove or transfer cost](https://support.innovint.us/hc/en-us/articles/204178489-volume-adjustment?hsLang=en#COGSimpact).

Because of these workflows, we would recommend tracking the spirit cost outside of InnoVint and then adding the appropriate amount of cost (based on the volume of spirit added) to the vermouth lot as a cost item after the spirit is combined with the wine base.

The cost of sweeteners may be tracked with different methods depending on what you use to sweeten (concentrate, juice or sugar, and how you track these sweeteners).  Please reach out to InnoVint Support if required.

#### TTB reporting for vermouth

This workflow will populate *Part IX, Line 1. Produced, column (a)* and the lines in Part I described above. InnoVint does not populate the TTB report for formula wine write-in lines.Note that wines sweetened with sugar require manual entries on the TTB Report for Part IV.

We recommend consulting with your compliance expert for correctly reporting vermouth production.

InnoVint does not support TTB reporting for Vermouth case goods, and we recommend reviewing and manually updating Part IX every period after bottling Vermouth.
