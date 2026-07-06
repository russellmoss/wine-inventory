---
id: "32303310694804"
title: "Topping Your Wines"
url: "https://support.vintrace.com/hc/en-us/articles/32303310694804-Topping-Your-Wines"
category: "vintrace Web"
section: "Winemaking"
created_at: "2024-11-20T15:52:52Z"
updated_at: "2024-11-21T10:29:58Z"
labels: ["estate", "barrel", "top wines", "multi topping", "wp-faq-1981", "topping", "topping wines"]
gist: "Topping your wines in vintrace is done using the Multi Topping operation."
tags: ["transfers", "barrels", "work-orders", "fermentation", "api", "lot-identity"]
---

# Topping Your Wines

Topping your wines in vintrace is done using the Multi Topping operation. This operation is essentially a one-to-many transfer that allows you to capture the topping work done across all your wine batches.

You can access the Multi Topping operation from the following:

- [The Vessels page](https://support.vintrace.com/hc/en-us/articles/32301344827924)
- [The Job Management page](https://support.vintrace.com/hc/en-us/articles/32303318317972)

You can also add a Multi Topping job to a [work order](https://support.vintrace.com/hc/en-us/articles/32303315610388).

To top off your wines, you’ll need to select :

1. [The barrel that will be used to top off the rest of your barrels](#h_01EM29R6VJFATDKYD5WR1YM5SB).
2. [The barrels to top off](#h_01EM29RCRQYXQ59WPZSTSZSZPH).

![Multi_Topping_-_To_and_From_20201007.png](https://support.vintrace.com/hc/article_attachments/32329173968148)

After completing the topping, you will have depleted your topping material and will be able to view updated volumes and compositions on your topped wines.

For information on topping your barrels post-fermentation, refer to our [Topping Up Barrels Post Fermentation](https://support.vintrace.com/hc/en-us/articles/32301342037396) article.

## Selecting Barrel(s) to Use for Topping Off

If you’re topping off from a barrel group and aren’t using all the wine in the group, you can select the volume and the vessel it should come from. To do this:

1. In the Top From section, click the ![Barrel_Group_List_20201007.png](https://support.vintrace.com/hc/article_attachments/32329193845652)barrel group list icon beside the vessel.

![Multi_Topping_-_Barrel_Group_List_Icon_20201007.png](https://support.vintrace.com/hc/article_attachments/32329173878036)

The Barrel Group List window displays the barrels in the group.

2. Set the Fill of the barrel(s) that you want to use. The barrel’s Volume changes to reflect the selected Fill. For example, to empty a barrel, select *Empty*. If you want to manually enter the remaining volume, select *Specify* from the Fill list and enter the remaining volume. The total volume of all selected barrels displays at the bottom.

![Barrel_Group_List_-_Fill_and_Total_Volume_20201007.png](https://support.vintrace.com/hc/article_attachments/32329188518036)

3. Click OK.

## Selecting the Barrels to Top Off

1. Select the barrels you want to top off.
2. Enter the volume that you want to transfer into the vessel in the Transfer In field. Or, click Apportion Out to distribute the topping volume proportionally to each of your destination vessels.
3. From the Topping Mode list, select how you want vintrace to handle the destination vessels’ volumes:

- Record Pre-Topping Loss — This option does not change the wine’s end volume. It automatically records a loss prior to the topping, then tops the vessel up to its current volume.
- Increase Volume by Amount — This option changes the vessel’s volume by the amount specified in the Transfer In field. This is useful to fill smaller vessels such as kegs when you have wine left over from a barrel.

![Multi_Topping_-_Topping_Mode_20201007.png](https://support.vintrace.com/hc/article_attachments/32329173910292)
