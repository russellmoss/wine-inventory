---
title: "How to Import Vineyard Events and Crop Estimates via CSV file"
url: "https://support.innovint.us/hc/en-us/how-to-import-vineyard-events-via-csv-file"
category: "GROW"
section: "general"
page_type: "page"
lastmod: "2025-11-20"
gist: "Vineyard event tracking and crop estimates are only available with activation of the GROW module."
tags: ["vineyard", "migration", "exports", "lab", "reporting", "ux-friction"]
---

# How to Import Vineyard Events and Crop Estimates via CSV file

Vineyard event tracking and crop estimates are only available with activation of the GROW module. Reach out to [InnoVint Support](mailto:support@innovint.us) for more information.

The Import Vineyard Event and Crop Estimates action allows you to create new [vineyard events and crop estimates](https://support.innovint.us/hc/en-us/articles/360026806092-how-to-record-and-track-data-and-analyses-on-vineyard-blocks?hsLang=en) via a CSV file. You can create your own CSV file for importing or use the template provided [here](https://support.innovint.us/hc/en-us/templates?hsLang=en) to get you started (recommended).

This article covers:

- [Using the Import Vineyard Event and Crop Estimate Action](#Using_import)
- [Specifications for the CSV import file](#Specs)
- [Troubleshooting the import](#faqs)

### Using the Vineyard Event and Crop Estimate Import

1. You can select "Import events and crop estimates" from the ![How to Import Vineyard Events and Crop Estimates via CSV file-record button](https://support.innovint.us/hs-fs/hubfs/How%20to%20Import%20Vineyard%20Events%20and%20Crop%20Estimates%20via%20CSV%20file-record%20button.webp?width=90&height=27&name=How%20to%20Import%20Vineyard%20Events%20and%20Crop%20Estimates%20via%20CSV%20file-record%20button.webp) button in the Vineyard Dashboard, Vineyard Details, and Block Details pages (anywhere you can create a vineyard action).
2. Click "Upload CSV" and choose your file to upload. Make sure the CSV file matches the required format exactly. We recommend using the example csv template within the action.
   ![How to Import Vineyard Events and Crop Estimates via CSV file-upload button](https://support.innovint.us/hs-fs/hubfs/How%20to%20Import%20Vineyard%20Events%20and%20Crop%20Estimates%20via%20CSV%20file-upload%20button.webp?width=688&height=89&name=How%20to%20Import%20Vineyard%20Events%20and%20Crop%20Estimates%20via%20CSV%20file-upload%20button.webp)
3. Click "Import events and crop estimates."

### Specifications for the CSV import file

- Each line of the CSV file represents *either* a single 'Vineyard Event', *or* a single "Crop Estimate." You can create new and backdated events via the import.

**Tip**: You cannot include both an event and an estimate on the same line.

- Files *must* be in the same format as the example CSV provided. Columns across the top, in order, include:
  - **Date**
    - Not required. If left blank, the event date will be recorded as of the upload date.
    - If included, dates must in the following format: MM/DD/YYYY or YYYY-MM-DD
  - **Vineyard**
    - Required. Must match exactly the name of an existing vineyard in the winery.
  - **Block**
    - Required. Must match exactly the name of an existing block in the specified vineyard.
  - **Variety**
    - Required. Must match exactly the name of a variety in the specified block.
  - **Clone**
    - Only required if the Vineyard/Block/Variety combination has an existing clone.
    - Leave blank if no clone currently exists for the block.
  - **Vintage**
    - Required. Must be 4-digit year (ex: 2019).
  - **Event or Crop Estimate**
    - Required. Must exactly match an existing event within the three main event types to specify a vineyard event, or, be "Crop Estimate," in order to record crop estimates.
      ![How to Import Vineyard Events and Crop Estimates via CSV file-event estimate](https://support.innovint.us/hs-fs/hubfs/How%20to%20Import%20Vineyard%20Events%20and%20Crop%20Estimates%20via%20CSV%20file-event%20estimate.webp?width=688&height=98&name=How%20to%20Import%20Vineyard%20Events%20and%20Crop%20Estimates%20via%20CSV%20file-event%20estimate.webp)
  - **Percentage (phenology)**
    - Required ONLY if the event type is an event within Phenology.  Otherwise, this field must be blank.
  - **Crop Estimate**
    - Required ONLY if the event type is "Crop Estimate." Otherwise, this field must be blank.
  - **Crop Estimate Units**
    - Required ONLY if the event type is "Crop Estimate." Otherwise, this field must be blank.
    - This field must match the weight units (tons, tonne or kg) associated with the account.

- - **Details**
    - Optional.

### FAQs

**Q. I can't get my file to upload! What should I try?**

*A. Please be sure to double check the following items:*

- *Make sure all details in the CSV file match your existing vineyards, blocks and varieties. Each line item must match to an existing, unique vineyard/block/variety/clone (or no clone) combination within InnoVint.*
- *Be sure you are uploading a .csv file*
- *Try changing the file type to CSV UTF-8*

**Q. Can I upload a .txt or .xls file instead?**

*A. Currently, we do not accept .txt or .xls files.*

**Q. I'm getting this error message:**

![How to Import Vineyard Events and Crop Estimates via CSV file-error msg](https://support.innovint.us/hs-fs/hubfs/How%20to%20Import%20Vineyard%20Events%20and%20Crop%20Estimates%20via%20CSV%20file-error%20msg.webp?width=403&height=110&name=How%20to%20Import%20Vineyard%20Events%20and%20Crop%20Estimates%20via%20CSV%20file-error%20msg.webp)

*A. You likely have a typo for an 'exact match' field, or you are missing required fields. Check the list of errors provided on the screen to troubleshoot any issues.*
