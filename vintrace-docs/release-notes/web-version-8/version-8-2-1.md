---
id: "32303293860116"
title: "Version 8.2.1"
url: "https://support.vintrace.com/hc/en-us/articles/32303293860116-Version-8-2-1"
category: "Release Notes"
section: "Web Version 8"
created_at: "2024-11-20T15:51:31Z"
updated_at: "2024-11-20T15:51:31Z"
labels: ["oldui", "wp-page-11136"]
gist: "1.1 Major new features."
tags: ["release-notes", "inventory", "lab", "mobile", "reporting", "ux-friction"]
---

# Version 8.2.1

Contents

- [1 vintrace](#vintrace)
  - [1.1 Major new features](#Major_new_features)
  - [1.2 Fixes and improvements](#Fixes_and_improvements)
- [2 vintrace Beta](#vintrace_Beta)
  - [2.1 Fixes and improvements](#Fixes_and_improvements-2)
- [3 vintrace App fixes and improvements](#vintrace_App_fixes_and_improvements)
  - [3.1 Android app](#Android_app)
  - [3.2 iOs app](#iOs_app)
- [4 Previous releases for version 8](#Previous_releases_for_version_8)

# vintrace

## Major new features

- [Client billing for winery work now charges against the batch per service order and changes in client billing for wine with multiple ownership](http://jx2.com.au/support/online-guides/client-billing/billing-for-winery-work/)
- [Client billing for inventory work now charges against the stock item per service order](https://jx2.com.au/support/online-guides/client-billing/client-billing-for-inventory/)
- [New Client billing invoices console](https://jx2.com.au/support/online-guides/client-billing/invoice-management-in-client-billing-invoices-console/)
- [Sandbox platform release](https://jx2.com.au/support/online-guides/vinx2-quickstart-guide/using-your-sandbox/)
- Create bookings, receive and process fruit, view and update vineyard map on the block page from the vintrace [Android app](https://play.google.com/store/apps/details?id=com.vinx2.vintrace).

## **Fixes and improvements**

- Replace use of term **Varietal** with **Variety**, including in reports.
- Remember sort order for lab print out from the **Lab** console.
- Fixed the issue where vend sales dispatches were not taking from the **Default storage area** in POS configuration.
- Fixed the issue where trial blend analysis charges causes an error in the **Detailed Charges** report.
- Fixed the issue where clicking on the **calculator** icon on a transfer operation causes an error if there is no destination vessel set.
- Fixed the issue in viewing a completed packaging operation where the Bill of Material that had a scrap entered was changed.
- Fixed the issue where batch search is filtered according to the booking owner set from the **Fruit Intake** console.
- Fixed the issue where the BOL report was being generated with incorrect date and time due to timezone differences.
- Added new **Case x2** and **Case x4** stock types.
- Fixed the issue where clicking **Add Extra Costs** and then cancelling from that screen on a packaging operation does not allow you to continue with the operation.
- Added a **Name** filter for **Tirage Item** in Winery Setup.
- Added a copy batch name function on **Tirage admin operation > Split / transfer** tab.
- Add the current location of bins as a column in **Tirage admin > Bin search**.
- Added a **Clear bin** button in the tirage admin operation.
- Fixed the issue where **Reset** in **Address book** does not clear the **Category**.
- Fixed the issue where clicking the **heart** icon in **Lab Console > Number per pages** and the value is blank causes an error.
- Fixed the issue where **Lab** console metric value does not display a warning color change when exceeds the threshold.
- Fixed the issue where **Lab console > Export to PDF and CSV all matching** doesn’t export all results but only the results from current page to last page.
- Fixed the issue where wine stock adjustments that record a gain do not produce inventory gains on PDF TTB report (US only).
- Fixed the issue where switching to scheduling mode from live operations does not show operation validations.
- Fixed the issue where opening a deleted job from **Product Overview > Tasks** tab in a different browser window and it has already been deleted from another window causes an error.
- Added a link to drill into more details to Additive and Lot# in **Product Overview > Adds** tab.
- When selecting an account for a particular purpose, the relevant account type is shown on the top of the accounts list.
- Added option to stop system emails from vintrace to third parties being flagged as Fraudulent, SPAM or Junk when email domain is incorrectly configured.
- Fixed the issue where the **Inactive** flag is not working for some stock items in Winery Setup.
- Fixed the issue where the **Purchase Order Item** field doesn’t highlight as mandatory on saving.

---

# vintrace Beta

## **Fixes and improvements**

- Replaced use of term **Alco State** with **Ferment State**.
- Fixed the broken Sales icon.

---

# vintrace App fixes and improvements

## Android app

- The **Composition** tab on the product page shows custom composition type that is set from the **vintrace Beta > Products page > Composition > Customise composition details**.
- Fixed the issue where the app crashes on editing the **Grading** field if there is no Grading Scale set.

## iOs app

- The **Composition** tab on the product page shows custom composition type that is set from the **vintrace Beta > Products page > Composition > Customise composition details**.

---

# Previous releases for version 8

- [Version 8.1.1](http://jx2.com.au/support/release-notes/version-8/version-8-1-1/)
- [Version 8.1.2](http://jx2.com.au/support/release-notes/version-8/version-8-1-2/)
- [Version 8.1.3](http://jx2.com.au/support/release-notes/version-8/version-8-1-3/)
- [Version 8.1.4](http://jx2.com.au/support/release-notes/version-8/version-8-1-4/)
- [Version 8.1.5](http://jx2.com.au/support/release-notes/version-8/version-8-1-5/)
- [Version 8.1.6](http://jx2.com.au/support/release-notes/version-8/version-8-1-6/)
