---
id: "32301375565076"
title: "Tracking Lab Costs"
url: "https://support.vintrace.com/hc/en-us/articles/32301375565076-Tracking-Lab-Costs"
category: "vintrace Web"
section: "Costing"
created_at: "2024-11-20T14:48:29Z"
updated_at: "2024-11-21T10:29:50Z"
labels: ["estate", "wp-page-2061", "lab costs"]
gist: "You can track lab costs in vintrace by setting up a custom cost item for the lab costs, then associating it with an analysis template."
tags: ["cost", "lab", "configuration", "transfers", "work-orders"]
---

# Tracking Lab Costs

You can track lab costs in vintrace by [setting up a custom cost item for the lab costs](#h_01EC5NZMQT7TG5YGRP39M17ZXE), then [associating it with an analysis template](#h_01EC5NZZH2R4TM0V06FAGVA1E3). Each time the analysis template is used as part of a lab job, the cost will automatically transfer to the wine.

## Setting Up a Cost Item for Lab Costs

When [setting up a cost item](https://support.vintrace.com/hc/en-us/articles/32301359350932), be sure to set its Price Per setting to *Each*. Set the cost item’s Default Value to the known fixed cost that you can apply to an analysis template.

![Update_Cost_Item_-_ETS_Lab_Cost_-_Price_Per_20200701.png](https://support.vintrace.com/hc/article_attachments/32329169383060)

If you need to add more specific lab costs, refer to our [Making Ad Hoc Cost Adjustments article](https://support.vintrace.com/hc/en-us/articles/32301343956884).

## Associating Cost Item with Analysis Template

[Set up an analysis template](https://support.vintrace.com/hc/en-us/articles/32301372281748) that has its Cost Amount set to the default price and its Cost Item set to the cost item that you created.

![Analysis_Template_Update_-_Routine_20200701.png](https://support.vintrace.com/hc/article_attachments/32329164401172)
