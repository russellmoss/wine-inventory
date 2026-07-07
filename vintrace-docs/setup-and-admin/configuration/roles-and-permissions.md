---
id: "32303349421588"
title: "Roles and Permissions"
url: "https://support.vintrace.com/hc/en-us/articles/32303349421588-Roles-and-Permissions"
category: "Setup and Admin"
section: "Configuration"
created_at: "2024-11-20T15:52:33Z"
updated_at: "2026-03-05T19:08:54Z"
labels: ["estate", "privileges", "login", "wp-faq-4670", "permission"]
gist: "If your account has single sign-on (SSO) enabled, refer to our Managing System Users (SSO enabled) article for details on managing system users and the available roles and permissions."
tags: ["permissions", "barrels", "configuration", "lab", "harvest", "work-orders"]
---

# Roles and Permissions

If your account has single sign-on (SSO) enabled, refer to our [Managing System Users (SSO enabled)](https://support.vintrace.com/hc/en-us/articles/32301350444180) article for details on managing system users and the available roles and permissions.

[Individuals, system users, and organizations in your address book](https://support.vintrace.com/hc/en-us/articles/32301367488788) can be assigned one or more roles. [Roles](#User_Roles) control the lists and searches where the contact will be included as an option. For example, assigning an organization the Cooper role includes the organization in the Cooper list when you're adding a barrel.

![Organization_with_Cooper_Role_20201109.png](https://support.vintrace.com/hc/article_attachments/32329115114004)

[System users](https://support.vintrace.com/hc/en-us/articles/32303348674196) can also be assigned [permissions](#User_Permissions) that allow the user to perform specific tasks and operations.

The roles and permissions assigned to a contact are managed from the [Address Book](https://support.vintrace.com/hc/en-us/articles/32301367488788).

![Create Basic System User Widget - Roles and Permissions 20240401.png](https://support.vintrace.com/hc/article_attachments/32329140296212)

## Roles

Roles provide a way to categorize contacts so that they display in different parts of vintrace. For example, granting a system user the Operator role includes the user in dropdown lists and searches for operational work. The roles that are available will differ for individuals, system users, and organizations.

| Contact Type | Available Roles |
| --- | --- |
| Individual | - Lab technician - Owner - Winemaker |
| [System User](https://support.vintrace.com/hc/en-us/articles/32303348674196) | - Lab technician - Owner - Winemaker |
| Organization | - Carrier - Cooper - Customer - Distributor - Grower - Harvester - Laboratory - Owner - Vendor |

Roles do NOT control what the system user is able to do. The tasks and operations available to a system user is controlled by their [permissions](#User_Permissions).

## Permissions

Permissions only apply to system users.

The tasks and operations that a system user can perform are controlled by their permissions. Some [permissions are selected by default](#h_01FVFBAWYEZSMWCWCBYGYG071F) for new users.

### Advanced Data Management

Assigned by default to new users. Allows the system user to:

- Maintain stock item batches/lots.
- Perform Operations > Admin > Change batch, Import product.
- Reverse dispatch operations.
- Move items between lots in Inventory > Move operation.
- Correct, reverse, and change date for completed inventory operations.
- Correct and fix date for completed winery operations.

### Advanced Lab Data Management

Allows the system user to:

- Reverse all entries in Lab Console.
- Edit or delete entries in Lab Console.

### All Winery Access

Allows the system user to switch between winery facilities. When this permission is disabled, the user can only view details for their default winery.

### Can Add/Edit Allocation Products

Allows the system user to:

- Add new products for use in the bulk wine and stock allocations
- Add a new vintage and product combination for use in the bulk wine and stock allocations

### Can Add/Edit Vineyards, Growers, Blocks

Assigned by default to new users. Allows the system user to add and edit [vineyards](https://support.vintrace.com/hc/en-us/articles/32301351350420), [growers](https://support.vintrace.com/hc/en-us/articles/32301351385364), and [blocks](https://support.vintrace.com/hc/en-us/articles/32303262299284).

### Can Add/Edit Vessels

Assigned by default to new users. Allows the system user to add and edit barrels, bins, cages, tanks, and tankers.

### Can Add Costs on Receival

Allows the system user to add or correct costs when receiving inventory stock items.

Available starting with [vintrace 9.4.3](https://support.vintrace.com/hc/en-us/articles/32303276816020).

### Can Add Product Notes

Assigned by default to new users. Allows the system user to add notes to a product

### Can Add/Edit Trial Blends

Allows the system user to add and edit trial blends

### Can Adjust Allocation Product Status

Allows the system user to change an allocated product's status.

Available starting with [vintrace 9.9.1](https://support.vintrace.com/hc/en-us/articles/32303283058068).

### Can Adjust Costs

Allows the system user to manually adjust/add costs to bulk wine, cased goods and other inventory items.

### Can Adjust Live Bond Details

Allows the system user to change the bond details for an active Winery or AP.

### Can Adjust Raw Wine Stock Items

Allows the system user to edit the bill of materials for raw wine stock items.

### Can Adjust Tax State

Allows the system user to move bulk wine or cased goods from non-declared to bonded.

### Can Adjust Work Order Status Backwards

Allows the system user to revert the work order to a previous status. When this feature is enabled, the work orders progress with the following statuses:

- Draft
- Ready
- In Progress
- Submitted
- Completed

All jobs in the work order will revert back to the specified status.

Available starting with vintrace 9.10.1.

### Can Bypass Packaging Rules for Stock Items

Allows the system user to bypass including glass with an item.

### Can Change Ownership of Wines

Allows the system user to change the ownership for a Change Ownership operation and Change Batch operation, and edit a batch's owner.

### Can Change Winery Defaults

Allows the system user to:

- Change Winery defaults in Winery Setup > Workflow > Defaults > Winery tab.
- Change System defaults in Winery Setup > Workflow > Defaults > System tab if Local vintrace Admin permission is assigned.
- [Manage the items that are available to wineries](https://support.vintrace.com/hc/en-us/articles/32301304791316).

### Can Close Off a TTB702 Period and Backdate Into a Closed Off TTB702 Period

Allows the system user to enter backdated entries that have a 702 effect even though the TTB702 has been marked as “I plan to submit this TTB report to the TTB”.

![TTB_Report_-_I_Plan_to_Submit_this_TTB_Report_to_the_TTB_Checkbox_20220725.png](https://support.vintrace.com/hc/article_attachments/32329115100436)

### Can Dispatch Non-Declared Wine

Allows the system user to dispatch non-declared wines.

This permission is available starting with [vintrace 9.4.3](https://support.vintrace.com/hc/en-us/articles/32303276816020), but it is not enabled by default. If you would like to use this permission, please contact our support team.

### Can Edit Batch Costs Tracked (%)

Allows the system user to [specify the percentage of a wine’s cost that will remain with the batch](https://support.vintrace.com/hc/en-us/articles/32301312791828-Adding-a-Wine-Batch#cost_tracked_field).

This permission is available starting with [vintrace 9.4.3](https://support.vintrace.com/hc/en-us/articles/32303276816020), but it is not enabled by default. If you would like to use this permission, please contact our support team.

### Can Edit Existing Product Notes

Allows the system user to edit notes added to a product.

### Can Edit Tax Volume Events

Allows the system user to edit TTB reportable volumes (does not change the batch volume).

### Can Force Lock Removal

Allows the system user to bypass the lock when vessels, batches and operation vessel/batch are opened by the same or different users.

### Can Manage Client Billing

Allows the system user to manage all aspects of client billing (with billing module enabled).

### Can Manage Grower Contract

Allows the system user to access and manage grower contracts.

### Can Manage Product Allocations

Allows the system user to access and manage bulk wine and stock allocations. This permission is applicable to the Small Estate plan and above, or for previous plans with the Inventory module enabled.

### Can Manage Purchase Orders

Allows the system user to access and manage purchase orders.

### Can Manage Sales Orders

Allows the system user to access and manage sales orders.

### Can Manage vintrace Subscription

Allows the system user to request changes to the vintrace subscription such as the number of user licenses, owner logins, AP licenses, and available modules.

### Can Manipulate Active BOMs

Allows the system user to change a Bill Of Materials for a cased goods item that already has stock on hand or transactions.

### Can Move Wine Between Bonds

Allows the system user to move bulk wines or cased goods between winery or AP bonds.

### Can Move Wine Between Wineries

Allows the system user to move bulk wines or cased goods between physical facilities.

### Can Perform Admin Operations

Allows the system user to:

- Maintain stock item batches/lots.
- Change the closed off period for a bond (US).
- Backdate an operation that will affect the TTB report (US).
- Edit charge/billing information that has already been invoiced
- Update sales orders with a Paid status.
- View Billing information in the Winery Setup.

### Can Perform Rollbacks and Restorations

Assigned by default to new users. Allows the system user to use the Rollback operation.

### Can Reassign Jobs on the vintrace app

Assigned by default to new users. Allows the system user to change the assignee of a work order while using the vintrace mobile app.

### Can Record Large Losses

Assigned by default to new users. Allows the system user to record losses over customizable loss threshold (still get a warning which they will need to confirm).

### Can Submit Inventory Actions

Assigned by default to new users. Allows the system user to complete cased goods/warehouse work orders.

### Can View Costs

Allows the system user to view cost information on screen or in reports.

### Can View Product Allocations

Allows the system user to view the [Product Allocations page](https://support.vintrace.com/hc/en-us/articles/32301319185940) and [allocations table](https://support.vintrace.com/hc/en-us/articles/32301328118932).

### Can View Product Notes

Assigned by default to new users. Allows the system user to view notes added to a product.

### Complete Operations in Future

Assigned by default to new users. Allows the system user to complete operations with a future date.

### Complete Tasks Out of Sequence

Assigned by default to new users. Allows the system user to submit jobs from a single work-order out of sequence.

### Enable API Login

Allows the system user to access the vintrace API.

### Import/Export Setup Data

Allows the system user to perform import/export data operations.

### Local vintrace Administrator

Allows the system user to:

- Manage licenses/subscriptions.
- Change permissions for other users.
- Manage the items that are available to wineries

### Modify Vessel Alert State

Allows the system user to change a tank’s alert/warning status that’s automatically updated by TankNet and Vinwizard. The status controls the warning icon on the tank map.

### Perform Bulk Wine Reversals

Assigned by default to new users. Allows the system user to reverse fruit receivals, crush notes, bulk intake and bulk dispatch jobs.

### Schedule Tasks

Assigned by default to new users. Allows the system user to schedule work orders for both bulk wine and/or cased goods inventory.

### Submit Operations

Assigned by default to new users. Allows the system user to complete bulk wine operations such as bulk intake, transfers, additions, lab analysis, etc.

## Permissions Selected by Default

The following permissions are selected by default for new users:

- Advanced Data Management
- Can Add Product Notes
- Can Add/Edit Vineyards, Growers, Blocks
- Can Add/Edit Vessels
- Can Perform Rollbacks and Restorations
- Can Reassign Jobs on the vintrace App
- Can Record Large Losses
- Can Submit Inventory Actions
- Can View Product Notes
- Complete Operations in Future
- Complete Tasks Out of Sequence
- Perform Bulk Wine Reversals
- Schedule Tasks
- Submit Operations

## Local vintrace Administrators

A system user who is granted the Local vintrace Admin permission should be familiar with the winery's data and business practices. This person can make decisions about any additional costs associated with changes in the winery's license/subscription, and can recognize when it's appropriate to edit other users' permissions.
