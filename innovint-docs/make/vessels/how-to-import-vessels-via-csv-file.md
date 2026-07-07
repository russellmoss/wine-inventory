---
title: "How to Import Vessels via .csv file"
url: "https://support.innovint.us/hc/en-us/how-to-import-vessels-via-csv-file"
category: "MAKE"
section: "Vessels"
page_type: "page"
lastmod: "2025-11-20"
gist: "The Import Vessels action lets you upload multiple new vessels at once using a .csv file."
tags: ["barrels", "exports", "migration", "ux-friction", "harvest", "lot-identity"]
---

# How to Import Vessels via .csv file

## Learn how to import new vessels into InnoVint in bulk!

The **Import Vessels** action lets you upload multiple new vessels at once using a `.csv` file. It’s especially helpful if you're:

- Starting a new InnoVint account
- Adding a batch of new barrels at harvest

💡 **Note:** You must use the official import template. You cannot import data directly from a Vessel Explorer export — the format must match the template exactly.

[Download the template here](https://support.innovint.us/hc/en-us/templates?hsLang=en) to get started!

This article covers:

- [How to Use the Import Vessels action](#using_action)
- [Specifications for the CSV import file](#specifications)
- [Troubleshooting the import](#troubleshooting)

### How to Use the Import Vessels Action

1. Go to the Vessel Explorer page.
2. Click the **carat (˅)** next to **+ Add Vessels**, then choose **Import Vessels**.

   ![How to Import Vessels via .csv file-import button](https://support.innovint.us/hs-fs/hubfs/How%20to%20Import%20Vessels%20via%20.csv%20file-import%20button.webp?width=577&height=175&name=How%20to%20Import%20Vessels%20via%20.csv%20file-import%20button.webp)
3. Click **Upload CSV** and select your properly formatted file.

   ![How to Import Vessels via .csv file-upload button](https://support.innovint.us/hs-fs/hubfs/How%20to%20Import%20Vessels%20via%20.csv%20file-upload%20button.webp?width=391&height=247&name=How%20to%20Import%20Vessels%20via%20.csv%20file-upload%20button.webp)
4. Click the green **Import Vessels** button to start the import.

### Specifications for the CSV import file

Each row in your CSV file represents a new vessel. **You cannot use this import to update existing vessels**. Review [this article](https://support.innovint.us/hc/en-us/articles/206240653-change-or-edit-vessel-details?hsLang=en) to learn more about editing details for multiple vessels in bulk

Files *must* be in the same format as the example CSV provided. Columns across the top, in order, include:

| Column | Details |
| --- | --- |
| **Vessel Code** | Must be unique (even across archived vessels). Use only letters, numbers, dashes `-`, or underscores `_`. No spaces or special characters |
| **Vessel Type** | Must match one of the accepted types exactly: Barrel, Tank, Steel Drum, Carboy, Bin, Keg, Egg, Amphora, Tirage |
| **Capacity (vol)** | **Required for all types except 'Tirage'**. Must be a number > 0 |
| **Bottle Type** | **Required for 'Tirage' only.** Use the name only (e.g., Standard, Slim Brite (can), Torpedo Keg). Volume is not accepted |
| **Capacity (bottles)** | **Required for 'Tirage' only.** Must be a number > 0 |
| **Year First Used** | **Required for 'Barrel' only.** Use format `YYYY` |
| **Cooper** *(optional)* | **For Barrels only.** Must match an accepted Cooper name in InnoVint |
| **Style** *(optional)* | **For Barrels only.** Must match an accepted Barrel Style in InnoVint |
| **Wood** *(optional)* | **For Barrels only.** Must match accepted wood types. Required if Forest is included. Examples: French Oak, American Oak, Hungarian Oak, N/A |
| **Forest** *(optional)* | **For Barrels only.** Must match accepted forest names. Required if Wood is included. Examples: Allier, Vosges |
| **Toast** *(optional)* | **For Barrels only.** Must match accepted Toast levels in InnoVint |
| **Color** *(optional)* | **For Barrels only.** Options: Red, White, Rose (not Rosé – no accents) |
| **Tags** *(optional)* | Match must be exact. New tags will be created if not found. Use commas to separate multiple tags |
| **Owner(s)** *(optional)* | Only used if **Custom Crush Permissions** are enabled. Must match existing owners. Use commas for multiple owners. ‘Global’ ownership cannot be applied via import — see below. |

**Tips to find accepted vessel attributes**

*To find the list of accepted bottle types go to: **Vessel Explorer** > **+ Add vessels** > **Select vessel type: Tirage** > **Bottle type**.*

*To find the list of accepted coopers go to: **Vessel Explorer** > **+ Add vessels** > **Select vessel type: Barrel** > **Cooper**.*

*To find the list of accepted styles go to: **Vessel Explorer** > **+ Add vessels** > **Select vessel type: Barrel** > **Barrel Style**.*

*Forest/Wood*

Note that 'Forests' are sub-divided within 'Wood' categories, (ex. Wood = French Oak: Forest = Allier) and therefore Wood is required if **Forest** is also included.

Wood must match the list provided in InnoVint.

***Vessel Explorer** > **+ Add vessels** > **Select vessel type: Barrel** > **Wood/Forest**. Forest options are listed in black text under the Wood headers (grey text). Some included "woods" are: Acacia,American Oak, Assemblage, Austrian Oak, Bulgarian Oak, Cby, European Oak, French Oak, French Oak/Acacia, Hungarian Oak, Russian Oak, Romanian Oak, Slavonian Oak, St. Romain, N/A.*

Tips to apply global ownership after import:

1. Add a tag like **"Global owner"** in your CSV
2. Leave the **Owner(s)** column blank
3. After import, go to **Vessel Explorer**:

   - Filter for the "Global owner" tag
   - Use **bulk edit owners** > Set to Global
   - Use the bulk edit tags function to remove the "Global owner" tag afterward

### Troubleshooting Tips

If your import isn’t working, check the following:

✅ You're uploading a `.csv` file (not .txt or .xls)

✅ Columns are in the **exact** correct order
✅ **Vessel codes are unique** across your account (including archived vessels)
✅ Fields like **Vessel Type**, **Wood**, and **Owner** **match exactly** (including capitalization and spelling)
✅ No special characters — avoid symbols and accented letters (e.g., use **Rose**, not **Rosé**)

### FAQ

**Q. I can't get my file to upload! What should I try?**

*A. Please be sure to double check the following items:*

- *Be sure you are uploading a CSV file.*
- *Double check that the file format is correct and that all columns are in the correct order.*
- *Make sure that the vessel codes are unique to your account, even for archived vessels!*
- *Don't forget that fields that must match an existing list must match exactly. That includes capitalization and spaces.*
- *The vessel code cannot already exist in the account (including archived vessels) or be duplicated in the CSV file.*

**Q. Can I upload a .txt or .xls file instead?**

*A. Currently, we do not accept .txt or .xls files.*

**Q. I'm getting this error message:**

***![How to Import Vessels via .csv file-error](https://support.innovint.us/hs-fs/hubfs/How%20to%20Import%20Vessels%20via%20.csv%20file-error.webp?width=540&height=248&name=How%20to%20Import%20Vessels%20via%20.csv%20file-error.webp)***

*A. Check your file for any special characters. Remember that the import does not accept accent marks (eg instead of **Rosé**, use **Rose**).*

**Q. I noticed a mistake on one of my vessels after importing. Can I edit or delete the vessels?**

*A. You can manually delete any imported vessel as long as no actions have been recorded against it. You can also edit vessel details; learn more about editing [here](https://support.innovint.us/hc/en-us/articles/206240653-change-or-edit-vessel-details?hsLang=en).*
