---
id: "32301323010836"
title: "Backdating Analysis and Live Metrics"
url: "https://support.vintrace.com/hc/en-us/articles/32301323010836-Backdating-Analysis-and-Live-Metrics"
category: "vintrace Web"
section: "Lab work"
created_at: "2024-11-20T14:47:44Z"
updated_at: "2024-11-21T10:29:09Z"
labels: ["estate", "wp-faq-1732", "essentials", "backdate analysis", "live metrics"]
gist: "When an analysis is backdated in vintrace, the system will try to roll the analysis forward."
tags: ["lab", "additives", "barrels", "blending", "transfers"]
---

# Backdating Analysis and Live Metrics

When an analysis is [backdated](https://support.vintrace.com/hc/en-us/articles/32301371490196) in vintrace, the system will try to roll the analysis forward. However, there are a few restrictions.

If the metric has had an analysis recorded against it with a more recent reading, the analysis will NOT be rolled past this point. For example, if a Malic analysis is backdated past two additions and a treatment, it’s stopped by the top analysis that also contains a Malic reading.

![Backdating_Analysis_Example_02_20200721.png](https://support.vintrace.com/hc/article_attachments/32329003968532)

If a new revision of the wine is created, the analysis will be rolled forward to this point. This could happen when the wine is topped, blended, partially transferred, pressed, or anything that could change its composition or split it. For example, if an analysis is backdated behind a pressing operation, the analysis will apply to the extracted must that was recorded prior to the backdated analysis.

![Backdating_Analysis_Example_01_20200721.png](https://support.vintrace.com/hc/article_attachments/32328988637972)

If the wine has changed vessels between the time the analysis was scheduled and when it was recorded, and the revision is the same, you’ll be asked if you want to apply the analysis to the current state.

Contact [support](mailto:support@vintrace.com) if you have any questions about how metrics are backdated.
