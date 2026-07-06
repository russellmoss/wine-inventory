---
title: "How to Reconcile Inventory"
url: "https://support.innovint.us/hc/en-us/how-to-reconcile-inventory"
category: "SUPPLY"
section: "Actions in SUPPLY"
page_type: "page"
lastmod: "2026-07-01"
gist: "Taking inventory? The Reconcile Inventory action allows you to true up your inventory after doing a physical count."
tags: ["inventory", "ux-friction", "packaging"]
---

# How to Reconcile Inventory

Taking inventory? The Reconcile Inventory action allows you to true up your inventory after doing a physical count. It sets the absolute quantity of an inventory line item as of a point in time in order to reset your SUPPLY inventory.

This article contains:

- [Where to find the Reconcile Inventory action](#where)
- [How to use the Reconcile Inventory action](#how)
- [The Change column](#change)

  - [How the Change column works](#change-how)
- [FAQ](#FAQ)

#### Where to find the Reconcile Inventory action

It can be accessed:

- From the ‘**Record inventory action**’ dropdown menu in the top navigation bar
- From the ‘**Record inventory action**’ dropdown menu in the Inventory by Location widget on the SKU Details Page

#### How to use the Reconcile Inventory action

1. Select the inventory line items in the Inventory Picker.
   *If a Reconcile inventory action is recorded from the Inventory by Location action menu then both the inventory line item and its location will be pre-selected.*
2. Enter the quantity of inventory. The amount entered should be the total quantity you physically counted, and must be a positive whole number (you may leave a field blank). Check the actual variance in [the Change column](#change)!
   ![Reconciliation_action](https://support.innovint.us/hs-fs/hubfs/Reconciliation_action.png?width=670&height=304&name=Reconciliation_action.png)

   💡*Use the “New Quantity” bulk dropdown menu to enter the current inventory quantity, clear all quantities or apply the same number of groups and items across all inventory.*
   💡*It is possible to record a "new" quantity that is the same as the existing quantity in inventory, i.e. confirm the existing count.*
   ![Reconciliation_Qty Menu](https://support.innovint.us/hs-fs/hubfs/Reconciliation_Qty%20Menu.png?width=359&height=231&name=Reconciliation_Qty%20Menu.png)
3. Click the green **‘Reconcile Inventory**’ button.

The reconciliation action is the only action in SUPPLY where the quantity that you enter is an **absolute number**.  This means that on a backdated action, you will enter the amount that was actually counted on that date. Any action submitted after this date will update according to this number.

💡 We recommend accessing the Reconcile Inventory action from the ‘**Record inventory action**’ dropdown menu in the top navigation bar when performing your routine physical counts (i.e. monthly, quarterly, etc). This will allow you to view all of your inventory line items at all locations, and therefore quickly true up your inventory across multiple SKUs and Locations at once.

#### About the Change column

See at a glance how far off your new inventory counts are from the current on-hand quantities with the **Change** column on the Reconcile inventory action. The column dynamically calculates the variance between each line item's on-hand inventory and the new quantity you enter, so you can confirm your adjustments in real time — no mental math required.

- Locate the **Change** column to the right of the **On hand** column in the action - you may need to scroll across the action to the right.
- The **Change** column shows the difference between the on-hand inventory and the new quantity entered for each inventory line item.
- As you enter new quantities, the Change column recalculates on the fly, making it easy to see how much inventory is being added to or removed from a line
- The Change column calculates the variance and rolls up/displays it as the largest grouping/item even when the new quantity is not a clean number of groups + items. For example: if your SKU's current on-hand inventory is 10 x 6-packs, and you record 10 6-packs and 13 bottles, then the Change column will show 2 x 6-packs, 1 bottle.

##### How the Change column works

*When recording an action, the Change column populates as soon as inventory line items are selected and updates live as you enter new quantities.*

- Because the **New quantity** input boxes always default to zero when line items are first selected, the Change column will always initially display the full negative of the on-hand inventory.
  ![Reconciliation_Change column](https://support.innovint.us/hs-fs/hubfs/Reconciliation_Change%20column.png?width=670&height=301&name=Reconciliation_Change%20column.png)
- Enter a value in the **New quantity** input boxes for each line item. The Change column updates in real time to reflect the new variance from the current on-hand quantity.

- If the new quantity matches the on-hand quantity exactly, the Change column displays **No change** for that line.

![Reconciliation_Change column2](https://support.innovint.us/hs-fs/hubfs/Reconciliation_Change%20column2.png?width=670&height=301&name=Reconciliation_Change%20column2.png)

*The Change column also appears on submitted Reconcile inventory actions and stays interactive if you edit the action.*

##### A few things to keep in mind

- **Negative value**s (e.g., - 2 cases, - 3 bottles) indicate the new quantity is *lower* than the on-hand quantity — inventory will be removed from the line when the action is submitted.
- **Positive valu**es (e.g., + 1 case, + 6 bottles) indicate the new quantity is *higher* than the on-hand quantity — inventory will be added to the line when the action is submitted.
- **No change** displays when the new quantity and on-hand quantity are equal.
- **Available** and **On order** columns are not affected by the Change column.
- **New quantity** values are captured and displayed on the recorded action exactly as entered by the user.
- The Change column is automatically calculated and cannot be edited directly. To change the variance, update the value in the **New quantity** input box for that line item.

#### FAQ

**Q: How does the Reconcile inventory action work with my C7 inventory?**

*A: When your C7 integration is setup, the Reconcile inventory action will post as a "Manual Reset" in your C7 inventory transactions for properly linked inventory.*

![C7 integrations - Manual Reset](https://support.innovint.us/hs-fs/hubfs/C7%20integrations%20-%20Manual%20Reset.png?width=670&height=34&name=C7%20integrations%20-%20Manual%20Reset.png)

**Q: Why do I have a Reconcile inventory action submitted by C7 integration?**

*A: If you perform a Reset inventory transaction in C7 on a linked SKU at a linked location, that will generate a Reconcile inventory action in SUPPLY for each involved (linked) SKU. Read more about how this C7 transaction posts into SUPPLY [here](/hc/en-us/supply-commerce7-integration#C7-IV).*

**Q: I edited an Add inventory action that occurred before my last Reconcile inventory action, but the final on-hand inventory hasn't updated - what gives?**

*A: The quantity recorded in the Reconcile inventory action is "absolute" as of that point in time, based on the physical count that took place. Any action edit or deletion that may have occurred prior to that will not change the absolute quantity updated on the Reconcile inventory action.*

**Q: Can I edit or delete my Reconcile inventory action?**

*A: Yes. Learn more about editing and deleting actions [here](https://support.innovint.us/hc/en-us/how-to-edit-or-delete-inventory-actions?hsLang=en).*

**Q: How does the Reconcile inventory action impact my TTB export?**

*A: SUPPLY will apply the quantity/volume to either Inventory Shortage, or Inventory Gains in Section B, depending on whether the **net** inventory increases or decreases in the action. This table describes the potential outcomes for your Reconcile inventory action:*

![Reconcile Inventory - TTB](https://support.innovint.us/hs-fs/hubfs/Reconcile%20Inventory%20-%20TTB.png?width=670&height=439&name=Reconcile%20Inventory%20-%20TTB.png)
