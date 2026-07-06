---
id: "32303355021588"
title: "Setting Up New Barrels"
url: "https://support.vintrace.com/hc/en-us/articles/32303355021588-Setting-Up-New-Barrels"
category: "vintrace Web"
section: "Barrel Management"
created_at: "2024-11-20T15:52:37Z"
updated_at: "2024-11-26T18:54:17Z"
labels: []
gist: "There are a number of ways that you can add barrels to vintrace."
tags: ["barrels", "configuration", "exports", "migration"]
---

# Setting Up New Barrels

There are a number of ways that you can add barrels to vintrace. These include:

- [Entering barrels manually](#h_557b7fef-ef6d-4db8-816e-68016248076f)
- [Importing barrels with a spreadsheet](#h_c44d8f9b-9f42-47e0-a6cd-e43a7e319920)
- [Adding barrels using an auto-code](#h_25a90dd7-e28b-4c88-90b8-c369a4b75b5f)
- [Adding barrels with a purchase order](#h_f39cf08a-7133-42f7-bea3-bf9beeaf0e0d)

## Manually Adding a Barrel

You can manually add barrels from the Winery Setup window (Setup Options > Vessels > Barrels):

To manually add barrels:

1. Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32329161565716) Set Up in the sidebar.
2. Click Vessels.
3. From the Barrels tile, click Configure.
4. Click New Barrels. The Barrel window displays.

![Barrel_Create_20221024.png](https://support.vintrace.com/hc/article_attachments/32329129701780)

5. Enter the barrel’s details such as its Asset ID in the Barrel window. If you’d like to copy the details from an existing barrel, click the ![Magnifying_Glass_20200320.png](https://support.vintrace.com/hc/article_attachments/32329129560340)beside the Copy From field and select the barrel that you want to copy.
6. Click Save.

## Importing Barrels with a Spreadsheet

You can also add barrels by importing a spreadsheet with the barrels’ details from the Winery Setup window (Setup Options > Vessels > Barrels).

You can download a spreadsheet with the various barrel fields from the Winery Setup window (Setup Options > Vessels > Barrels). To download the spreadsheet, click Import/Export, then click Download Headers.

If you’d like to import your barrels using a spreadsheet, you’ll need to include the following barrel details in your spreadsheet:

- Name — The barrel’s name.
- Owner — The barrel’s owner.
- Location — The building in vintrace where the barrel is located. You can view the buildings you have set up from the Winery Setup window (Setup Options > Infrastructure > Winery Building).
- Capacity — The barrel’s capacity.

If you'd like to include the barrel's asset ID, enter it in the Barcode column of the CSV file.

To import the spreadsheet, do the following from the Winery Setup window:

1. Click Import/Export.

![Barrelsl_-_Import_Export_Button_20200428.png](https://support.vintrace.com/hc/article_attachments/32329153001492)

2. From the Barrel Registry Importer window, click Upload a File.

![Barrel_Registry_Importer_-_Upload_File_20200428.png](https://support.vintrace.com/hc/article_attachments/32329161556244)

3. Click Choose File.
4. Navigate to your spreadsheet’s location.
5. Click Upload.

## Adding Barrels with an Auto-Code

If you have an Auto Code Policy set up, you can create multiple barrels with incrementing names. Refer to our [Using Auto-Codes article](https://support.vintrace.com/hc/en-us/articles/32303292885908) to learn more.

To add barrels using the auto-code policy:

1. Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32329161565716) Set Up in the sidebar.
2. Click Vessels.
3. From the Barrels tile, click Configure.
4. Click New Barrels.
5. If *[Auto Code]* doesn’t display in the Name field, click the ![Wand_Icon_20200410.png](https://support.vintrace.com/hc/article_attachments/32329129609236) and select the auto-code policy that you want to use for the barrel names.
6. Specify the details for one of the barrels.
7. In the Add N Incrementing Items with the Same Properties field, enter the number of barrels you want to create.

![Barrel_Create_-_Adding_Multiple_Barrels_20221025.png](https://support.vintrace.com/hc/article_attachments/32329175308692)

8. If you want to link these barrels to a previously created purchase order, enter the purchase order number in the Purchase Order field.
9. Click Save.

## Adding with a Purchase Order

Before you can add barrels with a [purchase order](https://support.vintrace.com/hc/en-us/articles/32303315399444), you’ll need to first set up a barrel category in the Winery Setup window (Setup Options > Vessels > Barrel Categories).

To add a barrel with a purchase order, be sure that the line’s Type is set to *Barrel* and select the barrel category that you created.

![Stock_Purchase_Order_-_Type_-_Barrel_20200428.png](https://support.vintrace.com/hc/article_attachments/32329116396820)

To add the barrel, click the ![Receive_Barrels_Icon_20200428.png](https://support.vintrace.com/hc/article_attachments/32329129647124) icon displayed to the right of the line.
