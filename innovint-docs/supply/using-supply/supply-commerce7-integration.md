---
title: "SUPPLY + Commerce7 Integration"
url: "https://support.innovint.us/hc/en-us/supply-commerce7-integration"
category: "SUPPLY"
section: "Using SUPPLY"
page_type: "page"
lastmod: "2026-07-01"
gist: "InnoVint's SUPPLY product aims to provide a single source of truth for your case goods inventory."
tags: ["integrations", "inventory", "packaging", "bond", "ux-friction", "configuration"]
---

# SUPPLY + Commerce7 Integration

InnoVint's SUPPLY product aims to provide a single source of truth for your case goods inventory. We all know that double-entry into two or more system leads to mistakes and extra work; the SUPPLY integration with Commerce7 (C7) is built to eliminate double entry and bring accuracy to your inventory within SUPPLY.

This article covers:

- [What does the SUPPLY-C7 integration do?](#What)
- [How to connect your SUPPLY account with Commerce7](#How)
  - [Things to know before you start](#before)
  - [Installing the SUPPLY app to C7](#install_app)
  - [How to link SUPPLY SKUs to C7 Products](#Link-SKU)
- [How SUPPLY updates C7](#IV-C7)
- [How C7 updates SUPPLY](#C7-IV)
- [Editing Integration actions](#edit)
- [FAQ](#faq)

### What does the SUPPLY-C7 integration do?

The SUPPLY-C7 integration works in both directions (SUPPLY <-> C7). SKUs within locations in SUPPLY are mapped and linked to products and your inventory locations in Commerce7.

When orders are placed in Commerce7, they automatically deplete from SUPPLY inventory locations upon fulfillment.  As inventory is replenished in SUPPLY locations, it instantly updates in Commerce7 — no manual entry needed.

### How to connect your SUPPLY account with Commerce7

#### Things to know before you start

- **Units**

  - Inventory across the systems will be tracked in their respective units.  C7 will always be tracked in bottles and SUPPLY will always be tracked by the designated format and grouping of your SKU.  The integration "converts" the inventory between the two platforms automatically.
- **Types of locations and SKUs that can be linked**
  - Taxpaid and In-bond locations in SUPPLY may be linked to C7 locations

- **C7 Product and SUPPLY SKU facts**
  - The C7 product displayed in SUPPLY menu dropdowns is the “SKU” value from the C7 product setup
  - C7 products must only have one variant (i.e. 750ml OR 1.5L) in order to appear in the SUPPLY SKU C7 product dropdown
  - Only one C7 product may be linked with each SUPPLY SKU
  - Only one SUPPLY SKU may be linked with each C7 product
  - Only one C7 instance may be linked to SUPPLY
- **Linked Inventory**
  - Linking SKUs with on-hand inventory
    - If a SKU in SUPPLY already has added inventory, that inventory must match the existing quantity in C7 in order to link.
    - If the SUPPLY SKU has no inventory and the C7 product does have inventory when linking the product, then the initial onboard/add inventory action for the SUPPLY SKU will update the inventory amount in C7 for that location.
    - If the SUPPLY SKU and C7 product both have inventory, and it doesn't match, then the SKU linkage will fail.
  - The inventory in SUPPLY for a SKU at a linked location is equal to the C7 inventory quantity in 'Available for sale' PLUS the inventory quantity in 'Allocated.'  **The inventory in SUPPLY does not account for inventory quantity in 'Reserved.'**
    - When initially linking a SUPPLY SKU with a C7 product, the inventory quantity in SUPPLY must equal the sum of the inventory quantities in 'Available for sale' and 'Allocated' in order for the SKUs to link properly.
  - If a C7 product does not have Inventory turned on, it will not show in the SUPPLY drop-down

Don't forget! The product dropdown in SUPPLY will only display C7 products that:

- are not already linked to another SUPPLY SKU
- have Inventory turned on (in C7)
- have only one product variant in C7

#### Step 1 - Install the InnoVint App

Get started by installing the InnoVint SUPPLY app in your C7 platform. Check out the quick how-to video below!

#### Step 2 - Link Locations

A working integration first requires that your inventory locations in C7 be mapped to locations within SUPPLY. *Only inventory **within** linked locations will update between the systems.*

First, create (or confirm the existence of) your inventory locations in Commerce7.

![C7 integration-locations in C7](https://support.innovint.us/hs-fs/hubfs/C7%20integration-locations%20in%20C7.png?width=670&height=363&name=C7%20integration-locations%20in%20C7.png)

Next, map these locations to your locations in SUPPLY.

InnoVint Support sets up this connection on the backend at account setup. Please provide your list of C7 inventory locations mapped to desired SUPPLY locations via [support@innovint.us](mailto:support@innovint.us). These relationships should be created at the same you set up your SUPPLY account, or if you need to add or update these at any point, reach out to Support.

We strongly recommend linking known Commerce7 locations when you set up SUPPLY and before adding inventory to SUPPLY

![C7 integrations (locations)](https://support.innovint.us/hs-fs/hubfs/C7%20integrations%20(locations).png?width=403&height=334&name=C7%20integrations%20(locations).png)**Is your location already linked?**

In order to see if a location has already been linked, you need to check in SUPPLY.  The linkage is not visible in C7.

Linked locations in SUPPLY are noted by the C7 logo next to locations in menu dropdowns (in actions) and the Inventory by location widget in the SKU details page.

![C7 intergations (inventory-locations)](https://support.innovint.us/hs-fs/hubfs/C7%20intergations%20(inventory-locations).png?width=670&height=179&name=C7%20intergations%20(inventory-locations).png)

#### Step 3. Link the SUPPLY SKU to a Commerce7 Product

You can link your SUPPLY SKUs to a C7 product either at SKU creation, or later on, by editing the SKU.

**Link at SKU creation**

When adding the SKU, just check the box:

![C7 Integration-Add SKU connection](https://support.innovint.us/hs-fs/hubfs/C7%20Integration-Add%20SKU%20connection.png?width=350&height=458&name=C7%20Integration-Add%20SKU%20connection.png)

When you check the "Link to a C7 product," you will see a dropdown menu of available C7 products to link. You must select an existing C7 product from the dropdown - you cannot create a new one via SUPPLY.

![C7 integration-add C7 product](https://support.innovint.us/hs-fs/hubfs/C7%20integration-add%20C7%20product.png?width=350&height=148&name=C7%20integration-add%20C7%20product.png)

If no C7 products display, try typing in the C7 product code.  If no products appear, please check the following:

- You have Inventory initialized on the C7 product
- You have not already linked the C7 product to another SUPPLY SKU
- You have only one product variant created in C7

**Link after SKU creation**

Go to "Edit C7 Product" in the SKU details page via the More menu on a previously created SKU:

![C7 integration-edit SKU-C7 product](https://support.innovint.us/hs-fs/hubfs/C7%20integration-edit%20SKU-C7%20product.png?width=670&height=142&name=C7%20integration-edit%20SKU-C7%20product.png)

You'll see the same Edit C7 Product screen that will allow to link to a new product, or unlink/edit an existing product.

If a SKU in SUPPLY is linked with a product in C7 and the SUPPLY SKU has no inventory and the C7 product does have inventory, the **initial** **onboard/add inventory action for the SUPPLY SKU will update the available inventory amount in C7 for that location**.

If a SUPPLY SKU is already linked to a C7 product,  you will be able to unlink the inventory by unchecking the box.

![C7 integration-unlink SKU](https://support.innovint.us/hs-fs/hubfs/C7%20integration-unlink%20SKU.png?width=263&height=108&name=C7%20integration-unlink%20SKU.png)

A successful linkage for a SKU will show the C7 product linked in the SKU attributes. A linked inventory location and any linked inventory actions will show the C7 logo on the SKU details page:

![C7 integration - successful SKU linkage](https://support.innovint.us/hs-fs/hubfs/C7%20integration%20-%20successful%20SKU%20linkage.png?width=670&height=255&name=C7%20integration%20-%20successful%20SKU%20linkage.png)

### How SUPPLY updates C7

Once a SKU and location in SUPPLY are linked to a product and inventory location in Commerce7, actions recorded in SUPPLY are reflected via inventory transactions on inventory in Commerce7.

All inventory actions in SUPPLY will display in the Inventory Transaction report in C7, with the following information.

- **Details**: Manual reset of ‘SKU’
- **Notes**: Inventory transaction performed by InnoVint SUPPLY integration
- **[Add](https://support.innovint.us/hc/en-us/how-to-add-inventory?hsLang=en) or [onboard](https://support.innovint.us/hc/en-us/how-to-onboard-inventory-in-supply?hsLang=en) inventory** in SUPPLY on SKU A in Location B
  —> Inventory transaction in C7 to adjust inventory up for Product A in Location B by the appropriate number of bottles
  —> If the SUPPLY SKU has no inventory (i.e. at SKU set-up) and the C7 product does have inventory, this **initial** onboard/add inventory action for the SUPPLY SKU will trigger an Inventory transaction in C7 that updates the inventory amount in C7 for that location.
- **[Move](https://support.innovint.us/hc/en-us/how-to-move-or-deplete-inventory?hsLang=en#move-inventory) inventory** in SUPPLY on SKU B from Location C to Location D
  —> Inventory transaction in C7 to transfer inventory for Product B from Location C to Location D by the appropriate number of bottles
- **[Deplete](https://support.innovint.us/hc/en-us/how-to-move-or-deplete-inventory?hsLang=en#deplete-inventory) inventory** in SUPPLY on SKU C from Location E
  —> Inventory transaction in C7 to adjust inventory down for Product C in Location E by the appropriate number of bottles
- **[Reconcile](/hc/en-us/how-to-reconcile-inventory?hsLang=en) inventory** in SUPPLY for SKUs A, B and C in Location E
  —> Inventory transaction in C7 to adjust inventory either up or down for each SKU depending on the variance in the quantity.
- The integration from SUPPLY to C7 updates in real-time ✅

Inventory actions in SUPPLY are recorded as of a point in time, and maintain a concept of the event "stream in time". Users can edit and delete actions in SUPPLY virtually without restriction. Any transactions or edits in SUPPLY (even past actions) will be applied to *current* inventory in Commerce7.

Inventory from SUPPLY will sync with C7 every night. SUPPLY is considered the source of truth, and inventory in SUPPLY will override that in C7 if there are discrepancies between the platforms.

Back to [top](#top)

### How C7 updates SUPPLY

Once a SKU and location in SUPPLY are linked to a product and inventory location in Commerce7, inventory transactions on C7 products in linked locations will record an action in SUPPLY on the linked SKU.

Additionally, for linked SKUs at linked locations in SUPPLY, the SKU's "On order - C7" status will reflect the ‘allocated’ inventory quantities displayed in C7.

Four types of transactions in C7 will reflect in SUPPLY: Adjust inventory, Transfer inventory, Reset inventory, and order Fulfillment. These will reflect as follows:

- **Adjust inventory** transaction in C7 on Product C in Location D:
  - In C7, this transaction increases/decreases inventory bottle count for the product in the location.
  - For Taxpaid SUPPLY Locations: an Add inventory OR Deplete inventory action in SUPPLY for SKU C in Location D (depending on whether inventory is going up or down)
    - Cancellation of a prior fulfillment in C7 will also trigger an Add inventory action in SUPPLY.  The corresponding C7 order number will display on the submitted Add inventory action in SUPPLY.
  - For In-bond SUPPLY locations
    - If the inventory goes up: Add inventory action in SUPPLY with the reason of ‘compliance reason not set’
    - If the inventory goes down NOT due to fulfilling an order:  ‘Deplete Inventory - Other’ action where the compliance reason is ‘compliance reason not set’
- **Transfer inventory** transaction in C7 on Product E from Location X to Location Y:
  - In C7, this transaction moves inventory from one location to another.
  - In SUPPLY, this creates a deplete inventory action and corresponding add inventory action in the respective locations: thus, a Deplete inventory action in SUPPLY for SKU E from Location X and an Add inventory action for SKU E at Location Y.
    - If this occurs between locations of differing tax status, the In-bond location's action will have the compliance reason field showing ‘compliance reason not set’.
- **Depletions due to order fulfillment** in Commerce7 on inventory in a linked location
  - For Taxpaid Locations: if the inventory on the order is for a Product/location linked to a SUPPLY SKU/location that is Taxpaid, these will trigger a ‘Deplete Inventory - Sale’ action in SUPPLY. The C7 order number will display on the submitted depletion action in SUPPLY.
    - Cancellation of a prior fulfillment in C7 will trigger an Add inventory action in SUPPLY.  The corresponding C7 order number will display on the submitted Add inventory action in SUPPLY.

- - For In-bond Locations:  if the inventory on the order is for a Product/location linked to a SUPPLY SKU/location that is In-bond, it will result in a 'Deplete Inventory - Sale' action where the in-bond inventory will be marked *removed taxpaid*
- **Reset inventory** in C7 sets an absolute inventory count for a product in a location. It can be completed three ways: *Reset inventory action* on a single SKU/location; *Bulk edit inventory* on multiple SKUs/locations, and the *CSV import inventory* on multiple SKUs/locations

- - Each of these methods creates a **Reconcile inventory** action in SUPPLY for linked SKUs at linked locations
    - This is applicable for Available for Sale inventory changes only. *Reserve inventory is not considered by SUPPLY*.
    - When resetting multiple SKU/location combinations at once, a separate Reconcile inventory action is created in SUPPLY for each SKU/location combination.

- - For in-bond locations: the inventory increase or decrease from the Reconcile inventory action will be recorded on the 'Inventory gains' or 'Inventory losses' lines on the TTB report, the same as a manually submitted Reconcile action in SUPPLY
  - Deleting a Reconcile action submitted by the C7 integration in SUPPLY will update inventory in both SUPPLY and Commerce7

- The integration from C7 to SUPPLY updates every 5 minutes ✅
- Submitted actions in SUPPLY that are a result of an inventory transaction in Commerce7 will show the user as “C7 Integration” with the C7 icon.
- Actions in SUPPLY that are completed by the C7 integration are not editable, but are deletable, with the exception of Add inventory and Deplete inventory actions. These actions allow you to edit the reason/compliance reason.
- The amount of "Allocated" inventory on a linked SKU in a linked location in C7 will display as "On order - C7" on the SKU in SUPPLY

Turn inventory off - if this is selected, use cannot view inventory or record inventory transactions in C7.  SUPPLY actions will have no effect on this product when inventory is off.

![](https://support.innovint.us/hs-fs/hubfs/image-png-Mar-24-2026-06-33-25-1489-PM.png?width=670&height=366&name=image-png-Mar-24-2026-06-33-25-1489-PM.png)

Edit the C7 Product to Turn Inventory On and Initialize Inventory.

![](https://support.innovint.us/hs-fs/hubfs/image-png-Mar-24-2026-06-32-24-4617-PM.png?width=670&height=458&name=image-png-Mar-24-2026-06-32-24-4617-PM.png)

Back to [top](#top)

### Editing Integration actions

You may edit or delete any actions submitted by a SUPPLY user, but edits are limited on actions submitted by the integration

- Editing or deleting an inventory action in SUPPLY that affects inventory at a C7-linked location(s) triggers a new inventory transaction in C7 to bring current inventory to the correct quantity
  - That C7 inventory transaction will update current inventory and will be recorded in Commerce7 in real-time (it will not be backdated to match the original SUPPLY inventory action date)
- You may delete actions recorded in SUPPLY by the C7 Integration. This will also result in a corrective inventory transaction in C7.
- You may edit Add inventory and Deplete inventory actions submitted by C7 but you **may only** edit the reason/compliance reason for these actions.

Note: Inventory transactions in Commerce7 are also recorded as of a point in time but the user cannot backdate, edit, or delete them.

### FAQ

**Q: I've turned Inventory Off in C7 - what will that do?**

*A: Nothing should change with your SUPPLY inventory, but it will no longer synch with the C7 product.*

**Q: I can't see the C7 product in the dropdown**

*A: The Product dropdown displays with all Commerce7 products that:*

- *are not already linked to another SUPPLY SKU*
- *have Inventory turned on (in C7)*
- *have only one product variant in C7*

**Q: I have more than one C7 account - how do I link to the correct version?**

*A: Currently, SUPPLY only support linking to a single C7 account.*

Back to [top](#top)
