---
id: "32301304791316"
title: "Configuration for Multi-Winery Support"
url: "https://support.vintrace.com/hc/en-us/articles/32301304791316-Configuration-for-Multi-Winery-Support"
category: "Setup and Admin"
section: "Configuration"
created_at: "2024-11-20T14:46:54Z"
updated_at: "2026-05-27T22:13:37Z"
labels: ["enterprise"]
gist: "vintrace has improved support for users with a multi-winery license."
tags: ["configuration", "permissions", "inventory", "additives", "fermentation", "lab"]
---

# Configuration for Multi-Winery Support

vintrace has improved support for users with a multi-winery license. The enhancement features the following improvements:

- Ability to [manage the items that are available to wineries](#managing_item_availability)
- Ability to [set up the default extraction rates per winery](#h_01FY7PYVP8GHP5APSJG2WWAF4T)

## Managing an Item’s Availability

In order to manage the assigned set up items for wineries, you will need the [Local vintrace Administrator permission or the All Winery Access permission](https://support.vintrace.com/hc/en-us/articles/360000813755-Roles-and-Permissions#Permissions).

Users with a multi-winery license can specify which items are available at each winery. This functionality makes searching easier and reduces the chance that an item set up for a specific winery isn’t used elsewhere.

The ability to specify the applicable winery applies to the following items in vintrace:

- [Additives](https://support.vintrace.com/hc/en-us/articles/32301344910740)
- [Additive templates](https://support.vintrace.com/hc/en-us/articles/32301359803412)
- [Analysis templates](https://support.vintrace.com/hc/en-us/articles/32301372281748)
- [Barrel treatments](https://support.vintrace.com/hc/en-us/articles/32301341352084)
- [Blocks](https://support.vintrace.com/hc/en-us/articles/32303262299284)
- Closures
- Crush treatments
- [Custom print templates](https://support.vintrace.com/hc/en-us/articles/32303308638740)
- Dry goods
- Equipment treatments
- [Ferment treatments](https://support.vintrace.com/hc/en-us/articles/360000826256-Managing-Ferments#SettingUpStartandStopFermentPolicies)
- Glass/containers
- [Metrics](https://support.vintrace.com/hc/en-us/articles/32301345260948)
- Other stock
- [Product treatments](https://support.vintrace.com/hc/en-us/articles/32301359713428)
- Saved Searches - [Inventory](https://support.vintrace.com/hc/en-us/articles/32303350682388-Searching-Inventory), [Bulk Wine](https://support.vintrace.com/hc/en-us/articles/32303332410516-Bulk-Wine-Search), [Vessels Page](https://support.vintrace.com/hc/en-us/articles/32301344204308-Searching-the-Vessels-Page)
- Spray agents
- [Standard notes](https://support.vintrace.com/hc/en-us/articles/32301315435028)
- Standard tasks
- Stock items
  - [Single bottles](https://support.vintrace.com/hc/en-us/articles/32301345671956)
  - [Cases (all)](https://support.vintrace.com/hc/en-us/articles/32301360537876)
  - Pallets
- Treatment agents
- [Vineyards](https://support.vintrace.com/hc/en-us/articles/32301351350420)
- [Work order templates](https://support.vintrace.com/hc/en-us/articles/32303319793556)

By default, each winery will have access to all of the existing set up items listed above. For existing set up items, you will need to unassign items that do not apply to a winery.

- If you’ve [switched vintrace to a specific winery](https://support.vintrace.com/hc/en-us/articles/360000822456-Using-vintrace-Across-Multiple-Facilities#SwitchingBetweenWineries) or only have access to a specific winery, adding new items from the Winery Setup window will assign the item to that winery. If vintrace is in All Winery Mode, the item will be assigned to all wineries.
- If a user with access to all wineries adds a new item from an operation or job in a work order, vintrace assigns the item to all wineries. If the user only has access to a specific winery, the item will only be assigned to that winery.

To manage a winery’s assigned set up items:

1. Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32328603969940) Set Up in the sidebar.
2. Search for the set up item.
3. From the item’s tile, click Configure.
4. From the Winery list, select the winery that you want to manage the assigned items for.

If you’ve [switched vintrace to a specific winery](https://support.vintrace.com/hc/en-us/articles/360000822456-Using-vintrace-Across-Multiple-Facilities#SwitchingBetweenWineries) or only have access to a single winery, the Winery Setup window’s Winery list will automatically show that winery’s name; you will not be able to select a different winery from this window. If you need to manage the assigned items for a different winery, you will need to switch vintrace to that winery.

5. Click Assign to Winery.

![Assign_to_Winery_Button_20220107__Edit_.png](https://support.vintrace.com/hc/article_attachments/32328636605716)

The Assign Items for <WineryName> window displays. The selected winery’s name displays in the window’s title. The displayed list defaults to the set up item from which you clicked the Assign to Winery button. For example, if you were viewing standard notes when you clicked Assign to Winery, the list of standard notes displays. You can view a different set up item by selecting it from the Types list.

![Assign_Items_for_JX2_-_Standard_Note_20220107__Edit_.png](https://support.vintrace.com/hc/article_attachments/32328638954132)

Active and inactive items are displayed. Checkboxes for items assigned to the winery are selected; de-selected checkboxes are not assigned to the winery. When the Assign Items window is initially displayed, the selected items are listed at the top.

![Assign_Items_for_JX2_-_Standard_Note_-_Selected_vs_Deselected_20220107__Edit_.png](https://support.vintrace.com/hc/article_attachments/32328648640916)

The Assign Items window lists items starting with a number first, followed by items starting with a capital letter, followed by items starting with a lowercase letter.

6. To change the items assigned to the winery, select or de-select the items. You can select or de-select all items using the select all/none checkbox that’s displayed to the left of the column headers.

![Assign_Items_-_Select_All_20220107__Edit_.gif](https://support.vintrace.com/hc/article_attachments/32328664972052)

TIPS:

- As you select and de-select items, the sort order will not change unless you click Save, or select a different item from the Types list.
- To display only those items that are assigned to the winery, select the Assigned to My Winery checkbox.

![Assigned_to_My_Winery_20220107__Edit_.png](https://support.vintrace.com/hc/article_attachments/32328664909972)

- You can manage different items assigned to the winery by selecting a different item from the Types list. vintrace will remember the items that you selected/de-selected from each list.
- A warning displays if you de-select an item that’s linked to another item assigned to the winery. For example, if you unassign an additive that’s used by an additive template that’s assigned to the winery.

![Confirmation_-_Linked_Items_20220107.png](https://support.vintrace.com/hc/article_attachments/32328664755988)

To continue unassigning the item from the winery, click Yes. The linked item (in this example, the additive template) will continue to work.

- To add a new item for the winery, click the ![Plus_in_Green_Circle_20200319.png](https://support.vintrace.com/hc/article_attachments/32328636401684) plus icon.

![Adding_New_Item_20220107__Edit_.png](https://support.vintrace.com/hc/article_attachments/32328636624276)

- After unassigning an item from a winery, previously scheduled work orders and linked items will continue to work as if the item was still assigned to the winery. However, for newly scheduled work orders, you will not be able to search for it using the unassigned item.

7. Click Save.

If you have the [Local vintrace Administrator permission or the All Winery Access permission](https://support.vintrace.com/hc/en-us/articles/360000813755-Roles-and-Permissions#Permissions), you can also manage the assigned items for the wineries available to you from the Winery Setup window’s Winery list by clicking the ![Assign_Items_Icon_20220107.png](https://support.vintrace.com/hc/article_attachments/32328638858004) assign items icon.

![Winery_Setup_-_Winery_20220107__Edit_.png](https://support.vintrace.com/hc/article_attachments/32328639042452)

## Setting Up the Default Extraction Rates

To set up a winery’s default extraction rates:

1. Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32328603969940) Set Up in the sidebar.
2. Search for Winery.
3. From the Winery tile, click Configure.
4. Click Default Extraction Rate Setup.
5. Enter the rates for each Fraction Type.

![Edit_Default_Extraction_Rate_-_Must_20200902.png](https://support.vintrace.com/hc/article_attachments/32328664961428)

6. Click OK.
7. Click Save.
