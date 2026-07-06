---
title: "How to Receive Fruit"
url: "https://support.innovint.us/hc/en-us/articles/360005125552-receive-fruit"
category: "Harvest"
section: "Harvest Workflow & Fermentation Tracking"
page_type: "article"
lastmod: "2025-11-20"
gist: "The Receive Fruit action in InnoVint is your first step when bringing fruit weight into your facility from a vineyard."
tags: ["harvest", "work-orders", "fermentation", "vineyard", "corrections", "lot-identity"]
---

# How to Receive Fruit

The Receive Fruit action in InnoVint is your first step when bringing fruit weight into your facility from a vineyard.

**This article covers:**

- [What does the Receive Fruit action do?](#what)
- [Receive Fruit via Direct Action](#Direct-Action)
  - [Using Simple Receive Fruit](#Simple-direct)
  - [Using Advanced Receive Fruit](#ARF-Direct)
- [Schedule & Receive via Work Order](#Recieve-WO)
  - [How to Create a Receive Fruit Work Order](#Create-WO)
  - [How to Complete a Receive Fruit Work Order](#Complete-WO)
- [How to Receive Fruit without a weigh tag](#wo-wt)
- [Edit, Delete, or Void a Weigh Tag](#edit)

### What does the Receive Fruit action do?

This action records time of arrival, weigh tag (see your weigh tag options [here](https://support.innovint.us/hc/en-us/articles/115003754563-simple-vs-advanced-receive-fruit?hsLang=en)), weight, and composition details - vineyard, block, variety, and appellation - for your Fruit Lot attributes.

- The Receive Fruit action can only be recorded on [Fruit lots](https://support.innovint.us/hc/en-us/what-is-the-difference-between-a-fruit-lot-and-a-juice/wine-lot?hsLang=en).
  - If you do not already have a Fruit lot created in InnoVint, you can create a new Fruit lot code from within the Receive Fruit direct action or work order task.
- Each Receive Fruit action corresponds to **one** weigh tag.
  - If you need multiple weigh tags, be sure to utilize multiple Receive Fruit actions.
- The Receive Fruit action can be recorded on the same Fruit lot multiple times.

**Note**: The Process Fruit action (the next step after receiving fruit) includes the option to archive a lot if it will no longer have contents. ![How to Receive Fruit-archive box](https://support.innovint.us/hs-fs/hubfs/How%20to%20Receive%20Fruit-archive%20box.png?width=688&height=77&name=How%20to%20Receive%20Fruit-archive%20box.png)If you plan to receive fruit on the same fruit lot in the future, don't forget to uncheck this box - or you can [unarchive the Fruit lot](https://support.innovint.us/hc/en-us/articles/205039485-archive-lots-and-vessels?hsLang=en) from the Lot details page when you are ready to receive fruit on that lot again.

### Receive Fruit via Direct Action

#### Where to Find the Receive Fruit action

- In the top Nav bar or the Fruit Lot details page, via the Record action menu
- In the Fruit Lot Explorer, via the blue Receive weight button
  ![How to Receive Fruit-rcv button](https://support.innovint.us/hs-fs/hubfs/How%20to%20Receive%20Fruit-rcv%20button.webp?width=688&height=51&name=How%20to%20Receive%20Fruit-rcv%20button.webp)
- On the Vineyard Dashboard, via the Receive Fruit button
  ![How to Receive Fruit-rcv fruit button](https://support.innovint.us/hs-fs/hubfs/How%20to%20Receive%20Fruit-rcv%20fruit%20button.webp?width=688&height=40&name=How%20to%20Receive%20Fruit-rcv%20fruit%20button.webp)
- On the Harvest Launchpad, via the Receive unscheduled Fruit button

#### How to submit your Receive Fruit action

You can perform a Receive Fruit action with Simple Receive Fruit (input your own weigh tag number and the net weight) or Advanced Receive Fruit (input tare and gross weights, InnoVint will generate sequential weigh tag numbers).

**Using Simple Receive Fruit**

1. **Time of arrival** defaults to the current date and time. Review and change this if necessary.
2. **Weigh tag**: Enter the weigh tag number from your paper weigh tag.
3. **Fruit lots**
   - Choose to create a new fruit lot or select an existing fruit lot.
     - **Expected Yield:** After creating or selecting the fruit lot, you’ll see fields for Area, Yield, and Expected Yield. If the vineyard block has an area value entered, InnoVint uses that area along with one of the following as the Expected Yield value — scheduled fruit, historically received fruit, or the crop estimate — in order to calculate the Yield values.
     - ![Receive Fruit - Expected Yield](https://support.innovint.us/hs-fs/hubfs/Receive%20Fruit%20-%20Expected%20Yield.png?width=688&height=153&name=Receive%20Fruit%20-%20Expected%20Yield.png)

1. - (optional) Sugar Reading: Enter the harvest sugar reading to display as the last brix or baume for the fruit lot in the Fruit Intake Report (\*\*CA Winemakers: This will be very helpful for the California Grape Crush Report!). This entry can also be edited or deleted at any time after the action is recorded.
   - Next, enter your net Fruit Weight.
   - Click on + Add fruit lot under the Fruit Lots header if you would like to receive fruit for additional fruit lots on the same weigh tag.
2. Click on ![How to Receive Fruit-record button](https://support.innovint.us/hs-fs/hubfs/How%20to%20Receive%20Fruit-record%20button.webp?width=117&height=23&name=How%20to%20Receive%20Fruit-record%20button.webp)

![How to Receive Fruit-action](https://support.innovint.us/hs-fs/hubfs/How%20to%20Receive%20Fruit-action.webp?width=688&height=523&name=How%20to%20Receive%20Fruit-action.webp)

**Note:** The recorded date and time of the Receive Fruit action is different than the **Time of arrival**. To match the recorded date and time with the Time of arrival, the action may need to be backdated.

**Using Advanced Receive Fruit**

Advanced Receive Fruit actions are similar to the Simple action, but have additional fields and functionality.  *The Advanced Receive Fruit feature requires activation.* Compare the Simple and Advanced options [here](https://support.innovint.us/hc/en-us/articles/115003754563-simple-vs-advanced-receive-fruit?hsLang=en) and find detailed instructions on activation in [this article](https://support.innovint.us/hc/en-us/articles/115003779846-activating-the-advanced-receive-fruit-option-to-generate-weigh-tags?hsLang=en).

1. If you have Multi Weight Locations activated, select your **Weighing location.** Otherwise, you will not see this field, and this will default to your weighing address from your Harvest Settings on the weigh tag.
2. **Time of arrival** defaults to the current date and time. Change this if necessary (i.e. if you are backdating the action).
3. **Weigh tag**
   - The weigh tag number will be generated by InnoVint when the action is completed.
   - Choose your deputy weighmaster, if more than one at your facility.
   - (Optional) Enter the truck license and trailer license.
     - To enter multiple trailer licenses, enter a comma and space between each to separate them and have them display properly on your weigh tag:
       ![How to Receive Fruit-weigh tag](https://support.innovint.us/hs-fs/hubfs/How%20to%20Receive%20Fruit-weigh%20tag.webp?width=549&height=111&name=How%20to%20Receive%20Fruit-weigh%20tag.webp)
       ![How to Receive Fruit-vehicle license](https://support.innovint.us/hs-fs/hubfs/How%20to%20Receive%20Fruit-vehicle%20license.webp?width=339&height=110&name=How%20to%20Receive%20Fruit-vehicle%20license.webp)
   - Use the Notes field to append any text or information you want to appear on the generated weigh tag.
4. **Fruit lots**
   - Choose to create a new fruit lot or select an existing fruit lot.
     **Expected Yield:** After creating or selecting the fruit lot, you’ll see fields for Area, Yield, and Expected Yield. If the vineyard block has an area value entered, InnoVint uses that area along with one of the following as the Expected Yield value — scheduled fruit, historically received fruit, or the crop estimate — in order to calculate the Yield values.
     ![Receive Fruit - Expected Yield](https://support.innovint.us/hs-fs/hubfs/Receive%20Fruit%20-%20Expected%20Yield.png?width=688&height=153&name=Receive%20Fruit%20-%20Expected%20Yield.png)
   - (optional) Sugar Reading: Enter the harvest sugar reading to display as the last brix or baume for the fruit lot in the Fruit Intake Report (\*\*CA Winemakers: This will be very helpful for the California Grape Crush Report!). This entry can also be edited and deleted at any time after the action is recorded.
   - Weighing groups. Click on **+Add group** to activate the slide-over for data entry.
     - Select your tare container and number of containers to calculate the tare for your weigh group. Find out about presetting your tare container weights in [Weigh tag Settings.](https://support.innovint.us/hc/en-us/articles/360012349452-editing-weigh-tag-settings?hsLang=en)
     - Enter the gross weight to calculate the fruit weight.
     - Click on ![How to Receive Fruit-save button](https://support.innovint.us/hs-fs/hubfs/How%20to%20Receive%20Fruit-save%20button.webp?width=171&height=20&name=How%20to%20Receive%20Fruit-save%20button.webp) to keep the slide-over open and pre-populate the tare container selection. Click on ![How to Receive Fruit-save button2](https://support.innovint.us/hs-fs/hubfs/How%20to%20Receive%20Fruit-save%20button2.webp?width=116&height=22&name=How%20to%20Receive%20Fruit-save%20button2.webp) to save and exit the slide-over.

       ![How to Receive Fruit-weigh group](https://support.innovint.us/hs-fs/hubfs/How%20to%20Receive%20Fruit-weigh%20group.webp?width=688&height=266&name=How%20to%20Receive%20Fruit-weigh%20group.webp)
     - To add a second tare container to the same weigh group, click on **+Add container**. You can use this in conjunction with the "Custom tare container" to use a truck scale and record the truck weight, or combine other tare containers, such as lugs and pallets into a single weigh group.
       ![How to Receive Fruit-add container](https://support.innovint.us/hs-fs/hubfs/How%20to%20Receive%20Fruit-add%20container.webp?width=688&height=419&name=How%20to%20Receive%20Fruit-add%20container.webp)
   - To receive fruit for additional fruit lots on the same weigh tag, click on **+Add fruit lot** under the Fruit lots header. Choose/create you fruit lot(s) and enter the weighing groups. *All fruit lots on the same task will appear on the same weigh tag.*
5. **Summary**
   - Double check your Net, Gross, and Tare weights for each fruit lot.
6. Click on ![How to Receive Fruit-record and download](https://support.innovint.us/hs-fs/hubfs/How%20to%20Receive%20Fruit-record%20and%20download.webp?width=243&height=25&name=How%20to%20Receive%20Fruit-record%20and%20download.webp).

**Note:** The recorded date and time of the Receive Fruit action is different than the **Time of arrival**. To match the recorded date and time with the Time of arrival, the action may need to be backdated.

![How to Receive Fruit-rcv action2](https://support.innovint.us/hs-fs/hubfs/How%20to%20Receive%20Fruit-rcv%20action2.webp?width=688&height=765&name=How%20to%20Receive%20Fruit-rcv%20action2.webp)

Any edits made to the Receive Fruit action (fruit lot or weigh tag fields) after the action is recorded will cause the original weigh tag number to be [voided](#edit). InnoVint will regenerate a new weigh tag with the next consecutive number.

### Schedule & Receive via Work Order

Creating a work order with a Receive Fruit task allows you to create a fruit schedule. Find out more about how to see and schedule fruit [here](https://support.innovint.us/hc/en-us/how-to-schedule-fruit?hsLang=en)!

#### **How to Create a Receive Fruit Work Order**

To create a Receive Fruit work order, start a new work order:

- In the top Nav bar via the Create work order button/menu
- In the Work Order Explorer, via the +Create work order button
- In the Vineyard OR Fruit Lot Explorers, via the blue Receive weight button
  ![How to Receive Fruit-create wo](https://support.innovint.us/hs-fs/hubfs/How%20to%20Receive%20Fruit-create%20wo.webp?width=688&height=46&name=How%20to%20Receive%20Fruit-create%20wo.webp)
- On the Harvest Launchpad, via the +Create work order button

**Add a Receive Fruit task**

**![How to Receive Fruit-add fruit task](https://support.innovint.us/hs-fs/hubfs/How%20to%20Receive%20Fruit-add%20fruit%20task.webp?width=118&height=199&name=How%20to%20Receive%20Fruit-add%20fruit%20task.webp)**

**Populate the required task fields**

Creating a task with Advanced Receive Fruit is very similar to creating one with Simple Receive, with a single additional field.

1. **Advanced Receive only**. If you have [Multi Weight Locations activated,](https://support.innovint.us/hc/en-us/articles/115003779846-activating-the-advanced-receive-fruit-option-to-generate-weigh-tags?hsLang=en#MWL) select your *Weighing location.* Otherwise, you will not see this field, and this will default to your weighing address from your Harvest Settings on the weigh tag.
2. Enter the *Expected time of arrival.* The expected date will default to the due date for the work order at the bottom of the page.
3. Select Fruit lots.Choose to Create a new fruit lot code or to Receive Fruit on an existing lot.

   • *Expected Yield:* After creating or selecting the fruit lot, you’ll see fields for Area, Yield, and Expected Yield. If the vineyard block has an area value entered, InnoVint uses that area along with one of the following as the Expected Yield value — scheduled fruit, historically received fruit, or the crop estimate — in order to calculate the Yield values.

   ![Receive Fruit - Expected Yield](https://support.innovint.us/hs-fs/hubfs/Receive%20Fruit%20-%20Expected%20Yield.png?width=688&height=153&name=Receive%20Fruit%20-%20Expected%20Yield.png)

   • To schedule other fruit lots that you plan to receive and record on the same weigh tag, click on *+Add fruit lot* under the Fruit lots header.
4. Enter the expected weight.  If the Expected Yield (above) is accurate, you can consider "Applying expected yield from block," and InnoVint will populate the Expected Yield for you.

**Create the Work Order!**

Don't forget to give your work order a title and assign it to someone. Select the due date as the date you expect to receive fruit. Finally, click on ![How to Receive Fruit-create button](https://support.innovint.us/hs-fs/hubfs/How%20to%20Receive%20Fruit-create%20button.webp?width=121&height=26&name=How%20to%20Receive%20Fruit-create%20button.webp)

**![How to Receive Fruit-time add lot action](https://support.innovint.us/hs-fs/hubfs/How%20to%20Receive%20Fruit-time%20add%20lot%20action.webp?width=688&height=456&name=How%20to%20Receive%20Fruit-time%20add%20lot%20action.webp)**

#### **How to Complete a Receive Fruit Work Order**

Completing Advanced Receive Fruit tasks is similar to completing Simple tasks, but there are more additional fields and functionality.

1. **Advanced Receive Only**. Review the Weighting Location.
2. Adjust the Time of arrival, if necessary
3. Weigh tags
   1. **Simple Receive only.** Enter your weigh tag number.
   2. **Advanced Receive only**. Complete the Weigh tag section.  The weigh tag number will be generated by InnoVint when the action is completed.
      • Choose your deputy weighmaster, if more than one at your facility.
      • (Optional) Enter the truck license and trailer license. To enter multiple trailer licenses, enter a comma and space between each to separate them and have them display properly on your weigh tag:
      ![How to Receive Fruit-weigh tag](https://support.innovint.us/hs-fs/hubfs/How%20to%20Receive%20Fruit-weigh%20tag.webp?width=549&height=111&name=How%20to%20Receive%20Fruit-weigh%20tag.webp)

       • Use the Notes field to append any text or information you want to appear on the generated weigh tag.
4. Fruit Lots. To receive fruit for additional fruit lots on the same weigh tag, click on +Add fruit lot under the Fruit lots header. All fruit lots on the same task will appear on the same weigh tag.
5. (optional) Sugar Reading: Enter the harvest sugar reading to display as the last brix or baume for the fruit lot in the [Fruit Intake Report](https://support.innovint.us/hc/en-us/articles/205606335-fruit-intake-report?hsLang=en) (\*\*CA Winemakers: This will be very helpful for the California Grape Crush Report!). This entry can also be edited or deleted at any time after the action is recorded.
6. Record your fruit weight
   1. **Simple Receive only**. Enter the net Fruit Weight received.
      ![Receive Fruit - simple fields](https://support.innovint.us/hs-fs/hubfs/Receive%20Fruit%20-%20simple%20fields.png?width=688&height=327&name=Receive%20Fruit%20-%20simple%20fields.png)
   2. **Advanced Receive only**. Enter your weigh groups for each Fruit lot.![Receive Fruit Advanced Fields](https://support.innovint.us/hs-fs/hubfs/Receive%20Fruit%20Advanced%20Fields.png?width=688&height=329&name=Receive%20Fruit%20Advanced%20Fields.png)
   - Click on **+Add group** to activate the slide-over for data entry.
   - Select your tare container and number of containers to calculate the tare for your weigh group. Find out about presetting your tare container weights in [Weigh tag Settings.](https://support.innovint.us/hc/en-us/articles/360012349452-editing-weigh-tag-settings?hsLang=en)
   - Enter the gross weight to calculate the fruit weight.

1. - Click on ![How to Receive Fruit-save button](https://support.innovint.us/hs-fs/hubfs/How%20to%20Receive%20Fruit-save%20button.webp?width=188&height=22&name=How%20to%20Receive%20Fruit-save%20button.webp) to keep the slide-over open and pre-populate the tare container selection. Click on ![How to Receive Fruit-save button2](https://support.innovint.us/hs-fs/hubfs/How%20to%20Receive%20Fruit-save%20button2.webp?width=100&height=19&name=How%20to%20Receive%20Fruit-save%20button2.webp) to save and exit the slide-over.
     ![How to Receive Fruit-save weight group](https://support.innovint.us/hs-fs/hubfs/How%20to%20Receive%20Fruit-save%20weight%20group.webp?width=688&height=266&name=How%20to%20Receive%20Fruit-save%20weight%20group.webp)
   - To add a second tare container to the same weigh group, click on **+Add container**. You can use this in conjunction with the "Custom tare container" to use a truck scale and record the truck weight, or combine other tare containers, such as lugs and pallets into a single weigh group.
     ![How to Receive Fruit-add container2](https://support.innovint.us/hs-fs/hubfs/How%20to%20Receive%20Fruit-add%20container2.webp?width=688&height=419&name=How%20to%20Receive%20Fruit-add%20container2.webp)
   - Double check your Net, Gross, and Tare weights for each fruit lot.

9.    Complete task: click on ![How to Receive Fruit-comp task and download](https://support.innovint.us/hs-fs/hubfs/How%20to%20Receive%20Fruit-comp%20task%20and%20download.webp?width=180&height=24&name=How%20to%20Receive%20Fruit-comp%20task%20and%20download.webp)

Any edits made to the Receive Fruit action (fruit lot or weigh tag fields) after the task is submitted will cause the original weigh tag number to be voided. InnoVint will regenerate a new weigh tag with the next consecutive number.

### How to Receive Fruit without a Weigh Tag

*\*\* This method is only recommended if you have the **Advanced Receive Fruit** system activated and do not want to generate a weigh tag number in InnoVint. Without the Advanced Receive Fruit system, we recommend receiving fruit via the method outlined above for Simple Receive Fruit.*

*\*\* Want to receive fruit with a weigh tag to sell? Check out [this article.](https://support.innovint.us/hc/en-us/how-to-track-sold-fruit?hsLang=en)*

Use the Fruit Weight Adjustment action to receive fruit on a created Fruit lot without a weigh tag.

![How to Receive Fruit-compliance warning](https://support.innovint.us/hs-fs/hubfs/How%20to%20Receive%20Fruit-compliance%20warning.webp?width=688&height=219&name=How%20to%20Receive%20Fruit-compliance%20warning.webp)

**Note:** Fruit Weight Adjustments are ***not*** reflected on the Fruit Intake Report, although a positive weight adjusted will be reflected on the TTB Report, Part IV *Summary of Materials Received and Used* in Column (a): UNCRUSHED (Pounds) on Line 2 as "Received.*"*

**Costing:** Fruit Weight Adjustments have no bearing on *direct* fruit costs (ie costs applied directly to the block via Vineyard Contract, Fruit Cost Worksheet, or in the Block Details page). To apply direct fruit costs to a lot, you must use the Receive Fruit action. To apply costs to fruit that is entered in InnoVint through a Fruit Weight Adjustment, record a **cost item** on the fruit lot.

### Edit/Delete/Void a Weigh Tag

The Receive Fruit action not only records the total weight received on each Fruit lot (to populate the [Fruit Intake Report](https://support.innovint.us/hc/en-us/articles/205606335-fruit-intake-report?hsLang=en)), but it also tracks the total fruit received per vineyard block. To adjust the weight on this report or to correct a mistake on an InnoVint-generated weigh tag, changes need to be made on the Receive Fruit action.

#### Simple Receive Fruit action

To correct a mistake, the Receive Fruit action may be edited, or deleted and re-recorded. Find out about how to edit an action [here](https://support.innovint.us/hc/en-us/articles/208141233-how-to-edit-or-delete-recorded-actions?hsLang=en). To delete the Receive Fruit action, no other movement actions (e.g. process to gallons/tons) may be recorded after it, or they will need to be deleted first. At the top of the Action details page, click on View dependent actions list to see what actions will need to be deleted before you can delete and re-enter the Receive Fruit action.

If editing or deleting the Receive Fruit action is not possible, we recommend recording a [Weight Transfer](https://support.innovint.us/hc/en-us/articles/360006664192-weight-transfer?hsLang=en) or [Weight Adjustment](https://support.innovint.us/hc/en-us/articles/360006618412-weight-and-volume-adjustments-for-undeclared-fruit-or-juice?hsLang=en) to amend the tonnage outside of the Receive Fruit action. Or simply leaving a note on the action of the correct weight if the lot has since been pressed. Weight transfers/adjustments do *NOT* adjust weights in the Fruit Intake Report, which reflects the record on the Receive Fruit action.

#### Advanced Receive Fruit action

While a Receive Fruit action created with Advanced Receive Fruit activated may be edited or deleted, editing or deleting the action will generate a new weigh tag number for the fruit receipt. The original weigh tag number from an edited or deleted action will be marked as Void.

Any new weigh tags will continue to be numbered in sequential order following the last created weigh tag.

**Due to CDFA regulations on weighmaster certificates, once a weigh tag is generated in InnoVint and the weigh tag number established, it cannot be edited or deleted, only voided.**

You can find all weigh tags, including any voided weigh tags in the [Fruit Intake Report](https://support.innovint.us/hc/en-us/articles/205606335-fruit-intake-report?hsLang=en) (clear the Voided filter in order to surface voided weigh tags).

![How to Receive Fruit-fruit intake report](https://support.innovint.us/hs-fs/hubfs/How%20to%20Receive%20Fruit-fruit%20intake%20report.webp?width=688&height=191&name=How%20to%20Receive%20Fruit-fruit%20intake%20report.webp)
