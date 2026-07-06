---
id: "32303268508564"
title: "Preparing for Harvest/Vintage"
url: "https://support.vintrace.com/hc/en-us/articles/32303268508564-Preparing-for-Harvest-Vintage"
category: "Harvest/Vintage"
section: "Preparing for Harvest"
created_at: "2024-11-20T15:51:07Z"
updated_at: "2024-11-21T10:28:01Z"
labels: ["estate", "wp-page-1122"]
gist: "There are a number of steps you can take to prepare for your first vintrace harvest."
tags: ["harvest", "configuration", "getting-started", "vineyard", "lab", "ux-friction"]
---

# Preparing for Harvest/Vintage

There are a number of steps you can take to prepare for your first vintrace harvest. Although none of the following steps are required, setting them up helps automate certain processes which can save you time and decrease the potential for errors.

## Setting Up Defaults

Setting up default data and thresholds makes data entry easier, faster, and more accurate. You can set up defaults and thresholds in the Winery Setup window. Refer to the table below for details.

|  |  |
| --- | --- |
| **SET UP ...** | **IN WINERY SETUP UNDER ...** |
| Defaults | Setup Options > Work-Flow > Defaults |
| Minimum and maximum load thresholds | Setup Options > Equipment > Scales |
| Default extraction rates | Setup Options > General > System Policy > Edit Default Extraction Rates  Edit_Default_Extraction_Rate_-_Must_20200902.png    If you have a multi-winery license, refer to our [Configuration for Multi-Winery Support article](https://support.vintrace.com/hc/en-us/articles/32301304791316) for details on setting up default extraction rates for each winery. |
| Minimum and maximum extraction rates | Setup Options > General > System Policy > Edit Threshold Settings |
| Extraction rates for a specific varietal | Setup Options > Production > Variety Varietal_Extraction_Rate_20200902.png |

## The Block Overview Window

The Block Overview window lets you manage your blocks details, fruit sampling, and viticulture assessments.

To access the Block Overview window:

1. Click ![More_Options_20200323.png](https://support.vintrace.com/hc/article_attachments/32328972575380) More Options from the sidebar.
2. From the Harvest tile, click Block Overview.

Refer to our [Block Overview Window article](https://support.vintrace.com/hc/en-us/articles/32301319801876) to learn more.

## Setting Up Analysis Templates

Analysis templates are used throughout vintrace to group common metrics together and provide the necessary fields when recording measurements in different situations. They can save you time when you need to record metrics or request an analysis. You can also specify the default template used for fruit sampling, fruit receival, and ferments. This would cause the template to be automatically selected in those situations.

When you [add an analysis template](https://support.vintrace.com/hc/en-us/articles/32301372281748), you pre-define the metrics that are included in the analysis.

![Analysis_Template_Metrics_20200826.png](https://support.vintrace.com/hc/article_attachments/32328965106196)

The analysis template can also be used to change the product’s state. If you’re using vintrace for costing, you can also track the cost amount for the analysis.

![Analysis_Template_Product_State_and_Cost_20200826.png](https://support.vintrace.com/hc/article_attachments/32328947814292)

Examples of harvest-specific analysis templates that you might want to add include:

- Vineyard samples
- B&Ts
- Grape phenolic panel
- Juice panel
- Press panel

Other examples include:

- Fruit at scale
- Cold soak
- Monthly
- Weekly RS
- Weekly ML
- Chem panel
- Smoke Taint
- SO2 addition confirmation
- SO2 check
- Baker lab juice panel
- ETS Juice panel (lab specific)
- ETS wine panel
- ETS Scorpion
- Post crossflow
- Pre-bottling

We recommend that you review the standard templates prior to vintage to ensure all metrics recorded by your lab are present. You can view and edit your analysis template in the Winery Setup window, by selecting Setup Options > Production > Analysis Template.

## Setting Up Additions

When you [set up an additive](https://support.vintrace.com/hc/en-us/articles/32301344910740) in vintrace, you can configure it so that it not only tracks the linked stock item when the additive is used, but also sets the cause treatment state of the wine.

At a minimum, you should ensure the following:

- Yeast additives should start alcoholic fermentation. You can confirm this by looking at the additive’s Cause Treatment. Refer to our [Managing Ferments article](https://support.vintrace.com/hc/en-us/articles/32303278530708) to learn more.

![Additive_-_Cause_Treatment_-_Start_Ferment_20200417.png](https://support.vintrace.com/hc/article_attachments/32328976822420)

- Malo additives should start malolactic fermentation. You can confirm this by looking at the additive’s Cause Treatment.

![Malo_Additive_Cause_Treatment_20200902.png](https://support.vintrace.com/hc/article_attachments/32328976849428)

- If you’re using an SO2 solution, be sure that the additive’s strength is set correctly. You can confirm this by reviewing the additive’s metric weighting.

![SO2_Solution_Weighting_20200826.png](https://support.vintrace.com/hc/article_attachments/32328939519380)

## Setting Up Additive Templates

[Additive templates](https://support.vintrace.com/hc/en-us/articles/32301359803412) make [writing work orders](https://support.vintrace.com/hc/en-us/articles/32303315610388) easier, especially when you’re adding more than one additive. For example, we could set up a Yeast Inoculation additive template that includes our additives (i.e., DAP and Yeast - VL2) and their rate. You can also configure the [additive template](https://support.vintrace.com/hc/en-us/articles/32301359803412) so that it sets the cause treatment and changes the product state.

![Update_Additive_Template_-_Yeast_Innoculation_20200827.png](https://support.vintrace.com/hc/article_attachments/32328972759316)

When you use an additive template for a work order, vintrace automatically fills in the additives and their rates of add.

![Using_Additive_Template_20200827.png](https://support.vintrace.com/hc/article_attachments/32328983774228)

If for any reason you need to change the rate for a work order, or include another additive, you can do so when you create the work order.

Below is a list of additive templates that you might want to consider adding:

- 1st SO2 add
- Monthly SO2 (KMBS)
- Monthly 6% SO2 (solution)
- 1st nutrient add
- 2nd nutrient add
- Inoculation

## Setting Up Standard Notes

Standard notes in vintrace are your SOPs (Standard Operating Procedures). We recommend that you [set up standard notes](https://support.vintrace.com/hc/en-us/articles/32301315435028) so that you can quickly include them in your work orders. For example, we could create a standard note for your inoculation procedures.

![Standard_Note_Update_-_Inoculation_20200902.png](https://support.vintrace.com/hc/article_attachments/32328983648276)

Instead of having to enter these procedures each time you want to include them in a work order, you can simply select the standard note and vintrace will include the procedure’s details in the work order.

![Work_Order_with_Standard_Note_20200902.png](https://support.vintrace.com/hc/article_attachments/32328947929492)

Examples of standard notes that you might want to add include:

- Barrel transfer
- Barrel racking
- Bottling
- Inoculation
- Load tankers
- Pad filter
- Barrel down
- Addition - yeast build up

## Setting Up Product Treatments

[Product treatments](https://support.vintrace.com/hc/en-us/articles/32301359713428) are actions that you perform on a wine that don’t change the wine, but that you want to track. Examples include:

- Cross flow, or DE filtration
- Drain and return
- Heating the tank
- Restarting
- Stirring barrels

When a product treatment is included in a work order, it can change the product state. Any procedures included with the product treatment will be included in the work order.

![Product_Treatment_-_Product_State_and_Procedures_20200827.png](https://support.vintrace.com/hc/article_attachments/32328972950420)

If you’re using vintrace for costing, you can include the cost for performing the treatment.

## Setting Up Barrel Treatments

[Barrel treatments](https://support.vintrace.com/hc/en-us/articles/32301341352084) are actions you perform on barrels. For example, you could create a [Move Barrels barrel treatment](https://support.vintrace.com/hc/en-us/articles/360000824736-Changing-Barrel-Locations#MovingMultipleBarrelswithaBarrelTreatment) for when you move barrels to a new location.

You can use barrel treatments so that they change the barrel’s sanitation state.

![Barrel_Treatment_-_Change_Sanitation_State_20200827.png](https://support.vintrace.com/hc/article_attachments/32328947965332)

Barrel treatments can also be used to change whether a barrel is active. For example, you could create a *Sold Barrels* barrel treatment that deactivates the barrels and prints a bill of lading.

![Barrel_Treatment_-_Sold_Barrels_20200827.png](https://support.vintrace.com/hc/article_attachments/32328983682580)

## Customizing Auto Codes for Wine Lots/Batches

Auto codes are automatic naming templates within vintrace that allow entities such as wine batches, weighbridge bookings, and barrels to be named based on arbitrary properties. For example, a wine batch could could consist of the vintage, region, variety, and a unique number (e.g., 2019MVLSHZ01).

Refer to our [Using Auto-Codes article](https://support.winery-software.com/hc/en-us/articles/360000825416) to learn more.

## Adding Saved Searches to the Dashboard

You can [create and save searches](https://support.vintrace.com/hc/en-us/articles/32301344204308) that enable you to quickly apply filters. For example, you could create a search that displays wines in a particular product state (e.g., inoculated wines), or ferment state (e.g., fermenting, unfermented).

![Saved_Search_-_Wines_in_Ferment_20200827.png](https://support.vintrace.com/hc/article_attachments/32328983753876)

After you’ve saved a search, you can pin it to your Dashboard by clicking the ![Heart_White_20200731.png](https://support.vintrace.com/hc/article_attachments/32328965202324) Heart.

![Pinning_Search_20200827.png](https://support.vintrace.com/hc/article_attachments/32328939645588)

This changes the icon to ![Heart_Green_20200731.png](https://support.vintrace.com/hc/article_attachments/32328939674516) which indicates that it’s been pinned to your Dashboard where you can quickly see how many wines meet the filter. You can view those wines by clicking the name of the search in the Dashboard.

![Pinned_Search_on_Dashboard_20200827.png](https://support.vintrace.com/hc/article_attachments/32328972898964)

## End-of-Day Procedure During Harvest

We encourage you to run the following reports at the end of each day during harvest:

- Grape Delivery Report
- Crush/Extraction Report

These reports provide a detailed list of all deliveries and all extraction rates from which you can check the validity of data entered by the weighbridge and crush/press operator. Specifically, you can check for:

- Accurate delivery weights
- Accurate extraction rates
- Uncrushed parcels

To access these reports:

1. Click ![Reports_Menu_Option_20200406.png](https://support.vintrace.com/hc/article_attachments/32328964935828)Reports in the sidebar.
2. Click Vintage/Harvest.

![Winery_Reports_-_Vintage_Harvest_20200415.png](https://support.vintrace.com/hc/article_attachments/32328947763732)

Click Email to generate and email the report to one or more recipients.
