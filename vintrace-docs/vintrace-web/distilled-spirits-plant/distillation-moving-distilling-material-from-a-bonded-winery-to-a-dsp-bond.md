---
id: "32301325979412"
title: "Distillation: Moving Distilling Material from a Bonded Winery to a DSP Bond"
url: "https://support.vintrace.com/hc/en-us/articles/32301325979412-Distillation-Moving-Distilling-Material-from-a-Bonded-Winery-to-a-DSP-Bond"
category: "vintrace Web"
section: "Distilled Spirits Plant"
created_at: "2024-11-20T14:46:23Z"
updated_at: "2026-05-18T19:09:57Z"
labels: []
gist: "This functionality is part of our Distilled Spirits Plant functionality and is not enabled by default."
tags: ["bond", "barrels", "inventory", "tax-class", "transfers", "ttb"]
---

# Distillation: Moving Distilling Material from a Bonded Winery to a DSP Bond

This functionality is part of our [Distilled Spirits Plant](https://support.vintrace.com/hc/en-us/sections/32300840834452-Distilled-Spirits-Plant) functionality and is not enabled by default. If you would like to use this functionality, please contact support.

Be sure to complete the [configuration steps for a Distilled Spirits Plant (DSP)](https://support.vintrace.com/hc/en-us/articles/32301312232852) before starting this workflow.

![Diagram - Distillation - Bonded Winery to DSP Bond 20231109.png](https://support.vintrace.com/hc/article_attachments/32329221217428)

To move distilling material (e.g., wine not suitable for packaging, lees, filter wash, other residues) in Part VI from the bonded winery to a DSP bond, the dispatching winery should record a [bulk dispatch (inter-winery) operation](https://support.vintrace.com/hc/en-us/articles/32301313513620). When recording the bulk dispatch (inter-winery):

- Select a vessel that has material in the Part VI tax class.
- Select a dispatch type that has its Part VI item set to *Removed to Distilled Spirits Plant*.
- Select an in-transit DSP tanker for the destination vessel. This tanker must be in an in-transit winery that’s also set up as a DSP bond.

The receiving winery should record a one-to-many or many-to-one transfer operation. When recording the transfer:

- The source vessel for the transfer is the in-transit DSP tanker.
- The destination vessel should be one that’s in the DSP bond and in the Production account.
- The resulting tax class is a distilling material DSP tax class.
- Depending on the product treatment selected, you may need to specify the alcohol metric.

The receival of the distilling material will be tracked in Part VI of the [TTB F 5110.40 Monthly Report of Production Operations](https://www.ttb.gov/images/pdfs/forms/f511040.pdf).
