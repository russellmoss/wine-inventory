---
id: "32303324016404"
title: "Version 8.1.2"
url: "https://support.vintrace.com/hc/en-us/articles/32303324016404-Version-8-1-2"
category: "Release Notes"
section: "Web Version 8"
created_at: "2024-11-20T15:52:03Z"
updated_at: "2024-11-20T15:52:03Z"
labels: ["oldui", "wp-page-10784"]
gist: "1 Major new features."
tags: ["release-notes", "harvest", "lab", "vineyard", "fermentation", "reporting"]
---

# Version 8.1.2

Contents

- [1 Major new features](#Major_new_features)
- [2 Other significant enhancements](#Other_significant_enhancements)
- [3 Additional fixes and improvements](#Additional_fixes_and_improvements)
- [4 Previous releases for version 8](#Previous_releases_for_version_8)

# Major new features

- View block details, view and record fruit samples using the vintrace [Android app](https://play.google.com/store/apps/details?id=com.vinx2.vintrace). [More details](http://jx2.com.au/support/question/view-blocks-view-and-record-fruit-samples-from-the-android-app/).

# Other significant enhancements

- [New options for a booking in the Fruit Intake Console](https://jx2.com.au/support/question/new-options-for-a-booking-in-fruit-intake-console/ "Permanent link to New options for a booking in the Fruit Intake Console")

- [New API endpoint for Transaction report](https://vintraceapp.docs.apiary.io/#reference/0/transaction-report/transaction-search)

# Additional fixes and improvements

- Fixed the issue with bins with negative and positive Common Tare that cancel each other not calculating properly on **Fruit Intake**.
- Fixed the issue where, on some devices, the **Save** button couldn’t be clicked when in big fruit intake console mode.
- Fixed the issue where the **Sample Day Sheet** (PDF) incorrectly groups varieties if you don’t enter a block.
- Added search by **Harvester** option in **Harvest Calendar**.
- Fixed the issue where **Scale Bookings** were breaking to a second page before it was necessary.
- Fixed the issue for ferments missing from **Ferment Spreadsheet Generator** when **Include Ferments with no Analysis** checkbox is selected.
- Fixed the issue where one to many replay work order hangs on to original losses.
- Fixed the issue where **Tax Class** labels entered in wrong section on **TTB Report**.
- Fixed the filters in **Winery Setup > Accounts**.
- Changed **Government Reference** label to **SWNZ Code** in the **Block Overview** on the **Vineyard** tab for NZ customers.
- Winery default setting changes are now included in the **User transaction Audit Report**.
- Fixed the issue where **Bulk Dispatch** (multi line) clears the barrel group selection on clicking **Add line**.
- Fixed the issue where TWL search on scheduling job shows summary instead of TWL#.
- Fixed the issue where the **Search** icon in **Standard notes** in work order is showing as a white icon.
- Fixed the issue where the **Grape delivery report** (PDF) date format in the header is not regional.
- Fixed the issue where batch search on **Costs Admin** shows description instead of code.

# Previous releases for version 8

- [Version 8.1.1](http://jx2.com.au/support/release-notes/version-8/version-8-1-1/)
