---
id: "32301334239636"
title: "Returning Shipped Juice to Fermenter"
url: "https://support.vintrace.com/hc/en-us/articles/32301334239636-Returning-Shipped-Juice-to-Fermenter"
category: "vintrace Web"
section: "Compliance"
created_at: "2024-11-20T14:46:44Z"
updated_at: "2024-12-03T22:13:54Z"
labels: ["estate"]
gist: "This article is for US customers."
tags: ["compliance", "ttb", "fermentation", "bond", "tax-class", "barrels"]
---

# Returning Shipped Juice to Fermenter

This article is for US customers.

Juice that’s fermenting may already have an alcohol percentage recorded. Some wineries may ship their juice to another facility because of space limitations and/or so that the receiving winery can use it to finish the fermentation process.

When shipping juice with more than 0.5% alcohol, it must be declared as wine. The source winery can do this using either a [transfer](#transferring_juice) or a [dispatch](#dispatching_fermenting_juice).

The receiving winery will undeclare the wine using a product treatment that changes its tax state to *Non-declared*.

If you’re in the US and ship juice with more than 0.5% alcohol between your wineries, the receiving winery will need to follow the steps below to ensure that it’s properly recorded on the [TTB 5120.17 (702)](https://support.vintrace.com/hc/en-us/articles/360000813955-TTB-Report-5120-17-).

1. [Create a product treatment to undeclare juice with alcohol](#creating_product_treatment_to_undeclare_juice_with_alcohol).
2. [Apply the product treatment to an individual wine](#apply_the_product_treatment_to_an_individual_wine), or to [multiple vessels](#apply_the_product_treatment_to_multiple_vessels).

## Creating a Product Treatment to Undeclare Juice with Alcohol

[Set up a product treatment](https://support.vintrace.com/hc/en-us/articles/360001994575-Setting-Up-a-Product-Treatment#SettingUpaProductTreatment) that has the Return Previously Declared Wine to Fermenter checkbox selected. This checkbox is specifically used for inter-winery shipping of fermenting juice with more than 0.5% alcohol that’s undeclared at the receiving winery where it will continue fermentation.

![Returned_to_Fermenter_12-07-2022_1.png](https://support.vintrace.com/hc/article_attachments/32328634027796)
For bonded wines, this changes the product’s tax state from *Bonded* to *Non-declared*. This only applies to declared wines in Part I of your TTB 5120.17 (702) that are in the following columns:

- Column a: Not over 16%
- Column b: 16 to 21%
- Column c: 21 to 24%
- Column d: Artificially carbonated wine
- Column f: Hard cider

![Returned_to_Fermenter_12-07-2022_2.png](https://support.vintrace.com/hc/article_attachments/32328596086164)

A product treatment that has the Return Previously Declared Wine to Fermenter checkbox selected can only be used for declared wines that are in one of the columns above.

The product treatment cannot be used for the following:

- Column e of Part I: Sparkling wine
- Anything in Part II and Part III. This may include, but is not limited to:

- Spirits in columns b, c, and d of Part II
- Juice in column c Part III.
- Concentrate in column d of Part III.

If you attempt to use the product treatment on any of the above, an error displays.

## Product Treatment’s Impact on the TTB

The tax events will be recorded and shown on the [TTB 5120.17 (702)](https://support.vintrace.com/hc/en-us/articles/360000813955-TTB-Report-5120-17-).

The change in volume displays under the RETURNED TO FERMENTERS row in the TTB.

![Returned_to_Fermenter_12-07-2022_3.png](https://support.vintrace.com/hc/article_attachments/32328612141716)

The volume will be included in column (a) of the IN FERMENTERS (ESTIMATED QUANTITY OF LIQUID) row in Part VII. This volume is currently tracked when the juice is fermenting and isn’t declared, or when the juice is unfermented.

![Returned_to_Fermenter_12-07-2022_4.png](https://support.vintrace.com/hc/article_attachments/32328612023316)

## Apply the Product Treatment to an Individual Wine

The system user applying the product treatment must have the [Can Adjust Tax State permission](https://support.vintrace.com/hc/en-us/articles/360000813755-Roles-and-Permissions#Permissions).

To apply the product treatment that you created to each wine that the juice is being added to:

1. From the Vessels page, click the ![Operations_Icon_20200407.png](https://support.vintrace.com/hc/article_attachments/32328602296596) operations icon.
2. Select Treatment (Product) under Treatments.

The Treatment (Product) window displays.

3. Specify the vessel and batch.
4. From the Treatment list, select the [product treatment you created to undeclare the juice](#creating_product_treatment_to_undeclare_juice_with_alcohol).

![Returned_to_Fermenter_12-07-2022_10.png](https://support.vintrace.com/hc/article_attachments/32328612200468)

5. Click Save.

## Apply the Product Treatment to Multiple Vessels

To apply the product treatment to multiple vessels:

1. From the Vessels page, select the vessels.
2. From the Actions menu in the lower left of the page, select Work Order > Treatment (Product).

![Returned_to_Fermenter_12-07-2022_6.png](https://support.vintrace.com/hc/article_attachments/32328612002196)

3. Select the [product treatment you created to undeclare the juice](#creating_product_treatment_to_undeclare_juice_with_alcohol).
4. Save each job in the work order.

## Workflow Options

There are two different workflows for shipping out juice from a winery and receiving it in another. Both workflows use the product treatment that you created for undeclaring juice.

### Transferring Juice

In this workflow, the source winery [declares the fermenting juice and sets the tax class](https://support.vintrace.com/hc/en-us/articles/360000824316-Declaring-Wine#DeclaringWine). If the destination (i.e., receiving) winery is set up in the same vintrace database, you can use the [in-transit workflow to move the wine between the wineries](https://vinx2-old.zendesk.com/hc/en-us/articles/360000812115).

The destination winery [applies the product treatment to undeclare the juice to individual wines](#apply_the_product_treatment_to_an_individual_wine) or [multiple vessels](#apply_the_product_treatment_to_multiple_vessels). The diagram below provides an overview of the workflow and the impact on the [TTB 5120.17 (702)](https://support.vintrace.com/hc/en-us/articles/360000813955-TTB-Report-5120-17-) at each step.

![Returned_to_Fermenter_12-07-2022_7.png](https://support.vintrace.com/hc/article_attachments/32328627626132)

### Dispatching Fermenting Juice

Like the first workflow, this begins with the source winery [declaring the fermenting juice and setting the tax class](https://support.vintrace.com/hc/en-us/articles/360000824316-Declaring-Wine#DeclaringWine). However, with this workflow, the source winery uses the [Bulk Dispatch operation](https://support.vintrace.com/hc/en-us/articles/360000822556-Recording-a-Bulk-Wine-Dispatch) and a custom dispatch type that has the Section A Item for Bulk Wine Dispatch setting set to *Transfers in Bond.*

When the wine is [dispatched out of vintrace](https://support.vintrace.com/hc/en-us/articles/360000824696-Dispatching-Vessels-as-Part-of-a-Bulk-Wine-Dispatch), it’s recorded as a Transfers in Bond on the [TTB 5120.17 (702)](https://support.vintrace.com/hc/en-us/articles/360000813955-TTB-Report-5120-17-).

The destination winery receives the wine as a bonded wine with the correct tax class.

The destination winery can import the [eBOL](https://support.vintrace.com/hc/en-us/articles/360000822536-Using-an-eBOL-Electronic-Bill-of-Lading-#ImportingtheeBOLFile) that was generated by the source winery to complete the bulk intake operation manually.

The destination winery then [applies the product treatment to undeclare the juice to individual wines](#apply_the_product_treatment_to_an_individual_wine) or [multiple vessels](#apply_the_product_treatment_to_multiple_vessels). The diagram below provides an overview of the workflow and the impact on the [TTB 5120.17 (702)](https://support.vintrace.com/hc/en-us/articles/360000813955-TTB-Report-5120-17-) at each step.

![Returned_to_Fermenter_12-07-2022_9.png](https://support.vintrace.com/hc/article_attachments/32328634160148)
