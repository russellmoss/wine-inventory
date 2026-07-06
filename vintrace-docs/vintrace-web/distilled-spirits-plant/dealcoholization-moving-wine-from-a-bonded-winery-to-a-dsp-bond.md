---
id: "32301302503444"
title: "Dealcoholization: Moving Wine from a Bonded Winery to a DSP Bond"
url: "https://support.vintrace.com/hc/en-us/articles/32301302503444-Dealcoholization-Moving-Wine-from-a-Bonded-Winery-to-a-DSP-Bond"
category: "vintrace Web"
section: "Distilled Spirits Plant"
created_at: "2024-11-20T14:46:22Z"
updated_at: "2026-01-22T23:28:01Z"
labels: []
gist: "This functionality is available starting with vintrace 9.4.3, but not enabled by default."
tags: ["bond", "barrels", "transfers", "inventory", "lot-identity", "tax-class"]
---

# Dealcoholization: Moving Wine from a Bonded Winery to a DSP Bond

This functionality is available starting with [vintrace 9.4.3](https://support.vintrace.com/hc/en-us/articles/32303276816020), but not enabled by default. If you would like to use this functionality, please contact our support team.

Be sure to complete the [configuration steps for a Distilled Spirits Plant (DSP)](https://support.vintrace.com/hc/en-us/articles/32301312232852) before starting this workflow.

![Diagram - Dealc Moving Wine to DSP 20231026.png](https://support.vintrace.com/hc/article_attachments/32328806830228)

To move wine from a bonded winery to a DSP bond, the dispatching winery should record a [bulk dispatch (inter-winery)](https://support.vintrace.com/hc/en-us/articles/32301313513620) operation. When recording the bulk dispatch (inter-winery):

- Select a dispatch type that has its Part I item set to *Transfers in bond*.
- Select an in-transit DSP tanker for the destination vessel. This tanker must be in an in-transit winery that’s also set up as a DSP bond.

The receiving winery should record a one-to-many or many-to-one transfer operation. When recording the transfer:

- The source vessel for the transfer is the in-transit DSP tanker.
- The destination vessel should be one that’s in the DSP bond and in the Production account.
- Set the resulting tax class to a Wine DSP tax class.
- Specify the alcohol measurement.
- Change the destination vessel’s batch to a name that’s different from the source batch. Be sure that the new batch’s winery is set to the DSP winery.

The receival of the wine will be tracked in Part VI of the Part VI of the [TTB Monthly Report of Production Operations](https://www.ttb.gov/images/pdfs/forms/f511040.pdf).
