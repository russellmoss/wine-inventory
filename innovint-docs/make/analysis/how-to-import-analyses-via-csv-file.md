---
title: "How to Import Analyses via .csv file"
url: "https://support.innovint.us/hc/en-us/articles/115002687291-how-to-import-analyses-via-csv"
category: "MAKE"
section: "Analysis"
page_type: "article"
lastmod: "2026-03-31"
gist: "The Analysis Import action allows you to import analysis data in bulk via a csv file for one or more lots or vessels."
tags: ["lab", "exports", "migration", "ux-friction", "barrels", "corrections"]
---

# How to Import Analyses via .csv file

The Analysis Import action allows you to import analysis data in bulk via a csv file for one or more lots *or* vessels. The csv must match one of two formats outlined in [**this**](//innovint-6865708.hs-sites.com/hc/en-us/articles/115002684812-analysis-import-format-guidelines-for-csv-file?hsLang=en) article, and we recommend starting with one of the templates provided.

This article covers:

- [Using the Analysis Import](#direct_action)
- [How to edit or delete analysis data](#mistake)
- [Troubleshooting the import](#troubleshoot)

### Using the Analysis Import

1. Analysis Import is completed via a direct action called "Analysis Import", and can be accessed via the Record action menu on either the top navigation bar or the Lot Details page.
   ![How to import analysis from csv_action location](https://support.innovint.us/hs-fs/hubfs/How%20to%20import%20analysis%20from%20csv_action%20location.webp?width=670&height=174&name=How%20to%20import%20analysis%20from%20csv_action%20location.webp)
2. Select an Analysis source from the drop-down list. If the source is not listed or unknown, choose *Not specified.* This source applies to the entire file.
   ![How to import analysis from csv_source](https://support.innovint.us/hs-fs/hubfs/How%20to%20import%20analysis%20from%20csv_source.webp?width=670&height=145&name=How%20to%20import%20analysis%20from%20csv_source.webp)
3. Choose a csv file to import. The csv template format and column headers must meet very specific requirements. Download a sample [template](https://support.innovint.us/hc/en-us/articles/115002684812-analysis-import-format-guidelines-for-csv-file?hsLang=en#templates) and review format guidelines [here](https://support.innovint.us/hc/en-us/articles/115002684812-analysis-import-format-guidelines-for-csv-file?hsLang=en).  Choose your template format based on how you receive your existing lab results.
   You can choose the "Original Analysis Import" with one row and multiple analyses per lot:
   ![How to import analysis from csv_template1](https://support.innovint.us/hs-fs/hubfs/How%20to%20import%20analysis%20from%20csv_template1.webp?width=670&height=50&name=How%20to%20import%20analysis%20from%20csv_template1.webp)
   or, the "Modified Analysis Import", with one row per analysis result per lot or vessel:
   ![How to import analysis from csv_template2](https://support.innovint.us/hs-fs/hubfs/How%20to%20import%20analysis%20from%20csv_template2.png?width=359&height=113&name=How%20to%20import%20analysis%20from%20csv_template2.png)
4. After selecting the file, you will be able to review the data to be imported:
   ![Analysis Import - steps](https://support.innovint.us/hs-fs/hubfs/Analysis%20Import%20-%20steps.png?width=670&height=281&name=Analysis%20Import%20-%20steps.png)
5. Select whether to attribute your analysis data to lot composite(s) or individual vessel(s). The file's "Performed on" or "ID" field data will trigger InnoVint to select Lot Composite (if it finds Lot Codes) or Individual Vessel (if it finds Vessel codes).
6. Match the ID to the Lot Code in InnoVint, if necessary. If you need to remove a lot or vessel from the import, you can do it here.
7. Double check the Analysis data to be imported.
8. Click "Record Analysis".

**Note:** You can choose to import analysis data for different dates and times within the same csv file. (Note: The Date column is entirely is optional.)

Both Analysis templates will also support a timestamp (MM/DD/YY 00:00).

![backdate](https://support.innovint.us/hs-fs/hubfs/backdate.webp?width=155&height=19&name=backdate.webp)

Backdating the import action will override any dates and times specified in the file.

**Note:** The Analysis Import feature does not allow you to import data for lot composites *and* individual vessels in the same file.

### How to edit or delete imported data

#### To delete all the analyses from a single import:

Go to the Winery Activity Feed:

![Filepath to WAF](https://support.innovint.us/hs-fs/hubfs/Filepath%20to%20WAF.png?width=670&height=30&name=Filepath%20to%20WAF.png)

Choose the Analysis Import action that you would like to delete. (Tip: Filter for all Analysis actions to narrow your search).

![How to Import analyses_find import action](https://support.innovint.us/hs-fs/hubfs/How%20to%20Import%20analyses_find%20import%20action.png?width=670&height=85&name=How%20to%20Import%20analyses_find%20import%20action.png)

Click on the action, and then in the Action details page click on ![Delete action](https://support.innovint.us/hs-fs/hubfs/Delete%20action.png?width=111&height=15&name=Delete%20action.png) in the top right corner. This will delete all analyses recorded via the import action.

#### To delete individual analyses

Go to the Lot details page and on the Lot Analysis tab, choose **All analyses in a list.**

![Filepath to Delete analysis](https://support.innovint.us/hs-fs/hubfs/Filepath%20to%20Delete%20analysis.png?width=670&height=30&name=Filepath%20to%20Delete%20analysis.png)

![How to import analyses_All analysis in a List-delete](https://support.innovint.us/hs-fs/hubfs/How%20to%20import%20analyses_All%20analysis%20in%20a%20List-delete.webp?width=670&height=214&name=How%20to%20import%20analyses_All%20analysis%20in%20a%20List-delete.webp)

You will see a confirmation screen before deleting the analysis:

![How to import analyses_confirm-delete](https://support.innovint.us/hs-fs/hubfs/How%20to%20import%20analyses_confirm-delete.png?width=450&height=219&name=How%20to%20import%20analyses_confirm-delete.png)

#### To edit individual analyses:

Go to the Lot details page and on the Lot Analysis tab, choose **All analyses in a list.**

**![Filepath to Delete analysis](https://support.innovint.us/hs-fs/hubfs/Filepath%20to%20Delete%20analysis.png?width=670&height=30&name=Filepath%20to%20Delete%20analysis.png)**The Edit option (next to Delete) allows you to change the analysis value or recorded date/time. To change any other attributes (e.g. source, or analysis type), you will need to delete the entire import action and re-import the analyses with the correction.

![How to import analyses_edit analysis](https://support.innovint.us/hs-fs/hubfs/How%20to%20import%20analyses_edit%20analysis.png?width=450&height=223&name=How%20to%20import%20analyses_edit%20analysis.png)

### FAQ

**Q: I'm getting an error on my import! Why?**

*A: Make sure to match the file format to our specifications detailed [here](//innovint-6865708.hs-sites.com/hc/en-us/articles/115002684812-analysis-import-format-guidelines-for-csv-file?hsLang=en). If you cannot manage to troubleshoot, please reach out to us at support@innovint.us.*

**Q: Can I import Vineyard Block Analysis?**

*A: We do not currently allow importing vineyard analyses. For now - the fastest way to enter the analysis currently is to do so manually but to utilize the "Record and add another" button to make quick work of it,*

*![How to import analyses_Vineyard analysis](https://support.innovint.us/hs-fs/hubfs/How%20to%20import%20analyses_Vineyard%20analysis.png?width=670&height=253&name=How%20to%20import%20analyses_Vineyard%20analysis.png)*

*Or else [InnoApp](https://support.innovint.us/hc/en-us/mobile-app-how-to-record-analysis?hsLang=en#vineyard_analysis) makes this a pretty quick process as well.*
