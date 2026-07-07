---
title: "2/15/2023 Release Notes: Scan Work Orders and Archive Dry Goods Batches"
url: "https://support.innovint.us/hc/en-us/2/10/2023-release-notes"
category: "Product Updates"
section: "Product Updates: 2023"
page_type: "page"
lastmod: "2025-11-20"
gist: "Release Notes from February 15, 2023 include:."
tags: ["release-notes", "lot-identity", "work-orders", "fermentation", "packaging", "exports"]
---

# 2/15/2023 Release Notes: Scan Work Orders and Archive Dry Goods Batches

Release Notes from February 15, 2023 include:

### Features

#### **Scan Work Order QR Codes in browser**

Are you completing or submitting a lot of printed work orders? If you use our [new printed work orders](https://support.innovint.us/hc/en-us/work-order-print?hsLang=en), the QR code in the header can now be scanned using a handheld scanner, or your tablet (or the camera on your laptop!), and it will open the work order within the same browser tab.

**![](https://support.innovint.us/hubfs/image-png-Feb-13-2023-06-43-33-2817-PM.png)**

To activate the scanner on your tablet or labtop, click on the scan icon in the Search field in the top navigation bar.

![](https://support.innovint.us/hubfs/image-png-Feb-14-2023-06-34-16-8975-PM.png)

Scanning the code will open the work order in the same open browser tab and you can quickly complete and submit without searching though the Work Order Explorer.

#### Archive Dry Good Batches

If you are tired of seeing empty batches of depleted yeast or acid hanging around your Product Details in the Dry Good Explorer - we've just released a method to archive empty batches!

If a batch is fully depleted or empty, you will now have the ability to archive it.

![](https://support.innovint.us/hubfs/image-png-Feb-14-2023-10-03-12-6959-PM.png)

The Product Details page also now has the option to navigate between "show" or "hide" archived batches, if you need to access them at a future point.

![](https://support.innovint.us/hubfs/image-png-Feb-14-2023-10-05-30-5487-PM.png)

### Improvements

#### **Recent VA Results are now included in the ML Fermentation Report**

There is nothing worse than a volatile acidity spike as your malolactic fermentation finishes up. InnoVint now automatically includes the three most recent Volatile Acidity readings within the [Malolactic Fermentation Report](https://support.innovint.us/hc/en-us/articles/204546129-ml-fermentation-report?hsLang=en) so you can easily watch for this red flag.

**![](https://support.innovint.us/hubfs/image-png-Feb-13-2023-06-38-18-9201-PM.png)**

#### **Sentia - Added Manual integration and Lab Source**

If you are using a Sentia Lab Analyzer, InnoVint now supports analysis types as exported from Sentia. This means you can copy/paste your export results directly into the InnoVint [import template](https://support.innovint.us/hubfs/Modified%20Analysis%20Import.csv?hsLang=en) and easily upload your results. We have also added Sentia as a Lab Source, so you can see where that analysis originated.

![](https://support.innovint.us/hubfs/image-png-Feb-14-2023-06-42-05-4573-PM.png)

![](https://support.innovint.us/hs-fs/hubfs/image-png-Feb-14-2023-06-41-46-0641-PM.png?width=654&height=194&name=image-png-Feb-14-2023-06-41-46-0641-PM.png)

#### **Improved Bottling Report export performance for wineries with large volumes of data (but check for your pop-up blockers!)**

Some wineries have experienced limited functionality with large bottling data sets. We have now improved the data handling with the Bottling Report. This report may now trigger your pop-up blocker - so if you don't see your report download, check your browser toolbar and allow [pop-ups from Chrome.](https://support.innovint.us/hc/en-us/why-isnt-my-report-downloading?hsLang=en)

#### Control Tag Creation!

InnoVint has new, optional, behind the scenes functionality that will allow you to restrict user abilities to create Tags. What does this mean? We've created a user permission restriction that allows only Admins to create new Tags.  Non-Admin users, such as Team Members, will only be able to select from existing tags.

If you would like to restrict Tag creation in your own account, please reach out to support@innovint.us.

### Bugs

- The Lot Components export from the Lot Composition tab was missing vintage
- Lot Explorer export was missing total cost data
- Cost Item actions were missing "Submitted by" user
- Users were temporarily blocked from editing cost items that involved lots with 50+ dependent actions
- Lots created with Bulk Components would not allow components <0.1%
- Lots created via our bulk components feature were not included in blend composition preview
- Bond to Bond Transfer and Volume Adjustment actions in the Winery Activity Feed displayed one vessel as "1" instead of the vessel code
