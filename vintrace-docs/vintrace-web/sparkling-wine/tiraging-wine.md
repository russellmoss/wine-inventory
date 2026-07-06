---
id: "32301315744404"
title: "Tiraging Wine"
url: "https://support.vintrace.com/hc/en-us/articles/32301315744404-Tiraging-Wine"
category: "vintrace Web"
section: "Sparkling Wine"
created_at: "2024-11-20T14:47:07Z"
updated_at: "2025-01-15T19:19:19Z"
labels: []
gist: "You can access the Tirage operation from the following:."
tags: ["lot-identity", "work-orders", "barrels", "inventory", "naming", "packaging"]
---

# Tiraging Wine

You can access the Tirage operation from the following:

- [The Vessels page](https://support.vintrace.com/hc/en-us/articles/32301344827924)
- [The Job Management page](https://support.vintrace.com/hc/en-us/articles/32303318317972)
- [The Product page](https://support.vintrace.com/hc/en-us/articles/32303310460948)

![Tirage_-_General_20210621.png](https://support.vintrace.com/hc/article_attachments/32328888770836)

You can also add a Tirage job to a [work order](https://support.vintrace.com/hc/en-us/articles/32303315610388).

Before a wine is tiraged, its sparkling state will be blank.

![Sparkling_State_-_Blank_20210618.png](https://support.vintrace.com/hc/article_attachments/32328878102676)

To tirage a wine:

1. In the From section of the Tirage window, specify the details for the wine that you want to tirage, including its vessel, batch, and out amount. If you accessed the tirage operation from a wine’s product page, the wine’s vessel and batch will be automatically filled in.
2. In the Tirage Item field, select the [tirage item](https://support.vintrace.com/hc/en-us/articles/32301315764884) that you want to package. The stock items included in the tirage item’s BOM are listed.

![Tirage_-_General_-_Tirage_Item_20210621.png](https://support.vintrace.com/hc/article_attachments/32328895286548)

3. If you’d like to change the batch code for the tirage, you can specify it in the Tirage Batch field. To keep it the same, search for the batch code.
4. If needed, update the amount in the Quantity field. This calculates the loss amount in the From section.

![Tirage_-_General_-_Loss_20210621.png](https://support.vintrace.com/hc/article_attachments/32328908891412)

5. If there was any loss, select the reason from the Loss Reason list.
6. For each stock item, click the ![Forklift_20200511.png](https://support.vintrace.com/hc/article_attachments/32328878128148) forklift icon to select where the item will be taken from.
7. If you need to account for any waste (i.e., broken bottles), click Scrap beside the item and enter the amount in the Scrap field. The quantity for the item is automatically re-calculated based on the scrap.

![Tirage_-_General_-_Scrap_20210621.png](https://support.vintrace.com/hc/article_attachments/32328888849940)

8. To account for extra costs such as labor or bottling charges, click Add Extra Costs.
9. [Specify the bins and cages.](#specifying_bins_cages)
10. Specify other details for the tirage in the remaining tabs.
11. Click Save.

After a wine is tiraged, its Sparkling State on the product page will show *Tiraged*.

![Sparkling_State_-_Tiraged_20210621.png](https://support.vintrace.com/hc/article_attachments/32328878164756)

The tirage job will also be listed in the wine’s Jobs tab.

You can apply a [column filter](https://support.vintrace.com/hc/en-us/articles/32301336063764) to the Type column to only show Tirage jobs.

## Specifying Bins and Cages

To specify the bins and cages for the tirage, do the following from the Bins/QA tab:

1. Change the Tirage Group Name if needed.
2. Select the Default Area.
3. If you don’t need to select the specific bins to use, click [Quick Fill](#quickfill). Otherwise, select the bins that you want to use.
4. If you don’t want to specify the fill times, de-select the Mandatory Bin Fill Times checkbox. Otherwise, specify the fill times.

![Tirage_-_Bins_QA_-_Mandatory_Fill_Times_Unchecked_20210621.png](https://support.vintrace.com/hc/article_attachments/32328888886932)

You can click the ![Heart_White_20200731.png](https://support.vintrace.com/hc/article_attachments/32328895265556) beside the Mandatory Bin Fill Times to save your preference.

## Using Quick Fill to Select Bins and Cages

When you’re not concerned about the specific bins or cages to use for the tirage, you can use the Quick Fill option.

To use quick fill:

1. On the Bins/QA tab, click Quick Fill.

![Tirage_-_Bins_QA_-_Quick_Fill_Link_20210621.png](https://support.vintrace.com/hc/article_attachments/32328908989844)

The # Bottles is automatically filled in based on the amount in the General tab.

![Quick_Fill_Bins_20210621.png](https://support.vintrace.com/hc/article_attachments/32328888902804)

2. If you want to use the same fill area for all the bins and cages, select a Fill Area.
3. From the Bins/Cages list, select whether you want to use bins, cages, or both.
4. Click OK.

vintrace selects available bins and/or cages.

![Tirage_-_Bins_QA_-_Quick_Fill_Bins_20210621.png](https://support.vintrace.com/hc/article_attachments/32328895258004)
