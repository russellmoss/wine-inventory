---
id: "32301328377876"
title: "Transferring Wine Between Wineries"
url: "https://support.vintrace.com/hc/en-us/articles/32301328377876-Transferring-Wine-Between-Wineries"
category: "vintrace Web"
section: "Winemaking"
created_at: "2024-11-20T14:46:55Z"
updated_at: "2025-01-15T19:26:55Z"
labels: []
gist: "In order to transfer wine between wineries, you’ll need the following permissions:."
tags: ["transfers", "bond", "permissions", "reporting", "additives", "barrels"]
---

# Transferring Wine Between Wineries

In order to transfer wine between wineries, you’ll need the following [permissions](https://support.vintrace.com/hc/en-us/articles/360000813755-Roles-and-Permissions#Permissions):

- All Winery Access
- Can move wine between bonds
- Can move wine between wineries

When wine is transferred from one winery to another, all of the wine’s information (i.e., additives, composition, job history, etc.) transfers with it. This article provides two examples for transferring wine: a [tank example](#h_01FRRV3B54KQZ3SMKPQFYK0BA8) and a [barrel example](#h_01FRRV3HVET279KT73K2QAW938).

## Tank Example

To transfer a tank of wine between wineries:

1. Switch vintrace to the originating winery.
2. View the wine that you’ll be transferring and make sure that it’s bonded. If the wine isn’t bonded and is still going through fermentation, you’ll first need to declare it as juice before transferring it to the other bond. After receiving wine you can un-declare it as juice.
3. Run a Bill of Lading report by clicking the ![Reports_Icon_20200403.png](https://support.vintrace.com/hc/article_attachments/32328604480148) report icon, then selecting Bill of Lading. A few notes:

- You can click the ![Wand_Icon_20200410.png](https://support.vintrace.com/hc/article_attachments/32328648795668) wand icon to fill in the next bill of lading number.
- From the Dispatch Type list, select *Transferred in Bond*.
- If the receiving winery’s bond number is not already [added to their entry in the vintrace address book](https://support.vintrace.com/hc/en-us/articles/32303336930708), you can manually enter it in the Bond # field.

![Bill_of_Lading_20220104.png](https://support.vintrace.com/hc/article_attachments/32328639256340)

4. Switch the winery to *All Winery Mode*.

![All_Winery_Mode_20220104.png](https://support.vintrace.com/hc/article_attachments/32328863564564)

You can do this by switching the winery and selecting *[Reset]* from the Switch To list.

5. [Create a work order](https://support.vintrace.com/hc/en-us/articles/32303315610388) with a Transfer job. You can create a new work order category such as *Shipping Wine Between Wineries* to make the work order easier to identify.
6. Specify the details for the transfer job:

- Use the treatment name that your company uses to identify transfers between internal wineries (e.g., Dispatch - Inter Winery, Interplant Ship Out, Interwinery Ship Out, etc.).
- From the To section’s Vessel field, select the tank at the receiving winery.
- If you change the wine’s name at the receiving winery, you can specify the new name in the To section.

7. Save the work order as *Ready*. The resulting work order displays both bond numbers.

![Tank_Example_-_TWL1782_Bond_Numbers_20220104.png](https://support.vintrace.com/hc/article_attachments/32328639122068)

If you don’t want the vessel that you selected displayed in the work order, you can either change it or remove the information from the work order’s Word document.

8. Either the shipping winery or the receiving winery can complete the work order. When the work order is completed, a warning that the wine is being moved from one bond to another displays.

![Warning_-_Moving_From_One_Bond_20220105.png](https://support.vintrace.com/hc/article_attachments/32328639189780)

9. Click OK. At this point the wine is officially moved.

The receiving winery can create a work order with a Transfer job to move the wine from the tanker into a tank. When the receiving winery completes the work order, they will NOT see the bond warning as the wine is already at their bond.

You can view the bond change by viewing the wine’s product page then clicking the ![Building_Gray_20200415.png](https://support.vintrace.com/hc/article_attachments/32328680535316) building icon in the Tax Class tile.

![Product_Page_-_Tax_Class_Tile_20220106.png](https://support.vintrace.com/hc/article_attachments/32328639211540)

You should see the transfer from one bond to the other.

![Tank_Example_-_Tax_Class_Details_20220105.png](https://support.vintrace.com/hc/article_attachments/32328604470036)

## Barrel Example

To transfer barrels or kegs of wine between wineries:

1. Switch vintrace to the originating winery.
2. View the barrel group that you’ll be transferring and make sure that it’s bonded.
3. Run a Bill of Lading report by clicking the ![Reports_Icon_20200403.png](https://support.vintrace.com/hc/article_attachments/32328604480148) report icon, then selecting Bill of Lading.
4. [Create a work order](https://support.vintrace.com/hc/en-us/articles/32303315610388) with a [product treatment](https://support.vintrace.com/hc/en-us/articles/32301359713428) (i.e., Treatment (Product)) job. You can create a new work order category such as *Shipping Wine Between Wineries* to make the work order easier to identify.
5. Specify the details for the transfer job using the treatment name that your company uses to identify transfers between internal wineries
6. Save the work order as *Ready*. The work order lists the barrels in the barrel group. If needed, you can edit the work order to include additional information.

![Barrel_Example_-_TWL1784_20220105.png](https://support.vintrace.com/hc/article_attachments/32328863443092)

7. Switch the winery to *All Winery Mode*.

![All_Winery_Mode_20220104.png](https://support.vintrace.com/hc/article_attachments/32328863564564)

You can do this by switching the winery and selecting *[Reset]* from the Switch To list.

8. View the barrel group.
9. Complete the work order with the product treatment that you created in step 4. This is more for reporting purposes versus actually moving the barrels. The barrels will be moved in the next step.
10. Click the ![Operations_Icon_20200407.png](https://support.vintrace.com/hc/article_attachments/32328885936404) operations icon, then select Move Barrels.

Moving barrels can only be done as an operation.

11. Specify the details for the operation including the storage area at the receiving winery.
12. When you save the operation, vintrace displays a warning that the same batch is at two different wineries. Click Continue.

![Warning_-_Same_Batch_at_Different_Wineries_20220105.png](https://support.vintrace.com/hc/article_attachments/32328636753684)

When you view the wine’s tax information, you should see the transfer from one bond to the other.

![Barrel_Example_-_Tax_Class_Details_Edited_20220106.png](https://support.vintrace.com/hc/article_attachments/32328863467156)
