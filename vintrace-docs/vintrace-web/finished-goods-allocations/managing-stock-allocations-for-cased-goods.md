---
id: "32301321793812"
title: "Managing Stock Allocations for Cased Goods"
url: "https://support.vintrace.com/hc/en-us/articles/32301321793812-Managing-Stock-Allocations-for-Cased-Goods"
category: "vintrace Web"
section: "Finished Goods Allocations"
created_at: "2024-11-20T14:47:26Z"
updated_at: "2025-01-07T17:48:16Z"
labels: ["estate"]
gist: "You can manage the stock allocation for your customers’ and sales regions’ cased goods from the Products page."
tags: ["inventory", "permissions", "packaging", "configuration", "dtc-sales", "harvest"]
---

# Managing Stock Allocations for Cased Goods

You can manage the stock allocation for your customers’ and sales regions’ cased goods from the Products page. You’ll be able to link your bulk and cased goods to supply and demand.

## Permissions and Winery Access

Products can now be assigned to a winery. Winery-restricted users will only have access to products within their winery. Refer to our [Using vintrace Across Multiple Winery Facilities article](https://support.vintrace.com/hc/en-us/articles/32303328608660) to learn more.

Users with the Can Manage Sales Orders permission are automatically assigned permission to manage product allocations (i.e., the Can Manage Product Allocations permission). Refer to our [User Roles and Permissions article](https://support.vintrace.com/hc/en-us/articles/32303349421588) to learn more. To have this permission added to your account, contact your local vintrace administrator.

## Creating a Product

The ability to add products is only available to users with the [Can add / edit allocation products permission](https://support.vintrace.com/hc/en-us/articles/32303349421588#Permissions).

To start tracking allocations, you’ll need to create a new product that includes its name, owner, demand per vintage, and supply.

To create a product:

1. Select ![Products_Icon_20200715.png](https://support.vintrace.com/hc/article_attachments/32328933897364) Products from the sidebar.

You can also create a product by selecting More Options from the sidebar, then clicking Manage Products from the Products tile.

2. From the Products page, click ![Plus_in_Green_Circle_20200319.png](https://support.vintrace.com/hc/article_attachments/32328966300180).
3. Enter the following details for the product:

- Product name
- Owner
- Winery (if relevant)

![New_Product_20200715.png](https://support.vintrace.com/hc/article_attachments/32328933936148)

4. Click Save. The product you created displays in the Products page.

![Products_20200715.png](https://support.vintrace.com/hc/article_attachments/32328927910804)

## Adding Stock Items to be Allocated

To add the stock items that you want to allocate to the product:

1. From the Products page, click the product that you want to allocate stock items to.
2. Select the Stock Items tab.
3. Click ![Plus_in_White_Circle_20200715.png](https://support.vintrace.com/hc/article_attachments/32328941535124) to search for the stock items that you want to assign to the product.

![Adding_Stock_Items_to_Product_20200715.png](https://support.vintrace.com/hc/article_attachments/32328933973396)

You can also filter your stock items by entering part of its name in the Quick Search field, or by selecting one or more categories.

![Add_Stock_Items_Search_2.png](https://support.vintrace.com/hc/article_attachments/32328927420436)

By default, the Show Unassigned Items checkbox is not selected so that the search results only displays stock items that haven’t been added to the product. To view the stock items that have already been assigned to the product, select the Show Unassigned Items checkbox.

4. To allocate a stock item to the product, select the checkbox beside the product. You can select all products listed by selecting the checkbox beside the Code column heading.
5. Click Save. The selected stock items are added to the product’s Stock Items tab.

![Stock_Items_Tab.png](https://support.vintrace.com/hc/article_attachments/32328957386132)

## Adding Stock Allocations

You can set up stock allocations prior to [fulfilling any sales orders](https://support.vintrace.com/hc/en-us/articles/32303318150164), or prior to or after changing a sales order’s fulfillment state.

To add stock allocations to a product:

1. From the product’s page, select the Stock Allocation tab.
2. Click ![Plus_in_White_Circle_20200715.png](https://support.vintrace.com/hc/article_attachments/32328941535124).
3. For each stock allocation, specify a customer and/or sales region, enter the amount to allocate, then click ![Checkmark_in_Green_Circle_20200715.png](https://support.vintrace.com/hc/article_attachments/32328941609236).

![Enter_Allocation_Amount.png](https://support.vintrace.com/hc/article_attachments/32328927531412)

The demand and remaining amounts will be updated. Each new or updated stock allocation will increase demand.

![Demand_and_Remaining_Amounts_Stock_Allocation.png](https://support.vintrace.com/hc/article_attachments/32328933660692)

If there aren’t any sales orders for the selected customer and/or sales region, the fulfilled amount won’t be populated. If there are sales orders that match the selected customer and/or sales region, the fulfilled amount will be populated to reflect the fulfillment status of sales orders.

The following sales order fulfillment states will cause the fulfillment amount to be populated:

- Approved to send
- Partially sent
- Fully sent

## Deleting Stock Allocations

To delete a stock allocation from a product:

1. From the product’s page, select the Stock Allocation tab.
2. Click the ![Three_Vertical_Dots_20200623.png](https://support.vintrace.com/hc/article_attachments/32328934012820) beside the stock allocation.
3. Select Delete.

![Delete_Stock_Allocation.png](https://support.vintrace.com/hc/article_attachments/32328927558676)

## Adding Tags to Stock allocations

To add tags to a stock allocation:

1. From the product’s page, select the Stock Allocation tab.
2. Click Add Tag. The Edit Tags window displays.
3. For each tag you want to add, click Add Tag, enter the tag name, then click Add as a New Tag.
4. Click Save.

The stock allocations tags display in the Tags column.

You can update or remove tags by clicking any of the tags in the Tags column.

## Updating Stock Allocations

You can update a stock allocation at any time. This includes:

- Prior to creating sales orders
- Prior to changing a sales order’s fulfillment state
- After changing a sales order’s fulfillment state

To update a stock allocation:

1. From the product’s page, select the Stock Allocation tab.
2. Enter the new amount in the Allocation field.

![Update_Stock_Allocation.png](https://support.vintrace.com/hc/article_attachments/32328941299732)

3. Click ![Checkmark_in_Green_Circle_20200715.png](https://support.vintrace.com/hc/article_attachments/32328941609236) or press the Enter key.

The demand and remaining amounts will be updated. Each new or updated stock allocation will increase demand.

![Updated_Stock_Allocation.png](https://support.vintrace.com/hc/article_attachments/32328957751700)

## Remaining Amounts for Stock Allocations

The remaining amount provides an indication of how many bottles or cases need to be produced to meet the allocated amount for the customer and/or sales region.

In the example below, an additional 200 bottles would need to be produced to meet the demand of 300 bottles.

![Remaining_Stock_Allocation.png](https://support.vintrace.com/hc/article_attachments/32328966087316)

## Under-Allocated Products

If the amount of stock fulfilled is more than the amount allocated, the stock allocation will be under-allocated. These stock allocations can be updated to allocate more stock as required. Under-allocated stock allocations are highlighted with pink.

In the example below, the stock allocation is under-allocated by 70 bottles, as 100 bottles have already been fulfilled.

![Underallocated_SA.png](https://support.vintrace.com/hc/article_attachments/32328927681428)

## Over-Allocated Products

Over-allocated stock will have a negative net difference. In the example below, the product is over-allocated by 2,333.1 cases. There’s not enough in production (i.e., 20,298.2 cases) to meet the demand of 23,600 cases.

![Over_Allocated_Product.png](https://support.vintrace.com/hc/article_attachments/32328966122132)

## Switching Between Equivalent Units

Each tab of the product page displays an Equivalent Unit list in the upper right. You can select a unit from the list to update the values in the tabs.
![Equivalent_Units.png](https://support.vintrace.com/hc/article_attachments/32328957211156)

## Stock Allocation Summaries

At the top of the Stock Allocation tab are three summary tiles:

- Summary — An overall summary of the amounts in demand, in production, produced, net difference, and fulfilled.
- Stock Category — Groups the stock levels of the assigned items by their stock category.
- Location — Groups the stock levels of the assigned items by the winery building’s location.

![Summary_Cards_Stock_Allocation_Tab.png](https://support.vintrace.com/hc/article_attachments/32328933780372)
