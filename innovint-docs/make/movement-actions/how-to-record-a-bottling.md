---
title: "How to Record a Bottling"
url: "https://support.innovint.us/hc/en-us/articles/207265686-how-to-record-or-edit-a-bottling-action"
category: "MAKE"
section: "Movement Actions"
page_type: "article"
lastmod: "2026-01-23"
gist: "When you're ready to bottle your wines, InnoVint helps you to easily record the details of your bottling into the system."
tags: ["packaging", "work-orders", "barrels", "mobile", "ux-friction", "cost"]
---

# How to Record a Bottling

When you're ready to bottle your wines, InnoVint helps you to easily record the details of your bottling into the system. Using our mobile app? Get more details on using the bottling task in InnoApp [here](https://support.innovint.us/hc/en-us/innoapp-how-to-complete-bottling?hsLang=en).

This article covers:

- [How to record a Bottle direct action](#Record)
- [How to create a Bottle task in a work order](#Create)
- [How to complete a Bottle task in a work order](#complete)
- [How to edit a recorded Bottle action (and packaging)](#edit)
- [Bottling with COGS Tracking](#lotcost)
- [FAQ (Frequently Asked Questions)](#faq)

### How to record a Bottle direct action

Choose the Bottle action from the Record action dropdown menu in the upper navigation bar or a Lot details page.![How to Record a Bottling-direct action](https://support.innovint.us/hs-fs/hubfs/How%20to%20Record%20a%20Bottling-direct%20action.webp?width=670&height=355&name=How%20to%20Record%20a%20Bottling-direct%20action.webp)

#### 1. Lot and Vessels

First, select your **Lot** and **Vessels** to bottle. InnoVint defaults to remove the entire vessel volume.

If you are only bottling a partial volume in a vessel, be sure to adjust the removed or ending volume(s).

#### 2. Case Goods or Formats

**Case Goods**

*If the Case Goods Management feature is activated*, decide whether to combine with an existing Case Goods lot, or else create a new lot. If you choose to combine with an existing Case Goods lot, the lot composition must match exactly, or you will see an error message when submitting the action. If you create a new lot,  the format must be selected and it cannot be edited after bottling.

Enter the lot fill with the **total number of full pallets**, **cases**, and **individual bottles**. Each field must have a number, but will accept zero (0) if you don't choose to calculate cases or pallets. For example, InnoVint will calculate a number of cases and/or pallets based solely on the number of bottles.

InnoVint will calculate the new on hand values for the Case Goods lot: new current on-hand, total bottles added, and the total volume added, based on the case goods lot format set at lot creation.

![How to Record a Bottling-case goods](https://support.innovint.us/hs-fs/hubfs/How%20to%20Record%20a%20Bottling-case%20goods.webp?width=670&height=246&name=How%20to%20Record%20a%20Bottling-case%20goods.webp)

To bottle into multiple Case Goods lots , click on the blue '+ Add lot' text.

**Formats**

*If the Case Goods Management feature is not activated*, instead of choosing your case good lot, enter your bottling **Formats**. InnoVint defaults to a Standard 750mL bottle type. Use the dropdown to select other format options, including large format bottles, kegs, cans, and growlers. If you are bottling into more than one format in the same action (ex. Standard 750mL *and* Magnum 1.5L), click on the blue '+ Add format' text.

![How to Record a Bottling-format](https://support.innovint.us/hs-fs/hubfs/How%20to%20Record%20a%20Bottling-format.webp?width=670&height=164&name=How%20to%20Record%20a%20Bottling-format.webp)

Enter the **number of bottles per case**, **number of full cases**, and **number of additional** **bottles** for each format. These values are required to calculate the total volume bottled, but can be zero (0). InnoVint will calculate the total volume bottled.

This volume is what will populate as bottled for the period on your TTB Report, and will be used to calculate the loss/gain on the action.

**TIP**: For kegs or large format bottles, you can enter 0 for the number of bottles per case and total cases. This indicates that your "bottles" are stand-alone containers.

#### 3. Packaging

Click on **Edit packaging** to select and enter the packaging materials used.

*Note: Packaging is not required to submit the action. Adjustments can be made to packaging at any time after submission, subject to the winery backdate lock.*

![How to Record a Bottling-edit packaging](https://support.innovint.us/hs-fs/hubfs/How%20to%20Record%20a%20Bottling-edit%20packaging.webp?width=670&height=503&name=How%20to%20Record%20a%20Bottling-edit%20packaging.webp)

At the top you will see a summary of the bottled format, including the total number of full cases and total number of bottles.

- - *InnoVint will default to include 4 packaging types: Glass/Vessels, Closures, Labels, and Capsules/Foils*. You can add or remove packaging types as needed, and even add multiple of the same type (ex: front and back labels as separate packaging products).
    - Click on the blue, '**+ Add packaging**' text at the bottom to add additional products.
    - Click on the negative sign to the right of the product (or batch) to remove it.
  - *For each packaging type, select your packaging product and batch(es)*. InnoVint will not accept duplicate packaging products.  If more than one batch of a single product is used for a bottled format, click on the blue, '**+ Add batch**' for the appropriate product.
  - After your batch is selected, enter the used and scrap amounts.
    - To quickly enter the used amount to match the total bottles, click on '**Apply bottles to packaging used**' in the top right corner.
    - "Scrap" is a required field. If you are not including scrap, just enter zero (0) in the scrap field.
    - InnoVint will remove the used and scrap amounts from the on hand inventory to calculate the remaining items per batch.
    - If a batch is now empty as a result of the action, you can check the '**Fully depleted**' box to remove the batch from your active inventory for future bottlings.
  - When you are done entering your packaging information, click the '**Save packaging**' button.

**TIP:** If you know what packaging products and batches you used for a bottled format, but are unsure of the used or scrap amount at the time of submitting the action, enter 0 (zero) in the input fields. This will save the product and batch information without removing items from your packaging inventory. You can then edit the action later when you have your final numbers.

#### 4. Bottling Summary

Double check your data for any errors. We especially recommend reviewing the volume gains and losses for the action, to make sure your numbers are as expected.![How to Record a Bottling-summary](https://support.innovint.us/hs-fs/hubfs/How%20to%20Record%20a%20Bottling-summary.webp?width=670&height=203&name=How%20to%20Record%20a%20Bottling-summary.webp)

#### 5. Lot Stage

Click the checkbox to automatically change your wine lot stage to 'Bottled' (or select an alternative) upon submission. Un-click the checkbox to leave the lot stage unchanged (such as if you will be continuously bottling from the same wine lot over time).

#### 6. Archiving

Click the checkbox to automatically archive empty lots upon submission.

#### 7. Record Bottle

Backdate your action if necessary, and click the 'Record Bottle' button to submit.

### How to create a Bottle task in a work order

Add a 'Bottle' task to a work order.

#### 1. Lot and Vessels

Select your **Lot** and **Vessels** to bottle.

InnoVint defaults to remove the entire vessel volume. If you are only bottling a partial volume in a vessel, be sure to adjust the requested removed or ending volume(s).

#### 2. Case Goods or Formats

**Case Goods**

*If the Case Goods Management feature is activated*, decide whether to combine with an existing Case Goods lot, or else create a new lot.

If you choose to combine with an existing Case Goods lot, the lot composition must match exactly, or you will see an error message when submitting the task.  If you create a new lot,  the format must be selected and it cannot be edited after bottling.

InnoVint will estimate the total cases bottled based on the volume removed from the wine lot.

To bottle into multiple Case Goods lots , click on the blue '+ Add lot' text.

![How to Record a Bottling-combine case goods](https://support.innovint.us/hs-fs/hubfs/How%20to%20Record%20a%20Bottling-combine%20case%20goods.webp?width=670&height=192&name=How%20to%20Record%20a%20Bottling-combine%20case%20goods.webp)

**Formats**

*If the Case Goods Management feature is not activated*, instead of choosing your case good lot, enter your planned bottling **Format(s)**.

Enter the expected **number of bottles per case**, **number of full cases**, and **number of additional bottles**. These values are required to calculate the total expected bottled volume, but can be zero (0). The values can be adjusted during work order completion.

If you are bottling into more than one format in the same action (ex. Standard 750mL *and* Magnum 1.5L), click on the blue '+ Add format' text.

#### 3. Packaging

Click on **Edit packaging** to select and enter the packaging materials to be used.

*Packaging is not required to create the work order task. Adjustments can be made to packaging at any time after work order creation.*

![How to Record a Bottling-packaging batch](https://support.innovint.us/hs-fs/hubfs/How%20to%20Record%20a%20Bottling-packaging%20batch.webp?width=670&height=337&name=How%20to%20Record%20a%20Bottling-packaging%20batch.webp)

- - InnoVint will default to include 4 packaging types: Glass/Vessels, Closures, Labels, and Capsules/Foils. You can add or remove packaging types as needed, and even add multiple of the same type (ex: front and back labels as separate packaging products).
    - Click on the blue, '**+ Add packaging**' text at the bottom to add additional products.
    - Click on the negative sign to the right of the product (or batch) to remove it.
  - For each packaging type, select your packaging product. InnoVint will not accept duplicate packaging products.
  - Batch selection is not required to create the work order, but if you prefer to specify a particular batch, click on '**+ Add batch**' for the appropriate product. Otherwise, assignees can select the appropriate batch when completing the work order.
    - If you would like to specify more than one batch to use for a bottled format, click on the blue, '**+ Add batch**'.
  - When you are done entering your packaging information, click the '**Save packaging**' button.

#### 4. Archiving

Click the checkbox to automatically archive empty lots upon submission. This box can only be check or un-checked at work order creation.

### Completing a Bottle task in a work order

![How to Record a Bottling-work order](https://support.innovint.us/hs-fs/hubfs/How%20to%20Record%20a%20Bottling-work%20order.webp?width=670&height=168&name=How%20to%20Record%20a%20Bottling-work%20order.webp)

- Users must enter the Fill as a combination of the number of pallets, cases and bottles. Each field must have a number, but will accept zero (0) if you don't choose to calculate cases or pallets. For example, InnoVint would calculate a number of cases and/or pallets based solely on the number of bottles.
- Click on '**Edit packaging**' to record the packaging products, batches and quantities depleted in the bottling.
  - At the top of the Edit Packaging slideover, you will see a summary of the bottled format, including the total number of full cases and total number of bottles, calculated by the Fill.
  - Add additional Packaging types and Products if needed.
    - Once batches are selected, you can use the 'Apply bottles to packaging used' in order to apply the calculated total bottle numbers to the 'Used' field.
    - 'Scrap' is a required field. If you are not including scrap, just enter zero (0) in the scrap field. When you are done, click 'Save packaging.'

![How to Record a Bottling-used packaging](https://support.innovint.us/hs-fs/hubfs/How%20to%20Record%20a%20Bottling-used%20packaging.webp?width=670&height=431&name=How%20to%20Record%20a%20Bottling-used%20packaging.webp)

- Review the task Bottling summary. Double check your data for any errors, including the consumed packaging summary.  We especially recommend reviewing the volume gains and losses for the action, to make sure your numbers are as expected before completing and submitting the action.

![How to Record a Bottling-summary2](https://support.innovint.us/hs-fs/hubfs/How%20to%20Record%20a%20Bottling-summary2.webp?width=670&height=264&name=How%20to%20Record%20a%20Bottling-summary2.webp)

### How to edit a recorded Bottle action

#### Edit action

Click on 'Edit action' in the top right corner of the action details page. This allows you to edit the volumes used for the bottling.

Note that volumes in Bottle action cannot be edited if the corresponding case good lot(s) have had any dependent movement actions recorded on them.

WARNING: Editing the number of filled pallets, cases, and/or number of bottles will change the total bottled volume and the total inventory gains or losses calculated by InnoVint. This will change the bottled volume and inventory gains and losses on the TTB 5120.17 report as well.

#### Edit packaging

Click on 'Edit packaging' to make changes to packaging selections. You can edit selected products and batches, add new packaging types, or remove packaging from the bottle action.

If any involved packaging batches are 'Fully depleted' at the time of the edit, they will not display a batch, and you will not be able to save your packaging edit. You must first 'Undeplete' the impacted batches via the Dry Goods Explorer before editing packaging on the action.

![How to Record a Bottling-depleted](https://support.innovint.us/hs-fs/hubfs/How%20to%20Record%20a%20Bottling-depleted.webp?width=670&height=529&name=How%20to%20Record%20a%20Bottling-depleted.webp)

### Bottling with COGS Tracking

If COGS Tracking is activated for your account, there are a few items to consider when bottling and packaging:

1)  Any costs added to the bottled case good lot(s) - such as indirect cost items, or additional packaging added via an Add Packaging action - will not be included on the Bottled Costs Report.  Only direct packaging applied via the Bottle action, and indirect costs added to the bulkjuice/wine lot *prior to the point of bottling*, will be reflected on the Bottled Costs Report.  Find more details on the Bottled Cost Report [here](https://support.innovint.us/hc/en-us/cost-reports?hsLang=en#bottled).

2) When you are only *partially* bottling a wine lot, and if you will be adding *indirect costs* *specific to bottling* (such as utilizing a cost item for mobile bottling or staffing costs) to the bulk juice/wine wine, we recommend splitting off that portion of the bulk wine lot into a unique lot code prior to bottling and applying those costs to the new lot. Otherwise, those indirect bottling specific costs will be applied equally to the entire contents of the bulk lot.

FAQ

**Q. Can I bottle more than one lot in an action?**

*A. No. Each Bottling action or task can only record bottling for one lot at a time. A single lot can be bottled into multiple formats. See above.*

*To assign multiple lots for bottling, you can also create multiple tasks in a work order - one for each lot to bottle.*
