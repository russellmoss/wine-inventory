---
id: "32301298697748"
title: "Dealcholization: Moving Spirits Between DSP Bonds"
url: "https://support.vintrace.com/hc/en-us/articles/32301298697748-Dealcholization-Moving-Spirits-Between-DSP-Bonds"
category: "vintrace Web"
section: "Distilled Spirits Plant"
created_at: "2024-11-20T14:46:19Z"
updated_at: "2026-01-22T23:29:09Z"
labels: []
gist: "This functionality is available starting with vintrace 9.4.3, but not enabled by default."
tags: ["barrels", "inventory", "lot-identity", "bond", "configuration", "transfers"]
---

# Dealcholization: Moving Spirits Between DSP Bonds

This functionality is available starting with [vintrace 9.4.3](https://support.vintrace.com/hc/en-us/articles/32303276816020), but not enabled by default. If you would like to use this functionality, please contact our support team.

Be sure to complete the [configuration steps for a Distilled Spirits Plant (DSP)](https://support.vintrace.com/hc/en-us/articles/32301312232852) before starting this workflow.

![Diagram - Dealc Moving Spirits Bewteen DSP Bonds 20230904.png](https://support.vintrace.com/hc/article_attachments/32328789023252)

To move spirits between DSP bonds, record a [bulk dispatch (inter-winery) operation](https://support.vintrace.com/hc/en-us/articles/32301313513620). When recording the Bulk Dispatch (Inter-Winery) operation:

- The destination should be an in-transit tanker in the DSP winery.
- The dispatch type should be linked to Transferred to Other Bonded Premises.

The receiving winery will need to record a One-to-Many or Many-to-One Transfer operation where:

- The source is the in-transit DSP tanker.
- The destination vessel is one that’s in the DSP bond (typically a vessel in the Storage account). Be sure to change the destination vessel’s batch to a new batch, or a batch in the receiving winery.
