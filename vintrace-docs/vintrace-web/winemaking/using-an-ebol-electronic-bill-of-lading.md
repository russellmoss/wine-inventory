---
id: "32303343160596"
title: "Using an eBOL (Electronic Bill of Lading)"
url: "https://support.vintrace.com/hc/en-us/articles/32303343160596-Using-an-eBOL-Electronic-Bill-of-Lading"
category: "vintrace Web"
section: "Winemaking"
created_at: "2024-11-20T15:52:53Z"
updated_at: "2024-11-21T10:29:59Z"
labels: ["estate", "wp-faq-10919"]
gist: "When one vintrace client dispatches bulk wine to another vintrace client, using an eBOL (Electronic Bill of Lading) file can speed up data entry and prevent mistakes."
tags: ["exports", "inventory", "work-orders", "migration", "barrels"]
---

# Using an eBOL (Electronic Bill of Lading)

When one vintrace client dispatches bulk wine to another vintrace client, using an eBOL (Electronic Bill of Lading) file can speed up data entry and prevent mistakes.

If you’re dispatching the bulk wine, you’ll need to [download the eBOL file](#h_01EMF5ZK422F4QWN1TVPCZHNRX) and email it to the receiving winery.

If you’re the receiving winery, you’ll need to [import the eBOL file to the Bulk Intake operation](#h_01EMF5ZXNSHPMW4PNWHEPBT1KJ). If you haven’t [created a mapping for the sending winery](#h_01EMF60AZE3HH24A7Y7KXHZBVQ), you may also need to do this before you can complete the Bulk Intake operation.

## Downloading an eBOL File

If you’re dispatching bulk wine, you can download an eBOL file that you can send to the receiving winery.

To download an eBOL file:

1. Click ![More_Options_20200323.png](https://support.vintrace.com/hc/article_attachments/32329234555028) More Options in the sidebar.
2. From the Tools tile, click Dispatch Search. The Dispatch Search window displays.
3. Use the filters to find your dispatch.
4. Select the dispatch.
5. Click eBOL.

![eBOL_Button_20200930.png](https://support.vintrace.com/hc/article_attachments/32329194236564)

6. Save the eBOL’s .XML file, then email it to the receiving winery.

## Importing the eBOL File

If you’re receiving bulk wine, be sure to save the eBOL file that was sent by the dispatching winery. You can import the eBOL file by using vintrace’s Bulk Intake operation.

To access the Bulk Intake operation, click the ![Operations_Icon_20200407.png](https://support.vintrace.com/hc/article_attachments/32329202713108) Operations icon, then select Bulk Intake from the following:

- [The Vessels page](https://support.vintrace.com/hc/en-us/articles/32301344827924)
- [The Job Management page](https://support.vintrace.com/hc/en-us/articles/32303318317972)

You can also add a Bulk Intake job to a [work order](https://support.vintrace.com/hc/en-us/articles/32303315610388).

From the Bulk Intake window:

1. Click Choose File.
2. Click Load From File.

![Bulk_Intake_-_Choose_File_and_Load_from_File_Buttons_20201012.png](https://support.vintrace.com/hc/article_attachments/32329194325908)

The File Import Errors/Warnings window displays. This window lists any codes from the XML file that you need to provide a mapping for.

In the example below, the XML file contains a carrier code and a region code that need to be mapped. For example, the XML file’s RRV region might map to your Russian River Valley region.

![File_Import_Errors_Warnings_20201012.png](https://support.vintrace.com/hc/article_attachments/32329234643348)

3. To perform a one-time mapping of the field’s values, click the ![Magnifying_Glass_20200320.png](https://support.vintrace.com/hc/article_attachments/32329234599444) search icon and select the mapped value.

Although mapping the field’s values from the File Import Errors/Warnings window enables you to complete the Bulk Intake operation, we recommend that you [set up an external code mapping](#h_01EMF60AZE3HH24A7Y7KXHZBVQ) for the sending winery that can be re-used.

4. Click OK.
5. Specify the remaining details for the bulk intake such as the vessels and final volumes before saving the operation.

## Setting Up an External Code Mapping

If you expect to receive bulk wine from another winery more than once, you’ll want to set up an external code mapping for that winery. The external code mapping “translates” the sending winery’s values so that they are correctly mapped to your winery’s values.

If you want to set up the external code mapping and reference the fields that need to be mapped, you can click the + at the bottom of the sidebar to [open another vintrace tab](https://support.vintrace.com/hc/en-us/articles/32301339319700). This enables you to view the unknown mappings in one tab, while creating the external code mapping in another tab.

You can set up an external code mapping from the Winery Setup window (Setup Options > Miscellaneous > External Codes):

1. Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32329188863636) Set Up in the sidebar.
2. Click Other.
3. From the External Codes tile, click Configure.
4. Click New External Code Mappings. The External Code Mappings window displays.
5. Specify the details for the mapping, including:

- Party — The name of the sending winery.
- Code — The Sender value from the XML file.

![External_Code_Mapping_-_Code_Value_20201012.png](https://support.vintrace.com/hc/article_attachments/32329194283156)

The values listed in the Code column are the sending winery’s values, while the values in the Entity column are what they’re called at your winery.

![External_Code_Mapping_-_Code_and_Entity_Columns_20201012.png](https://support.vintrace.com/hc/article_attachments/32329202838420)

6. Click Save.

After setting up the external code mapping, you’ll need to re-upload the XML file to the Bulk Intake window.
