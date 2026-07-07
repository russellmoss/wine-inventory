---
id: "32301385548308"
title: "Setting Up a Tank's Dip Chart"
url: "https://support.vintrace.com/hc/en-us/articles/32301385548308-Setting-Up-a-Tank-s-Dip-Chart"
category: "Setup and Admin"
section: "Configuration"
created_at: "2024-11-20T14:48:27Z"
updated_at: "2026-05-18T20:00:49Z"
labels: ["tank measurement", "tank gauging"]
gist: "Dip charts enable you to determine the volume of wine in a tank based on the dip measurement."
tags: ["configuration", "exports", "migration", "lab", "ux-friction"]
---

# Setting Up a Tank's Dip Chart

Dip charts enable you to determine the volume of wine in a tank based on the dip measurement. You can use dry or wet dip measurements when setting up your dip charts in vintrace.

To set up a dip chart for a tank, you’ll need to [create a CSV file](#h_01EJVH9MGQ10D8X0KX4Z425DM8) with the volume for each dip level. Once you have the dip levels and volumes in your CSV file, you can either [import the file to a single tank](#h_01EJVHAB30D2DGXHYVXY5Q39D6), or [to multiple tanks](#h_01EJVHB9ZK0W0G2FJMGGVNSTZK). You can also [copy the dip chart from another tank](https://support.vintrace.com/hc/en-us/articles/32301323575956).

Be sure to [set up your tank](https://support.vintrace.com/hc/en-us/articles/32301359425428) before you add its dip chart.

## Creating a CSV File

To set up a dip chart, you’ll need to import a CSV file that contains the volume for each dip level.

![Dip_Chart_CSV_File_20200922.png](https://support.vintrace.com/hc/article_attachments/32329132165012)

Below are guidelines for creating the CSV file:

- The first column’s heading should be *Tick* or *Dip Level*. The second column’s heading should be *Volume*, *Gallons*, or *Litres*. You can download a CSV file with the column headers.
- The dip levels in the CSV file do not have to be whole numbers, vintrace also accepts up to three decimal places.
- Be sure to include a dip level for when the tank is full, and when it’s empty.

For the dip level when the tank is full, you’ll need to specify the same capacity for the tank that’s specified in vintrace. The dip chart cannot be loaded if these volumes do not match.

![Tank_Capacity_for_Dip_Tick_0_Annotated_20200924.png](https://support.vintrace.com/hc/article_attachments/32329155063700)

- The last dip level in the CSV file will need to have a volume of 0.
- Because the dip charts follow a linear manner from the first dip level for the tank’s full capacity to a volume of 0, the tank’s cone is usually not uploaded.
- If you’re using Excel to create your CSV file, be sure to change the format of the cells to General so that the values do NOT include commas.
- If you have very large tanks, contact support for alternative options to specifying your dip charts.

## Downloading a CSV File

You can download a CSV file with the column headings, then edit the file to include your tank’s dip levels and volumes.

To download a CSV file tank:

1. Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32329145497876) Set up in the sidebar.
2. Click Vessels.
3. From the Tank tile, click Configure.
4. Search for and view the tank.
5. Click Edit/Import.
6. Click Download CSV.

![Import_Dip_Levels_for_T01_-_Download_CSV_20200922.png](https://support.vintrace.com/hc/article_attachments/32329177894292)

7. Save the file.

## Importing Dip Levels to a Single Tank

After you’ve entered the dip levels for a tank in the CSV file, you can import it into vintrace.

To import the dip levels for a single tank:

1. Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32329145497876) Set up in the sidebar.
2. Click Vessels.
3. From the Tank tile, click Configure.
4. Search for and view the tank.
5. Click Edit/Import.

![Tank_Update_-_Edit_Import_Button_20200921.png](https://support.vintrace.com/hc/article_attachments/32329145509780)

6. Click Upload a File. You must click directly on the cloud icon.

![Import_Dip_Levels_for_T01_-_Upload_File_20200921.png](https://support.vintrace.com/hc/article_attachments/32329168638868)

7. Click Choose File.
8. Select the CSV file.
9. Click Upload. The Import Dip Levels window displays the values from your CSV file.

![Import_Dip_Levels_for_T01_-_After_Upload_20200921.png](https://support.vintrace.com/hc/article_attachments/32329163655316)

If you need to update the tick or volume, click Edit.

10. Click Save.

## Importing Dip Levels to Multiple Tanks

If you have multiple tanks with the same dip levels, you can import a CSV file and apply the dip levels to those tanks.

To import a CSV file and apply the dip levels to multiple tanks:

1. Click More Options in the sidebar.
2. From the Tools tile, click Import Tank Dip Tables.
3. Specify the tanks by doing either of the following:

- If you’d like to search for the tanks, click Search. From the Search for Tanks window, use the filters to find the tanks. Select specific tanks by clicking on the row, or select all tanks listed, by clicking All. Click Use Selection.

![Search_for_Tanks_-_Selecting_Multiple_20200922.png](https://support.vintrace.com/hc/article_attachments/32329177848852)

- To copy and paste, or manually enter a list of tanks, click List. After entering the tanks, click OK.

![Tank_Code_List_-_Entering_Tanks_20200922.png](https://support.vintrace.com/hc/article_attachments/32329163762964)

4. Click Upload File.

![Import_Dip_Levels_-_File_Uploaded_20200922.png](https://support.vintrace.com/hc/article_attachments/32329155127188)

5. Click Import.
