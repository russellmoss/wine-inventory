---
id: "32301384766868"
title: "Managing Fruit Costs"
url: "https://support.vintrace.com/hc/en-us/articles/32301384766868-Managing-Fruit-Costs"
category: "vintrace Web"
section: "Costing"
created_at: "2024-11-20T14:48:17Z"
updated_at: "2025-06-19T00:48:34Z"
labels: ["estate", "fruit costs", "after harvest", "during harvest", "grower contracts", "manage fruit costs"]
gist: "If costing is enabled in vintrace, you can add or adjust the cost of fruit at any time."
tags: ["cost", "harvest", "configuration", "lab", "vineyard", "blending"]
---

# Managing Fruit Costs

If costing is enabled in vintrace, you can add or adjust the cost of fruit at any time. Generally it’s easiest to set up the costing before or during harvest.

Because the costing transfers through the system automatically when the fruit costs change, it doesn’t matter when the costs are added, or how blended the wines have become.

## Setting Up Grower Contracts Before Harvest

A [grower contract](https://support.vintrace.com/hc/en-us/articles/32303300639124) lets you configure the price paid for fruit either per tonne/ton, or per area unit. You can then relate this to any number of properties including the grower, vineyard, block, or varietal. Refer to our [Managing Grower Contract Payments and Fruit Costs article](https://support.vintrace.com/hc/en-us/articles/32303300639124) to learn more.

When you set up a grower contract, you can set the default price. However, you can use a grading scale to override this price based on a quality or metric grading.

For example, suppose your default contract for 2019 Chardonnay is $2500 per tonne.

![GrowerContract_Update_JX2_CH_Contract_20200619.png](https://support.vintrace.com/hc/article_attachments/32329150901396)

The fruit is evaluated by brix at the scale and given a <22 grade; your contract pays less based on that scale. You can set up an overriding price in the Graded Prices section of the grower contract for the amount.

![GrowerContract_Update_-_Value_Rules_20200619.png](https://support.vintrace.com/hc/article_attachments/32329114439060)

You can also configure a default freight price that will be added to the fruit as it’s received over the scale.

When you [record a fruit delivery](https://support.vintrace.com/hc/en-us/articles/32303268370324), the contract will be automatically set for you if it matches the fruit being received. You’ll be able to view this information in the Cost/QA/Analysis tab of the Intake Details window, and manually override the fruit cost and freight cost if needed.

## Adding Costs During Harvest

You can assign costs to fruit during fruit intake by entering the information in the QA/Cost/Analysis tab of the [Intake Details window](https://support.vintrace.com/hc/en-us/articles/32303268370324).

If you have a grower contract assigned to the booking, the cost details will be completed for you. Otherwise, you can manually enter the cost of the fruit if you know it at the time of delivery. These numbers can be adjusted later if needed.

## Adding Costs After Harvest from the Fruit Intake Console

To add costs from the Fruit Intake Console:

1. Follow the steps for correcting a fruit intake. Refer to our [Correcting a Fruit intake](https://support.vintrace.com/hc/en-us/articles/32303331960980) article for details.
2. From the Intake Details window, select the QA/Costs/Analysis tab.
3. Select the Adjust Cost checkbox.

![Intake_Details_-_QA_Cost_Analysis_-_Adjust_Cost_20200623.png](https://support.vintrace.com/hc/article_attachments/32329127494036)

4. Enter the costs.
5. Click OK. The Intake Delivery window displays.
6. From the Intake Delivery window, enter an explanation in the Reason for Correction field.
7. Click Save.

## Adding Costs After Harvest For All Fruit Intakes for a Booking

To add costs from the Product page:

1. Use vintrace’s Quick Search to find the stock item or wine.
2. Select the Fruit tab.
3. Click the docket number. The Intake Delivery window displays.
4. Click Add Cost.

![Intake_Delivery_-_Add_Cost_Button_20200623.png](https://support.vintrace.com/hc/article_attachments/32329159664148)

The Admin Add Costs window displays.

5. Ensure that the Effective Date is set to the date that the fruit was received.
6. Enter the details for the costs.
7. Click Save.

## Adding Costs for a Fruit Intake After Harvest

1. Use vintrace’s Quick Search to find the stock item or wine.
2. From the product page, select the [Fruit tab](https://support.vintrace.com/hc/en-us/articles/360000814455-The-Product-Page#FruitTab).
3. Use either the [docket number](#h_01JHN7A4YXF6X1Y7F38EW0EXN2) or [block ID](#h_01JHN7V7CJJ0E5XMYXHDASMP1N) to add costs.

### Adding Costs Using the Docket Number

To add costs from the product page using the docket number:

1. Click the docket number.
2. Select the intake.
3. Click View.

![Adding Costs - Intake Delivery 20230508.png](https://support.vintrace.com/hc/article_attachments/33916311500308)

The Intake Details window displays.

4. Click Adjust Costs.

![Adding Costs - Intake Details - Adjust Cost Button 20230508.png](https://support.vintrace.com/hc/article_attachments/33916326969492)

The Adjust Associated Operation Cost window displays.

![Admin Adjust Associated Operation Cost 20230508.png](https://support.vintrace.com/hc/article_attachments/33916311510036)

5. Adjust the costs as needed.
6. Click Save.

### Adding Costs Using the Block Name

Note: The costs are added to the fruit intake docket and not added at a block level.

To add costs from the Blocks page using the block name:

1. Click the block name. The Block Overview window displays.
2. Select the Seasonal tab.
3. From the Fruit Receivals section of the window, click the amount received in the Tonnage column. The Product Overview window displays a warning.
4. Click I Understand, Continue Anyway.

![Adding Costs - Old Product Overview Warning 20230508.png](https://support.vintrace.com/hc/article_attachments/33916311515284)

4. Click the ![Costing 20230508.png](https://support.vintrace.com/hc/article_attachments/33916326980244) costing icon.

![Adding Costs - Old Product Overview - Costing Icon 20230508.png](https://support.vintrace.com/hc/article_attachments/33916311519508)

The costing window for the fruit intake displays.

5. Click Add Costs.

![Adding Costs - Costing - Add Costs Button 20230508.png](https://support.vintrace.com/hc/article_attachments/33916311526804)

The Admin Add Costs window displays.

![Admin Add Costs 20230508.png](https://support.vintrace.com/hc/article_attachments/33916326986772)

6. Add the cost items.
7. Click Save.

## Adding Costs After Harvest Using a CSV File

If you need to update a large number of fruit costs, you can enter the details into a CSV file and submit the file to vintrace for upload.

1. Click ![Reports_Menu_Option_20200406.png](https://support.vintrace.com/hc/article_attachments/32329150944148)Reports in the sidebar.
2. Select Vintage/Harvest.
3. Scroll down to the Grape Delivery report.
4. Specify the filters for the report. Be sure to set the Format to *CSV*.

![Winery_Reports_-_Vintage_Harvest_-_Grape_Delivery_-_Format_CSV_20200623.png](https://support.vintrace.com/hc/article_attachments/32329139594516)

5. Click Generate and save the CSV file to your computer.
6. Open the CSV file and enter your cost details.
7. Email the updated file to <support@vintrace.com>.

Our support team will upload the costs for you. The costs will be backdated to harvest and will ripple forward through all affected wine batches.

## Adding the Costs of Additions to Fruit

There may be times when you need to separate the cost of fruit. For example, if you purchased the fruit from a grower, but made your own additions, you may want to see these additions categorized separately in the resulting wines you produce.

Often, the cost of these actions is unknown when the fruit comes in. By the time they’re confirmed, the fruit has been crushed or pressed and is often in several different wine batches.

To add the costs of additions to fruit:

1. Use vintrace’s Quick Search to find the wine.
2. Select the Jobs tab.
3. Click the ![Three_Vertical_Dots_20200623.png](https://support.vintrace.com/hc/article_attachments/32329127557524) icon that’s beside the job.
4. Select View.
5. From the Intake Delivery window, select the intake then click View.

![Intake_Delivery_-_Viewing_Intake_20221206.png](https://support.vintrace.com/hc/article_attachments/32329159745556)

The Intake Details window displays.

6. Click Adjust Costs. The Admin Adjust Associated Operation Cost window displays.
7. In the Additions field, enter the new costs. This updates the costs and doesn’t add them. If you’ve entered costs in any of the fields, be sure to leave them as-is so you don’t change costs that were already entered.

![Admin_Adjust_Associated_Operation_Cost_-_Additons_20200623.png](https://support.vintrace.com/hc/article_attachments/32329151054484)

8. Click Save.

The new costs will be spread proportionally across all wines that originate from this fruit parcel.
