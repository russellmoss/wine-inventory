---
id: "45568632820756"
title: "Calculating Levies for Grower Contracts without Grower Payments (Contracts Management)"
url: "https://support.vintrace.com/hc/en-us/articles/45568632820756-Calculating-Levies-for-Grower-Contracts-without-Grower-Payments-Contracts-Management"
category: "Harvest/Vintage"
section: "Growers, Vineyards, and Blocks"
created_at: "2026-01-22T21:46:22Z"
updated_at: "2026-05-06T17:28:25Z"
labels: ["grower contracts", "grower payments", "levies"]
gist: "This article relates to Contracts Management."
tags: ["harvest", "cost", "vineyard", "configuration", "reporting", "permissions"]
---

# Calculating Levies for Grower Contracts without Grower Payments (Contracts Management)

This article relates to Contracts Management. The Contracts Management module is disabled by default. To have this feature enabled, contact support.

Typically, the cost of fruit levies (aka fruit assessments) are calculated when grower payments are processed, and they are deducted from those grower payments.

However if you are not processing grower payments from vintrace then you can still calculate the levy costs.

1. Click ![](https://support.vintrace.com/hc/article_attachments/45568632812692) Contracts in the sidebar.

The Contract page displays.

Access to this menu is only available to users with the [Can manage grower contract permission](https://support.vintrace.com/hc/en-us/articles/32303349421588).

![](https://support.vintrace.com/hc/article_attachments/45568632813076)

2. Click the Configure dropdown button at the top right of the page and select ‘Settings’

![](https://support.vintrace.com/hc/article_attachments/45568617317524)

The Settings window is displayed

![](https://support.vintrace.com/hc/article_attachments/45568617319188)

1. Turn on the ‘Calculate levies independently from grower payments’ option
2. Click Close

The cost of levies will be displayed in the Levies section for each individual contract.

![](https://support.vintrace.com/hc/article_attachments/45568617320596)

See [Assigning Levies](https://support.vintrace.com/hc/en-us/articles/45962805386004) for assigning levies to contracted fruit records.

You can also run the ‘Levy costs report’ to see the costs for multiple contracts.

1. In the main Contracts page use the search options to locate the contracts you want to see the levy values for.
2. Select the contracts you want. You can select individual contracts, or select all, or a page of records via the Multi select button at the top left of the table
3. Select the ‘Levy costs report’ option from the bulk actions menu button at the bottom left of the contracts table

![](https://support.vintrace.com/hc/article_attachments/45568617321620)

A validation window displays

![](https://support.vintrace.com/hc/article_attachments/45568632817940)

4. Click Generate

A csv file will be created with the levy costs calculated based on the fruit received to date.

Note that this report is based on actual fruit received only. It does not calculate estimated costs based on the expected contracted fruit before harvest.
