---
id: "32301298832276"
title: "Flagging a Wine as a Formula Wine"
url: "https://support.vintrace.com/hc/en-us/articles/32301298832276-Flagging-a-Wine-as-a-Formula-Wine"
category: "vintrace Web"
section: "Winemaking"
created_at: "2024-11-20T14:46:21Z"
updated_at: "2026-01-22T19:26:44Z"
labels: []
gist: "Refer to our Formula Wines Setup article for details on setting up tax classes, product treatments, water additives, additive templates, and work order templates for formula wines."
tags: ["additives", "configuration", "barrels", "tax-class", "work-orders"]
---

# Flagging a Wine as a Formula Wine

Refer to our [Formula Wines Setup article](https://support.vintrace.com/hc/en-us/articles/32301319054996) for details on setting up tax classes, product treatments, water additives, additive templates, and work order templates for formula wines.

There are two options for flagging a wine as a formula wine:

- [Apply a product treatment](#product_treatment) to change the tax class to *Part I - Formula Wine*. This is the most commonly used option.
- [Record an additive or multi-additions operation that uses a loss reason for formula wine](#loss_reason).

## Applying a Product Treatment

With this option, you’ll need to first [set up a product treatment that will be used to flag the wine as a formula wine](https://support.vintrace.com/hc/en-us/articles/32301359713428). The product treatment should change the tax class to *Part I - Formula Wine Produced*.

![Product Treatment 20230718.png](https://support.vintrace.com/hc/article_attachments/32328569334676)

After you’ve set up the product treatment, record a product treatment operation that uses the formula wine product treatment.

![Treatment Product 20230718.png](https://support.vintrace.com/hc/article_attachments/32328574959380)

## Using a Loss Reason for Formula Wines

For this option, you’ll need to set up a loss reason to indicate that a formula wine was produced.

![Loss Reason 20230718.png](https://support.vintrace.com/hc/article_attachments/32328543860884)

Next, you’ll need to record an additive or multi additions operation where the volume is increased.

![Additive with Loss Reason 20230718.png](https://support.vintrace.com/hc/article_attachments/32328588215828)

## Viewing Formula Wines on the Vessels Page

You can [customize the Vessels page](https://support.vintrace.com/hc/en-us/articles/32301323976084) to display the Formula Wine column. You’ll also be able to [filter the Vessels page by a wine’s formula wine setting](https://support.vintrace.com/hc/en-us/articles/32301344204308).

![Vessels Page 20230718.png](https://support.vintrace.com/hc/article_attachments/32328569382804)

## Viewing Formula Wines on the Product Page

You can display the Formula Wine tile on the [Product page](https://support.vintrace.com/hc/en-us/articles/32303310460948) so you can quickly see whether a wine is a formula wine.

## Viewing Formula Wines on the Bulk Stock Report

The Bulk Stock Report’s CSV will include a column to show whether a wine is a formula wine.

## Viewing Formula Wines on the TTB Report

Bulk dispatches that use a removed taxpaid (bulk) reason for a wine that is flagged as a formula wine will be reported in Part IX, line 2.

The Formula Wine Produced events may be reported on line 10, line 11, or line 12, or as a combined line when there are three or more entries. If there is a combined line, a remark and volume will be added to Part X for each item.

In Part IX:

- Line 1 will only show the total amount for the Formula Wine Produced tax class change reason for all of the official Part I tax class columns (i.e., a, b, c, d, e, and f).
- Wine in the Formula Wine in Process tax class (i.e., wines in a tax class with column reference FIP) will not be reported in Part I and Part IX. However, its volume at the end of the period will be included as a remark in Part X.
