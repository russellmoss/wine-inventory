---
id: "32301303004308"
title: "Transferring a Trial Blend to Multiple Tanks"
url: "https://support.vintrace.com/hc/en-us/articles/32301303004308-Transferring-a-Trial-Blend-to-Multiple-Tanks"
category: "vintrace Web"
section: "Winemaking"
created_at: "2024-11-20T14:46:29Z"
updated_at: "2025-01-15T19:36:24Z"
labels: []
gist: "This functionality is available starting with vintrace 9.4.3."
tags: ["blending", "transfers", "barrels", "work-orders", "permissions", "lot-identity"]
---

# Transferring a Trial Blend to Multiple Tanks

This functionality is available starting with [vintrace 9.4.3](https://support.vintrace.com/hc/en-us/articles/32303276816020).

In order to transfer a trial blend to multiple tanks, you will need the [*Can Add/Edit Trial Blends* permission](https://support.vintrace.com/hc/en-us/articles/360000813755-Roles-and-Permissions#Permissions).

To transfer a trial blend to multiple tanks:

1. [Create the blend using the Trial Blend operation](https://support.vintrace.com/hc/en-us/articles/360000822576-Managing-Trial-Blends#CreatingaTrialBlend).
2. Click ![More_Options_20200323.png](https://support.vintrace.com/hc/article_attachments/32329211018004) More Options in the sidebar.
3. From the Trial Blends tile, click Manage Trial Blends. The Trial Blend Console displays.
4. From the Trial Blend Console, do one of the following:

- Click on a row, then click Blend Transfer.

![Trial_Blend_Console_-_Blend_Transfer_Button_20230420.png](https://support.vintrace.com/hc/article_attachments/32329211053588)

- View a trial blend, then select Create Blend Job from the Operations menu.

![Create_Blend_Job_20230420.gif](https://support.vintrace.com/hc/article_attachments/32329206130196)

5. Select the vessel and the volume to transfer to that vessel. To specify more than one vessel, click Add Line.

If you select one vessel, vintrace creates a Multi-Transfer (Many-to-One) operation. You can schedule the operation on a work order, or save the operation.

If you select more than one vessel, vintrace creates a work order with multiple Multi-Transfer (One-to-Many) jobs. The source vessel and batch for the many-to-one operations are inherited from the trial blend’s source wine. The destination’s vessel, batch, and volume will be based on the values specified. You can edit the jobs as needed to select any tasks in the Task Order tab that need to be completed prior to the job.
