---
id: "32301354452244"
title: "Adding Storage Costs for Wines in Vessel"
url: "https://support.vintrace.com/hc/en-us/articles/32301354452244-Adding-Storage-Costs-for-Wines-in-Vessel"
category: "vintrace Web"
section: "Costing"
created_at: "2024-11-20T14:47:46Z"
updated_at: "2026-04-02T18:40:51Z"
labels: ["estate", "wp-page-2024", "storage costs", "costs to wines", "barrel depreciation"]
gist: "When setting up barrel storage cost items, you should create one for each different type of barrel, or one for each different depreciation rate."
tags: ["cost", "barrels", "configuration", "exports", "migration"]
---

# Adding Storage Costs for Wines in Vessel

## Setting Up a Barrel Storage Cost Item

When setting up barrel storage cost items, you should create one for each different type of barrel, or one for each different depreciation rate. For example, if you depreciate your 2017 French Oak at $1.50/day and your 2017 American Oak at $1.20/day, then you’d configure two separate cost items.

In vintrace, barrel storage costs can only be depreciated/applied at a per day, year, or hour rate.

You can set up a barrel storage cost item from the Winery Setup window (Setup Options > Costing > Cost Items):

1. Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32329042118420)Set Up in the sidebar.
2. Click Accounts.
3. From the Cost Items tile, click Configure.
4. Click New Cost Item.
5. Specify the details for the cost item. Be sure to set the Cost Type to *Storage*.

![Create_Cost_Item_-_17FrenchOak_Storage_Per_Day_20200610.png](https://support.vintrace.com/hc/article_attachments/32329037176468)

6. Click Save.

## Setting the Storage Cost item on the Barrel

After [setting up a barrel storage cost item](#h_8dda5bdd-3944-4b34-884d-8ddb11f95715), you’ll need to link each barrel to the cost item.

Although you can link a barrel to the storage cost item from the Winery Setup window (Setup Options > Vessels > Barrels), we recommend using the Import/Export functionality to [update barrel details in bulk](#h_ec43b671-b058-4c3f-8736-5a801138f5c8).

To set the storage cost item on a single barrel:

1. Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32329042118420) Set Up in the sidebar.
2. Click Vessels.
3. From the Barrels tile, click Configure.
4. Select the barrel you want to update.
5. Select the Advanced tab.
6. Click the ![Magnifying_Glass_20200320.png](https://support.vintrace.com/hc/article_attachments/32329037140500) beside the Storage Cost Item field to search for the cost item that you created.

![Barrel_Update_-_Advanced_-_Storage_Cost_Item_20200610.png](https://support.vintrace.com/hc/article_attachments/32329025280404)

7. Click Save.

## Setting the Storage Cost Item for Multiple Barrels

You can use vintrace's Import/Export functionality to update barrels in bulk. Refer to our [Importing and Exporting Data article](https://support.vintrace.com/hc/en-us/articles/32303307646868) to learn more.

To set the storage cost item for multiple barrels:

1. Use vintrace’s Import/Export functionality to create a CSV file with the barrel details:

- If you’re setting up new barrels, click Download Headers.
- If you’re updating the storage cost item on barrels that you’ve already added to vintrace, export the existing barrel details by clicking Export Barrel Registry Records

2. In the CSV file, enter the Storage Cost Item and Depreciation Start Date values for the barrels that you want to set the storage costs. Be sure to set the Depreciation Start Date as the date you want to start the storage costs so that you don’t add extra costs to wines that have already factored in storage costs.

![Storage_Fields_Barrel_Spreadsheet.png](https://support.vintrace.com/hc/article_attachments/32328997828756)

3. Import the updated CSV file with the updated barrel details using the Import/Export functionality.

## Generating Storage Costs

vintrace has built-in logic to recognize that if a wine was only in barrel for 10 days of the month, only 10 days worth of costs should be added to that wine, even if that wine has now been racked to tank, or bottled. Refer to our [Generating Storage Costs article](https://support.vintrace.com/hc/en-us/articles/32301355816852) to learn more.
