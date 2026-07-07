---
title: "How to Move or Deplete Inventory"
url: "https://support.innovint.us/hc/en-us/how-to-move-or-deplete-inventory"
category: "SUPPLY"
section: "Actions in SUPPLY"
page_type: "page"
lastmod: "2026-03-24"
gist: "The Move and Deplete inventory actions allow you to easily update your current inventory across locations."
tags: ["inventory", "dtc-sales", "packaging", "tax-class", "bond", "integrations"]
---

# How to Move or Deplete Inventory

The Move and Deplete inventory actions allow you to easily update your current inventory across locations. This article covers:

- [How to Move Inventory](#move-inventory)
  - [Video Tutorial](#move-inventory-video)
- [How to Deplete Inventory or move it to On Order](#deplete-inventory)
  - [How to Record a Depletion or Create an Open Depletion for On-Order Inventory](#How-to-record-depletion-on-order)
  - [Editing or Submitting an Open Depletion](#edit-submit-open-depletion)
- [How Inventory actions in SUPPLY integrate to Commerce7](#C7)

### How to Move Inventory

The Move inventory action allows you to move inventory between locations and can be accessed:

- From the ‘**Record inventory action**’ dropdown menu in the top navigation bar
- From the ‘**Record inventory action**’ dropdown menu in the Inventory by Location widget on the SKU Details Page

1. Select the inventory in the Inventory Picker.
   *If a Move Inventory action is recorded from the SKU details page/Inventory by Location widget, the SKU and location will be pre-selected for the action.*
2. Enter the quantity of inventory to move.
   *TIP! Use the “Quantity” bulk dropdown menu to enter the current inventory quantity, clear all quantities or apply the same number of groups and items across all SKUs.*
3. Select a location from the Location dropdown menu.
   *If a Move Inventory action is recorded from the SKU details page/Inventory by Location widget, the  location will be pre-selected for the action.*
4. Depending upon the tax status of both the inventory and its location, any changes to the tax status will display under the Tax Status section.
   *Review the Tax status section to understand how the movement will impact the TTB export (for instance, moving inventory from an in-bond location to a taxpaid location will result in the inventory populating Section B as Remove Taxpaid). See [this article](https://support.innovint.us/hc/en-us/how-does-supply-populate-the-ttb-report?hsLang=en) on how SUPPLY populates the TTB export.*
5. Click the green **‘Move Inventory**’ button.

**![How to Move Inventory_Annotated](https://support.innovint.us/hs-fs/hubfs/How%20to%20Move%20Inventory_Annotated.jpg?width=670&height=204&name=How%20to%20Move%20Inventory_Annotated.jpg)**

🚨 Moving inventory between locations may have compliance implications including transfers in bond, taxpaid removals, and taxpaid wine returned to bond. Carefully review the Tax Status section to understand possible compliance changes.

#### Video Tutorial

### How to Deplete Inventory or move it to On-Order

The **Deplete Inventory action** allows you to remove inventory, or mark it as "On order" with an Open depletion task. It can be accessed:

- From the ‘**Record inventory action**’ dropdown menu in the top navigation bar
- From the ‘**Record inventory action**’ dropdown menu in the Inventory by Location widget on the SKU Details Page

**How to record a depletion or create an open depletion for "on order" inventory**

1. Select the depletion type using the radio buttons.
   *If “Other depletion” is selected, choose the appropriate reason. The reason selected will appropriately populate the correct line on the TTB Report for the depletion of inventory that is in-bond.  If you choose 'Compliance reason not set' then this action will not be mapped to any line of the TTB Report, but will be surfaced in the 'Actions with compliance reason not set' section of the TTB export.*
2. Select the inventory in the Inventory Picker.
   *If a Deplete Inventory action is recorded from the SKU details page/Inventory by Location widget, the SKU and location will be pre-selected for the action.*
3. Enter the quantity of inventory to deplete.
   TIP! *Use the “Quantity” bulk dropdown menu to enter the current inventory quantity, clear all quantities or apply the same number of groups and items across all SKUs.*
4. Review the tax status or compliance reason section to confirm that everything is correct. See [this article](https://support.innovint.us/hc/en-us/how-does-supply-populate-the-ttb-report?hsLang=en) on how SUPPLY populates the TTB export.
5. Decide whether you will a)  mark the inventory as "on-order" and create an open depletion, or b) record the depletion now.

   ![SUPPLY - On-order - Depletion](https://support.innovint.us/hs-fs/hubfs/SUPPLY%20-%20On-order%20-%20Depletion.png?width=670&height=265&name=SUPPLY%20-%20On-order%20-%20Depletion.png)
   1. Choose **Create open depletion**

      **Note:** You cannot backdate an Open depletion. If the Backdate action is checked, the Create open depletion button will be greyed out.

      Creating an open depletion saves the action in an “open” state and adds it to the Open depletions explorer.
   2. Choose the the green ‘Deplete Inventory’ button.

      Inventory will be depleted as of the time of submission or chosen backdate.![SUPPLY - on-order depletion tax status](https://support.innovint.us/hs-fs/hubfs/SUPPLY%20-%20on-order%20depletion%20tax%20status.png?width=670&height=258&name=SUPPLY%20-%20on-order%20depletion%20tax%20status.png)

🚨 Depleting inventory may have compliance implications including transfers in bond, taxpaid removals, etc. Carefully review the Tax Status or Compliance Reason section to understand possible compliance changes.

**Editing or submitting an open depletion**

1. Navigate to the Open Depletion, via the **Open Depletions Explorer.**
   **![SUPPLY - open depletions](https://support.innovint.us/hs-fs/hubfs/SUPPLY%20-%20open%20depletions.png?width=670&height=216&name=SUPPLY%20-%20open%20depletions.png)**
2. Click on the open depletion task from the Open depletions screen.  All fields will be open and editable for any changes prior to submission.
   ![SUPPLY - Edit or submit open depletion](https://support.innovint.us/hs-fs/hubfs/SUPPLY%20-%20Edit%20or%20submit%20open%20depletion.png?width=670&height=302&name=SUPPLY%20-%20Edit%20or%20submit%20open%20depletion.png)
3. You may make any desired edits to the selected inventory, quantity or depletion type and **Save the open depletion** to leave inventory on order.
4. When you are ready to fulfill and remove inventory, click the **Deplete inventory** button:
   ![Success message - SUPPLY](https://support.innovint.us/hs-fs/hubfs/Success%20message%20-%20SUPPLY.png?width=347&height=81&name=Success%20message%20-%20SUPPLY.png)
5. Upon submission, any inventory that was previously on-order via the action will be depleted and removed from the "On order" status. The action will no longer display in the Open depletions explorer - you will instead find it in your Action History Feed or on the SKU details page with the added description "Via open depletion"!
   ![SUPPLY - submitted open depletion](https://support.innovint.us/hs-fs/hubfs/SUPPLY%20-%20submitted%20open%20depletion.png?width=670&height=230&name=SUPPLY%20-%20submitted%20open%20depletion.png)

Want to know more about how "On order" status works? Check out the full article [here](https://support.innovint.us/hc/en-us/supply-on-order-status?hsLang=en).

### How Inventory actions in SUPPLY integrate to Commerce7

Once a SKU and location in SUPPLY are linked to a product and inventory location in Commerce7, inventory actions recorded in SUPPLY are reflected via inventory transactions on products in Commerce7. The integration from SUPPLY to C7 updates in real-time.

**Open depletions** created in SUPPLY do not link to C7, and remain "Available for Sale" in C7.

![On-order - SKU details](https://support.innovint.us/hs-fs/hubfs/On-order%20-%20SKU%20details.png?width=670&height=171&name=On-order%20-%20SKU%20details.png)

Learn more about how SUPPLY inventory actions update in C7 in [this article](https://support.innovint.us/hc/en-us/supply-commerce7-integration?hsLang=en#IV-C7)!

Learn more about On order status works in SUPPLY in [this article!](https://support.innovint.us/hc/en-us/supply-on-order-status?hsLang=en)
