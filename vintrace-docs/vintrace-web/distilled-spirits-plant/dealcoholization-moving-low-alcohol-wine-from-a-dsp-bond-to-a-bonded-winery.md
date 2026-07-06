---
id: "32301302326036"
title: "Dealcoholization: Moving Low-Alcohol Wine from a DSP Bond to a Bonded Winery"
url: "https://support.vintrace.com/hc/en-us/articles/32301302326036-Dealcoholization-Moving-Low-Alcohol-Wine-from-a-DSP-Bond-to-a-Bonded-Winery"
category: "vintrace Web"
section: "Distilled Spirits Plant"
created_at: "2024-11-20T14:46:20Z"
updated_at: "2026-01-22T23:28:38Z"
labels: []
gist: "This functionality is available starting with vintrace 9.4.3, but not enabled by default."
tags: ["bond", "inventory", "barrels", "configuration", "transfers"]
---

# Dealcoholization: Moving Low-Alcohol Wine from a DSP Bond to a Bonded Winery

This functionality is available starting with [vintrace 9.4.3](https://support.vintrace.com/hc/en-us/articles/32303276816020), but not enabled by default. If you would like to use this functionality, please contact our support team.

Be sure to complete the [configuration steps for a Distilled Spirits Plant (DSP)](https://support.vintrace.com/hc/en-us/articles/32301312232852) before starting this workflow.

![Diagram - Moving Low Alc Wine to Bonded Winery 20230904.png](https://support.vintrace.com/hc/article_attachments/32328792080148)

To move a low-alcohol wine from a DSP bond to a bonded winery, you’ll need to record a [bulk dispatch (Inter-Winery) operation](https://support.vintrace.com/hc/en-us/articles/5865625691663-Bulk-Dispatch-Inter-Winery-) from the dispatching (DSP bonded) winery. Using this operation retains the wine’s composition and history. When recording the bulk dispatch (inter-winery):

- The destination should be an in-transit tanker in a bonded winery. This results in a positive tax event.
- The dispatch type should be linked to Transferred to Other Bonded Premises. This results in a negative tax event.

The receiving bonded winery will need to record a transfer operation where the source is the in-transit tanker. The destination should be a vessel at the bonded winery.
