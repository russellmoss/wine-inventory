---
title: "Workflows for harvest additions"
url: "https://support.innovint.us/hc/en-us/workflows-for-harvest-additions"
category: "Harvest"
section: "Harvest Workflow & Fermentation Tracking"
page_type: "page"
lastmod: "2025-11-20"
gist: "InnoVint does not support additions to Fruit lots."
tags: ["harvest", "additives", "fermentation", "vineyard", "transfers", "work-orders"]
---

# Workflows for harvest additions

InnoVint does not support additions to Fruit lots.  Instead, addition actions and tasks must be recorded on Juice/wine lots (after the [Fruit lot](https://support.innovint.us/hc/en-us/what-is-the-difference-between-a-fruit-lot-and-a-juice/wine-lot?hsLang=en) is processed). We also know that during harvest, sometimes you make additions directly to your fruit prior to the actual processing step (destemming/crushing or pressing). So how do you record these additions in InnoVint?

Whether you're adding enzyme straight to your macrobins as your fruit arrives or adding a little SO2 to the press pan, we have a few workflow options to help record all of your harvest additions in InnoVint.

This article covers:

- [Recording additions to harvested fruit in the vineyard](#adds-in-vineyard)
- [Recording additions to unprocessed fruit](#adds-to-unprocessed-fruit)
- [Recording additions to fruit during processing](#adds-during-processing)

### Recording additions to harvested fruit in the vineyard

Adding some SO2 to your fruit as soon as it's been picked in the vineyard? We recommend the following workflow to record that addition.

1. [Create a fruit lot](https://support.innovint.us/hc/en-us/articles/360005034292-how-to-create-a-fruit-lot-in-innovint?hsLang=en).
2. Record a custom action or task applied to the Fruit lot that includes details of the addition. This will save a record of the addition details on the Fruit lot, but not deplete additive inventory, or carry into the Juice/wine lot at processing.  ![](https://support.innovint.us/hs-fs/hubfs/image-png-Aug-23-2024-04-50-10-2357-PM.png?width=688&height=269&name=image-png-Aug-23-2024-04-50-10-2357-PM.png)
3. If you want to maintain the record of the addition made to the fruit lot through the life of the wine, you'll need to ensure that an addition is recorded on the Juice/wine lot processed from the Fruit lot.

   You can do this by creating a work order containing Receive Fruit, Process Fruit and Addition tasks (or record the series of direct actions).  Make a note on the addition task that this additive was added in the vineyard prior to receival and processing, and apply the addition task to the Juice/wine lot.

### Recording additions to unprocessed fruit

To record an addition to your fruit in macrobins, try one of these these workflows:

**Option 1)**
Manually calculate your additions and request/submit the addition on the empty Juice/wine lot prior to your Process to Volume/Process to Weight action.

1. After receiving your fruit, record a custom action or task applied to the fruit lot that includes details of the addition. Similar to the workflow above, this will save a record of the addition details on the Fruit lot, but not deplete additive inventory, or carry into the Juice/wine lot at processing.
2. Record an Addition action/task, applied to the Juice/wine lot that the fruit lot will be processed into. Select the appropriate vessel that the juice/wine lot will move into after processing. Add notes to specify that the addition action was performed before processing. It is possible to submit this action/task *prior* to the Juice/wine lot containing any volume, but you will need to manually calculate the addition quantity.

**Option 2)**

To use the actual fruit weight calculation on a lot that you will press (and ferment in volume), record an addition to your fruit after processing it to *weight* (rather than volume) - and use the Drain & Press action/task in order to "Process to Volume":

1. Record a Process Fruit to Weight action/task, moving your Juice/wine lot to a phantom vessel, such as a bin (to represent your macrobins).
2. Record an Addition action/task.
   1. Because your fruit weight is now processed as a Juice/wine lot into a vessel, you can now use the Additive calculator based on the fruit weight. InnoVint will correctly calculate the addition for an addition rate in weight/weight, such as g/ton, or an addition rate in weight/volume, such as g/hL.
3. If you are processing whites, or plan to track your lot in volume, then record a Drain & Press action/task to press your lot in weight to volume.

### Recording additions to fruit *during* processing

If you're adding SO2 or enzymes to your fruit directly at the press, i.e. in the press pan, during processing, use the workflow below:

1. Record a Process Fruit action/task that specifies in a process step that an addition is being performed. ![](https://support.innovint.us/hs-fs/hubfs/image-png-Aug-23-2024-08-02-25-3379-PM.png?width=688&height=387&name=image-png-Aug-23-2024-08-02-25-3379-PM.png)
2. Record an Addition action/task on the juice lot, adding notes to specify that the addition was performed during processing.
   This Addition action/task can be completed before or after the processing action/task; the Juice/wine lot does not require contents to be submitted (but does require contents in a vessel in order to utilize the additive calculator) ![](https://support.innovint.us/hs-fs/hubfs/image-png-Aug-23-2024-08-18-28-9096-PM.png?width=688&height=388&name=image-png-Aug-23-2024-08-18-28-9096-PM.png)
