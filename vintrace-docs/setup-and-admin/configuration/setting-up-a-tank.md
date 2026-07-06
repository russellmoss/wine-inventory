---
id: "32301359425428"
title: "Setting Up a Tank"
url: "https://support.vintrace.com/hc/en-us/articles/32301359425428-Setting-Up-a-Tank"
category: "Setup and Admin"
section: "Configuration"
created_at: "2024-11-20T14:48:22Z"
updated_at: "2026-05-13T23:19:59Z"
labels: []
gist: "To add tanks to vintrace, you can either:."
tags: ["configuration", "barrels", "exports", "migration", "ux-friction"]
---

# Setting Up a Tank

To add tanks to vintrace, you can either:

- [Add the tanks manually](#h_01EMRH4ANXNX1TPBTN77NPAHCW)
- [Import tanks with a spreadsheet](#h_01EMRH4GNC034EBJ4G1JJXKMH6)

## Manually Adding a Tank

You can manually add tanks from the Vessels page

1. Click ![Vessels_Menu_Option_20200402.png](https://support.vintrace.com/hc/article_attachments/43451046123412) Vessels in the sidebar.
2. Click the ![](https://support.vintrace.com/hc/article_attachments/43451046124948) add icon.
3. Click Add new tank. The Tank window displays.
4. Specify the tank’s details. Required fields are Name, Owner, Winery Building (location within the winery) and Capacity in gallons or litres. You may also include details such as when the tank was purchased, the tank’s asset ID, and the [tank's dip chart(s)](https://support.vintrace.com/hc/en-us/articles/32301385548308). If you’d like to copy the details of an existing tank, click the ![Magnifying_Glass_20200320.png](https://support.vintrace.com/hc/article_attachments/32329115957652) search icon beside the Copy From field and select the tank that you want to copy.
5. Click Save.

![](https://support.vintrace.com/hc/article_attachments/43451070469908)Setting up a Tank - required fields

You can also manually add tanks from the Winery Setup window (Set up > Vessels > Tanks).

1. Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32329143160084) Set Up in the sidebar.
2. Click Vessels.
3. From the Tanks tile, click Configure.
4. Click New Tanks... The Tank window displays.
5. Specify the tank’s details.
6. Click Save.

NOTE: Vessel names must be unique. Vessels cannot share an identical name within your database, even if their location is different. Consider adding a prefix for location/winery if required to avoid duplicates.

See also:

- [Setting Up a Tank's Dip Chart](https://support.vintrace.com/hc/en-us/articles/32301385548308)
- [Wet and Dry Dip Charts](https://support.vintrace.com/hc/en-us/articles/32301297422612)

## Importing Tanks with a Spreadsheet

You can add tanks by importing a spreadsheet with the tank details from the Winery
Set up window. This is especially useful for bulk uploads.

Start by downloading the Headers spreadsheet with the various tank fields from
the Winery Set up window (Setup Options > Vessels > Tanks). To download
the spreadsheet, click Import/Export, then click Download Headers.

1. Click
   ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32329143160084)
   Set Up in the sidebar.
2. Click Vessels.
3. From the Tanks tile, click Configure.
4. Click Import/Export.
5. Click Download Headers.
6. Open, populate and save the downloaded CSV file

You’ll need to include the following details for each tank in your spreadsheet:

- Name - the tank’s name.
- Owner - the tank's owner
- Winery Building - the tank's location within your winery
- Capacity - the tank’s capacity.

Specify any other details you wish to capture before saving the spreadsheet.

If you'd like to include the tank’s asset ID, enter it in the Barcode column
of the CSV file.

To import the spreadsheet, go to the Winery Set up window (Set up > Vessels
> Tanks > Configure):

1. Click Import/Export.

![Winery_Setup_-_Vessels_-_Tanks_20201016.png](https://support.vintrace.com/hc/article_attachments/32329129158804)

2. From the Tank Registry Importer window, click Upload a File.

![](https://support.vintrace.com/hc/article_attachments/43451046126484)

3. Click Choose File.
4. Navigate to your spreadsheet’s location.
5. Click Upload.

You can also use this Import/Export function to
[edit vessel details](https://support.vintrace.com/hc/en-us/articles/32301370477460-Editing-a-Vessel).

## Updating a Tank's Capacity with an Existing Dip Chart

If you need to update the capacity of a tank that has
[Dip Charts](https://support.vintrace.com/hc/en-us/articles/32301385548308),
e.g. if the tank has been damaged:

1. Add a new dip chart entry that matches the new capacity, then
2. Update the capacity, then
3. Save the tank record.
4. You can then go back in and remove the old 'FULL' entry in the dip chart.

You can set the 'tick' value to the desired number either in the initial update,
or retrospectively.
