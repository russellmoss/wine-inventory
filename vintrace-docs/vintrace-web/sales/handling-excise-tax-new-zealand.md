---
id: "32303303127572"
title: "Handling Excise Tax (New Zealand)"
url: "https://support.vintrace.com/hc/en-us/articles/32303303127572-Handling-Excise-Tax-New-Zealand"
category: "vintrace Web"
section: "Sales"
created_at: "2024-11-20T15:51:37Z"
updated_at: "2025-01-09T18:10:57Z"
labels: ["estate", "wp-page-2367", "Excise tax", "NZ Excise tax"]
gist: "Complete the following to set up the New Zealand’s alcohol excise duty rates in vintrace and integrate the excise tax as a liability in an external accounting package such as Xero."
tags: ["ttb", "configuration", "lab", "packaging", "integrations", "dtc-sales"]
---

# Handling Excise Tax (New Zealand)

Complete the following to set up the New Zealand’s alcohol excise duty rates in vintrace and integrate the excise tax as a liability in an external accounting package such as Xero.

## Setting the Alcohol Metric

It’s important to confirm that the Excise Alc Metric to Alcohol is set to *Alcohol*. If it isn’t set to *Alcohol*, wine that you've packaged won’t automatically calculate the estimated alcohol percentage even if you’ve entered the % alcohol on a packaged stock item.

To confirm that the Excise Alc Metric to Alcohol is set to *Alcohol* in the Winery Setup window (Setup Options > Work-flow > Defaults):

1. Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32329013973268) Set Up in the sidebar.
2. Click General.
3. From the Defaults tile, click Configure.
4. Select the System tab.
5. Set the Excise Alc Metric to *Alcohol*.

![mceclip0.png](https://support.vintrace.com/hc/article_attachments/32329023816724)

6. Click Apply.

## Setting Up a Tax Rate

Set up the appropriate tax rates as detailed in our [Setting Up Sales Tax Rates article](https://support.vintrace.com/hc/en-us/articles/32303335629332).

![Create_Tax_Rate_-_Excise_and_GST_20200812.png](https://support.vintrace.com/hc/article_attachments/32328996526612)

## Setting Up an Excise Duty

You can set up an excise duty in the Winery Setup window (Setup Options > Tax > Excise Duties):

1. Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32329013973268) Set Up in the sidebar.
2. Click Tax.
3. From the Excise Duties tile, click Configure.
4. Click New Excise Duty.
5. Specify the details for the excise duty. Below is an example for the 2018-2019 excise rates for wine.

![mceclip2.png](https://support.vintrace.com/hc/article_attachments/32329023581204)

Only one excise rate may be active for a date range.

6. Click Save.

## Linking the Tax Rate to a Sales Price List

When you [create sales orders](https://support.vintrace.com/hc/en-us/articles/32303318150164), it’s important to ensure that the correct tax rate is set for the items you’re selling. You can do this by setting the tax rate for the [price list](https://support.vintrace.com/hc/en-us/articles/32303325767316).

To link the tax rate to a sales price list:

1. Create or edit a sales price list.
2. Set the Default Tax Rate of the price list to the tax rate that you created.

![Linking_Price_List_to_Tax_Rate_20200812.png](https://support.vintrace.com/hc/article_attachments/32329035541524)

3. Click Save.

## Alcohol Value

If you’ve measured the metrics and have a volume on your wine, vintrace calculates the alcohol percentage. When you [add items to a sales order](https://support.vintrace.com/hc/en-us/articles/32303318150164) where the excise tax rate is selected, you may be asked to confirm the alcohol content of your wine.

[![](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2014/06/Confirm-Alcohol-Content.png "confirm metric")](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2014/06/Confirm-Alcohol-Content.png)

Confirming or modifying the alcohol percentage also sets the stock item’s alcohol content.

![mceclip4.png](https://support.vintrace.com/hc/article_attachments/32328990310932)

Below is an example of a sales order with two different items that have the same value, but different alcohol metrics to illustrate the difference between the excise rates.

[![](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2014/06/SalesOrder.png "two excise one LT 14 one GT 14")](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2014/06/SalesOrder.png)

## Reporting on Excise Tax

To report on your excise tax, run either the Sales Summary Report or the Sales Tax Report.

![Sales_Order_Tax_Report_20200818.png](https://support.vintrace.com/hc/article_attachments/32328996625044)

To access these reports:

1. Click ![Reports_Menu_Option_20200406.png](https://support.vintrace.com/hc/article_attachments/32329023727764) Reports in the sidebar.
2. Select Sales.

![Winery_Reports_-_Sales_-_Sales_Summary_and_Sales_Tax_Reports_20200818.png](https://support.vintrace.com/hc/article_attachments/32329023756052)
