---
title: "How to Onboard Inventory in SUPPLY"
url: "https://support.innovint.us/hc/en-us/how-to-onboard-inventory-in-supply"
category: "SUPPLY"
section: "Getting Started with SUPPLY"
page_type: "page"
lastmod: "2025-11-20"
gist: "The Onboard inventory action is used when onboarding into SUPPLY and bringing in inventory that was previously tracked somewhere else."
tags: ["inventory", "migration", "getting-started", "packaging", "bond", "exports"]
---

# How to Onboard Inventory in SUPPLY

The **Onboard inventory** action is used when onboarding into SUPPLY and bringing in inventory that was previously tracked somewhere else. When inventory is onboarded in SUPPLY using this action, it will populate the “On Hand Beginning of Period” line within the TTB export.

This article contains:

- [Where to find the Onboard inventory action](#where)
- [How to use the Onboard inventory action](#how)
- [Video tutorial](#video)

If you are bottling, bond-to-bond transferring in, or adding taxpaid inventory, you should NOT use the **Onboard Inventory** action because it will not populate the correct line of the TTB export; instead you should record an [**Add Inventory**](https://support.innovint.us/hc/en-us/how-to-add-inventory?hsLang=en) action.

#### Where to find the Onboard inventory action

The Onboard Inventory action can be accessed:

- From the ‘**Record inventory action**’ dropdown menu in the top navigation bar
- From the ‘**More**’ dropdown menu on the SKU Details page
- From the ‘**Record inventory action**’ dropdown menu in the Inventory by Location widget on the SKU Details Page

The Onboard inventory action is normally activated for new SUPPLY account setup. Afterwards it should be disabled. If you do not see this action, please reach out to [support@innovint.us](mailto:support@innovint.us).

#### How to use the Onboard inventory action

1. Select the tax status of the inventory using the radio buttons.
2. Select the SKU(s) in the SKU Picker.
   1. If an Onboard inventory action is recorded from the SKU details page, the SKU will be pre-selected.
3. Select a location from the Location dropdown menu. Only the locations with the same tax status you chose in Step 1 will populate the dropdown menu.
   1. Use the “Location” bulk dropdown menu to clear all selected locations or apply a location to all SKUs.
   2. If an Onboard inventory action is recorded from the Inventory by Location action menu then both the SKU and the location will be pre-selected.
4. Enter the quantity of inventory.
   1. Use the “Quantity” bulk dropdown menu to clear all quantities or apply the same number of groups and items across all SKUs.
5. Click the green **‘Onboard Inventory**’ button.

**![How to Onboard Inventory_Annotated](https://support.innovint.us/hs-fs/hubfs/How%20to%20Onboard%20Inventory_Annotated.jpg?width=688&height=177&name=How%20to%20Onboard%20Inventory_Annotated.jpg)**

For users implementing the [Commerce7 integration](https://support.innovint.us/hc/en-us/supply-commerce7-integration?hsLang=en), we recommend linking all SUPPLY and C7 inventory locations & SKUs prior to onboarding inventory in SUPPLY. This allows you to update and reconcile inventory between SUPPLY and C7 at the outset.

If the SUPPLY SKU has no inventory and the C7 product *does* have inventory when the product is linked, then the initial onboard/add inventory action for the SUPPLY SKU will override the inventory amount in C7 for that location.

However, if *both* the SKU and C7 product have inventory but they don't match, the initial product linkage will fail.

#### Video Tutorial
