---
id: "32301313513620"
title: "Bulk Dispatch (Inter-Winery)"
url: "https://support.vintrace.com/hc/en-us/articles/32301313513620-Bulk-Dispatch-Inter-Winery"
category: "vintrace Web"
section: "Winemaking"
created_at: "2024-11-20T14:46:37Z"
updated_at: "2026-05-01T19:26:33Z"
labels: []
gist: "Although an inter-winery transfer and a dispatch both involve shipping wine to another location, they are handled as separate operations in vintrace."
tags: ["inventory", "transfers", "configuration", "barrels", "ux-friction"]
---

# Bulk Dispatch (Inter-Winery)

Although an inter-winery transfer and a dispatch both involve shipping wine to another location, they are handled as separate operations in vintrace. Previously, a transfer did NOT generate a Bill of Lading (BOL). Although a BOL can be generated for a wine, the BOL number was not linked to the transfer and cannot be re-generated.

In order to solve this problem, vintrace has added the Bulk Dispatch (Inter-winery) operation to handle inter-winery transfers. This operation lets you generate and search for a BOL for inter-winery transfers.

Before you can record a Bulk Dispatch (Inter-Winery) operation, you’ll need to do the following:

- [Set up an In-Transit location (i.e., winery and winery building)](#winery_and_building).
- [Set up a tanker in the In-Transit location](#tanker).

After the location and tanker above are set up, the workflow for an inter-winery dispatch would be as follows:

1. The sending winery [records a Bulk Dispatch (Inter-Winery) operation](#bulk_dispatch_interwinery) that dispatches to the receiving winery using the In-Transit tanker.
2. The receiving winery [records a Transfer operation](#receiving) or [Move barrel operation](#receiving) to transfer the wine from the In-Transit tanker to one of their tanks.

![Diagram_Gap_147_Workflow_20221115.png](https://support.vintrace.com/hc/article_attachments/32328624011540)

## Setting Up an In-Transit Winery and Building

When the sending winery records an inter-winery bulk dispatch, the wine will technically not yet be at the receiving winery. The In-Transit location that you create in this part of the process allows you to associate the tanker with this location. The location will consist of the winery and the winery building.

To set up an in-transit winery:

1. Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32328624024724) Set Up in the sidebar.
2. Click Locations.
3. From the Winery tile, click Configure.
4. Click New Winery. The Winery window displays.
5. When specifying the details for the winery, be sure to:

- Enter a name that will make it clear that the winery is an in-transit location.
- Select the In-Transit Location checkbox.

![Winery_-_In-Transit_20221115.png](https://support.vintrace.com/hc/article_attachments/32328616136980)

6. Click Save.

To set up an in-transit building:

1. Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32328624024724) Set Up in the sidebar.
2. Click Locations.
3. From the Winery Buildings tile, click Configure. The Winery Building window displays.
4. When specifying the details for the winery building, be sure to select the in-transit winery that you created.

![Winery_Building_20221115.png](https://support.vintrace.com/hc/article_attachments/32328616151572)

5. Click Save.

## Setting Up a Tanker

The tanker in the in-transit location will be used when the receiving winery records the inter-winery bulk dispatch.

To set up a tanker in the in-transit location:

1. Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32328624024724) Set Up in the sidebar.
2. Click Vessels.
3. From the Tankers tile, click Configure. The Tanker window displays.
4. When specifying the details for the tanker, be sure to select the in-transit winery building that you created.

![Tanker_20221115.png](https://support.vintrace.com/hc/article_attachments/32328616172564)

5. Click Save.

## Recording a Bulk Dispatch (Inter-Winery) Operation

This part of the process will be completed by the sending winery.

To record the inter-winery bulk dispatch:

1. From the Record an Operation window, select Bulk Dispatch (Inter-Winery).

You can access the Record an Operation window by clicking the operation icon from several pages in vintrace, including the Vessels page and Job Management page.

2. When specifying the details for the operation, be sure to:

- Set the Dispatch To to the receiving winery.
- Set the Tanker Compartment to the in-transit tanker that you created.

![Bulk_Dispatch_Inter-Winery_20221115.png](https://support.vintrace.com/hc/article_attachments/32328608263828)

You can ship barrels via a inter-winery bulk dispatch. Barrels can be shipped individually or as part of a barrel group. Note that full barrel groups must be shipped- if you wish to ship specific barrels of a barrel group, you must [break the barrel group](https://support.vintrace.com/hc/en-us/articles/32303277484564) prior to dispatch. To ship barrels, click 'Dips/Options' and ![](https://support.vintrace.com/hc/article_attachments/48819101303700) check 'Barrels dispatched'

![](https://support.vintrace.com/hc/article_attachments/48819111269268)

3. Click Save.

vintrace generates a Bill of Lading when the operation is completed.

![Bill_of_Lading_20221115.png](https://support.vintrace.com/hc/article_attachments/32328608284948)

## Receiving Bulk Wine

This part of the process will be completed by the receiving winery.

To record the receipt of the wine:

1. From the Record an Operation window, select Transfer/Rack/Blend.

You can access the Record an Operation window by clicking the ![Operations_Icon_20200407.png](https://support.vintrace.com/hc/article_attachments/32328608315412) operation icon that's available several pages in vintrace, including the [Vessels page](https://support.vintrace.com/hc/en-us/articles/32301344827924) and [Job Management page](https://support.vintrace.com/hc/en-us/articles/32303318317972).

2. When specifying the details for the transfer, be sure to do the following:

- Select the in-transit tanker as the From vessel.
- Select a tank that’s located at the receiving winery as the To vessel.

![Racking_20221115.png](https://support.vintrace.com/hc/article_attachments/32328624192532)

3. Click Save.

## Receiving Full Barrels

This part of the process will be completed by the receiving winery.

To record the receipt of the wine:

1. From the Record an Operation window, select Move barrels.

You can access the Record an Operation window by clicking the ![Operations_Icon_20200407.png](https://support.vintrace.com/hc/article_attachments/32328608315412) operation icon that's available several pages in vintrace, including the [Vessels page](https://support.vintrace.com/hc/en-us/articles/32301344827924) and [Job Management page](https://support.vintrace.com/hc/en-us/articles/32303318317972).

2. When specifying the details for the transfer, be sure to do the following:

- Select the barrel or barrel group as the From vessel.
- Select the new storage location.
- Enter the new batch under Target batch

![](https://support.vintrace.com/hc/article_attachments/48819101306772)

3. Click Save.

## Searching for Inter-Winery Transfer BOLs

You can search for inter-winery transfer BOLs from the Dispatch Search window:

1. Click ![More_Options_20200323.png](https://support.vintrace.com/hc/article_attachments/32328630666004) More Options in the sidebar.
2. From the Tools tile, click Dispatch Search.
3. Select the Bulk (In-Transit) Only option.

![Dispatch_Search_20221115.png](https://support.vintrace.com/hc/article_attachments/32328624165908)

You can click the row to display similar options for a normal bulk dispatch.

You can also filter the [Vessels page](https://support.vintrace.com/hc/en-us/articles/32301344827924) to show tankers.

![Vessels_Page_-_Tankers_Filter_20221115.png](https://support.vintrace.com/hc/article_attachments/32328616267156)

## Reporting on Inter-Winery Bulk Dispatches

The existing [Stock Dispatch Report](https://support.vintrace.com/hc/en-us/articles/32301330369684) has been updated to include Bulk Dispatch (Inter-Winery) operations.
