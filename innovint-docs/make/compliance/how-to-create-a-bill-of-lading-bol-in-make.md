---
title: "How to create a Bill of Lading (BOL) in MAKE"
url: "https://support.innovint.us/hc/en-us/articles/360055473151-how-to-create-a-bill-of-lading-bol-"
category: "MAKE"
section: "Compliance"
page_type: "article"
lastmod: "2026-04-27"
gist: "Create and print a Bill of Lading document from within InnoVint using your lot data and information that is tracked within the platform."
tags: ["bond", "transfers", "work-orders", "compliance", "exports", "reporting"]
---

# How to create a Bill of Lading (BOL) in MAKE

Create and print a Bill of Lading document from within InnoVint using your lot data and information that is tracked within the platform. This article includes:

- [Introduction to the Bill of Lading feature](#intro)
- [How to generate a BOL in InnoVint](#generate)
  - [Via Bond to Bond Transfers](#inactions)
  - [Via the Report Explorer](#Reportexplorer)
- [BOL Details & Information](#details)
- [Frequently Asked Questions](#faq)

### Introduction to BOLs

Bills of Lading can be created in InnoVint from the following locations:

1. Via any Bond to Bond Transfer action or task (supports a single lot per BOL)
2. From the Work Order details page for work orders containing at least one B2B Out task (supports multiple lots per BOL), or
3. From the Report Explorer (supports multiple lots per BOL)

Upon creation, BOLs are accessed via a popup window, at which point you may choose to print and/or save the pdf document. **InnoVint does not save a copy of the generated BOL**. It is InnoVint's recommendation that users print copies as needed, as well as save a digital version to their computer or cloud storage solution for reference later.

### How to generate a BOL in InnoVint

#### Via Bond to Bond Transfers

The following actions include the option to generate a Bill of Lading both when submitting the action, and after submitting the action (on the Action details page):

- B2B within your winery
- B2B to another InnoVint winery
- B2B Transfer Out

Learn more about our different types of B2B actions [here](https://support.innovint.us/hc/en-us/articles/360018542692-bond-to-bond-transfers?hsLang=en).

The **B2B Transfer Out** action (and the B2B Transfer (Inter-Facility) action) are the only B2B actions supported by work order tasks.

These tasks also include the option to generate a Bill of Lading at any point after the work order is created for the lot(s) involved in those task(s). If you are using a work order containing multiple B2B tasks, you can also easily generate a [multi-lot BOL from your work order](#WO_details)!

**When submitting a B2B Transfer action:**

Within each action listed above (all types of B2B actions), you have the option to generate a Bill of Lading as the action is submitted. This Generate Bill of Lading checkbox is selected by default, but you can deselect the option if you would like to skip it.

![How to create a Bill of Lading (BOL)-transfer out](https://support.innovint.us/hs-fs/hubfs/How%20to%20create%20a%20Bill%20of%20Lading%20(BOL)-transfer%20out.webp?width=670&height=348&name=How%20to%20create%20a%20Bill%20of%20Lading%20(BOL)-transfer%20out.webp)After you click on **Record**, the action will submit and InnoVint will automatically open a slide over page to create your Bill of Lading.

![How to create a Bill of Lading (BOL)-gif](https://support.innovint.us/hs-fs/hubfs/How%20to%20create%20a%20Bill%20of%20Lading%20(BOL)-gif.gif?width=600&height=338&name=How%20to%20create%20a%20Bill%20of%20Lading%20(BOL)-gif.gif)

The slide over will auto-populate with the known details of your B2B Transfer action, and allow you to edit or populate additional lot and shipment details - more information on these fields is [below](#details).

Make sure to review and update all details and information in the BOL screen. When you are ready, click **Download Bill of Lading** to generate a pdf that automatically downloads to your computer.

**NOTE: This Bill of Lading is not saved within InnoVint.** The generated pdf document should automatically appear in the default downloads folder on your computer.

**After submitting an action:**

After a B2B Transfer action has been submitted in InnoVint, you can also generate a BOL from the Action details page. Go to the Lot History or Winery Activity Feed to find the B2B Transfer action, then click on **Generate Bill of Lading** in the bottom right corner.

![How to create a Bill of Lading (BOL)-generate](https://support.innovint.us/hs-fs/hubfs/How%20to%20create%20a%20Bill%20of%20Lading%20(BOL)-generate.webp?width=670&height=298&name=How%20to%20create%20a%20Bill%20of%20Lading%20(BOL)-generate.webp)

**NOTE:** Clicking on Generate Bill of Lading in a past action **generates a brand new document.** It will not restore any previously generated BOLs.

**In the Work Order details page:**

*This option supports multiple lots on a single Bill of Lading.*

If you have an open work order with at least one B2B Transfer Out (or B2B Transfer (Inter-Facility)) task, there will now be a "Print Bill of Lading" button that will display at the top right of the work order.

**![How to create a Bill of Lading (BOL)-open wo](https://support.innovint.us/hs-fs/hubfs/How%20to%20create%20a%20Bill%20of%20Lading%20(BOL)-open%20wo.webp?width=670&height=89&name=How%20to%20create%20a%20Bill%20of%20Lading%20(BOL)-open%20wo.webp)**

This button allows you to quickly access the "Create a Bill of Lading" slideover, and automatically populates multiple lots if you have more than one lot shipping on the same work order.

In the Create BOL slideover, every lot from each B2B Transfer Out task in the work order will be pre-populated in the BOL in the same order of the tasks on the work order, even if there are other types of tasks on the work order.

- You will be able to add or remove lots from the Create BOL screen.
- The "Shipping From" field will be populated by the bond information from the *first* lot in the *first* B2B Transfer Out task in the work order.
- If you set the "To location" in the *first* B2B Transfer Out task, then the "Shipped to" location will be automatically populated on the BOL. Find out about setting up your Shipping Locations [here](https://support.innovint.us/hc/en-us/locations?hsLang=en).
  ![How to create a Bill of Lading (BOL)-shipping location](https://support.innovint.us/hs-fs/hubfs/How%20to%20create%20a%20Bill%20of%20Lading%20(BOL)-shipping%20location.webp?width=599&height=246&name=How%20to%20create%20a%20Bill%20of%20Lading%20(BOL)-shipping%20location.webp)
- Each individual task still provides an option for the generation of an individual "one lot" Bill of Lading.

#### Via the Report Explorer

*Use this option if you want to include multiple lots on a single Bill of Lading.*

To create a Bill of Lading outside of a Bond to Bond Transfer, you can access a blank BOL template from the Compliance section of the Report Explorer. Click on **Create BOL** to open a slide over page and generate a new BOL.

![How to create a Bill of Lading (BOL)-mult lots](https://support.innovint.us/hs-fs/hubfs/How%20to%20create%20a%20Bill%20of%20Lading%20(BOL)-mult%20lots.webp?width=670&height=78&name=How%20to%20create%20a%20Bill%20of%20Lading%20(BOL)-mult%20lots.webp)

When using this template, we recommend selecting a lot first. This will populate the "Shipping from" information with the known bond details associated with that lot.

If you want to add multiple lots to a single BOL, use the **+ Add lot**button next to the Lot & Vessel Information header. You may select empty lots or archived lots via the lot picker on the BOL template (use your filters to "include archived lots" and add them in the picker).

![How to create a Bill of Lading (BOL)-add lot](https://support.innovint.us/hs-fs/hubfs/How%20to%20create%20a%20Bill%20of%20Lading%20(BOL)-add%20lot.webp?width=670&height=529&name=How%20to%20create%20a%20Bill%20of%20Lading%20(BOL)-add%20lot.webp)

Each added lot will have its own set of Lot & Vessel Information to complete. Find out about all those available fields [here](#details).

Otherwise, follow the same instructions above on how to generate, print, and save your BOL.

NOTE: Generating a BOL does not record a Bond to Bond Transfer action in InnoVint.

### BOL Details & Information

InnoVint will auto-populate BOL details with any known information that is associated with the selected lot or action. All details within a BOL can be removed or changed as needed.

#### Shipping/Freight Information

- **Shipping date**
  Defaults to the current date. Can be changed to any date in the past or future.
- **BOL #** (Optional)                                                                                                                                Users should manually enter this number before downloading the BOL to a pdf. InnoVint doesn't automatically generate BOL#s.

- **Shipping from**
  - **Location name**Defaults to the winery account name
  - **c/o**Defaults to the DBA name associated with the bond registry number of Lot #1
  - **Registry number**Defaults to the bond registry number of Lot #1.
  - **Street address, City, State/Territory, Zip/Postal Code, and Country**Defaults to the address associated with the bond registry number
- **Shipped to**InnoVint will auto-fill this information if a location from your saved Shipping Locations is selected via the B2B action.
   ![How to create a Bill of Lading (BOL)-ship to](https://support.innovint.us/hs-fs/hubfs/How%20to%20create%20a%20Bill%20of%20Lading%20(BOL)-ship%20to.webp?width=403&height=150&name=How%20to%20create%20a%20Bill%20of%20Lading%20(BOL)-ship%20to.webp)
  Alternately, use the dropdown menu here to select a previously saved location. Learn more about using saved Shipping Locations [here](https://support.innovint.us/hc/en-us/locations?hsLang=en).
  ![How to create a Bill of Lading (BOL)-ship drop down](https://support.innovint.us/hs-fs/hubfs/How%20to%20create%20a%20Bill%20of%20Lading%20(BOL)-ship%20drop%20down.webp?width=326&height=269&name=How%20to%20create%20a%20Bill%20of%20Lading%20(BOL)-ship%20drop%20down.webp)
- #### Lot & Vessel Information

  - **Lot #1**
    - Lot code(s) will be selected automatically when generating a BOL via a B2B action or work order task.
    - Use the lot menu or picker to select your first lot when using the blank template via the Report Explorer.  This template provides the **+ Add lot** button to add additional lots.**![How to create a Bill of Lading (BOL)-add lot2](https://support.innovint.us/hs-fs/hubfs/How%20to%20create%20a%20Bill%20of%20Lading%20(BOL)-add%20lot2.webp?width=670&height=124&name=How%20to%20create%20a%20Bill%20of%20Lading%20(BOL)-add%20lot2.webp)**
  - **Description**Defaults to the lot code and name.
  - **Class/Type**Defaults to "Grape wine."
  - **Volume**
    Enter your shipped volume here.  This field:
    - Defaults to the volume removed in the B2B Transfer action.
    - Defaults to the current lot fill when using the blank template via the Report Explorer.
  - **Contains sulfites**
    Defaults to *No*.  If the user selects *Yes*, the resulting BOL will include  'Contains sulfites' language.
  - **Include containers**Defaults to *No*. If *Yes*, the vessel information (number and capacity) is listed in text format.
    *Note:* Selecting to include containers does not remove or archive the vessels in InnoVint.
  - **Tax Class**Defaults to the current tax class of the selected lot.
    *Note:* Tax class or alcohol is required on a BOL. If you select *Don't include tax class* in the dropdown, we recommend including the necessary details in the Description or Notes.
  - **Analysis (Optional)**

    Use an existing saved analysis panel, or include ad hoc analysis results on your BOL. If results have been recorded on the lot, the most recent result will autofill the analysis field. You can also manually enter analysis here at the time of BOL creation.

    ![How to create a Bill of Lading (BOL)-analysis](https://support.innovint.us/hs-fs/hubfs/How%20to%20create%20a%20Bill%20of%20Lading%20(BOL)-analysis.webp?width=670&height=354&name=How%20to%20create%20a%20Bill%20of%20Lading%20(BOL)-analysis.webp)
  - **Composition**
    This field has three options:
    - Defaults to include the composition as it is displayed in InnoVint. This will print up to 6 components for vintage, variety, and appellation. If there are more than 6, the BOL will print the top 5 components and combine the rest labeled as *Other*.
    - If you would prefer to edit the components that print on the BOL, select 'Enter composition as text.' This opens a text box with up to  6 components prefilled.
    - If you want to print the complete composition of a lot with more than 6 components, you can opt to print the full composition on a second page. This will generate a second page that displays your entire lot composition, with the phrase: "Full composition attached" on the front of the BOL.
      - This option will also contain the varietal-appellation composition.

- **Scale Ticket #** (Optional)                                                                                                                  Enter a scale ticket number here, if required. This field defaults to print blank.
- **Seal #** (Optional)      Enter any seals used to "lock" manifold or access point on tankers. This field defaults to print blank.

#### Case Good Lots

Case good lots will have additional fields within the Lot & Vessel Information section:

- **Format**
  Displays the bottle format of the case good lot. This field is editable.

- **Taxpaid**
  Defaults to *No*.  If the user selects Yes, the resulting BOL will include  'Taxpaid' language.
- **Cases (#) & Total case weight**
  Total case weight must be calculated by the user.
- **Include pallets**
  Defaults to *No*. If *Yes*, then user will see additional fields for the number and individual weight of pallets.
- **Total weight**
  Requires entry of number of cases and case weight, and will total the load weight including  pallets. On a BOL with multiple case good lots, each lot will have a total weight, and the BOL will also have the total shipment weight of all lots.

#### Notes

This is a simple text field. Use this field to enter any other details or notes that you would like printed on the BOL.

### FAQ

**Q. How do I update my bond information in InnoVint?**

*A: Contact Client Success at [support@innovint.us](mailto:support@innovint.us) to update your bond information.*

*Use the subject line '**Update Bond Information**' and provide the following details:**- Legal name**- DBA name (if different than legal)**- Bond registry number (format is generally BWN-[state]-###)**- Address (street address/city/state/zip)**- Telephone number (optional)**- EIN number (optional)*

*You can also just send a screenshot or PDF of your bonded winery permit and we will pull the necessary details from the document.*

*Bond details saved by InnoVint are used to autofill Bills of Lading and the TTB 5120.17.*

**Q. Can I change the legal language on my BoL?**

*A: Yes, users can customize the legal language included on the BoL. Admins can update the language in the Bills of Lading section within Settings.*

![How to create a Bill of Lading (BOL)-legal language](https://support.innovint.us/hs-fs/hubfs/How%20to%20create%20a%20Bill%20of%20Lading%20(BOL)-legal%20language.webp?width=592&height=455&name=How%20to%20create%20a%20Bill%20of%20Lading%20(BOL)-legal%20language.webp)

*Any BoL generated thereafter will include the updated language. If there is a significant amount of legal language the user would like included in the BoL, it will render on subsequent pages.*
