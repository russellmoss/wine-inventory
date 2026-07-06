---
title: "How to Edit or Delete Inventory Actions"
url: "https://support.innovint.us/hc/en-us/how-to-edit-or-delete-inventory-actions"
category: "SUPPLY"
section: "Actions in SUPPLY"
page_type: "page"
lastmod: "2026-06-29"
gist: "All submitted inventory actions can easily be edited and deleted using the “Edit Action” and “Delete Action” buttons in the top right corner."
tags: ["inventory", "corrections", "ux-friction", "integrations", "packaging"]
---

# How to Edit or Delete Inventory Actions

All submitted inventory actions can easily be edited and deleted using the “Edit Action” and “Delete Action” buttons in the top right corner.

This article will walk you through:

- [How to Edit an Inventory Action](#edit-inventory-action)
- [How to Delete an Inventory Action](#delete-inventory-action)
- [Editing and Deleting Actions involving Commerce7 Inventory](#C7)
- [FAQ](#faq)

### How to Edit an Inventory Action

1. Access a submitted inventory action via the SKU details page.
2. Click the “Edit action” button at the top right of the action details page. ![How to Edit or Delete Inventory Actions_Action Details Page_Edit_annotated](https://support.innovint.us/hs-fs/hubfs/How%20to%20Edit%20or%20Delete%20Inventory%20Actions_Action%20Details%20Page_Edit_annotated.jpg?width=670&height=172&name=How%20to%20Edit%20or%20Delete%20Inventory%20Actions_Action%20Details%20Page_Edit_annotated.jpg)
3. Once you click on "Edit action," fields that are possible to edit will show as available for text entry or selection. These available fields may vary by action. ![How to Edit or Delete Inventory Actions_Edit action_Annotated](https://support.innovint.us/hs-fs/hubfs/How%20to%20Edit%20or%20Delete%20Inventory%20Actions_Edit%20action_Annotated.jpg?width=670&height=189&name=How%20to%20Edit%20or%20Delete%20Inventory%20Actions_Edit%20action_Annotated.jpg)
4. Once you finish editing the action, click “Save action” to save the action with the updated information.
   1. Clicking “Cancel edit” removes all changes made in the edit mode and returns the action to the original action details screen.
   2. Actions can also be deleted from within the edit screen by clicking the “Delete action” button in the top right.

Once an action has been edited, the original submitted date and time will display, along with the edited date and time. A ‘Version’ dropdown will also display, allowing you to select and view the current version of the action or an earlier version from a previous date and time. ![How to Edit or Delete Inventory Actions_Edited action version_annotated](https://support.innovint.us/hs-fs/hubfs/How%20to%20Edit%20or%20Delete%20Inventory%20Actions_Edited%20action%20version_annotated.jpg?width=670&height=175&name=How%20to%20Edit%20or%20Delete%20Inventory%20Actions_Edited%20action%20version_annotated.jpg)

Actions in SUPPLY that are more than 430 days (14 months) old cannot be edited.

'Add Inventory' and 'Deplete Inventory - Other' actions created by the C7 Integrations user (generated in SUPPLY by the Commerce7 Integration), allow limited edits to the compliance reason, but not to the depletion type, or the inventory line items or quantity. Learn more about impacts of editing inventory actions with C7 linked inventory [here](#C7).

### How to Delete an Inventory Action

1. Access a submitted inventory action via the SKU details page.
2. Click the “Delete action” button at the top right of the action details page. A pop-up window will appear to verify the deletion. ![How to Edit or Delete Inventory Actions_Delete action pop up_annotated](https://support.innovint.us/hs-fs/hubfs/How%20to%20Edit%20or%20Delete%20Inventory%20Actions_Delete%20action%20pop%20up_annotated.jpg?width=670&height=177&name=How%20to%20Edit%20or%20Delete%20Inventory%20Actions_Delete%20action%20pop%20up_annotated.jpg)
3. Click “Yes, delete” to delete. Otherwise click “Cancel” to close the window.

Users in SUPPLY may delete actions submitted in SUPPLY by the integration from C7 (i.e. recorded by "C7 Integration"). Find out how that impacts your C7 inventory [below](#C7).

🚨 Editing and deleting inventory actions in SUPPLY will cause any changes to flow through to downstream actions and may result in changes to tax status, inventory counts and locations. Note that if a Reconcile Inventory action has been recorded after the edited or deleted action, the new quantity count submitted in the Reconcile Inventory action will not update, but the *Change* associated with the prior actions will.

Editing and Deleting Actions involving Commerce7 Inventory

#### **Editing actions**

Editing an inventory action in SUPPLY that affects inventory at C7-linked location(s) triggers a new inventory transaction in C7 to bring current inventory to the edited quantity.

- You may edit or delete any actions on inventory items that are linked to C7 and submitted by a SUPPLY user
- You *may not* edit depletion types, inventory line items or quantities on actions submitted in SUPPLY by the integration from C7 (these show as recorded by "C7 Integration")
- You may edit the “Reason” on ‘Add inventory’ and “Compliance reason” on ‘Deplete inventory - Other’ actions on inventory at in-bond locations submitted by C7
- When an action in SUPPLY is edited, the resulting outcome of changes to inventory will be reflected in a new inventory transaction in Commerce7. That inventory transaction will update current C7 inventory and will be recorded in Commerce7 in real-time (it will not be backdated to match the SUPPLY inventory action date)

Inventory transactions in Commerce7 cannot be backdated, edited, or deleted. Any transactions or edits in SUPPLY will be applied to current inventory in Commerce7.

#### **Deleting actions**

Although you may not edit them, users in SUPPLY may *delete* actions submitted in SUPPLY by the integration from C7 (recorded by "C7 Integration").

Deleting an inventory action in SUPPLY that affects inventory at C7-linked location(s) triggers a new inventory transaction in C7 to bring current inventory to the correct quantity in SUPPLY.

### FAQ

**Q. Ooops! I accidentally deleted an action. Is there any way for InnoVint Support to recover it on the back-end?**

*A. No, unfortunately once an inventory action is deleted, there is no way for us to recover it.*
