---
id: "32301328118932"
title: "Allocations Table"
url: "https://support.vintrace.com/hc/en-us/articles/32301328118932-Allocations-Table"
category: "vintrace Web"
section: "Finished Goods Allocations"
created_at: "2024-11-20T14:46:51Z"
updated_at: "2025-01-07T17:55:15Z"
labels: ["estate"]
gist: "The Allocations Table displays wine that has been allocated to products."
tags: ["packaging", "harvest", "permissions", "barrels", "vineyard"]
---

# Allocations Table

The Allocations Table displays wine that has been allocated to products. To access the Allocations Table, click the ![Manage_Allocations_Icon_20220111.png](https://support.vintrace.com/hc/article_attachments/32328635820052) manage allocations icon on the [Product Allocations page](https://support.vintrace.com/hc/en-us/articles/32301319185940).

The Allocations Table displays a maximum of 20 columns; the first 20 matching vintage/product combinations. We recommend using the filters to refine what’s displayed.

The page displays 25 rows at a time. You can use the page controls at the bottom of the page to scroll through your allocations.

![Allocation_Table_-_Page_Controls_20220112.png](https://support.vintrace.com/hc/article_attachments/32328629209620)

The column headers and footers will continue to display as you scroll the page.

At the top of the page are filters that let you refine what’s displayed on the page.

![Allocation_Table_-_Filters_20220112.png](https://support.vintrace.com/hc/article_attachments/32328629298196)

The selected filters are applied to the vessels AND the allocation codes. Therefore, all specified filters must be met in order for an allocation code to display.

You can filter the page by the following:

- Owner - [See note.](#h_01FS7N9QR8K1JPST3WB23F1GW6)
- Vintage - [See note.](#h_01FS7N9QR8K1JPST3WB23F1GW6)
- Variety - [See note.](#h_01FS7N9QR8K1JPST3WB23F1GW6)
- Appellation - [See note.](#h_01FS7N9QR8K1JPST3WB23F1GW6)
- Winery - [See note.](#h_01FS7N9QR8K1JPST3WB23F1GW6) If you only have permission to view a specific winery, the Winery filter displays only that winery. If you have permission to view multiple wineries, the Winery filter displays the [winery that you’re currently switched to](https://support.vintrace.com/hc/en-us/articles/360000822456#SwitchingBetweenWineries) and you’ll be able to select a different winery.
- Allocation code - This filter displays codes that are available for the winery and codes for products that don’t have a winery specified. This is useful when you have staff allocating volumes to general brands or products across the company. If you’ve specified other filters, you can click the ![Refresh_20201029.png](https://support.vintrace.com/hc/article_attachments/32328664130836) refresh icon so that only codes that meet the other filters are included.
- Vessel allocation status - You can filter the vessel allocation status by the following values:

|  |  |
| --- | --- |
| **Vessel Allocation Status** | **Description** |
| All | Includes vessels for all of the status values (i.e., Available, Fully Allocated, Matching Allocations, Over Allocated). |
| Available | Includes vessels where the available volume is greater than 0. |
| Fully Allocated | Includes vessels where the available volume is equal to 0. This indicates that all vessels have been allocated to the products. |
| Matching Allocations | Includes vessels where the volume has been allocated for the products displayed in the table. |
| Over Allocated | Includes vessels where the available volume is negative. This indicates that the allocated volumes exceed the volume available in the vessel (i.e., demand exceeds supply). These rows are highlighted in red.  Allocations_Table_-_Over_Allocated_20220112.png |

- Vessel/batch code

With the exception of the Vessel/Batch Code filter, vintrace remembers the specified filters so that you don’t need to re-specify them the next time you view the Allocations Table.

To [create a new product](https://support.vintrace.com/hc/en-us/articles/32301350767380), click the Add Product link that’s in the upper right.

The ability to add products is only available to users with the [Can add / edit allocation products permission](https://support.vintrace.com/hc/en-us/articles/32303349421588#Permissions).

![Allocation_Table_-_Add_Product_Link_20220112.png](https://support.vintrace.com/hc/article_attachments/32328603624084)

## Note About Filters

This filters the vessel and the product. If no vessels or products match the filters, we recommend selecting a code from the Specific Allocation Codes list.

For example, suppose you have a filter on the 2021 vintage and Merlot variety, but there are no matching products. You can select a product (e.g., 2021 Cabernet Sauvignon) from the Specific Allocation Codes list.
