---
id: "48434754107796"
title: "Version 26.05.1"
url: "https://support.vintrace.com/hc/en-us/articles/48434754107796-Version-26-05-1"
category: "Release Notes"
section: "Version 26"
created_at: "2026-04-21T06:13:00Z"
updated_at: "2026-05-12T23:16:18Z"
labels: []
gist: "Version roll-out dates: Mon 4 May - Wed 13 May 2026."
tags: ["release-notes", "barrels", "cost", "inventory", "configuration", "additives"]
---

# Version 26.05.1

Version roll-out dates: Mon 4 May - Wed 13 May 2026

## Table of Contents

- [General Availability](#h_01KQVCNT1VACZQBP9RD2ZEGJ0E)
- [Bug Fixes](#h_01KQVCSBC9GZVSJMWHQK8KAXAX)
- [Pilot: Scalehouse](#h_01KQVCY5TEH544YS0V10WKV1QY)

## General availability

*The updates in this section are generally available to all customers as long as the module in question is within the customer package / licensing scope.*

- **MSO2 (Molecular Sulphur Dioxide) calculation**: vintrace can now dynamically calculate MSO2 for you within the Lab Console. Follow [this guide](https://support.vintrace.com/hc/en-us/articles/48508411412756) to learn how to setup and use dynamic MSO2 calculation
- **More default start screen options**: Users can now set the Calendar, Jobs, and More Options screen as their default start page. Follow [this guide](https://support.vintrace.com/hc/en-us/articles/32301352146324) to learn how
- **Dispatching individual barrels between wineries**: The existing Bulk dispatch (inter-winery) operation now allows individual barrels (as well as barrel groups ) to be dispatched. After selecting the barrel, ensure you click the Dips/Options link and select the ‘Barrels dispatched’ option to move the wine in the barrel

  ![879a3f00-e6c4-4d64-8182-1b4a176501b6.png](https://support.vintrace.com/hc/article_attachments/48917983578516)
- **Enhanced Cost Controls**: To improve financial oversight, the ‘Keep unit costs @’ option during stock adjustments is now restricted. Users must have the ‘Can adjust costs’ permission to modify this setting, ensuring that cost write-offs or absorptions are handled by authorised personnel.
- **Product Search Accessibility**: Finding specific wine or juice records is now easier with a direct ‘Product Search’ link added to the Products section of More Options.
- **Scale Certification Update**: For users in the United States, the scale certification version number displayed in the Help & Support screen has been updated to NTEP CC: 23-058A2
- **Usability**:
  - Inactive tags are no longer listed when linking tags to wine batches, blocks or stock allocations
  - To better reflect the functionality of the system, the ‘Custom reports' category in the Winery Reports screen has been renamed to 'Custom searches’

## Bug fixes

- **Vessels & Wine**
  - Fixed an issue where remaining bins/cages were not displayed for a Tirage Admin operation after a partial dispatch
  - Fixed an issue where an error was displayed when selecting a multi-topping operation
- **Harvest**
  - Fixed an issue where a Press Cycle on any extraction type other than Must did not end ‘days on skins’ counter
  - Reversed intakes no longer show on the intake counter of a booking in the Fruit Intake console
- **Sales Orders**
  - Corrected an issue where dispatching non-stock items (such as merchandise or glass towels) would trigger incorrect error messages or display inaccurate Xero synchronisation statuses.
- **Inventory**
  - Fixed a bug where searching for stock items by lot number would only return a single result even if multiple items shared that same lot code
- **Reporting**
  - Added guardrails (one year time constraint) on Operation Throughput report to prevent system instability
  - Resolved several issues within the Contracts module where reports, such as the Payment Details and Payment Reconciliation reports, were not correctly filtering data by the selected vintage or processed date range
  - Improved the generation speed of the Bulk Stock report, particularly when including complex composition details
- **Mobile**
  - Fixed an issue with viewing previously submitted Additive Work Orders on the App
- **General**
  - Changed the default handling of PDF files to download, fixing an issue with inline (in-browser) display in some browsers
  - Addressed a "ClassCastException" error that prevented the Stock Item overview from loading for some users

## Features in pilot

### Scalehouse

- The pilot Scalehouse feature has been expanded on to include a ‘Weigh certificates' report. This new report lists all weigh certificates for a selected timeframe, whether they relate to a Fruit Intake, or a non-fruit weigh record. The report is accessed via the existing Reporting console > Vintage/Harvest section

  ![1dc7da7b-4662-41ff-a1a0-e291deacba7c.png](https://support.vintrace.com/hc/article_attachments/48917968964244)
- The Commodity types available for selection in the Scalehouse weigh records can now be managed via a standard Set up page
- There is now a Winery search/filter option on the Scalehouse page for users with single sign-on as well as clients who use standard username/password to login
