---
id: "32301312037396"
title: "RTD Production: Moving Flavors from a Bonded Winery to a DSP Bond"
url: "https://support.vintrace.com/hc/en-us/articles/32301312037396-RTD-Production-Moving-Flavors-from-a-Bonded-Winery-to-a-DSP-Bond"
category: "vintrace Web"
section: "Distilled Spirits Plant"
created_at: "2024-11-20T14:46:17Z"
updated_at: "2026-01-22T23:30:23Z"
labels: []
gist: "This functionality is available starting with vintrace 9.4.3, but not enabled by default."
tags: ["bond", "inventory", "barrels", "tax-class", "transfers", "configuration"]
---

# RTD Production: Moving Flavors from a Bonded Winery to a DSP Bond

This functionality is available starting with [vintrace 9.4.3](https://support.vintrace.com/hc/en-us/articles/6196990653071), but not enabled by default. If you would like to use this functionality, please contact our support team.

Be sure to complete the [configuration steps for a Distilled Spirits Plant (DSP)](https://support.vintrace.com/hc/en-us/articles/8224707977487) before starting this workflow.

![Diagram - Ready to Drink - Moving Flavors from Bonded to DSP 20230904.png](https://support.vintrace.com/hc/article_attachments/32329226282260)

To move flavors from a bonded winery to a DSP bond, record a [bulk dispatch (inter-winery) operation](https://support.vintrace.com/hc/en-us/articles/5865625691663). When recording the bulk dispatch (inter-winery), set the destination vessel to an in-transit DSP tanker. The operation will be linked to a Transfers in bond dispatch type.

The receiving winery should record a one-to-many or a many-to-one transfer. When recording the transfer:

- The source vessel is the in-transit DSP tanker specified for the bulk dispatch (inter-winery) operation.
- Set the resulting tax class to a Flavors DSP tax class.
- If needed, specify the alcohol measurement.
- Change the destination vessel’s batch.
