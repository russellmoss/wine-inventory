---
id: "47327661464980"
title: "Version 26.04.1"
url: "https://support.vintrace.com/hc/en-us/articles/47327661464980-Version-26-04-1"
category: "Release Notes"
section: "Version 26"
created_at: "2026-03-18T05:12:54Z"
updated_at: "2026-04-16T03:43:15Z"
labels: []
gist: "Version roll-out dates: Mon, 6 Apr - Wed, 15 Apr 2026."
tags: ["release-notes", "exports", "reporting", "inventory", "lab", "compliance"]
---

# Version 26.04.1

Version roll-out dates: Mon, 6 Apr - Wed, 15 Apr 2026

## Table of Contents

- [**General availability**](#h_01KPA57KCRMZGQ3PDR2JBQP0S7)
  - [Bug fixes](#Bug-fixes)
- [**Features in pilot**](#Features-in-pilot)
  - [Contract management](#Contract-management)
  - [Scalehouse](#Scalehouse)
  - [Claret integration](#Claret-Integration)

## General availability

*The updates in this section are generally available to all customers as long as the module in question is within the customer package / licensing scope.*

- **Enhanced Expiration Visibility:** Expiration dates are now displayed within lot routing windows and distribution tabs to help identify stock closest to expiration during routing.
- **Best Before Dates:** You can now record a "Best Before" date when creating or receiving stock items, allowing for better differentiation from expiry dates and improved management of dry goods.
- **Inclusive Terminology:** Updated "Man Hours" to "Person Hours" within Client Billing and Service Charge areas to ensure gender-neutral terminology.
- **Report Accuracy:**

  - The "Analysis Spreadsheet" now downloads with its correct title
  - The “Wine/Juice Costing Report” correctly reflects measurement units in headers regardless of system settings.
  - The “Bulk Inventory by Allocation” report now has an ‘Allocation precision’ field to control how many decimals values in the Allocation Quantity column are displayed, so that unallocated values under 1 gallon can be hidden.
  - The “Sample Day Sheet” has been updated to include the vineyard Sub AVA / Region
- **Audit Report CSV Export:** The User Transaction Audit report can now be generated as a CSV file, allowing for easier sorting and filtering in spreadsheet applications.
- **Usability:**

  - You can now set a default vintage for **fruit maturity sampling** in Set Up > General > Defaults. This can be set at System or Winery level, and also sets the sampling vintage in the Mobile App. This appears directly beneath the ‘vintage’ default option.
  - The ‘Vineyard Govt Reference’ in the block importer/exporter csv file has been renamed ‘Sustainable Cert#’ to align with the vintrace UI
  - Renamed the ‘Lab labels’ to ‘Lab request’ under the ![Plus](https://pf-emoji-service.prod-east.frontend.public.atl-paas.net/assets/atlassian/productivityEmojis/add-128px.png) icon when viewing a vessel’s wine overview screen

### Bug fixes

- **Compliance & Reporting**

  - Fixed cost calculation errors in bulk stock reports when measurements occur at specific times.
  - Errors when generating monthly billing charges have been resolved.
  - Corrected supply calculation in product allocation exports to match UI.

- **Vessels & Wine**

  - UI now correctly reflects volume changes in self-topping operations for barrel groups.
  - Prevented errors when performing operations on locked vessels from the Vessels page.
- **Authentication & Access**

  - Fixed issue where you could not access the profile menu when switched to a winery with an apostrophe in the name.
  - The change password button now correctly enables when requirements are met.
- **General**

  - Fixed translation issues in mobile API for Spanish string “vacio” (“empty”)
  - Fixed an issue where some in‑progress jobs in the web, and some work orders in the app could not be opened.

## Features in pilot

### Contract management

- **Reporting Performance:** Significantly optimized the Levy Costs report, resulting in much faster generation times and fewer timeouts when managing large volumes of contracts and blocks.
- **Intuitive Installment Tracking:** The "Installment" column now correctly displays the specific installment number (e.g., "1 of 3") rather than counting individual payments, providing a clearer view of payment schedules.
- **Improved Bulk Payment Feedback:** The "Process Next Payment" bulk action now provides clear notifications if a contract is excluded from a run due to missing fruit intake records.
- **Payment Action Safety:** The system now disables payment buttons while data is refreshing to ensure you only perform actions on the most up-to-date information.
- **User-Friendly Interface:** Corrected contract status displays to show clear, human-readable labels instead of internal system codes.
- **Language Support:** Enhanced the internal implementation of translations to ensure smoother performance and better reliability across international versions of the module.

### Scalehouse

- A new ‘Scalehouse’ feature has been introduced that provides a streamlined, high-efficiency interface for managing deliveries and dispatches that go across the winery scales. It is designed specifically for scale operators and weighbridge staff to quickly record gross and tare weights, and generate weight dockets.
- The Scalehouse is accessible via the truck icon in the sidebar menu

  ![](https://support.vintrace.com/hc/article_attachments/48047614836244)
- The Scalehouse page displays a list of weigh records that have come across the scales - whether delivered to the winery, or dispatched out.

  ![](https://support.vintrace.com/hc/article_attachments/48047614836628)
- New records can be added, and existing records managed via a ‘Weigh Record’ window![](https://support.vintrace.com/hc/article_attachments/48047600459540)
- On saving the record as **Complete** a **Weight Certificate (PDF)** is automatically generated. Aka 'Weigh tag' or 'Docket'
- You can select the **Print** option for any record the Scalehouse list page to reprint a docket at any time.

### Claret integration

- A new integration has been introduced to import wine product demand data from [Claret](https://claret.app/), supporting daily updates and new product creation.
