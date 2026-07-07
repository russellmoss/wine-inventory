---
id: "32303301779988"
title: "Reporting Sugar on the TTB Report"
url: "https://support.vintrace.com/hc/en-us/articles/32303301779988-Reporting-Sugar-on-the-TTB-Report"
category: "Reporting"
section: "TTB (USA)"
created_at: "2024-11-20T15:51:19Z"
updated_at: "2024-11-21T10:27:55Z"
labels: ["estate", "wp-faq-6493"]
gist: "The ability to report sugar in the TTB Report was added in vintrace version 5.2.4."
tags: ["reporting", "ttb", "configuration", "tax-class", "additives", "inventory"]
---

# Reporting Sugar on the TTB Report

The ability to report sugar in the TTB Report was added in vintrace version 5.2.4.

Dry and liquid sugar that’s used is reported in the Part IV - Summary of Materials Received and Used section of the TTB Report.

To report on sugar in the TTB Report, you’ll need to do the following for your dry sugar and liquid sugar:

1. [Set up tax classes for the sugars](#Setting_Up_Tax_Classes).
2. [Set up additives for the sugars](#Setting_Up_Additives).
3. [Set up stock items for the sugars](#Setting_Up_Stock_Items).

When you [use the sugar in your wines](#Using_Sugar), it will be [reported in the TTB Report](#Sugar_in_TTB_Report).

## Setting Up Tax Classes for Sugars

You'll need to [set up two tax classes](https://support.vintrace.com/hc/en-us/articles/32301306220180) for your sugars: one for dry sugar, and another for liquid sugar.

When setting up the tax class for dry sugar, be sure to specify the following settings:

- TTB Part — Select *Part IV - Materials*.
- TTB Column Ref — Enter *h*.

![Dry_Sugar_Tax_Class_20210113.png](https://support.vintrace.com/hc/article_attachments/32329008451860)

You’ll also need to set up a new tax class for liquid sugar with the following settings:

- TTB Part — Select *Part IV - Materials*.
- TTB Column Ref — Enter *i*.

![Liquid_Sugar_Tax_Class_20210114.png](https://support.vintrace.com/hc/article_attachments/32329000335380)

## Setting Up Additives for Sugar

Unlike other materials such as grapes, juice and concentrate in Part IV of the TTB Report, vintrace handles sugar as an additive. You'll need to [set up additives](https://support.vintrace.com/hc/en-us/articles/32301344910740) for dry sugar and for liquid sugar.

![Additives_-_Sugar_20210114.png](https://support.vintrace.com/hc/article_attachments/32328979611156)

## Setting Up Stock Items for Sugar

[Set up a stock item](https://support.vintrace.com/hc/en-us/articles/32303296023316) for dry sugar and liquid sugar with the following settings:

- Tax Class — Select the [tax class you created earlier](#Setting_Up_Tax_Classes). Be sure to select the correct tax class so that the sugar used is correctly reported in the TTB Report. In other words, be sure to select the *Dry Sugar* tax class for your Dry Sugar additive stock item, and the *Liquid Sugar* tax class for your Liquid Sugar additive.

![Additive_Stock_Item_-_Sugars_-_Tax_Class_20210114.png](https://support.vintrace.com/hc/article_attachments/32329000377492)

- Additive — Select the [additive you created earlier](#Setting_Up_Additives). Be sure to select the correct additive for each stock item. In other words, be sure to select the *Dry Sugar* additive for your Dry Sugar additive stock item, and the *Liquid Sugar* additive for your Liquid Sugar additive.

![Additive_Stock_Item_-_Sugars_-_Additives_20210114.png](https://support.vintrace.com/hc/article_attachments/32328991949332)

Refer to our [Receiving Stock article](https://support.vintrace.com/hc/en-us/articles/32303350382356) for details on receiving your sugar stock.

## Using Sugar

You can add sugar to your wines like any other additive. You can do this with an Additive or [Multi Addition](https://support.vintrace.com/hc/en-us/articles/32301358791956) operation, or by using the sugar as an inline addition to Transfer or Blend operations.

## Sugar in the TTB Report

Sugar that’s used in an addition will be reported in Part IV, row 5 (Used in Wine Production) of the TTB Report. The amount of dry sugar displays in the Sugar - Dry column.

![TTB_Part_04_-_Dry_Sugar_20210114.png](https://support.vintrace.com/hc/article_attachments/32328979724948)

The amount of liquid sugar displays in the Sugar - Liquid column.

![TTB_Part_04_-_Liquid_Sugar_20210114.png](https://support.vintrace.com/hc/article_attachments/32329000434324)
