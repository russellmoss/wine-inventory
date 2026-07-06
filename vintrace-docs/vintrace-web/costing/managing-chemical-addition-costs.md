---
id: "32301356440084"
title: "Managing Chemical Addition Costs"
url: "https://support.vintrace.com/hc/en-us/articles/32301356440084-Managing-Chemical-Addition-Costs"
category: "vintrace Web"
section: "Costing"
created_at: "2024-11-20T14:48:15Z"
updated_at: "2024-12-05T18:12:50Z"
labels: ["estate", "manage costs", "additive", "addition", "addition costs", "cost"]
gist: "You can track additive costs inline to the wine production process."
tags: ["cost", "additives", "configuration", "fermentation", "inventory"]
---

# Managing Chemical Addition Costs

You can track additive costs inline to the wine production process. By setting up your additions with costs, you can pass the costs of your additions onto the wine.

## Tracking Costing Without the Inventory Module

If you only have the Costing module, you can track additive costs automatically as additions made to your bulk wines. To do this, you’ll need to [set up a cost item](https://support.vintrace.com/hc/en-us/articles/32301359350932) for each additive you want to track costings for.

When you set up the cost item, be sure to set the Cost Type to Additions and the Default Value to the dollar value for the additive’s unit of addition. Set the Price Per based on how the addition is made as detailed in the table below.

|  |  |
| --- | --- |
| **If the addition is made in ...** | **Then set the Price Per to ...** |
| Weight units (e.g., milligrams, grams, kilograms) | Per Kg |
| Fluid units (e.g., mL, litres) | Per Litre/Per Gallon |
| Whole units, or most other units of addition | Each or Per Unit |

![Create_Cost_Item_-_Additive_20200625.png](https://support.vintrace.com/hc/article_attachments/32329150108308)

For example, if the unit of addition for PMS is grams and you’ve calculated the average cost of PMS per gram to be $1.20, the Default Value for the cost item would be $1200/kilogram.

After you’ve set up the cost item, you’ll need to link it to the additive by setting the additive’s Cost Item to the cost item that you created. You can do this from the Winery Setup window (Setup Options > Production > Additive):

1. Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32329090674580) Set Up in the sidebar.
2. Click Winemaking.
3. From the Additives tile, click Configure.
4. Click the additive.
5. Set the additive’s Cost Item to the cost item that you created for the additive.

Over time, the average cost of your additions will change. Each time this occurs, you’ll need to update the cost item’s Default Value. The change will only affect future additions and are not retroactive.

## Costing for Chemicals with the Inventory Module

If you have the Advanced Inventory module enabled, you can link your winery additions to inventory stock. This enables you to track both the additive’s stock levels and its costs.

You can do this from the Winery Setup window (Setup Options > Production > Additive):

1. Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32329090674580) Set Up in the sidebar.
2. Click Winemaking.
3. From the Additives tile, click Configure.
4. Click the additive.
5. Set the additive’s Linked Stock Item to the stock item.

![Additive_Update_-_PMS_-_Linked_Stock_Item_20200625.png](https://support.vintrace.com/hc/article_attachments/32329138556180)

6. Click Save.

When an addition is made to wine, vintrace will transfer the consumed portion of the stock costs to the wine.

If you’ve enabled the Inventory module’s lot/batch tracking, you can have separate costing for each lot of stock you receive so you can have variable costing depending on which stock lot is selected. This is particularly useful if you want to track costs using a FIFO or LIFO methodology versus average weighted costing.

When you [receive stock items](https://support.vintrace.com/hc/en-us/articles/32303350382356), be sure to enter the cost information. You can also [correct costs for a Receive operation](https://support.vintrace.com/hc/en-us/articles/32301357714836), or add costs to a stock item.

If you backdate costs onto stock items when the additive has been applied to wines, the costs will ripple forward throughout the bulk wines to which it was applied or blended. Be sure to set the Effective Date to a date after the stock item was received to ensure that the costs ripple forward correctly.
