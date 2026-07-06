---
title: "Custom Lot Attributes"
url: "https://support.innovint.us/hc/en-us/custom-attributes-lots"
category: "MAKE: Advanced Features"
section: "Custom Attributes"
page_type: "page"
lastmod: "2026-04-07"
gist: "This is available with the MAKE-Plus subscription."
tags: ["reporting", "barrels", "configuration", "exports", "fermentation", "integrations"]
---

# Custom Lot Attributes

This is available with the MAKE-Plus subscription. Please reach out to InnoVint Support if you do not see Custom Attributes in your Settings.

Custom Attributes allow your winery to define, create and add **custom data fields** to lots in InnoVint. Tags can become broad, inconsistent, and cluttered; notes are unstructured and difficult to report on - consider Custom Attributes to be the lot attributes that you've always wanted to assign to your lots in a standard way, capturing your winery-specific information.

![](https://support.innovint.us/hs-fs/hubfs/image-png-Mar-16-2026-10-59-53-5836-PM.png?width=670&height=528&name=image-png-Mar-16-2026-10-59-53-5836-PM.png)

Once created, Custom Attributes can be: added to lots and viewed on the Lot Details page, and are included in the Lot Explorer, Custom Reports, and other additional report exports. This allows you to track the information that matters most to your winery and integrate that data more easily into your workflows.

This article covers:

- [What are Custom Attributes?](#what)
- [How to create Custom Attributes](#how)
- [How to add Custom Attributes to Lots](#Add_CA)
- [How to edit or remove Custom Attributes](#edit_remove)
- [How to View or Report on Custom Attributes](#report)
- [Tracking Changes](#Changes)
- [How to Archive or Delete Custom Attributes](#archive-delete)

### What Are Custom Attributes?

Custom Attributes are **additional fields you define** to store information about lots.

Examples of attributes that can be created include:  Winemaker, Fermentation protocol, Barrel program or % new oak, Target alcohol, MOX Start/Stop date, Contract reference number, or a unique internal project code.

When you create a custom attribute, you specify the data format and how the field is used:

- Supported data formats include:

  - Single-select (specify a list of predefined options for the attribute)
  - Text (alphanumeric)
  - Number (no leading zeros or commas)
  - Date
- Custom Attributes can be required at lot creation (via the UI and lot import), or optional.
- Custom Attributes can be used with all lot types (fruit lots, juice/wine lots and case good lots)

### How to Create Custom Attributes

Custom Attributes are created and managed in **Settings**.

Only **Admin users** can create or manage custom attributes.

#### Steps to create a Custom Attribute

1. Go to **Settings**
2. Open **Custom Attributes**

   **![Screenshot 2026-03-16 at 10.09.29 AM](https://support.innovint.us/hs-fs/hubfs/Screenshot%202026-03-16%20at%2010.09.29%20AM.png?width=565&height=465&name=Screenshot%202026-03-16%20at%2010.09.29%20AM.png)**
3. Click **+ Add attribute**
4. Enter a **Name** for the attribute (each custom attribute name must be unique)
5. Select a **Data Type**
   **![CA_Add](https://support.innovint.us/hs-fs/hubfs/CA_Add.png?width=670&height=356&name=CA_Add.png)**

   1. If you select Single-Select, you will need to define the list of options (at least one)![CA_Single Select](https://support.innovint.us/hs-fs/hubfs/CA_Single%20Select.png?width=670&height=503&name=CA_Single%20Select.png)
6. Specify settings:

   1. Will this attribute be required or optional at lot creation?
   2. Do you want this attribute to display on the InnoApp lot details page?

      ![CA_Create](https://support.innovint.us/hs-fs/hubfs/CA_Create.png?width=670&height=505&name=CA_Create.png)
7. Click **Add attribute**

#### Custom Attribute Data Types

**Single-Select**

The single-select attribute allows users to select **one value from a predefined list**. You can add, reorder, archive, or remove options in Settings at any point.  Drag and drop the list options to reorder them; the order set in Settings determines how they appear throughout InnoVint.

Example of single-select attribute:

**Attribute:** Winemaking Program
**Options:**Estate, Custom Crush, or Experimental

**Text**

A text attribute allows users to enter **free-form text**. Example:

- - Consultant notes
  - Special handling instructions

    ![CA_Text](https://support.innovint.us/hs-fs/hubfs/CA_Text.png?width=670&height=360&name=CA_Text.png)

**Number**

A number attribute stores only numeric values, up to 5 decimal places. Example:

- - Target alcohol or FSO2
  - Residual sugar
  - Internal tracking number

    ![CA_Number](https://support.innovint.us/hs-fs/hubfs/CA_Number.png?width=670&height=360&name=CA_Number.png)

**Date**

A date attribute stores calendar dates.  Example:

- - Blend approval date
  - Lab review date
  - Sensory panel date
  - MOX on/off

    ![CA_Date](https://support.innovint.us/hs-fs/hubfs/CA_Date.png?width=670&height=359&name=CA_Date.png)

#### Attribute Settings

When creating a custom attribute you can configure the following options:

- **Make Custom Attributes Optional on Lot Creation.** This controls whether the field is required when creating a lot

  - If the box is checked, the field is optional

- - If the box is not checked, then you must enter a value for this attribute when creating a lot. NOTE: the value is required at lot creation, but may be removed via the Lot details page after creation; it does not mean that this value is *always* required on a lot.
  ![CA_Lot Create](https://support.innovint.us/hs-fs/hubfs/CA_Lot%20Create.png?width=670&height=368&name=CA_Lot%20Create.png)

- **Show on InnoApp Lot Details.** This option ensures that the attribute displays on Lot Details in the InnoApp mobile app.

  - If this option is unchecked, the attribute will only appear in the desktop web app
  ![CA_InnoApp](https://support.innovint.us/hs-fs/hubfs/CA_InnoApp.png?width=298&height=490&name=CA_InnoApp.png)

### How to add Custom Attributes to Lots

Once created, custom attributes can be applied to lots two ways.

#### On the Lot Details Page

Each lot includes a **Custom Attributes** section underneath the main lot attribute box.

If no Custom Attributes are setup for the winery this section will not display.

![CA_Lot details_nomarkup](https://support.innovint.us/hs-fs/hubfs/CA_Lot%20details_nomarkup.png?width=245&height=400&name=CA_Lot%20details_nomarkup.png)

To add or edit a value:

1. Open the **Lot Details** page.
2. Locate the **Custom Attributes** section.
3. Click the **edit (pencil) icon**.
4. Enter or select a value.
5. Save.
   ![CA_Edit attribute](https://support.innovint.us/hs-fs/hubfs/CA_Edit%20attribute.png?width=670&height=478&name=CA_Edit%20attribute.png)

If no value is set, the field displays **No value**.

#### When Creating a Lot

When creating a new lot (via +Add lot or inline or via Lot Import) custom attribute fields will appear in the **Create Lot** form.

- If required (per the Attribute Settings) the custom attributes must be completed before the lot can be created. These can be removed later via the Lot details page.
- When creating a lot in-line (via an action or work order task), a new fill "to" lot will default to the custom attributes of the drained "from" lot.
- When [importing lots](/hc/en-us/how-to-import-lots-via-csv?hsLang=en), you can set custom attributes by adding additional columns to the import file.
  ![CA Import Lots-2](https://support.innovint.us/hs-fs/hubfs/CA%20Import%20Lots-2.png?width=670&height=222&name=CA%20Import%20Lots-2.png)
  - Each custom attribute must be added via a column in the import file.
  - The column header(s) of the additional column(s) must match the custom attribute name(s).
  - The attribute must already exist in Settings.

    - For **single-select attributes**, the value in the lot's row in the CSV file must match one of the defined options.
  - If required attributes are missing or values don’t match available options, the import will display an error.

### How to Edit or Remove Custom Attributes from a Lot

Custom attribute values can be updated via the **Lot Details page**.

Steps:

1. Open the lot.
2. Click the **edit (pencil) icon**.
3. Update the value.
4. Save.

For single-select attributes, you can also choose **Clear value** to remove the current selection.

### How to View or Report on Custom Attributes

Custom attributes appear across multiple areas of InnoVint.

- **Lot Details:** Each lot includes a **Custom Attributes widget** displaying the Attribute name and current value.
- **Lot Explorer:** Custom attributes can be found in the **Lot Explorer** and used as sortable columns and filters. These will report as additional columns in exported files.  [See how to report and filter for custom attributes in the Lot Explorer](/hc/en-us/lot-explorer?hsLang=en).
- Custom Reports: Custom attributes can also be used in **Custom Reports**.  Add them as report columns or filter reports using attribute values
- **Fruit Lot Explorer:** Export only.
- **Case Good Lot Explorer:** Export only.
- **Winery Activity Feed:** Export only. Custom attributes appear for the lots involved in each activity - these are not "point in time" attributes, but those that are currently recorded on the lot when you run the report (as of today’s values).
- **Inventory at Point in Time:** Export only. Custom attribute values are included as additional columns as of the point in time of the report.
- **Lot Cost Report:** Export only. Each attribute appears as its own column as of the point in time of the report.

### Tracking Changes on Custom Attributes

All changes to custom attributes are tracked in the **Lot Property History Report**.

This report records:

- When a value was added
- When a value was changed
- When a value was removed

You can also view this history directly on the **Lot Details → History** tab.

![CA_Lot Properties](https://support.innovint.us/hs-fs/hubfs/CA_Lot%20Properties.png?width=670&height=250&name=CA_Lot%20Properties.png)

### How to Archive or Delete Custom Attributes

Custom Attributes or single-select options within an attribute can be **archived** when they are no longer needed, or deleted if they have never been used.

**Archiving**

- Removes them from new lot entries and filters
- Preserves historical data on existing lots
- Keeps them visible in Settings if archived items are shown

  ![CA_Archive](https://support.innovint.us/hs-fs/hubfs/CA_Archive.png?width=670&height=367&name=CA_Archive.png)

Archived attributes can be **restored (unarchived)** if needed.

![CA_Unarchive](https://support.innovint.us/hs-fs/hubfs/CA_Unarchive.png?width=670&height=241&name=CA_Unarchive.png)

**Deleting**

- Deletion is only possible if the attribute **has never been used on a lot**.
- If the attribute has been used previously, it must be **archived instead** to preserve historical data.

  ![CA_Delete](https://support.innovint.us/hs-fs/hubfs/CA_Delete.png?width=670&height=243&name=CA_Delete.png)

There are no Owner permissions around custom attributes. Everyone with access to the winery can view these. Users with write capabilities (Admin, Team Member and Team Member Cannot Submit) can edit custom attributes on lots
