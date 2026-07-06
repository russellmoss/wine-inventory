---
id: "32303332259476"
title: "Receiving Barrels from a Purchase Order"
url: "https://support.vintrace.com/hc/en-us/articles/32303332259476-Receiving-Barrels-from-a-Purchase-Order"
category: "vintrace Web"
section: "Purchases"
created_at: "2024-11-20T15:51:46Z"
updated_at: "2025-01-09T16:43:16Z"
labels: ["estate", "wp-faq-10783"]
gist: "You can receive barrels from vintrace’s Purchase Orders window, or from a work order."
tags: ["barrels", "work-orders", "configuration", "inventory"]
---

# Receiving Barrels from a Purchase Order

You can receive barrels from vintrace’s [Purchase Orders window](#h_01EF52ZEYBPVZA5V1J5DEWV2WZ), or [from a work order](#h_01EF52ZNXF27YR1999BV5J4N0P).

We recommend that you only use one of these methods to receive barrels to avoid creating duplicate barrels.

## Receiving Barrels From a Purchase Order

To receive barrels from a purchase order:

1. Click ![More_Options_20200323.png](https://support.vintrace.com/hc/article_attachments/32329058919956) More Options in the sidebar.
2. From the Purchases tile, click Manage Purchase Orders.
3. Click the purchase order.
4. Set the State to *Approved*.
5. For each purchase order line, click the ![Receive_Barrels_20200806.png](https://support.vintrace.com/hc/article_attachments/32329026327700).

![Update_Stock_Purchase_Order_-_Receiving_Barrels_20200806.png](https://support.vintrace.com/hc/article_attachments/32329059133460)

The Barrel window displays.

6. Specify the details for the barrel (i.e., cooper, forest, oak type, etc…).
7. In the Add n Incrementing Items with the Same Properties field, enter the number of identical barrels you want to create. This defaults to the quantity specified in the purchase order.
8. Click Save. The Fulfilled field in the Stock Purchase Order window is updated to reflect the number of barrels that you received.
9. Repeat steps 5-8 for each line of barrels in the purchase order.
10. Click Save.

After the purchase order is saved, its Fulfilled setting will be set to *Fulfilled*. The barrels that you received will be listed in the Winery Setup window.

![Update_Stock_Purchase_Order_-_Barrels_Fulfilled_20200806.png](https://support.vintrace.com/hc/article_attachments/32329059036820)

## Receiving Barrels from a Work Order

Before you can receive barrels from a work order, you’ll need to create a barrel treatment that has its Type set to *Buy*.

![Barrel_Treatment_Definition_-_Receive_Barrels_-_Type_of_Treatment_Buy_20200807.png](https://support.vintrace.com/hc/article_attachments/32329038389396)

To receive barrels from a work order:

1. [Create a work order](https://support.vintrace.com/hc/en-us/articles/32303315610388).
2. Click Add Job.
3. Select Treatment (Barrel). The Treatment (Barrel) window displays.
4. From the Treatment list, select the barrel treatment that you created to receive barrels.

![Treatment_Barrel_-_Receive_Barrels_20200807.png](https://support.vintrace.com/hc/article_attachments/32329043472916)

5. Click Add. The Search for Barrels window displays.
6. Click Create New Barrels located at the bottom of the Search for Barrels window.

![Search_for_Barrels_-_Create_New_Barrels_20200807.png](https://support.vintrace.com/hc/article_attachments/32329026476052)

The Barrel window displays.

7. Enter the purchase order number. The items in the purchase order are listed.

![Barrel_Create_-_VPO62_20200807.png](https://support.vintrace.com/hc/article_attachments/32329059082388)

8. Select the item from the purchase order that you want to add barrels for.
9. Specify the details for the barrel (i.e., cooper, forest, oak type, etc…).
10. In the Add n Incrementing Items with the Same Properties field, enter the number of identical barrels you want to create. This defaults to the quantity specified in the purchase order.
11. Click Save. The Fulfilled field in the Stock Purchase Order window is updated to reflect the number of barrels that you received.
12. Repeat steps 5-8 for each line of barrels in the purchase order.
13. Click Save. The newly created barrels are listed in the Search for Barrels window.
14. Click Use Selection.

![Search_for_Barrels_-_Use_Selection_20200807.png](https://support.vintrace.com/hc/article_attachments/32329038520852)

The Treatment (Barrel) window displays with the barrels that were created for the purchase order.

15. Click Add to Work Order.
16. Complete the work order to finalize the barrel intake.
