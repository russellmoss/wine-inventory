---
id: "32303278530708"
title: "Managing Ferments"
url: "https://support.vintrace.com/hc/en-us/articles/32303278530708-Managing-Ferments"
category: "Harvest/Vintage"
section: "Fermentation and Cap Management"
created_at: "2024-11-20T15:51:05Z"
updated_at: "2025-02-10T10:18:27Z"
labels: ["estate", "wp-page-1152"]
gist: "In addition to letting you track the ferment state of your wines, vintrace integrates with additive and analysis data to ensure the fermentation data is accurate."
tags: ["fermentation", "harvest", "lab", "additives", "configuration", "integrations"]
---

# Managing Ferments

In addition to letting you track the ferment state of your wines, vintrace integrates with additive and analysis data to ensure the fermentation data is accurate.

You can manually start and stop ferments from the Product page.

![Product_Page_-_Stop_Start_Ferments_20200420.png](https://support.vintrace.com/hc/article_attachments/32328974025492)

However, to use the addition and metric integration tools, you’ll need to set up ferment policies. You can view all of your ferments from the Ferments Console.

## Accessing the Ferment Console

To access the Ferment Console:

1. Click ![More_Options_20200323.png](https://support.vintrace.com/hc/article_attachments/32328931421588) More Options in the sidebar.
2. From the Harvest tile, click Ferment.

![Harvest_Tile_-_Ferment_Link_20200417.png](https://support.vintrace.com/hc/article_attachments/32328937475220)

## Setting Up Start and Stop Ferment Policies

To view all your ferment policies:

1. Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32328962137236)Set Up in the sidebar.
2. Click Treatments.
3. From the Ferment Treatments tile, click Configure.

![Ferment_Treatments_Tile_20200420.png](https://support.vintrace.com/hc/article_attachments/32328937501588)

You can view an existing ferment treatment by clicking the treatment.

4. To add a new ferment treatment, click New Ferment Treatments.

![New_Ferment_Treatment_Button_20200420.png](https://support.vintrace.com/hc/article_attachments/32328937516052)

For example, we might want to set up a start ferment policy that automatically prompts the user to stop when a low glucose/fructose metric is entered. To do this, we’d set the Ferment Type to *Alcoholic,* and the Start/Stop to *Start Ferment*.

5. In order for this policy to prompt a user to stop the ferment when metric data is entered, you’ll need to assign a metric threshold policy as the stop policy. To do this, click the ![Plus_Button_20200319.png](https://support.vintrace.com/hc/article_attachments/32328931226772) Plus beside the Stop Policy list in the Ferment Treatment Definition window.

![Ferment_Treatment_Definition_-_Add_Stop_Policy_Button_20200420.png](https://support.vintrace.com/hc/article_attachments/32328974323476)

The Metric Threshold Policy Create window displays.

![Metric_Threshold_Policy_Create_20200417.png](https://support.vintrace.com/hc/article_attachments/32328945824788)

6. From the Metric Threshold Policy window, specify the correct metric thresholds in the Metric, Operator, and Value fields, then click Add. After you’re done specifying the metric thresholds, click Save.

The stop policy will only trigger when it’s set up prior to starting a ferment. If you set up the stop policy after ferment has already started, the triggers will NOT activate.

Users with a multi-winery license can specify which ferment treatments are available at each winery. Refer to our [Configuration for Multi-Winery Support article](https://support.vintrace.com/hc/en-us/articles/32301304791316) for details.

## Starting Ferment from Yeast/Bacteria Additions

To trigger this policy to start when yeasts are entered, you’ll want to link the policy to the additive’s cause treatment by editing the additive. If you have a number of yeasts, you’ll want to assign the *Start Ferment* cause treatment to each.

![Additive_-_Cause_Treatment_-_Start_Ferment_20200417.png](https://support.vintrace.com/hc/article_attachments/32328962287764)

To view, add, or edit your additives:

1. Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32328962137236)Set Up in the sidebar.
2. Click Winemaking.
3. From the Additives tile, click Configure.

## Starting a New Ferment Manually

To start a new ferment without producing a work order:

1. [Access the Ferment Console](#h_c3eb6965-ff06-474b-8d21-386ee55f62a2).
2. Click Start a New Ferment.

![Ferment_Console_-_Start_New_Ferment_Button_20200417.png](https://support.vintrace.com/hc/article_attachments/32328945955348)

The Start Ferment window displays.

![Start_Ferment_20200417.png](https://support.vintrace.com/hc/article_attachments/32328970660244)

Below is a description of some of the fields in the Start Ferment window.

- Analysis Template — The default analysis template to use when recording analysis readings against this ferment.
- Stop Policy — You can set up a stop policy to prompt the user to stop a ferment when they’re recording an analysis where certain values are met. For example, you can set up a stop policy where residual sugar is being tested and less than 2.0. To set up a new stop policy from the Start Ferment window, click the ![Plus_Button_20200319.png](https://support.vintrace.com/hc/article_attachments/32328931226772) Plus beside the Stop Policy list.
- Start Date — The date the ferment was started.

## Starting a New Ferment from a Culture Transfer

vintrace allows you to seed the ferment of a wine product when transferring a fermenting wine to another wine product.

Assuming that the source vessel contains a fermenting liquid, the transfer operation will ask you to confirm the ferment state (for alcoholic or malolactic) of the resulting blend.

To make the purpose of the operation clear to your cellar hands, we recommend that you configure a product treatment named *Seed Ferment* and select this as the treatment in the Racking window.

![Racking_-_General_-_Treatment_Seed_Ferment_20200420.png](https://support.vintrace.com/hc/article_attachments/32328931278996)

NOTE: A prompt to start ferment always displays when blending fermenting and non-fermenting products.

Refer to [Setting Up Start and Stop Ferment Policies](#h_b7eaeb24-875b-4204-9581-449279937199) for details.

Another option is to use your starter culture as an additive linked to the treatment. To do this:

1. Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32328962137236) Set Up in the sidebar.
2. Click Winemaking.
3. From the Additives tile, click Configure.
4. Click New Additive.
5. From the Additive window, be sure to set the Cause Treatment to *Start Ferment (MLF)*.

![Additive_-_ML_Starter_20200420.png](https://support.vintrace.com/hc/article_attachments/32328962469396)

6. Start your barrel down (Transfer to Barrel Group) and use the inline additive to apply the “additive” to the wines. This should trigger the ferment. It has the added benefit of recording the amount added to each barrel/group for historical reasons. Remember to calculate the additive based on the total gallons/litres or barrels (if being added on a per barrel basis).

![Example_-_Start_New_Ferment_From_Culture_Transfer_20200420.png](https://support.vintrace.com/hc/article_attachments/32328945907348)

You should periodically adjust volume on the culture if this something you’re tracking.

## Viewing Ferment Analysis Data

You can view metrics such as sugar and alcohol data from the Ferment Reports.

To view ferment analysis data:

1. Click ![Reports_Menu_Option_20200406.png](https://support.vintrace.com/hc/article_attachments/32328974359956)Reports in the sidebar.
2. Click Fermentation.

![Winery_Reports_-_Fermentation_20200420.png](https://support.vintrace.com/hc/article_attachments/32328945991444)

You can also view these by clicking Chart in the Ferment Console.

## Ferment Management Tab

The wine batch overview page also has a Ferment tab where you can view fermentation details of a wine all in one place. You can search for an analysis template to view a graph based on those metrics, or if you have set up a [default analysis template](https://support.vintrace.com/hc/en-us/articles/32301344760980-Setting-the-Default-Analysis-Template-for-Ferments) then this will automatically populate a graph to match the default template.

![Ferment Tab](https://support.vintrace.com/hc/article_attachments/34500732268180)
