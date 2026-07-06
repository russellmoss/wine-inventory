---
title: "How to Import Lots via .csv File"
url: "https://support.innovint.us/hc/en-us/how-to-import-lots-via-csv"
category: "MAKE"
section: "Lots"
page_type: "page"
lastmod: "2026-03-17"
gist: "The Import Lot action allows you to create multiple lots in bulk via a .csv file."
tags: ["exports", "migration", "packaging", "ux-friction", "vineyard", "bond"]
---

# How to Import Lots via .csv File

## Learn how to import new juice/wine and case good lots into InnoVint!

The Import Lot action allows you to create multiple lots in bulk via a .csv file. This is a powerful tool to import data if you are just catching up, or migrating into a new InnoVint account.

Use the template provided [here](https://support.innovint.us/hubfs/template_lot_import_2025.csv?hsLang=en) to get you started.

This article covers:

- [Using the Import Lot Action](#using_action)
- [Specifications for the .csv import file](#specifications)
- [Troubleshooting the import](#troubleshooting)

### Using the Import Lot Action

1. Make sure the bond numbers, vineyards, blocks, and clones (and owners and custom attributes, if applicable) of all lots being uploaded are entered in the system before import.
2. From your Lot or Case Goods Explorer page, click the carat next to "Add lot"/"Add Case Goods lot" and select "Import lots".
   ![How to Import Lots via .csv File-import action](https://support.innovint.us/hs-fs/hubfs/How%20to%20Import%20Lots%20via%20.csv%20File-import%20action.webp?width=670&height=171&name=How%20to%20Import%20Lots%20via%20.csv%20File-import%20action.webp)
3. We recommend downloading the example template to get started. This file has all of the required column headers in a format that is accepted by InnoVint.
4. Click "Upload CSV" and choose your file to upload. Make sure the .csv file matches the required format exactly.  If a required field is missing, or the format is matched, you will get an error.
   ![How to Import Lots via .csv File-upload](https://support.innovint.us/hs-fs/hubfs/How%20to%20Import%20Lots%20via%20.csv%20File-upload.webp?width=490&height=295&name=How%20to%20Import%20Lots%20via%20.csv%20File-upload.webp)
5. Click "Import lots."

Please note that the lot import does not currently support [bulk components](https://support.innovint.us/hc/en-us/how-to-enter-bulk-wine-and-unknown-lot-composition?hsLang=en). Lots created with bulk components must be entered individually through the Add Lot screen.

### Specifications for the .csv import file

- Files *must* be in the format as pictured here. Columns across the top, in order, include:
  - **Bond**
    Bond registry number must match an existing bond in the account.
  - **Lot Code**
    Lot codes can contain letters, numbers, dashes (-), and/or underscores (\_). No spaces or special characters are allowed. To create a Case Goods lot, the lot code must begin with the *CG-* prefix.
  - **Lot Name** (optional)
  - **Tax Class**
    The tax class must follow the same format as displayed in InnoVint.

- - **Lot Stage**
    Lot stage must match the Stage list in InnoVint for the specific lot type (eg *Fermenting* is not a valid stage for a Case Goods lot).

- - **Owner(s)**
    If Custom Crush Permissions are active, you can import the lot's owner tag.  Owner tags must be created in the system prior to import.

- - **Vintage**
    Vintage should be in a 4 digit format.
  - **Vineyard**
    The Vineyard name must match an existing vineyard.
  - **Block**
    The Block must exist within the vineyard and match the name exactly.
  - **Variety**
    Varieties must match the list displayed in InnoVint, including special characters (eg accents and umlauts) and capital letters.  The variety on the csv file must match the variety of the designated block.
  - **Clone**
    Clone must be included in the csv file if a clone is specified for the block in InnoVint. If no clone is specified on the block, then leave this field blank.
  - **Percentage**Numbers only. Decimals are accepted.

- - **Bottle Format**
    Required for Case Goods lots only. Must match the Format name as displayed in InnoVint. Do no include the format volume. Disregard for juice/wine lots.
  - **Bottles per Case**
    Required for Case Goods lots only.
  - **Cases per Pallet**
    Required for Case Goods lots only.

    ![How to Import Lots via .csv File-specs](https://support.innovint.us/hs-fs/hubfs/How%20to%20Import%20Lots%20via%20.csv%20File-specs.webp?width=670&height=56&name=How%20to%20Import%20Lots%20via%20.csv%20File-specs.webp)
  - **Color**
    Required. May be: Red, White, Rose, Orange
  - **Style**
    Required. May be: Still or Sparkling. Sparkling is only valid if you have the [Sparkling module](/hc/en-us/sparkling-wine-production-feature-overview?hsLang=en) activated.
  - **Tags**
    Optional! If you want to import tags with your lots, please add a column with a header "Tags" and include desired tags on the lot row.  Multiple tags can be included in the same column, separated by commas with no spaces. For example "24mo,High VA,Best wine ever".  Tags that do not already exist exactly in the system will be created via the upload.
  - **Custom** **Attributes**
    Optional! If your subscription includes [Custom Lot Attributes](/hc/en-us/custom-attributes-lots?hsLang=en), you can choose to import those with the lot. *If your Custom Lot Attribute is required at lot creation (this option is selected when setting up your Custom Lot Attributes), then you **must** include this field when importing lots.*
    Please add additional columns with each Custom Lot Attribute name as a header, to the right of the existing template column headers. For instance if your Custom Lot Attribute name is a number field, and named "Target FSO2", then the column header should be "Target FSO2" and each lot row should display a numeric value equal to the desired target SO2. Custom Attributes and any single select Custom attribute options must be created prior to importing the lots.
- Each line of the csv file represents a single component (ie a unique vintage and vineyard source) of a lot. To import a new lot with multiple components, add one line per component and duplicate the Bond, Lot code, Lot name, Tax class, Stage, Owner(s) & Custom Lot Attribute details for each line. For Case Goods lots, Bottle Format, Bottles per Case, and Cases per Pallet must also be duplicated.
- The total percentage per lot code must be 100 exactly.
- Juice/Wine lots and Case Goods lots can be imported in the same file. Remember that Case Goods lots must begin with the *CG-* prefix.

**Note:** the file must contain lot codes, but lot names are optional.

[Template - Example lot.csv](https://support.innovint.us/hubfs/template_lot_import_2025.csv?hsLang=en)

### FAQ

**Q. Can I include tags?**

*A. Yes! Actually, you can add a column with the header "Tags" and import tags with each lot. If you want to include multiple tags, separate them with commas in the same column.*

**Q. Can I include Custom Attributes?**

*A. Yes! Actually, you can add a column with the Custom Attribute name as the header anywhere to the right of the final template column. Custom Attribute names must be created and exist in Settings prior to import.  Single select type Custom Lot Attributes must be created prior to import, and match exactly.*

*If your Custom Lot Attribute is required at lot creation (this option is selected when setting up your Custom Lot Attributes), then you **must** include this field when importing lots.*

**Q. I can't get my file to upload! What should I try?**

*A. Please be sure to double check the following items:*

- *All varieties are spelled correctly and accepted per the version of import*
- *All tax classes have the correct and accepted units*
- *All varieties have the accepted capitalizations*
- *Vintages are 4 digits*
- *Be sure you are uploading a .csv file*

**Q. Can I upload a .txt or .xls file instead?**

*A. Currently, we do not accept .txt or .xls files.*

**Q. Can I export a lot list from InnoVint and then re-import it back into another winery?**

*A. Yes! If you have to split up a lot or if you are moving data from one InnoVint account to another, simply follow these steps:*

1. *Export lots (Lot Explorer > Export lot components) utilizing filters if desired*
2. *Open this file and reformat this export to match the above Lot Import by moving columns around to match the same order. Then add 'Bottle Format', 'Bottles per Case', and 'Cases per Pallet' columns.
   Tip: Make sure the percentage column totals 100 per lot code, and not 1!*
3. *Add all lots you want to import into the file.*
4. *Record an "Import lots" action*

**Q. I'm getting this error message:**

***![How to Import Lots via .csv File-error](https://support.innovint.us/hs-fs/hubfs/How%20to%20Import%20Lots%20via%20.csv%20File-error.webp?width=318&height=131&name=How%20to%20Import%20Lots%20via%20.csv%20File-error.webp)***

*A. You have likely missed entering a bond number, vineyard, block, clone, or owner before you tried importing. Add that component and try the import again. Check the list of errors provided on the screen to troubleshoot any issues.*

**Q. I made a mistake on one of my lots after importing. Can I delete this lot?**

*A. Lots can be deleted immediately after importing as long as no actions have been applied to them. If an action has been applied to the lot, it must be archived to remove it from the main Lot Explorer view. Please note that each imported lot must be deleted individually.*
