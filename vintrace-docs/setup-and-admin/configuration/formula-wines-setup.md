---
id: "32301319054996"
title: "Formula Wines Setup"
url: "https://support.vintrace.com/hc/en-us/articles/32301319054996-Formula-Wines-Setup"
category: "Setup and Admin"
section: "Configuration"
created_at: "2024-11-20T14:46:50Z"
updated_at: "2026-05-18T18:40:02Z"
labels: []
gist: "Before you can use vintrace for formula wines, you must set up several tax classes and product treatments."
tags: ["configuration", "tax-class", "ttb", "additives", "reporting", "ux-friction"]
---

# Formula Wines Setup

Before you can use vintrace for formula wines, you must [set up several tax classes](#set_up_tax_classes) and product treatments. These tax classes and product treatments ensure that your TTB report is accurate.

You must declare any wines that you plan to use in your formula wines before using them. This ensures that the movements are correctly reported to the TTB. You can [declare your wines from vintrace’s Declaration Console](https://support.vintrace.com/hc/en-us/articles/32303302177940), or from the [wine details page](https://support.vintrace.com/hc/en-us/articles/32301306482708).

If you’re adding water to your formula wines, you’ll also need to [set up an additional water additive](#h_01FW1X9283VFW3J79901AABYT4).

Finally, you have the option to [set up additive templates](#h_01FW1X9PMPXCXPDB34F3RF50V1) and [work order templates](#h_01FW1XA1BYV4VVANDHTQ3PBJ9R). Although these templates are not required, they can streamline your process, reduce errors, and save time.

## Setting Up Tax Classes

To use vintrace for formula wines, you must [set up the following tax classes](https://support.vintrace.com/hc/en-us/articles/32301306220180):

- [Formula Wine In-Process](#formula_wine_in_process_tax_class)
- Concentrate
- Dry Sugar
- Juice
- Liquid Sugar

You must set up these tax classes in vintrace before any of these items can be brought in.

### Formula Wine In-Process Tax Class

When setting up the Formula Wine In-Process tax class, set the Federal TTB Column and State TTB Column to 'FIP' (formula in progress). By setting the column to 'FIP', the tax class causes the wine to move off the TTB while you’re making the formula wine.

![](https://support.vintrace.com/hc/article_attachments/49372957617684)

The wine will return to the TTB report when you’re done making the formula wine.

## Setting Up Product Treatments

After setting up the necessary tax classes, the next step to use vintrace for formula wines is to [set up the following product treatments](https://support.vintrace.com/hc/en-us/articles/32301359713428):

- [Formula Wine In-Process](#h_01FW1X2714PYRCMZ32VWER7C5V)
- [Formula Wine Produced 14 to 16%](#h_01FW1X2HWWWT7KH9N53WTS7QCB)
- [Formula Wine Produced 16 to 21%](#h_01FW1X2HWWWT7KH9N53WTS7QCB)
- [Formula Wine Produced Under 14%](#h_01FW1X2HWWWT7KH9N53WTS7QCB)
- [Un-declare Juice](#h_01FW1X2V3FBNX9G7C9TZA481HY)
- [Used 14 to 16% for Formula Wine](#h_01FW1X4V40TX1QYFFFWDAFWTEK)
- [Used 16 to 21% for Formula Wine](#h_01FW1X4V40TX1QYFFFWDAFWTEK)
- [Used Under 14% for Formula Wine](#h_01FW1X4V40TX1QYFFFWDAFWTEK)

### Formula Wine In-Process Product Treatment

When setting up the Formula Wine In-Process product treatment, be sure to:

- Select the Change Tax Class checkbox.
- Select *Part I - Formula Wine In-Process*. This is the [tax class that you created in the previous step](#formula_wine_in_process_tax_class).
- Select *Used for Formula Wine Production* as the reason.

![Product_Treatment_Definition_Create_-_Formula_Wine_In_Process_20220118.png](https://support.vintrace.com/hc/article_attachments/32328647592724)

### Formula Wine Produced Product Treatments

You’ll need to create three Formula Wine Produced product treatments:

- Formula Wine Produced 14 to 16%
- Formula Wine Produced 16 to 21%
- Formula Wine Produced Under 14%

For each product treatments, be sure to:

- Select the Change Tax Class checkbox.
- Select the appropriate tax class.
- Select *Formula Wine Produced* as the reason.

![Product_Treatment_Definition_Create_-_Formula_Wine_Produced_Percentage_20220118.png](https://support.vintrace.com/hc/article_attachments/32328603342484)

### Un-Declare Juice Product Treatment

The Un-Declare Juice product treatment that you create will be used to move the juice from page 1 of the TTB to page 2. Be sure to select the Use for Wine Production checkbox when setting up this product treatment.

![Product_Treatment_Definition_Create_-_UnDeclare_Juice_20220118.png](https://support.vintrace.com/hc/article_attachments/32328663767956)

### Used for Formula Wine Product Treatments

You’ll need to create three Used for Formula Wine product treatments:

- Used 14 to 16% for Formula Wine
- Used 16 to 21% for Formula Wine
- Used Under 14% for Formula Wine

For each product treatments, be sure to:

- Select the Change Tax Class checkbox.
- Select the appropriate tax class.
- Select *Used for Formula Wine Production* as the reason.

![Product_Treatment_Definition_Create_-_Used_Percentage_for_Formula_Wine_20220118.png](https://support.vintrace.com/hc/article_attachments/32328603365012)

## Setting Up a Water Additive

If you add water to your formula wines, you’ll need to [set up an additional water additive](https://support.vintrace.com/hc/en-us/articles/32301344910740). This water additive will be used for your formula wines to trigger increased volume.

![Additive_-_Water_Formula_20220119.png](https://support.vintrace.com/hc/article_attachments/32328621208852)

## Setting Up Additive Template

If you have a defined list of additives that go into your formula wines, you can [set up an additive template](https://support.vintrace.com/hc/en-us/articles/32301359803412) that automatically fills in the additives and their amounts.

![Additive_Template_-_Spritzer_20220119.png](https://support.vintrace.com/hc/article_attachments/32328621219988)

## Setting Up Work Order Template

Another optional step when setting up vintrace for formula wines is to [create work order templates](https://support.vintrace.com/hc/en-us/articles/32303293741588). You can create templates that include the jobs typically included in your process for making formula wines such as bulk intakes and multi additions.

![Work_Order_20210119.png](https://support.vintrace.com/hc/article_attachments/32328603430036)
