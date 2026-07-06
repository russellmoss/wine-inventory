---
id: "32301359803412"
title: "Setting Up an Additive Template"
url: "https://support.vintrace.com/hc/en-us/articles/32301359803412-Setting-Up-an-Additive-Template"
category: "vintrace Web"
section: "Lab work"
created_at: "2024-11-20T14:48:28Z"
updated_at: "2025-01-07T18:07:34Z"
labels: ["estate", "essentials", "additive target rates", "additives", "additive template", "wp-faq-1818"]
gist: "An additive template is a pre-configured list of additives and set rates."
tags: ["additives", "configuration", "lab", "fermentation"]
---

# Setting Up an Additive Template

An additive template is a pre-configured list of additives and set rates. When an additive template is selected, the additives and their rate of additions are automatically pre-filled.

You can create an additive template from the Winery Setup window (Setup Options > Production > Additive Template):

1. Click Set Up in the sidebar.
2. Click Winemaking.
3. From the Additive Templates tile, click Configure.
4. Click New Additive Template.
5. Specify the details for the additive template.

![Create_Additive_Template_-_SO2_35_20200719.png](https://support.vintrace.com/hc/article_attachments/32328863992340)

Selecting the Target checkbox for an additive will cause any additions created from the template to calculate the amount that will result in the metric reaching the target value. You can only select the Target checkbox for additives that have an associated metric.

You can automatically change a wine's [product state](https://support.vintrace.com/hc/en-us/articles/32301350848916) when the additive template is used by selecting the product state from the list. For example, the *Yeast Inoculation* additive template can change the wine's product state to *Inoculated.*
![Additive_Template_-_Yeast_Inoculation_20211028.png](https://support.vintrace.com/hc/article_attachments/32328886470292)

6. Click Save.

Users with a multi-winery license can specify which additive templates are available at each winery. Refer to our [Configuration for Multi-Winery Support article](https://support.vintrace.com/hc/en-us/articles/32301304791316) for details.

## Default Additive Rate vs. Target Rate

The additive rate is calculated using the rate and volume of wine (e.g., 35 ppm of the wine’s volume). The same target rate (e.g., 35 ppm) determines the current metric value of the wine (e.g., 10 ppm) and calculates the amount of additive needed based on the difference in rate (e.g., 35 - 10 = 25 ppm).

The addition will be switched to an additive rate if the Target checkbox is selected, but no current rate/metric value can be found for the wine.
