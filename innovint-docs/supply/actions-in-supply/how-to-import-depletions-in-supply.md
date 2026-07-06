---
title: "How to Import Depletions in SUPPLY"
url: "https://support.innovint.us/hc/en-us/how-to-import-depletions-in-supply"
category: "SUPPLY"
section: "Actions in SUPPLY"
page_type: "page"
lastmod: "2025-12-26"
gist: "SUPPLY streamlines workflows while maintaining accurate inventory."
tags: ["dtc-sales", "inventory", "migration", "exports", "ux-friction"]
---

# How to Import Depletions in SUPPLY

SUPPLY streamlines workflows while maintaining accurate inventory. While you can deplete multiple inventory items within a single depletions action, this **depletions import** enables you to to upload a file to create and submit multiple ‘Deplete inventory’ actions at once. It saves you even more time, increasing your inventory accuracy.

Wholesale depletions? Done.

This article covers:

- [What is the Depletions Import?](#What)
- [How to use the Import Depletions action](#how)
- [Specifications for the file - how to fill it out properly!](#Specs)
- [Troubleshooting the import](#Troubleshooting)

### What is the Depletions Import?

The Depletions Import action enables you to upload a csv or xlsx file within an action to create and submit multiple ‘Deplete inventory’ actions in SUPPLY.

### How to use the Import Depletions Actions

The import requires a specific format that must be followed for a successful import.

If the headers in the first row are not complete and in the order listed, the import will fail.

Use either the [csv template](https://support.innovint.us/hubfs/Example%20file%20for%20Import%20depletions.csv?hsLang=en) or [xlsx template](https://support.innovint.us/hubfs/Example%20file%20for%20Import%20depletions.xlsx?hsLang=en)  provided to get you started.

1. Selects “Import depletions” from the “Record inventory action” dropdown menu
   ![Import Depletinons - action](https://support.innovint.us/hs-fs/hubfs/Import%20Depletinons%20-%20action.png?width=670&height=100&name=Import%20Depletinons%20-%20action.png)
2. Upload a csv or xlsx file to the action import. We strongly recommend starting with **a template (linked below)**! You can choose either csv or xlsx file types.
   1. [CSV Template](https://support.innovint.us/hubfs/Example%20file%20for%20Import%20depletions.csv?hsLang=en)
   2. [XLSX Template](https://support.innovint.us/hubfs/Example%20file%20for%20Import%20depletions.xlsx?hsLang=en)
3. SUPPLY will validate the file and list any errors, line by line. Correct any errors in the actual file. Then, resave the file, and then click "Choose file" again to re-validate the data for submission.
4. Once all rows are error-free, click the ‘Import depletions’ button and one ‘Deplete inventory’ action will be created for each row in the file.

After import, these ‘Deplete inventory’ actions are separate from each other and can be individually edited or deleted like manually entered actions.

### **Specifications for the file - how to fill it out properly!**

The required file template is a very specific format, and improper formatting will cause errors with the import. This section will walk you through all the details required to successfully import your depletions.

Before you start - please note the following:

- *Use the templates provided to get started* - this will guarantee your headers and data are in the right place:
  - [CSV Template](https://support.innovint.us/hubfs/Example%20file%20for%20Import%20depletions.xlsx?hsLang=en)
  - [XLSX Template](https://support.innovint.us/hubfs/Example%20file%20for%20Import%20depletions.xlsx?hsLang=en)

- All columns are required to be present in the file even if they are empty for every row
- All headers are required to be present in Row 1
- Data rows must start in Row 2
- The maximum number of depletions in one file is two hundred (200).

  ![Import Depletions_Template screenshot](https://support.innovint.us/hs-fs/hubfs/Import%20Depletions_Template%20screenshot.png?width=670&height=146&name=Import%20Depletions_Template%20screenshot.png)

Here are the detailed requirements for the columns:

- **Date** - Not required

  - Format: MM/DD/YY 00:00 (24 hour time format)
  - If only the date is entered, the time on the submitted action for that row will display as 12:00 AM
  - If a date is not entered in this column, the "Effective at" date/time of the Deplete inventory action will match the Recorded at date/time of the import action itself

- - You may not enter a date/time into the future (must be earlier than the date/time of when the import action is submitted)
- **SKU** - Required

  - This value is NOT case-sensitive
  - The SKU must correctly match a current SKU in SUPPLY
- **Location** - Required

  - This value is NOT case sensitive
  - The location must match an existing location in SUPPLY
  - Both in-bond and taxpaid locations may be entered
  - Inventory *can* be depleted from a location that does not contain any inventory for that SKU
- **Depletion type** - Required

  - Value must be one of the following (NOT case sensitive):
    - Sale
      - May be entered for locations that are both in-bond or taxpaid
      - If the location is in-bond, the depletion will also record as a Taxpaid Removal
    - Bond to bond transfer
      - May only be entered for locations that are in-bond
    - Other depletion
      - Accepted values: Other depletion / Other
        - May be entered for locations that are both in-bond or taxpaid
          - If location is in-bond, the compliance reason column (next column) must contain an approved value
- **Compliance reason** - Only required if the Location is in-bond and the Depletion type is "Other". Otherwise, this must be left blank.

  - Value must be one of the following (NOT case-sensitive):
    - Removed taxpaid
      - Accepted values: Removed taxpaid / Taxpaid
    - Used for testing
      - Accepted values: Used for testing / Testing
    - Removed for export
      - Accepted values: Removed for export / Export
    - Removed for family use
      - Accepted values: Removed for family use / Removed family use / Family use
    - Used for tasting
      - Accepted values: Used for tasting / Tasting
    - Breakage
      - Accepted values: Breakage
    - Bottled wine dumped to bulk
      - Accepted values: Bottled wine dumped to bulk / Dumped to bulk
    - Inventory shortage
      - Accepted values: Inventory shortage / Shortage

- - Must NOT be entered if the Depletion type is ‘Other depletion’ and the location is taxpaid
  - Must NOT be entered if the Depletion type is ‘Sale’ or ‘Bond to bond transfer’
- **Group inventory quantity** - Not required (if blank, it’s assumed as zero)

  - Inventory quantity for the grouping of the SKU
  - Must be a positive whole number or zero
  - If blank, it is considered zero
- **Item inventory quantity** - Not required (if blank, it’s assumed as zero)

  - Inventory quantity for the item of the SKU
  - Must be a positive whole number or zero
  - If blank, it is considered zero

**📌** Group inventory quantity and item inventory may not BOTH be zero or blank

### Troubleshooting

Seeing red? Prior to importing the file, SUPPLY validates each line to confirm the headers, properly formatted data, existing SKUs and Locations, valid depletion types (depending on tax status), and more.  Read on for some common error descriptions and resolutions.

![IMport depletions - file not corrected](https://support.innovint.us/hs-fs/hubfs/IMport%20depletions%20-%20file%20not%20corrected.png?width=350&height=85&name=IMport%20depletions%20-%20file%20not%20corrected.png)![Import Depletions - format headers](https://support.innovint.us/hs-fs/hubfs/Import%20Depletions%20-%20format%20headers.png?width=325&height=108&name=Import%20Depletions%20-%20format%20headers.png)

![Import Depletions - errors](https://support.innovint.us/hs-fs/hubfs/Import%20Depletions%20-%20errors.png?width=670&height=352&name=Import%20Depletions%20-%20errors.png)

Common reasons for seeing an error message:

- File is not a csv or xlsx format (re-save your file in the proper format!)
- File does not contain the correct headers in Row 1 (download a template to confirm you are using the proper headers)
- File does not contain all columns (download a template to confirm you are using the proper headers)
- File has blank rows between the header row and the first data row (download a template to confirm you are using the proper headers - then ensure your SKU depletion data starts on Line 2)
- Date/time entered in the file is in the future (don't get ahead of yourself - check and correct the dates in the file)
- User clicks the ‘Import depletions’ button before the file has finished checking for errors (wait until the page load and previews all lines of the file)
- User clicks the ‘Import depletions’ button when the attached file still contains errors (correct the errors in your file and re-save, then reattach in a new 'Import depletions' action to re-attempt submission)
- File contains more than 200 depletions

Any highlighted error must be corrected in the file.  Resave the file, and then click "Choose file" again to re-validate the data for submission.

![Import Depletions - success](https://support.innovint.us/hs-fs/hubfs/Import%20Depletions%20-%20success.png?width=670&height=328&name=Import%20Depletions%20-%20success.png)
