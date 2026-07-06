---
title: "Using the Fermentation Worksheets (aka Ferm Gen)"
url: "https://support.innovint.us/hc/en-us/articles/360015385351-using-the-fermentation-worksheets-aka-ferm-gen-"
category: "Harvest"
section: "Harvest Workflow & Fermentation Tracking"
page_type: "article"
lastmod: "2026-06-25"
gist: "The Fermentation Worksheets (aka Ferm Gen) are tools in InnoVint to help you create multiple tasks and work orders for fermentation management during harvest."
tags: ["fermentation", "barrels", "harvest", "lab", "additives", "work-orders"]
---

# Using the Fermentation Worksheets (aka Ferm Gen)

The Fermentation Worksheets (aka Ferm Gen) are tools in InnoVint to help you create multiple tasks and work orders for fermentation management during harvest.

The Fermentation Worksheets allow you to quickly view the current status of your lots and assign analysis, addition, and fermentation management tasks to your crew all from a single page.

There are 2 available Fermentation Worksheets for different vessel types in InnoVint: one for Tanks and Bins and one for smaller vessels (ie Barrels, Steel Drums, Kegs, and Carboys). The worksheets are very similar in look and function, with just a few small differences. Continue reading for a more in depth look!

This article covers:

- [Navigating the Fermentation Worksheets](#navigating)
  - [View](#view)
    - [Columns and Sorting](#columnssorting)
    - [Vessel/Lot details and Brix/Temps data](#vessellot)
    - [Hoverable data: actions, work orders, additions](#hoverable)
  - [Selections](#selections)
    - [Work Order Title](#workordertitle)
    - [Show recent analysis values/graphs](#showrecentanalysis)
    - [Saving Drafts & Loading Previous Data](#savingdrafts)
    - [Clear Fields](#clearfields)
    - [Assigning a due date](#duedate)
- [Creating tasks](#creatingtasks)
  - [Analysis](#analysistasks)
  - [Additives](#additives)
  - [Fermentation Management tasks](#fermetationmanagementtasks)
- [Assigning and creating work orders](#assigningandcreating)
- [Printing Fermentation Worksheets](#printing)
- [Tips for using the Fermentation Worksheets for multiple owners](#tips)
- [Fermentation Worksheet lot stages](#lot_stages)
- [FAQ](#FAQs)

### Navigating the Ferm Gen

### What can I view in a Fermentation Worksheet?

- #### **Tanks and Bins**

This worksheet populates with a list of *tanks* and *bins* which contain lots that are currently in the Processed, Fermenting, Settling, and Cold Soak stages.

- #### **Barrels, Steel Drums, Kegs, and Carboys**

This worksheet populates with a list of lots currently in *barrels, steel drums, kegs, and carboys.* Only lots in the Processed, Fermenting, Settling, and Cold Soak stages are listed.

#### **Columns and Sorting**

You can sort your list by clicking on the header of any of the following columns:

- *Vessel* - by vessel code.

The Barrels, Steel Drum, etc. worksheet will display the number of each vessel type (including tanks and bins), or the vessel code if there is only one

- *Lot* - by lot code
- *Owners* - by owner tag (for accounts with Owner-based Permissions activated)
- *Stage* - by current stage (Click [here](https://innovint-6865708.hs-sites.com/hc/en-us/articles/204339859-how-to-change-lot-stage?hsLang=en) for instructions on how to change the stage of a lot and click [here](/hc/en-us/articles/115001094151-harvest-settings-receive-fruit-options-and-expected-yield-#lot-stages) to find out how to update the lot stages included on the sheet)
- *Contents* - by weight, then by volume

The Tanks and Bins worksheet displays the volume or weight in the vessel for each row.

The Barrels, Steel Drum, etc. worksheet displays the total lot volume or weight, including any tanks and/or bins.

*Tip: We recommend separating lots by vessel type. For example, if you have a fermenting lot that is split between a tank and barrels, we recommend splitting the volume into 2 different lots: eg lot 18PN-TANK and lot 18PN-BARRELS*

- *Processed date* - by date the lot was Processed to Gallons or Tons
- *Brix* - by most recent Brix reading for that vessel or lot composite
- *Temperature* - by most recent Temperature reading for that vessel or lot composite

You can also manually drag and drop rows by clicking and dragging the gray horizontal bars at the ends of each row.

#### **View: Vessel/Lot details and Brix/Temps data**

- *Vessels* - click on the vessel code to open the Vessel details page in a new tab (*Tanks and Bins Worksheet only*)
- *Lots* - click on the lot code to open the Lot details dashboard in a new tab
- *Recent Brix/Temperature readings* - Click on the Brix or Temperature value to open the Brix/Temp graph in the Lot details > Analysis tab. Make sure to select a vessel or lot composite to view the appropriate graph.

Tanks and Bins: The worksheet shows the most recent recorded analysis on the lot or vessel.

Barrels, Steel Drums, etc.: The worksheet shows the most recent recorded analysis on the lot composite.

![Using the Fermentation Worksheets-vessel](https://support.innovint.us/hs-fs/hubfs/Using%20the%20Fermentation%20Worksheets-vessel.webp?width=670&height=295&name=Using%20the%20Fermentation%20Worksheets-vessel.webp)

#### **Hoverable data**

- ![Using the Fermentation Worksheets-display recent](https://support.innovint.us/hs-fs/hubfs/Using%20the%20Fermentation%20Worksheets-display%20recent.webp?width=39&height=40&name=Using%20the%20Fermentation%20Worksheets-display%20recent.webp) - displays up to 3 of the most recent actions recorded to that lot and/or vessel
- ![Using the Fermentation Worksheets-clipboard](https://support.innovint.us/hs-fs/hubfs/Using%20the%20Fermentation%20Worksheets-clipboard.webp?width=39&height=49&name=Using%20the%20Fermentation%20Worksheets-clipboard.webp) - displays up to 3 of the most recent work orders completed or assigned to that lot and/or vessel
- ![Using the Fermentation Worksheets-recent add](https://support.innovint.us/hs-fs/hubfs/Using%20the%20Fermentation%20Worksheets-recent%20add.webp?width=40&height=42&name=Using%20the%20Fermentation%20Worksheets-recent%20add.webp) - displays up to 3 of the most recent Addition actions or tasks recorded to that lot and/or vessel
- ![Using the Fermentation Worksheets-warning](https://support.innovint.us/hs-fs/hubfs/Using%20the%20Fermentation%20Worksheets-warning.webp?width=64&height=60&name=Using%20the%20Fermentation%20Worksheets-warning.webp) - warning icon alerts you if there have not been any recent actions on a vessel. This warning will only show for red ferments.

### Selections

#### **1. Work Order Title**

![Using the Fermentation Worksheets-wo title](https://support.innovint.us/hs-fs/hubfs/Using%20the%20Fermentation%20Worksheets-wo%20title.webp?width=670&height=46&name=Using%20the%20Fermentation%20Worksheets-wo%20title.webp)

The Work Order title pre-populates with the current date, followed by 'Ferm. Management'. This field can be edited at any time. Choose 'AM', 'Mid', or 'PM' to add the time of day to precede the Work Order title, or choose 'None' to leave it out.

#### **2. Show recent analysis values/graph**

Click this option to toggle between the graphs and 3 most recent data points.

#### **3. Drafts & Previous Work Orders**

*Save as draft:*

If you are in the middle of creating work orders in the Ferm Gen and need to navigate away from the page before you are finished, make sure to save your work as a draft to save your selections.

*Load draft or previous generator data:*

Drafts and previously created work orders will be saved to and accessed from the dropdown list.

![Using the Fermentation Worksheets-drafts](https://support.innovint.us/hs-fs/hubfs/Using%20the%20Fermentation%20Worksheets-drafts.webp?width=495&height=241&name=Using%20the%20Fermentation%20Worksheets-drafts.webp)

**Warning**: Addition tasks will NOT save as part of Drafts or Previous Generator Data. Additions will need to be entered each time a draft or previous data is selected.

#### **4. Clear Fields**

By clicking on 'Clear Fields' (bottom left corner) you will remove all current selections, including all requested analysis panels, additives, other tasks, and assigned persons. It will, however, retain the order of you lots in the list.

#### **5. Due date**

The current date will pre-populate the due date of the work order. Make sure to edit this field to assign it to a different day.

### Creating tasks via Fermentation Worksheets

#### Analysis tasks

Analysis tasks can be assigned by selecting an analysis panel from a dropdown list.

Click [here](//innovint-6865708.hs-sites.com/hc/en-us/articles/204504149-analysis-panels-how-to-create-save-and-delete?hsLang=en) for instructions on how to create an Analysis Panel.

**Tip**: If you would like to request that a sample is pulled for a specific analysis panel, begin the panel name with *Pull Sample* or *Sample to lab*.

![Using the Fermentation Worksheets-anaylsis dropdown](https://support.innovint.us/hs-fs/hubfs/Using%20the%20Fermentation%20Worksheets-anaylsis%20dropdown.webp?width=212&height=281&name=Using%20the%20Fermentation%20Worksheets-anaylsis%20dropdown.webp)

An analysis panel can be applied to all vessels/lots in the worksheet, or to specific vessels/lots only. To remove assigned analysis panels in bulk, click on the Analysis column header and select *Clear all*. To remove or change an analysis panel for an individual vessel or lot, click on the panel name in the vessel row and select Remove or an alternative panel. You will only be able to select one panel per vessel row.

Analysis requested in the Tanks and Bins worksheet are **for individual vessels**.

Analysis requested in the Barrels, Steel Drums, etc. worksheet are **for lot composites**, including any tanks or bins if the lot is split between large and small vessels. To request analyses for individual barrels, etc., we recommend creating recurring work orders with an analysis task.

#### Addition tasks

This option is only available if you have the [Dry Goods Batch Tracking & Additions Calculator](https://innovint-6865708.hs-sites.com/hc/en-us/articles/360000607792-feature-option-simple-additions-vs-additive-batch-tracking-calculator?hsLang=en) activated in your account. If you do not have this add-on activated, Additions can be recorded as Other tasks in the worksheets.

Addition tasks can be assigned through the Fermentation Worksheet by clicking on  ![](https://support.innovint.us/hs-fs/hubfs/Knowledge%20Base%20Import/support.innovint.ushcarticle_attachments360010442791add_additives.png?width=116&name=support.innovint.ushcarticle_attachments360010442791add_additives.png)  in each vessel/lot row. This will open a slideover of the [Addition task](https://innovint-6865708.hs-sites.com/hc/en-us/articles/360007011471-how-to-record-a-simple-addition?hsLang=en) where you can add one or multiple additives to vessels.

To edit additive tasks, click on the additive(s) in the vessel row. This will automatically remove your previous additive selection and you can start over.

#### Fermentation Management tasks

Other fermentation management tasks can be assigned by clicking on  ![](https://support.innovint.us/hs-fs/hubfs/Knowledge%20Base%20Import/support.innovint.ushcarticle_attachments360010442991add_tasks.png?width=83&name=support.innovint.ushcarticle_attachments360010442991add_tasks.png) in each vessel row.

![Using the Fermentation Worksheets-ferm tasks](https://support.innovint.us/hs-fs/hubfs/Using%20the%20Fermentation%20Worksheets-ferm%20tasks.webp?width=209&height=341&name=Using%20the%20Fermentation%20Worksheets-ferm%20tasks.webp)

Select a task from the dropdown list and include instructions (optional).

To remove a task, click on the task name in the vessel row and select *Remove task*.

To add additional tasks, click on the ![](https://support.innovint.us/hubfs/Knowledge%20Base%20Import/support.innovint.ushcarticle_attachments360010443411more_tasks.png) and follow the same instructions as above.

![Using the Fermentation Worksheetspumpover](https://support.innovint.us/hs-fs/hubfs/Using%20the%20Fermentation%20Worksheetspumpover.webp?width=237&height=168&name=Using%20the%20Fermentation%20Worksheetspumpover.webp)

### Assigning and Creating Work Orders

#### Assigning Work Orders

A winery member must be assigned to a vessel to create the work order for that vessel. Unassigned vessels will be left out.

To assign a single Ferm Gen work order to one person, click on  ![](https://support.innovint.us/hs-fs/hubfs/Knowledge%20Base%20Import/support.innovint.ushcarticle_attachments360010443651assign_to.png?width=87&name=support.innovint.ushcarticle_attachments360010443651assign_to.png) in the column header. Select a winery member from the drop down to assign all tasks to one person. Assigned vessels are highlighted green. Unassigned vessel rows will not have a work order created.

To change or remove the assigned party, click on their name in the vessel row and select *Remove* or another winery member name from the list.

Each winery member with assigned tasks will receive one work order each.

When a vessel has an analysis, addition, or other task applied to it *and* a person has been assigned the work, the row will highlight in green. ***Work orders will only be created for highlighted rows.***

#### Create work orders

Double check your Work Order title and due date before creating your work order(s). The number of work orders created will correspond to the number of parties assigned, and only for rows highlighted in green. If a vessel has no assigned parties and/or tasks, the work order(s) will *NOT* be created.

![Using the Fermentation Worksheets-create wo-1](https://support.innovint.us/hs-fs/hubfs/Using%20the%20Fermentation%20Worksheets-create%20wo-1.webp?width=670&height=232&name=Using%20the%20Fermentation%20Worksheets-create%20wo-1.webp)

Once a work order is created it will be saved to your previously created work order list.

### Printing Fermentation Worksheets

At the bottom right corner of the Ferm Gen you will see the ![Using the Fermentation Worksheets-print button](https://support.innovint.us/hs-fs/hubfs/Using%20the%20Fermentation%20Worksheets-print%20button.webp?width=110&height=21&name=Using%20the%20Fermentation%20Worksheets-print%20button.webp) button.

The default option will print the current page as-is (even without selections) and will *not* create work orders in InnoVint or save it as a draft.

***Note:** The Barrels, Steel Drums, etc. worksheet will print a row for each individual vessel in each lot, including any tanks and/or bins if the lot is split between large and small vessels.*

If you click on the caret to the right, you will see that there is another option: Print separate pages per assignee.

![Using the Fermentation Worksheets-print menu](https://support.innovint.us/hs-fs/hubfs/Using%20the%20Fermentation%20Worksheets-print%20menu.webp?width=262&height=123&name=Using%20the%20Fermentation%20Worksheets-print%20menu.webp)

This will split the worksheet into multiple pages for each assignee in the order in which they are assigned, from top to bottom. In the example below on the left, 4 different worksheets will be printed.

To avoid printing multiple pages per assignee, drag and drop the vessels in the list using the gray horizontal bars at the far left or right of the row, ordered by assignee. (See the example below on the right.)

![Using the Fermentation Worksheets-horizontal bars](https://support.innovint.us/hs-fs/hubfs/Using%20the%20Fermentation%20Worksheets-horizontal%20bars.webp?width=670&height=289&name=Using%20the%20Fermentation%20Worksheets-horizontal%20bars.webp)

**TIP:** To view vessel icons in printed view, be sure to select "Background graphics" in your print settings.

### Tips for using Fermentation Worksheets for multiple owners

The Ferm Gen requires you to choose an owner for the created work order. We do not recommend creating a single, Global work order for all clients as this allows all owners to view the details of the entire work order, including analysis data and additives.

There are 2 ways we recommend using the Ferm Gen for multiple owners.

1. Allow owners to create their own work orders, or
2. Create separate work orders for each owner

Start by sorting the Ferm Gen by the Owner column. Create tasks for each vessel/lot, but only assign a winery member to one ownership. Create the work order, selecting the corresponding ownership tag. Next, unassign those vessels that you just created a work order for, and assign a winery member to the vessels for the next ownership. Repeat the same steps as above until you have created a separate work order for each ownership tag.

Each created work order - one for each owner - will be saved separately in the "Load previous work orders" dropdown.

### Fermentation Worksheets Lot Stages

By default, Fermentation Worksheets include lots in the **Processed, Fermenting, Settling** and **Cold Soak** stages. These are generally the stages your lots are in over the peak of harvest, and we recommend using this default for assigning and tracking harvest analysis tasks.

You can customize the Lot Stages that are included in the Fermentation Worksheets by going to Settings/Harvest/Fermentation Management Worksheet stages. This would allow you to continue tracking residual sugars in conjunction with lots in the ML Stage, or perhaps easily select and request Stirring on multiple lots in the period after most lots are near dry.

![](https://support.innovint.us/hs-fs/hubfs/undefined-Jun-24-2026-11-59-09-4860-PM.png?width=670&height=311&name=undefined-Jun-24-2026-11-59-09-4860-PM.png)

### FAQ

**Q: Why can't I see my individual barrel analysis in the barrel fermentation worksheet?**

*A: This worksheet shows the most recent analyses by lot composite only. Individual barrels, drums, kegs, and carboys are not tracked in this report. If you want to see analyses by individual barrel, we recommend creating a unique lot code for each barrel and running a lot composite reading on each lot code.*
