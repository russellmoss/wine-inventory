---
id: "32301318546964"
title: "vintrace Operations"
url: "https://support.vintrace.com/hc/en-us/articles/32301318546964-vintrace-Operations"
category: "Setup and Admin"
section: "Getting Started"
created_at: "2024-11-20T14:46:43Z"
updated_at: "2026-01-29T06:06:45Z"
labels: []
gist: "The operations available in vintrace are organised into the following categories:."
tags: ["configuration", "lot-identity", "getting-started", "additives", "bond", "harvest"]
---

# vintrace Operations

The operations available in vintrace are organised into the following categories:

- [Admin](#admin)
- [General](#general)
- [Inventory](#inventory)
- [Sparkling](#sparkling)
- [Transfers](#transfers)
- [Treatments](#treatments)
- [Vintage/Harvest](#vintage)

Sparkling will appear only if you have the sparkling module enabled. If you should have this feature enabled but cannot see the sparkling section, please contact vintrace support.

![](https://support.vintrace.com/hc/article_attachments/45774237850004)

These operations can be added to a [work order](https://support.vintrace.com/hc/en-us/articles/32303315610388), or recorded independently. The available operations are described below.

## Admin

![](https://support.vintrace.com/hc/article_attachments/45774237850772)

### Change Batch

Move a wine from one batch to another.

### Change Ownership

Change a wine batch's ownership. This option for ownership change includes a timestamp - you update ownership from the timestamp onwards, but the historical ownership of the wine is retained.

For US databases, you can use this to [change a wine’s bond](https://support.vintrace.com/hc/en-us/articles/32303307244308-Transferring-Wines-Between-Bonds-US#h_df74f252-038a-4367-8a43-54e41418ccf7) without changing its batch code or name. This is best used for batches that contain a single wine component. After performing a Change Ownership operation, you must perform Measurement operation on the wine without changing the volume so that it locks in the bond change as of the measurement’s date/time.

### Import Product

Imports a new customer's or a new winery's bulk wine inventory data.

Unlike the Bulk Wine Intake operation, this operation does not record a *Bulk received in bond* event in the TTB Report for US databases.

## General

![Record_an_Operation_-_General_20220829.png](https://support.vintrace.com/hc/article_attachments/32328611036308)

### Additive

Records the addition of a single additive to a product.

You can use the Multi Additions operation to record addition of multiple additives or use of a product treatment.

### Analysis

Records an analysis.

You can also [record an analysis of a bottled or dispatched wine](https://support.vintrace.com/hc/en-us/articles/32301371490196) from the Actions menu of a stock item. You can also [import lab work](https://support.vintrace.com/hc/en-us/articles/360000812735-Exporting-and-Importing-Lab-Results#ImportingLabWork) using a CSV file.

### Bulk Dispatch

Used when you [send bulk wine](https://support.vintrace.com/hc/en-us/articles/32303327348116) in vessel from your winery and no longer need to track the wine in vintrace.

### Bulk Intake

Used when you’re [receiving bulk wine](https://support.vintrace.com/hc/en-us/articles/32303303281428) from another winery. This is recorded as a *Bulk received in bond* event in the TTB Report for US databases.

### General Task

Used for any task that doesn't have a vintrace operation, or for tasks that are not wine specific such as end-of-week or end-of-day checklists. For example:

- Cleaning the winery
- Cleaning the warehouse
- Cleaning tasting valves
- Checking tops of tanks

### Measurement

[Adjusts the volume of a batch of wine](https://support.vintrace.com/hc/en-us/articles/32303278134676). For example, when you use wine in a vessel as a [topping material](https://support.vintrace.com/hc/en-us/articles/32303356087828) and need to deplete the wine in the vessel.

When you need to [update the configuration of a barrel group](https://support.vintrace.com/hc/en-us/articles/32303294099476). You can change the volume in any barrel, or add, remove, or swap a barrel in that group.

### Multi Additions

Records the [addition of multiple additives](https://support.vintrace.com/hc/en-us/articles/32301358791956) to one or more vessels. This operation also supports searching for multiple wines and using an [additive template](https://support.vintrace.com/hc/en-us/articles/32301359803412).

### New Batch

Creates a new wine batch.

You can also create a new batch from other operations (e.g., Multi Additions, Analysis).

### Packaging

[Records a bottling](https://support.vintrace.com/hc/en-us/articles/32303327186836). You can add stock items for your bottle or case prior to bottling, or during the Packaging operation.

### Start Ferment

Begins [fermenting](https://support.vintrace.com/hc/en-us/articles/32303278530708) a batch. There are numerous [other ways to start a ferment](https://support.vintrace.com/hc/en-us/articles/32303278530708-Managing-Ferments), including [using the app](https://support.vintrace.com/hc/en-us/articles/32301373036820-Tracking-Ferments-Pump-Overs-and-Punch-Downs).

### Stop Ferment

Stops fermenting a batch. You can also create a stop [ferment policy](https://support.vintrace.com/hc/en-us/articles/360000826256-Managing-Ferments#SettingUpStartandStopFermentPolicies) that stops a ferment when a certain metric threshold is reached. including [using the app](https://support.vintrace.com/hc/en-us/articles/32301373036820-Tracking-Ferments-Pump-Overs-and-Punch-Downs#h_01K4VS4997E1VCBRTDJG2VZSWJ).

### Tasting Note

[Records a tasting note](https://support.vintrace.com/hc/en-us/articles/32301351165204) for a wine, fruit sample, or trial blend.

### Trial Blend

Allows you [create and view a blend](https://support.vintrace.com/hc/en-us/articles/32303333476372) before committing to it in the cellar. You can also create a trial blend from the More Options page.

## Inventory

![Record_an_Operation_-_Inventory_20220829.png](https://support.vintrace.com/hc/article_attachments/32328618820884)

### Adjustment

[Changes the amount of stock items](https://support.vintrace.com/hc/en-us/articles/32303269835156). You can also do this from the Inventory module, the Stock Item Overview window, or the [mobile app](https://support.vintrace.com/hc/en-us/articles/32301336227220-Searching-for-and-Completing-Adjustment-and-Movement-Jobs-on-Stock-Items).

### Dissasemble

[Breaks down a case into single bottles](https://support.vintrace.com/hc/en-us/articles/32303316564628) (e.g., preparing for wine club shipment).

### Dispatch

[Moves stock items out of your winery](https://support.vintrace.com/hc/en-us/articles/32303319075988).

### Manufacture

[Builds complex stock items](https://support.vintrace.com/hc/en-us/articles/32303341990548) from packaged goods (e.g., label shiners/cleanskins, add components to existing packaging, palletise cases for dispatch).

### Move

[Transfers stock items](https://support.vintrace.com/hc/en-us/articles/32303355248916) from one physical location to another. US customers can also use this operation to move bonded items to tax-paid storage areas to record on their TTB Report.

### Receive

Takes in [stock items or bottled wine](https://support.vintrace.com/hc/en-us/articles/32303350382356-Receiving-Stock).

## Sparkling

![Record_an_Operation_-_Sparkling_20220829.png](https://support.vintrace.com/hc/article_attachments/32328618886676)

### Riddling

Starts and stops [riddling](https://support.vintrace.com/hc/en-us/articles/32301315714964).

### Tirage

Used to [tirage wine](https://support.vintrace.com/hc/en-us/articles/32301315744404).

### Tirage Admin

[Record a loss for a bin group](https://support.vintrace.com/hc/en-us/articles/32301351564564), [combine the tirage group with an existing one, or create a new tirage group](https://support.vintrace.com/hc/en-us/articles/32301306936724).

## Transfers

![Record_an_Operation_-_Transfers_20220829.png](https://support.vintrace.com/hc/article_attachments/32328618863764)

### Break Barrels

[Takes a barrel or barrels out of a barrel group](https://support.vintrace.com/hc/en-us/articles/32303277484564).

### Multi Topping

[Tops off your wines](https://support.vintrace.com/hc/en-us/articles/32303310694804).

### Multi Transfer (Many-to-One)

Moves wine from multiple sources to a single destination. Can also be used to [combine multiple barrels or barrel groups into a new barrel group](https://support.vintrace.com/hc/en-us/articles/32303316947092).

TIP: a **barrel group** is treated as single entity in vintrace, so a barrel group is a single source or destination regardless of how many barrels make up the group.

### Multi Transfer (One-to-Many)

Moves wine from a [single source to multiple destinations](https://support.vintrace.com/hc/en-us/articles/32301308168468).

TIP: a **barrel group** is treated as single entity in vintrace, so a barrel group is a single source or destination regardless of how many barrels make up the group.

### Transfer/Rack/Blend

A single source to single destination transfers. This can also capture racking, [racks and returns](https://support.vintrace.com/hc/en-us/articles/32303320423828), and moving wines into [a barrel or a barrel group](https://support.vintrace.com/hc/en-us/articles/32303355314708-Transferring-Wine-to-Barrel).

## Treatments

![Record_an_Operation_-_Treatments_20220829.png](https://support.vintrace.com/hc/article_attachments/32328633168404)

### Treatment (Barrel)

Performs some action on barrels (e.g., [deactivate](https://support.vintrace.com/hc/en-us/articles/32303347003156), [receive barrels from purchase order](https://support.vintrace.com/hc/en-us/articles/32303332259476), [move](https://support.vintrace.com/hc/en-us/articles/32303304744468)) using a barrel treatment. You’ll need to set up a [barrel treatment](https://support.vintrace.com/hc/en-us/articles/32301341352084) for the action you want to perform.

### Treatment (Equipment)

Performs some kind of action on your equipment (e.g., [sanitize tanks](https://support.vintrace.com/hc/en-us/articles/32301335169428), check tank, clean tank). You’ll need to set up an [equipment treatment](https://support.vintrace.com/hc/en-us/articles/32301313669524-Setting-Up-an-Equipment-Treatment) for the action you want to perform.

### Treatment (Product)

Performs some action on your wine that doesn’t change the wine (e.g., [declare wine](https://support.vintrace.com/hc/en-us/articles/32301321116308), [topping wine without updating its composition](https://support.vintrace.com/hc/en-us/articles/32303356087828), undeclare juice/concentrate, move wine between wineries). You’ll need to set up a [product treatment](https://support.vintrace.com/hc/en-us/articles/32301359713428) for the action you want to perform.

## Vintage/Harvest

![Record_an_Operation_-_Vintage_Harvest_20220829.png](https://support.vintrace.com/hc/article_attachments/32328633219732)

### Extraction

[Extracts](https://support.vintrace.com/hc/en-us/articles/32303268239508) must/juice from fruit.

### Intake Delivery

Confirms [delivery of fruit](https://support.vintrace.com/hc/en-us/articles/32303268370324).

### Press Cycle

[Splits a product](https://support.vintrace.com/hc/en-us/articles/32303268282132) into multiple fractions destined for different vessels.
