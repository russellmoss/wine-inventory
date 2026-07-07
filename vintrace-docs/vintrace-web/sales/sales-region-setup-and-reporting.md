---
id: "32303307733012"
title: "Sales Region Setup and Reporting"
url: "https://support.vintrace.com/hc/en-us/articles/32303307733012-Sales-Region-Setup-and-Reporting"
category: "vintrace Web"
section: "Sales"
created_at: "2024-11-20T15:52:15Z"
updated_at: "2025-01-09T17:24:18Z"
labels: ["estate", "wp-faq-3225", "Sales region", "Default sales region", "Sales region report"]
gist: "This article details how to set up sales regions in vintrace so that you can examine your business revenue by market."
tags: ["configuration", "reporting", "dtc-sales", "integrations", "getting-started"]
---

# Sales Region Setup and Reporting

This article details how to set up sales regions in vintrace so that you can examine your business revenue by market. This article assumes that you’ve [linked vintrace and Xero](https://support.vintrace.com/hc/en-us/articles/32303310784660), and that you understand the basics of [accounting integration](https://support.vintrace.com/hc/en-us/articles/32303315132180) and how to [manage sales orders](https://support.vintrace.com/hc/en-us/articles/32303318150164).

## Setting Up a Sales Region

To set up a sales region:

1. Do one of the following:

- Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32329106907924) Set Up in the sidebar, click Sales, then from the Sales Region tile, click Configure.

![Set_Up_-_Sales_-_Sales_Regions_20200817.png](https://support.vintrace.com/hc/article_attachments/32329135618580)

- Click ![More_Options_20200323.png](https://support.vintrace.com/hc/article_attachments/32329106938900) More Options in the sidebar, then from the Sales tile, click Sales Regions.

![More_Options_-_Sales_Regions_20200817.png](https://support.vintrace.com/hc/article_attachments/32329122095124)

2. Click New Sales Region.
3. Specify the details for the sales region.

- Code (required) — The identifier for the sales region. The code displays in reports.
- Name (required) — The sales region’s name. The name displays in the Sales Order window and reports.
- Category (required) — The sales region category that the sales region belongs to. A sales region category provides a way for you to group sales regions together.
- Default Account — Select the default account to associate with the sales region. Although this setting is optional, specifying the default account will automatically populate the field when items are added to a sales order that’s created using the sales region. For example, suppose we have a US-CA (California) sales region that has its Default Account set to *Domestic Sales*.

![Sales_Region_Update_-_Default_Account_20200817.png](https://support.vintrace.com/hc/article_attachments/32329122141588)

If we [create a sales order](https://support.vintrace.com/hc/en-us/articles/32303318150164) using this sales region, the Default Account setting for items added to the sales order would be automatically set to *Domestic Sales*; this is the default account specified for the sales region.

![Create_Sales_Order_-_Account_Set_Based_on_Sales_Region_20200817.png](https://support.vintrace.com/hc/article_attachments/32329088259732)

- Default Price List — Select the [price list](https://support.vintrace.com/hc/en-us/articles/32303325767316) to associate with the sales region. Although this setting is optional, specifying the default price list will automatically populate the field when a [sales order is created](https://support.vintrace.com/hc/en-us/articles/32303318150164) with the sales region. For example, suppose our US-CA (California) sales region has its Default Price List set to US Price List. If we create a sales order using this sales region, the Sales Price List would be automatically set to US Price List: this is the default price list specified for the sales region.

![Create_Sales_Order_-_Price_List_Based_on_Sales_Region_20200817.png](https://support.vintrace.com/hc/article_attachments/32329110998292)

The tax rate for items in the sales order are based on the tax rate specified in the [sales price list](https://support.vintrace.com/hc/en-us/articles/32303325767316).

4. Click Save.

## Linking a Sales Region to a Customer

Oftentimes a customer falls into a single sales region. You can link each customer to a sales region so that the region is automatically set when you create a sales order for the customer.

![Create_Sales_Order_-_Customer_Linked_to_Sales_Region_20200817.png](https://support.vintrace.com/hc/article_attachments/32329107053972)

For details on adding contacts to your vintrace address book, refer to our [Adding a Contact to the Address Book article](https://support.vintrace.com/hc/en-us/articles/32301367488788).

To link a sales region to a customer:

1. Click ![More_Options_20200323.png](https://support.vintrace.com/hc/article_attachments/32329106938900) More Options in the sidebar.
2. From the Address Book tile, click Open Address Book.
3. Click Advanced beside the customer.
4. From the Primary Contact tab, set the Sales Region for the customer.

![Organization_Update_-_Sales_Region_20200817.png](https://support.vintrace.com/hc/article_attachments/32329096859796)

5. Click Save.

## Reporting on Sales Regions

The Sales Summary report enables you to compare the costs and revenue within each sales region.

To run the Sales Summary report for sales regions:

1. Click ![Reports_Menu_Option_20200406.png](https://support.vintrace.com/hc/article_attachments/32329122337812) Reports in the sidebar.
2. Select Sales. The Sales Summary displays.

![Winery_Reports_-_Sales_-_Sales_Summary_20200817.png](https://support.vintrace.com/hc/article_attachments/32329111025812)

3. From the Group By list, select *Sales Region*.

![Sales_Summary_-_Group_By_Sales_Region_20200817.png](https://support.vintrace.com/hc/article_attachments/32329088248980)

4. Specify any other filters you’d like to use for the report (e.g., date range, item, etc…).
5. Click Generate.
