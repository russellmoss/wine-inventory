---
id: "32303339319700"
title: "Managing Dispatch of Sold Fruit"
url: "https://support.vintrace.com/hc/en-us/articles/32303339319700-Managing-Dispatch-of-Sold-Fruit"
category: "Harvest/Vintage"
section: "Fruit Bookings"
created_at: "2024-11-20T15:52:07Z"
updated_at: "2025-01-28T15:54:55Z"
labels: ["estate", "wp-faq-171"]
gist: "You can receive fruit that you expect to sell to keep a record of the weight/delivery in vintrace, and then remove it so as to ensure it's not accidentally crushed/pressed into a batch of wine."
tags: ["harvest", "inventory", "getting-started", "lab", "vineyard", "configuration"]
---

# Managing Dispatch of Sold Fruit

You can receive fruit that you expect to sell to keep a record of the weight/delivery in vintrace, and then remove it so as to ensure it's not accidentally crushed/pressed into a batch of wine.

To do this, set up a new owner named Sold Fruit, or named for the company you're selling the fruit to. [Receive the fruit](https://support.winery-software.com/hc/en-us/articles/360000814175-Managing-Fruit-Intakes-and-Fruit-Intake-Bookings-) as you normally would using the Fruit Intake console, but ensure that the Owner is set to Sold Fruit, or the company you're selling the fruit to.

You can also configure a grading (Set Up > Work-flow > Grading Scales), then select the grading on the QA/Cost/Analysis tab of the Intake Details window. Using the grading may be a good way to flag the fruit against a particular buyer so it can be reported on in the Grape Delivery Report.

## Measuring Fruit Down to Zero

Once you receive the fruit, you'll need to measure it down to zero to remove it from the system.

From the [Fruit Intake Console](https://support.vintrace.com/hc/en-us/articles/32303330881044):

1. Click the down arrow beside Arrive.
2. Select View > Block Details.

![Arrive_Button_-_View_-_Block_Details_20200422.png](https://support.vintrace.com/hc/article_attachments/32329104230420)

3. From the Block Overview window, select the Seasonal tab.
4. Use the filter at the top of the page to select the vintage.
5. From the Fruit Receivals section at the bottom of the window, click the value under the Tonnage column for the fruit.

![Block_Overview_-_Seasonal_Tab_-_Tonnage_Value_20200422.png](https://support.vintrace.com/hc/article_attachments/32329082736532)

6. From the Product Overview window, click the ![Ruler_20200422.png](https://support.vintrace.com/hc/article_attachments/32329108562324) Adjust Volume icon displayed beside the Amount.
7. From the Measurement window:

- Set the New Amount to 0.
- From the Loss Reason list, select Sold Fruit. If this reason isn't in your system, you can add it by clicking the ![Plus_Button_20200319.png](https://support.vintrace.com/hc/article_attachments/32329085591188).

![Measurement_-_Sold_Fruit_20200422.png](https://support.vintrace.com/hc/article_attachments/32329119097748)

## Reporting on Sold Fruit

After fruit is removed from the system, you can report on sold fruit using the Grape Delivery report. To run the Grape Delivery report:

1. Click ![Reports_Menu_Option_20200406.png](https://support.vintrace.com/hc/article_attachments/32329085570452) Reports in the sidebar.
2. Select Vintage/Harvest.
3. Scroll down to the Grape Delivery report. If you're using the Grading feature to allocate sold fruit to a specific buyer, the CSV format of the report includes this information.

![Winery_Reports_-_Vintage_Harvest_-_Grape_Delivery_Report_20200420.png](https://support.vintrace.com/hc/article_attachments/32329093604244)
