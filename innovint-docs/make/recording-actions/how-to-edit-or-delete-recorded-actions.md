---
title: "How to Edit or Delete Recorded Actions"
url: "https://support.innovint.us/hc/en-us/articles/208141233-how-to-edit-or-delete-recorded-actions"
category: "MAKE"
section: "Recording Actions"
page_type: "article"
lastmod: "2026-06-12"
gist: "Direct actions immediately record a movement or piece of data to InnoVint when they are submitted."
tags: ["work-orders", "corrections", "harvest", "ux-friction", "barrels", "transfers"]
---

# How to Edit or Delete Recorded Actions

This article covers:

- [Actions and work order tasks](#task-action)
- [How to edit an action](#edit)
  - [Actions that are always available for edit](#always)
  - [Actions with no Dependent Actions](#none)
  - [Actions with Dependent Actions](#with_dependent_actions)
- [How to edit the date on an action](#edit-date)
- [How to delete an action](#delete)
- [How to view dependent actions](#dependant)
- [Frequently Asked Questions (FAQ)](#faq)

### Actions and work order tasks

Direct actions immediately record a movement or piece of data to InnoVint when they are submitted.  Think of work orders and their associated tasks as the written record or request *for* a specific action. Once the work order task is submitted, that specific action is recorded, which becomes part of the activity history. That original task, the written request, can no longer be altered.

A work order task can be edited if it is open and uncompleted;  this will edit the details around a requested action. If you are trying to edit an open work order, check out this article on [How to Edit Work Orders](https://support.innovint.us/hc/en-us/articles/206371326-how-to-edit-a-work-order?hsLang=en).

There are a few specific fields you can edit on specific tasks within a submitted work order, including:

- "Treatment", on Filter tasks
- "Expected yield", on Drain and Bleed/Saignee tasks, and
- "Sugar" on Receive Fruit tasks

In order to edit most items, such as vessels or volumes, on a *submitted* work order task, you must actually edit the underlying recorded action. You can find that recorded action via the work order task, under "View action".

![Edit or Delete Actions_Submitted WO_View action](https://support.innovint.us/hs-fs/hubfs/Knowledge%20Base%20Import/Edit%20or%20Delete%20Actions_Submitted%20WO_View%20action.webp?width=670&height=93&name=Edit%20or%20Delete%20Actions_Submitted%20WO_View%20action.webp)

An action that was generated via a submitted work order will show the link to the original work order at the top of the action:

![Edit or Delete Actions_Submitted WO_Via WO](https://support.innovint.us/hs-fs/hubfs/Knowledge%20Base%20Import/Edit%20or%20Delete%20Actions_Submitted%20WO_Via%20WO.webp?width=670&height=71&name=Edit%20or%20Delete%20Actions_Submitted%20WO_Via%20WO.webp)

Read on to learn how to edit these actions!

### How to edit an action

- **Actions that are always available for edit:**
  - Addition actions and Custom actions (including Fermentation actions such as pumpover and stir) are not subject to any dependent action restrictions, and can always be edited. You can edit the date they were recorded using the [date edit.](#edit-date)
  - Analysis actions are also not subject to dependent action restrictions, and you can [edit the result, units, and date/time](/hc/en-us/articles/360013296251-edit-and-delete-analysis-data?hsLang=en) anywhere that you find the analysis  edit button ![](https://support.innovint.us/hs-fs/hubfs/image-png-Apr-08-2024-05-56-10-5209-PM.png?width=53&height=23&name=image-png-Apr-08-2024-05-56-10-5209-PM.png).

- - If COGS Tracking is available in your account, cost item actions are also always available for editing, including the date (within the limitations of the Cost [Backdating Lock](https://support.innovint.us/hc/en-us/articles/360020396351-winery-activity-lock-backdating?hsLang=en#what)).

- **Actions with no Dependent Actions:**
  - It is possible for users (with permission levels: Team Member cannot Submit, Team Member or Admin) to edit the most recent action that does not have any [dependent actions](#dependant).  Note that custom actions and addition actions are not considered dependent actions.
    When an action is available for editing, you will see the **Edit action** button at the top of the action details page.
    ![Edit or Delete Actions_Action with no dependencies](https://support.innovint.us/hs-fs/hubfs/Knowledge%20Base%20Import/Edit%20or%20Delete%20Actions_Action%20with%20no%20dependencies.webp?width=622&height=335&name=Edit%20or%20Delete%20Actions_Action%20with%20no%20dependencies.webp)
    Once you click on "Edit action," fields that are possible to edit will show as available for text entry or selection. These available fields may vary by action.
    ![Edit or Delete Actions_Action with no depdendencies_editable fields](https://support.innovint.us/hs-fs/hubfs/Knowledge%20Base%20Import/Edit%20or%20Delete%20Actions_Action%20with%20no%20depdendencies_editable%20fields.webp?width=622&height=346&name=Edit%20or%20Delete%20Actions_Action%20with%20no%20depdendencies_editable%20fields.webp)
  - In some cases, the best way to change the details of a submitted work order or recorded action may be to [delete](#delete) the action entirely, and re-enter the information. This often includes cases that require changing or removing an involved lot, or changing another element that is not available to edit.
  - If an action is not available for editing because it has limiting dependent actions, the "Edit action" button will be hidden, and the user will only see the "View dependent actions list" and "Delete action" buttons.![Edit or Delete Actions_Action with no dependencies_view dependent actions list](https://support.innovint.us/hs-fs/hubfs/Knowledge%20Base%20Import/Edit%20or%20Delete%20Actions_Action%20with%20no%20dependencies_view%20dependent%20actions%20list.webp?width=670&height=203&name=Edit%20or%20Delete%20Actions_Action%20with%20no%20dependencies_view%20dependent%20actions%20list.webp)

- **Actions with Dependent Actions:**

It is possible for users with the permission level **Admin** to edit some actions that show related dependent actions, and Admins will continue see the "Edit action" button available for actions with Dependent Actions.

Editing an action is a nuanced function and subject to various system restrictions.

- - Only Admins have access to this type of action edit.
  - Admins can only edit a limited number of actions (the selected action and up to 50 dependent actions). You will see an error message if the system calculates at least 50 dependent actions:
    ![Edit or Delete Actions_Actions w dependent actions_error message](https://support.innovint.us/hs-fs/hubfs/Knowledge%20Base%20Import/Edit%20or%20Delete%20Actions_Actions%20w%20dependent%20actions_error%20message.webp?width=462&height=162&name=Edit%20or%20Delete%20Actions_Actions%20w%20dependent%20actions_error%20message.webp)
  - Admins will not be able to edit actions involving case goods lots that have dependent actions. This includes Bottling, Transfer (Case Goods), Add Packaging, Volume Adjustment (Case Goods), Remove Taxpaid (Case Goods), B2B Transfer In (Case Goods) and B2B Transfer Out (Case Goods).  Please contact [support@innovint.us](mailto:support@innovint.us) for assistance with these action types.
  - As mentioned above, this edit feature will not impact cost item or analysis or addition edits as these action types are not restricted by dependent actions.
  - Action editing can be complex and you may come across error messages if InnoVint cannot edit the action for one reason or another. Please reach out to Support if needed.
- **What does an edited task look like?**
  A task whose action has been edited (see more [here](#edit-task)) will show an "Edited" tag next to the task in the Work Order, and the task will always link to the most recently edited version of the action.
  ![Edit or Delete Actions_Edited task_view edited task](https://support.innovint.us/hs-fs/hubfs/Knowledge%20Base%20Import/Edit%20or%20Delete%20Actions_Edited%20task_view%20edited%20task.webp?width=500&height=56&name=Edit%20or%20Delete%20Actions_Edited%20task_view%20edited%20task.webp)
  An original direct action will also show an "Edited tag" and link to the most recent version of the action.
  ![Edit or Delete Actions_edited action_view edited action](https://support.innovint.us/hs-fs/hubfs/Knowledge%20Base%20Import/Edit%20or%20Delete%20Actions_edited%20action_view%20edited%20action.webp?width=249&height=56&name=Edit%20or%20Delete%20Actions_edited%20action_view%20edited%20action.webp)

### How to edit the date on an action

Date editing is available on movement, addition, and most other action types.

Date edit is *not* available on [analysis](/hc/en-us/articles/360013296251-edit-and-delete-analysis-data?hsLang=en), [tax class change](/hc/en-us/articles/207936576-declare-or-edit-tax-class?hsLang=en), or cost item actions — those action types already have their own built-in date-changing workflows.

#### How to edit the date on an action

![Edit-date_WAF-MU](https://support.innovint.us/hs-fs/hubfs/Edit-date_WAF-MU.png?width=670&height=281&name=Edit-date_WAF-MU.png)

When a date is available for editing on an action, a blue pencil icon appears next to it.

![Edit-date_pencil](https://support.innovint.us/hs-fs/hubfs/Edit-date_pencil.png?width=670&height=299&name=Edit-date_pencil.png)

Click the pencil to open a modal showing the two neighboring actions that define the allowable window — you can select any date and time within that acceptable date range.

![Edit-date_window](https://support.innovint.us/hs-fs/hubfs/Edit-date_window.png?width=670&height=344&name=Edit-date_window.png)

The available date window depends on the action type:

- *Movement and addition actions* can only be moved within a range defined by surrounding dependent actions. Dependencies include movement and addition actions, certain analysis actions (individual vessel and lot composite analyses that generated a lot copy analysis), and cost item actions.
- *Custom actions and other non-dependent actions* have no dependency constraints and can be moved to any date.
- When rescheduling the date/time, you cannot select the exact same time as any dependent actions. The selected time has to be 1 minute after the preceding action or 1 minute before the following action.

If the date you need falls outside the available window, you'll need to first adjust the action that's creating the dependency.

##### After saving

Once the date is changed, a note is automatically added to the action summarizing what was modified.

![Date edit_New note format](https://support.innovint.us/hs-fs/hubfs/Date%20edit_New%20note%20format.png?width=670&height=251&name=Date%20edit_New%20note%20format.png)

![Edit-date_WAF after](https://support.innovint.us/hs-fs/hubfs/Edit-date_WAF%20after.png?width=670&height=268&name=Edit-date_WAF%20after.png)

#### Who can edit dates

Users with Team Member or Team Member (Cannot Submit) permissions can edit the most recent action only.

Admins can edit any action dated within the last 14 months (430 days). All edits also respect the winery's [lock backdate](/hc/en-us/articles/360020396351-winery-activity-lock-backdating?hsLang=en) setting.

#### Video Tutorial

### How to delete an action

Once a work order or direct action is submitted/recorded, it cannot be deleted unless it is the most recent recorded action.

To attempt an action deletion:

1. Navigate to the Action details page.  To find the Action details page:
   *Click on the blue arrow at the far right of the action summary in the History tab of the Lot Details page, or in the Winery Activity Feed.*
   *![Edit or Delete Actions_Delete action_Step 1](https://support.innovint.us/hs-fs/hubfs/Knowledge%20Base%20Import/Edit%20or%20Delete%20Actions_Delete%20action_Step%201.webp?width=655&height=77&name=Edit%20or%20Delete%20Actions_Delete%20action_Step%201.webp)*
   *Or, from the Work Order details page, click on "View action" at the top of each task.*
   *![Edit or Delete Actions_Delete Action_Step 1_WO Details page](https://support.innovint.us/hs-fs/hubfs/Knowledge%20Base%20Import/Edit%20or%20Delete%20Actions_Delete%20Action_Step%201_WO%20Details%20page.webp?width=655&height=99&name=Edit%20or%20Delete%20Actions_Delete%20Action_Step%201_WO%20Details%20page.webp)*
2. Click "Delete Action" in the upper right corner.
   A pop-up window will appear to verify the deletion.
   ![Edit or Delete Actions_Delete action_Step 2](https://support.innovint.us/hs-fs/hubfs/Knowledge%20Base%20Import/Edit%20or%20Delete%20Actions_Delete%20action_Step%202.webp?width=655&height=170&name=Edit%20or%20Delete%20Actions_Delete%20action_Step%202.webp)
3. If there are any dependent actions, you might get an error message like this one:
   ![Edit or Delete Actions_Delete action_Step 3_error message](https://support.innovint.us/hs-fs/hubfs/Knowledge%20Base%20Import/Edit%20or%20Delete%20Actions_Delete%20action_Step%203_error%20message.webp?width=367&height=170&name=Edit%20or%20Delete%20Actions_Delete%20action_Step%203_error%20message.webp)
   You will continue to get this error message until all dependent actions have been removed.

   #### What does a deleted action or task look like?

   Deleted actions will have a deleted tag next to the action title in the Action details.

![Edit or Delete Actions_Delete action_What does a deleted action look like](https://support.innovint.us/hs-fs/hubfs/Knowledge%20Base%20Import/Edit%20or%20Delete%20Actions_Delete%20action_What%20does%20a%20deleted%20action%20look%20like.webp?width=272&height=63&name=Edit%20or%20Delete%20Actions_Delete%20action_What%20does%20a%20deleted%20action%20look%20like.webp)

Deleted actions that were submitted via work order task will have the deleted tag on the recorded action, and the work order task will also display a deleted tag.

![Edit or Delete Actions_Delete action_What does a deleted action look like within WO](https://support.innovint.us/hs-fs/hubfs/Knowledge%20Base%20Import/Edit%20or%20Delete%20Actions_Delete%20action_What%20does%20a%20deleted%20action%20look%20like%20within%20WO.webp?width=648&height=211&name=Edit%20or%20Delete%20Actions_Delete%20action_What%20does%20a%20deleted%20action%20look%20like%20within%20WO.webp)

Find your deleted actions via the Winery Activity Feed, by clicking on the "Export Deleted Actions", next to the regular "Export" button at the top right.

![Edit or Delete Actions_WAF_Export deleted actions](https://support.innovint.us/hs-fs/hubfs/Knowledge%20Base%20Import/Edit%20or%20Delete%20Actions_WAF_Export%20deleted%20actions.webp?width=623&height=74&name=Edit%20or%20Delete%20Actions_WAF_Export%20deleted%20actions.webp)

### How to view dependent actions

Go to the Action Details page and click on "View dependent actions list".

![Edit or Delete Actions_View dependent actions_1](https://support.innovint.us/hs-fs/hubfs/Knowledge%20Base%20Import/Edit%20or%20Delete%20Actions_View%20dependent%20actions_1.webp?width=670&height=96&name=Edit%20or%20Delete%20Actions_View%20dependent%20actions_1.webp)

That will open this page in InnoVint 👇

![Edit or Delete Actions_Dependent actions list](https://support.innovint.us/hs-fs/hubfs/Knowledge%20Base%20Import/Edit%20or%20Delete%20Actions_Dependent%20actions%20list.webp?width=670&height=112&name=Edit%20or%20Delete%20Actions_Dependent%20actions%20list.webp)

The list of dependent actions displays all actions that will prevent you from deleting or editing an action.

In the example above, the Barrel Down and Blend actions in the dependent actions list will prevent the Top Off action from being edited or deleted. The Barrel Down and Blend actions will need to be deleted before the Top Off action can be edited or deleted. Then the Barrel Down and Blend actions will need to be re-recorded as well.

### FAQ

**Q. How can I "unsubmit" a task or action?**

A. We know that everybody makes mistakes. But, once you have clicked on "Submit" for a task or work order, or "Record action" in a direct action, you cannot go back in time and undo that submission*.* You may be able to [edit the action](#edit) after it is submitted, or else you may need to [delete](#delete)  and re-do the action.

**Q. What is a dependent action?**

A. *Dependent actions refer to all movement actions recorded on the lot and/or any involved vessels.**Movement actions are any action in InnoVint that have the potential to change volume or vessels. Non-movement actions include Additions, Analysis, and Custom Actions.*

**Q. Why does the dependent actions list show actions for unrelated lots?**

A. *Dependent actions include any movement actions recorded on involved vessels. For example, imagine this sequence of events:*

*- Lot A was transferred from Tank 1 to Tank 22*

*- Lot X was racked into Tank 1*

*- Lot X was barreled down*

*In this scenario, the Rack action and the Barrel Down action would be dependent actions if you tried to delete or edit the Transfer action on Lot A, because Tank 1 has since been involved in other movement actions.*

**Q: How can I edit my work order task?**

*A: Think of work order tasks as the written record or request for a specified action. While a work order task can be edited if it is OPEN (i.e. you can edit the details of the requested action), a submitted task must have the underlying recorded action edited. You can find that recorded action via the work order task, under **View action:***

*![Edit or Delete Actions_How can I edit WO task_1](https://support.innovint.us/hs-fs/hubfs/Knowledge%20Base%20Import/Edit%20or%20Delete%20Actions_How%20can%20I%20edit%20WO%20task_1.webp?width=670&height=100&name=Edit%20or%20Delete%20Actions_How%20can%20I%20edit%20WO%20task_1.webp)*

*Edit the action (if possible) and the original action will show the Edited tag, plus a link to the most recent version of the action.*

*![Edit or Delete Actions_How can I edit a WO_2](https://support.innovint.us/hs-fs/hubfs/Knowledge%20Base%20Import/Edit%20or%20Delete%20Actions_How%20can%20I%20edit%20a%20WO_2.webp?width=328&height=84&name=Edit%20or%20Delete%20Actions_How%20can%20I%20edit%20a%20WO_2.webp)*

*If you edit an action submitted via a work order task, then that task will receive an Edited tag:*

![Edit or Delete Actions_How can I edit a WO task_3](https://support.innovint.us/hs-fs/hubfs/Knowledge%20Base%20Import/Edit%20or%20Delete%20Actions_How%20can%20I%20edit%20a%20WO%20task_3.webp?width=445&height=119&name=Edit%20or%20Delete%20Actions_How%20can%20I%20edit%20a%20WO%20task_3.webp)

*Find out more about editing OPEN work orders [here](https://support.innovint.us/hc/en-us/articles/206371326-how-to-edit-a-work-order?hsLang=en).*

**Q. Can I edit the date on an action?**

*A: Yes, [see above](#edit-date) for more information on editing dates.*

*Analysis and Cost item actions also allow date edits.*

- ***Analysis actions** on Fruit lots, Juice/wine lots, Case Good lots and Vineyard block analyses are fully editable.*
  - *Editing analysis is accessed anywhere you can find the edit button*
    - *In an Analysis action detail page (for individual analysis entries, as well as Import actions)*
      *![Edit or Delete Actions_Edit date on analysis action](https://support.innovint.us/hs-fs/hubfs/Knowledge%20Base%20Import/Edit%20or%20Delete%20Actions_Edit%20date%20on%20analysis%20action.webp?width=589&height=400&name=Edit%20or%20Delete%20Actions_Edit%20date%20on%20analysis%20action.webp)*
    - *In the Lot details/Analysis tab via All analysis in a list & Sugar/temp pages*
      *![Edit or Delete Actions_Edit date on analyses_all analyses in a list](https://support.innovint.us/hs-fs/hubfs/Knowledge%20Base%20Import/Edit%20or%20Delete%20Actions_Edit%20date%20on%20analyses_all%20analyses%20in%20a%20list.webp?width=589&height=291&name=Edit%20or%20Delete%20Actions_Edit%20date%20on%20analyses_all%20analyses%20in%20a%20list.webp)*

- - *If you are editing an individual vessel analysis, you will be permitted to change the date to any time the lot is in that vessel.*
  - *Editing any value in this screen will update the Performed by person on all analyses in the original action.*
- ***Add/remove cost actions** are fully editable.*
  - *All fields on a cost action are editable, including cost category, details, total cost, effective at date/time and involved lots (see open fields in the screenshot):*
    *![Edit or Delete Actions_Edit addremove cost actions](https://support.innovint.us/hs-fs/hubfs/Knowledge%20Base%20Import/Edit%20or%20Delete%20Actions_Edit%20addremove%20cost%20actions.webp?width=620&height=333&name=Edit%20or%20Delete%20Actions_Edit%20addremove%20cost%20actions.webp)*
  - *If you change the date/time on a cost action, you will need to re-select lots via the lot picker.*
