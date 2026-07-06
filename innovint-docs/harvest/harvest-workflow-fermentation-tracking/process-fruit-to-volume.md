---
title: "Process Fruit to Volume"
url: "https://support.innovint.us/hc/en-us/articles/360006828911-process-fruit-to-volume"
category: "Harvest"
section: "Harvest Workflow & Fermentation Tracking"
page_type: "article"
lastmod: "2025-11-20"
gist: "The Process Fruit action is the second step (after Receive Fruit) in bringing fruit into your facility during harvest."
tags: ["harvest", "barrels", "fermentation", "transfers", "lot-identity", "ux-friction"]
---

# Process Fruit to Volume

The Process Fruit action is the second step (after Receive Fruit) in bringing fruit into your facility during harvest. It allows for a variety of options and flexibility in how to get your fruit from the crush pad to your vessels.

Process Fruit to *Volume* is specific for fruit that will be pressed, sent to your vessels as juice, and tracked in volume (e.g. gallons or liters). If you want to track your lot in weight (i.e. kg, pounds, tons or tonnes), please see more about the Process to Weight action [here](https://support.innovint.us/hc/en-us/articles/360006478872-process-fruit-to-tons?hsLang=en).

This action can only be performed on Fruit Lots with contents and captures information on what and how much fruit you are processing, optional process steps (e.g. sorting, pressing, etc.), and the lot(s) and vessel(s) that you are sending your juice to.

#### This article covers:

- [Process Fruit to Volume via Direct Action](#direct)
- [Process Fruit to Volume via Work Order](#work-order)
- [Frequently Asked Questions](#faq)

### via Direct Action

1. **Received fruit to process**
   - Click on **Select lots in picker** to select one or more Fruit lots to process at the same time
   - Enter the weight to process for each Fruit lot. This can be all or part of the total weight of the unprocessed fruit.![Process Fruit to Volume-enter weight](https://support.innovint.us/hs-fs/hubfs/Process%20Fruit%20to%20Volume-enter%20weight.webp?width=688&height=110&name=Process%20Fruit%20to%20Volume-enter%20weight.webp)
2. **Process** (optional)
   - Enter each step and instructions
   - Click on **+Add step**for more![Process Fruit to Volume-add step](https://support.innovint.us/hs-fs/hubfs/Process%20Fruit%20to%20Volume-add%20step.webp?width=688&height=145&name=Process%20Fruit%20to%20Volume-add%20step.webp)
3. **Press**
   - Lot: Select or create your destination lot
   - Vessels: Select one or more destination vessels and enter the volume
   - Lot Stage: Will default to Processed after action is submitted
   - Click on **+ Add lot** to add more press lots![Process Fruit to Volume-add press lot](https://support.innovint.us/hs-fs/hubfs/Process%20Fruit%20to%20Volume-add%20press%20lot.webp?width=688&height=455&name=Process%20Fruit%20to%20Volume-add%20press%20lot.webp)
4. **Archiving**: Leave the box checked to archive empty Fruit lots.
   *Uncheck* this box if you expect to receive fruit in the future for a Fruit lot that is being emptied of its current contents.
5. **Summary**: Double check the tons processed from your Fruit lot(s) and the total amount that is processed to your Juice lot
6. Click on ![Process Fruit to Volume-record button](https://support.innovint.us/hs-fs/hubfs/Process%20Fruit%20to%20Volume-record%20button.webp?width=122&height=24&name=Process%20Fruit%20to%20Volume-record%20button.webp)

### via Work Order

1. **Received fruit to process**
   - Click on **Select lots in picker** to choose one or more lots to process at the same time.
   - Enter your expected starting weight if you have not already received your fruit (the Requested Starting Weight defaults to the current Fruit Lot weight).
   - Choose whether you will process the Fruit Lot entirely or partially.  If you are not planning to process all the weight of your Fruit lot, you can select to leave some remaining or to only process a specific weight. This cannot be edited after work order creation.
     ![Process Fruit to Volume-rcv wo](https://support.innovint.us/hs-fs/hubfs/Process%20Fruit%20to%20Volume-rcv%20wo.webp?width=688&height=161&name=Process%20Fruit%20to%20Volume-rcv%20wo.webp)

     ***T******ip**: If you combine a Receive Fruit task with a Process Fruit to Volume task within one work order, utilize the [individual task submit](https://support.innovint.us/hc/en-us/articles/360050001811-using-work-orders-in-innovint?hsLang=en#individualtasksubmission) to submit the Receive Fruit task, the expected starting weight will automatically update in the Process Fruit to Volume task.*
2. **Process** (optional)
   - Enter each step. Instructions are also optional.
   - Click on **+Add step** for more![Process Fruit to Volume-process add](https://support.innovint.us/hs-fs/hubfs/Process%20Fruit%20to%20Volume-process%20add.webp?width=688&height=145&name=Process%20Fruit%20to%20Volume-process%20add.webp)
3. **Press**
   - Lot: Select or create your destination lot
   - Vessels: Select either to let cellar staff choose vessels or choose specific vessels
   - Lot Stage: Will default to Processed
   - Click on **+ Add Lot** to add more lots![Process Fruit to Volume-add](https://support.innovint.us/hs-fs/hubfs/Process%20Fruit%20to%20Volume-add.webp?width=688&height=308&name=Process%20Fruit%20to%20Volume-add.webp)
4. **Archiving**: Leave the box checked to archive empty Fruit lots. Uncheck this box if you expect to receive fruit in the future for a Fruit lot that is being emptied of its current contents.
5. **Summary**: Double check the tons processed from your Fruit lot(s) and the total amount that is processed to your Juice lot
6. Make sure to give your work order a title and assign it before clicking on ![Process Fruit to Volume-create button](https://support.innovint.us/hs-fs/hubfs/Process%20Fruit%20to%20Volume-create%20button.webp?width=98&height=23&name=Process%20Fruit%20to%20Volume-create%20button.webp)

### FAQ

#### Q: Can I process more than one Fruit lot at once?

*A: Yes. Go to the **Received fruit to process** step and click on Edit lots to choose additional Fruit lots.*

#### Q: Can I process a Fruit lot into more than one destination lot?

*A: Yes. In the **Received fruit to process** step, enter the weight you'd like to process in total. This can be all or part of the entire lot fill. Then in the **Process to** step, select +Add lot to add more destination lots. Select one or more vessels per lot, and enter the fill for each. Make sure to double check your final **Summary**to make sure everything balances (i.e. the **processed** weight balances with the **processed to** volume.)*

#### Q: Can I process fruit into a lot or vessel that already has contents?

*A: Yes. In the **Process to** step, choose 'Combine with existing lot' and select the lot from your list. Then select a vessel, empty or with contents, and enter the volume added to calculate the ending fill. You CANNOT add volume to a lot or vessel that currently has a fill measured in weight (i.e. you won't be able to add gallons to a lot that is measured in tons.)*

#### **Q: I'm getting a Negative Fruit Weight Error, what gives?**

*A: Check the Received Fruit to Process section of the action or task.  Here, InnoVint will calculate and display how much of the fruit lot weight is left remaining.  If you've entered more weight than you have in the fruit lot, you will see a Negative Fruit Weight error message when you try to submit the action.  Correct the processed weight to be less than or equal to the starting fruit weight.*

*![Process Fruit to Volume-remain weight](https://support.innovint.us/hs-fs/hubfs/Process%20Fruit%20to%20Volume-remain%20weight.webp?width=471&height=195&name=Process%20Fruit%20to%20Volume-remain%20weight.webp)*
