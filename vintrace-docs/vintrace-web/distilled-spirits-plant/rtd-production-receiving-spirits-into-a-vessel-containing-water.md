---
id: "32301302138260"
title: "RTD Production: Receiving Spirits into a Vessel Containing Water"
url: "https://support.vintrace.com/hc/en-us/articles/32301302138260-RTD-Production-Receiving-Spirits-into-a-Vessel-Containing-Water"
category: "vintrace Web"
section: "Distilled Spirits Plant"
created_at: "2024-11-20T14:46:17Z"
updated_at: "2026-01-22T23:30:40Z"
labels: []
gist: "This functionality is available starting with vintrace 9.4.3, but not enabled by default."
tags: ["barrels", "cost", "tax-class", "configuration", "lab", "lot-identity"]
---

# RTD Production: Receiving Spirits into a Vessel Containing Water

This functionality is available starting with [vintrace 9.4.3](https://support.vintrace.com/hc/en-us/articles/6196990653071), but not enabled by default. If you would like to use this functionality, please contact our support team.

Be sure to complete the [configuration steps for a Distilled Spirits Plant (DSP)](https://support.vintrace.com/hc/en-us/articles/8224707977487) before starting this workflow.

![Diagram - Ready to Drink - Receiving Spirits Into Vessel with Water 20230904.png](https://support.vintrace.com/hc/article_attachments/32328771872020)

To receive spirits into a vessel containing water so that the spirits are diluted upon arrival, record a [bulk intake operation](https://support.vintrace.com/hc/en-us/articles/360000910255). When recording the bulk intake:

- The specified destination vessel will be in the Processing account.
- The batch’s Designated Variety should be the type of spirit so that it’s correctly reported on the Processing report.
- On the Costing & Labs tab of the Bulk Intake window, set the DSP Account to *Processing* and set the DSP tax class to the applicable spirits DSP tax class.
- On the Costing & Labs tab of the Bulk Intake window, enter the alcohol metric so that the proof gallons for the receival can be calculated by vintrace.
