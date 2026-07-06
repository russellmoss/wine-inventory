---
id: "49730573917332"
title: "Version 26.06.1"
url: "https://support.vintrace.com/hc/en-us/articles/49730573917332-Version-26-06-1"
category: "Release Notes"
section: "Version 26"
created_at: "2026-05-29T03:53:42Z"
updated_at: "2026-06-02T02:49:29Z"
labels: []
gist: "Version roll-out dates: Mon 1 June - Wed 10 June 2026."
tags: ["release-notes", "lab", "mobile", "barrels", "additives", "lot-identity"]
---

# Version 26.06.1

Version roll-out dates: Mon 1 June - Wed 10 June 2026

## Table of Contents

- [General Availability](#h_01KSRVT763NQ3HC07BSPV0G67N)
- [Improvements & Bug Fixes](#h_01KSRX5RNRZ5VNG0H1V6C595JA)
- [vintrace Vineyard](#h_01KSRX88KX3616TPK8P2T2SBNN)
- [Pilot: Scalehouse](#h_01KSRX8ZB002589Z0M03W3FHZY)

## General Availability

*The updates in this section are generally available to all customers as long as the module in question is within the customer package / licensing scope.*

*Please note that Mobile App functions may not be immediately available to you as the Mobile release occurs only once the vintrace Web rollout is complete.*

- **Help & Support**
  - **Bev is now in vintrace:** your AI Support assistant is ready to provide advice on everything vintrace, without having to leave the software. Simply click the Bev icon to activate, type your question, and click the icon again to close

    ![](https://support.vintrace.com/hc/article_attachments/49731154118164)

    Bev - Support AI assistant is now live in vintrace
- **Lab**
  - **Lab data entry supports Metric Code**: you can now use the short-form Code of a Metric when adding Lab Results or making a new Analysis Template. [See how to speed up your data entry here](https://support.vintrace.com/hc/en-us/articles/32301345260948)
  - **MSO2 (Molecular Sulphur Dioxide) calculation:** vintrace can dynamically calculate MSO2 for you on an individual Analysis Operation or from the Lab Results option on a specific wine batch. This adds to functionality previously only present in the Lab Console. [Follow this guide](https://support.vintrace.com/hc/en-us/articles/48508411412756) to learn how
- **Mobile App**
  - **Specify barrel fill heights:** you can now nominate a specific volume when filling barrels
  - **Empty vessels**
    - Dip chartsare now available for empty tanks when they have a dip chart
    - Scanning a QR code/barcode on any type of empty vessel is now possible
- **Search & Navigation**
  - **Winery separation for Saved Searches**: you can now assign saved searches to specific wineries
  - **Persistent Container Equipment Search**: the Vessel and Container Equipment search screen now automatically remembers your specific checkbox selections from your last session uniquely for your user account
- **Reporting**
  - **Inventory Stock Report**
    - A new "Precision" field is now available for the Inventory Stock Report, allowing you to set the decimal precision for quantities. This ensures that values generated in both the PDF and CSV formats are consistent and accurate
    - Owner logins can now successfully view dry goods on the Inventory Stock Report, as the bond field is no longer locked and pre-filled by default
- **Compliance**
  - **TTB reporting**: the workflow to support Part IV in column b - FIELD CRUSHED (Gallons) - Line 5 - Used in Wine Production has been fully enabled.
    - The gallons of the un-declared juice appear under Part IV in column b - FIELD CRUSHED (Gallons) - Line 5 - Used in Wine Production, when completing a Product treatment to un-declare juice (or must). (Applies to US only)

## Improvements & Bug fixes

- **Vessels & Wine**
  - The optional ‘Location’ column in the Vessels list page has been renamed ‘Winery Building’ in line with other areas of vintrace
- **Compliance**
  - Corrected an issue with TTB reporting for multi transfer (one-to-many) inter-winery operations  where gallons were previously reported as inventory losses instead of Transfer in Bond
    (Applies to US only)
- **Harvest**
  - Added Grading Scale option to the Block bulk importer
- **Laboratory**
  - Confirming the page will now confirm all tasks possible and provide a list of errors/confirmations, where previously it would stop at the first issue
- **Sales Orders**
  - The API documentation for creating or updating a sales order has been updated to include the storageAreaId field, which controls the 'Pickup Storage Area'
- **Inventory**
  - Corrected an issue where the stock receival report displayed inflated unit prices and total prices when the same item was received multiple times
  - API users can now successfully create stock receivals via the /api/v7/stock/receivals endpoint in a single winery database without needing a current winery set on their user profile
- **Reporting**
  - The Ferment Spreadsheet Generator and Analysis Spreadsheet Generator reports previously used the GMT time zone to filter and display dates. These reports now use your local (Winery) time zone for all dates
  - Multi transfer inter-winery operations are now reported as ‘Transfer in Bond’ in the TTB report. These were previously reported as ‘Inventory Losses’ (applies to the US only)
  - The Wine/Juice Costing Report now show losses under the correct batch after Change Batch operations
- **Mobile**
  - Fixed an issue on iOS where Work Order Summaries were not displaying properly
  - Fixed an issue on iOS where the Reset button was not functional while using Dip Calculator
- **General**
  - Fixed an issue where corrupted user preferences prevented access to the Jobs screen
  - Fixed an application error that prevented users from searching for service orders using the "Invoice no(s)." filter on the Service Orders screen
- **Contracts Management**
  - Resolved an infrastructure error that incorrectly blocked users from successfully deleting an instalment plan inside a contract
  - Resolved an issue where attempting to generate a complete CSV of all  Contracts caused a timeout error.
  - The report export process has been significantly optimised, and a blocking modal with a loading spinner will now inform you that the process is running so your session is not interrupted unexpectedly
  - Fixed an issue where the Contracts module ignored New Zealand locale configurations, displaying US date formats (MM/DD/YYYY) and US labels ("SUB AVA"). Dates will now correctly display as DD/MM/YYYY and the label will accurately read "Region"

## vintrace Vineyard

- UX: Tooltips on menu items when the menu is collapsed
- Access: User permissions have now been consolidated and renamed to align with the UI
- Data Entry: Mandatory fields on Vineyard properties now have generic default data entered - the user can overwrite as required. These fields are required for vine models to function

![](https://support.vintrace.com/hc/article_attachments/49852507256596)

Generic default data entered on mandatory Vineyard property fields

- Various bug fixes and UX improvements
- Data Importers for onboarding/updating user data

## Features in pilot

### Scalehouse

- Commodity Type records - i.e. the types of goods that can be weighed - can now be maintained via Set up > Classification > Commodity Types
- The Weighmaster fields are shown/hidden based on the Set up > Defaults setting ‘Require weighmaster’
