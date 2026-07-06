---
id: "32303295570708"
title: "Version 8.1.4"
url: "https://support.vintrace.com/hc/en-us/articles/32303295570708-Version-8-1-4"
category: "Release Notes"
section: "Web Version 8"
created_at: "2024-11-20T15:51:51Z"
updated_at: "2024-11-20T15:51:51Z"
labels: ["oldui", "wp-page-10930"]
gist: "1 Major new features."
tags: ["release-notes", "inventory", "packaging", "ux-friction", "cost", "integrations"]
---

# Version 8.1.4

Contents

- [1 Major new features](#Major_new_features)
- [2 Other significant enhancements](#Other_significant_enhancements)
- [3 Fixes and improvements](#Fixes_and_improvements)
- [4 vintrace Beta](#vintrace_Beta)
  - [4.1 Fixes and improvements](#Fixes_and_improvements-2)
- [5 vintrace App](#vintrace_App)
  - [5.1 Fixes and improvements](#Fixes_and_improvements-3)
- [6 Previous releases for version 8](#Previous_releases_for_version_8)

# Major new features

- Our [Terms of Service](https://www.winery-software.com/terms-and-conditions/) and [Privacy Policy](https://www.winery-software.com/privacy-policy/) have recently been updated to be compliant with the European Union GDPR regulations.

# Other significant enhancements

- [Allow vintrace to send emails on behalf of your domain](https://jx2.com.au/support/question/allow-vintrace-to-send-emails-on-behalf-of-your-domain/ "Permanent link to Allow vintrace to send emails on behalf of your domain")

# Fixes and improvements

- Fixed the issue where an incorrect service order is shown in the wine storage charge generator on a wine that has changed ownership and batch.
- Fixed the issue where costs without accounts linked are marked as not to be included in the first sync, and the costs are showing up in **Preview** on first accounts sync again.
- Fixed the error when viewing the Winery Setup in different tabs in the browser.
- Fixed the issue where metric with an **&** symbol doesn’t work in a bulk wine search.
- Fixed the issue on a packaging operation using a **Bill of Materials** (BOM) made up of bulk wine and another product using ml or mg in the components, these components were not not calculating the inventory depletion correctly based on the quantity of items packaged.
- Standardised the use of keyword **EMPTY** in all the printed work orders.
- Fixed the issue where Inventory bottled/manufactured stock report outputs no results in multi winery mode when a winery is selected.
- Fixed the error on press cycle if the source wine is bonded and it triggers the tax class change dialog.
- Fixed the Additions and Jobs PDF reports to show the batch instead of the liquid ID.
- Changed the **Show job details between** date range in the tank map to show jobs one month back and two months ahead and added the option to ignore Analysis jobs.
- Added a warning on using **List** to add barrels where it doesn’t warn if the barrel doesn’t exist.
- Added the system setting **Prioritise destination batch codes** in **Winery Setup > Work-flow > Defaults** for users that prefer that batch codes don’t change to source batch code on transfers.
- Fixed the error on selecting more than five metrics in the tank map and one of the metrics has the **&** character.
- Fixed the error on clicking the **Show chart** link on a trial blend and there are no percentages or volumes entered for the trial blend.
- Fixed the error on removing an attached photo on fruit intake correction.
- Fixed the issue where process fruit notes from app is not showing up in the web application.
- Fixed the issue where applying the **Warehouse** filter in **Inventory search** shows an incorrect number of results.
- Fixed the issue where editing an analysis on a fruit intake correction does not save the values.
- Fixed the issue where moving non-wine items to the taxpaid area  is showing the warning for taxpaid wine.
- Fixed the issue where the incorrect amount is shown for the additive amount in the Bill of Lading in stock dispatch.
- Fixed the error on clearing the number of results per page in the **Lab Console**.
- Fixed the bulk wine search timing out when there are five or more metrics selected in the filters.
- Fixed the issue where changing the order of jobs on a work order and then adding a new job lost the changed order of the jobs.

---

# vintrace Beta

## **Fixes and improvements**

- Added **Calculated** text for calculated metric value.

---

# vintrace App

## Fixes and improvements

- Added **Calculated** text for calculated metric values.
- Fixed the issue where viewing a booking does not show the **Status** and **Grading** values.
- Fixed the images of thumbnails for attachments in **Receive fruit**.

---

# Previous releases for version 8

- [Version 8.1.1](http://jx2.com.au/support/release-notes/version-8/version-8-1-1/)
- [Version 8.1.2](http://jx2.com.au/support/release-notes/version-8/version-8-1-2/)
- [Version 8.1.3](http://jx2.com.au/support/release-notes/version-8/version-8-1-3/)
