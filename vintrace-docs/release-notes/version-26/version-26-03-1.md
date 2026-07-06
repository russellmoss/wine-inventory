---
id: "46814358735252"
title: "Version 26.03.1"
url: "https://support.vintrace.com/hc/en-us/articles/46814358735252-Version-26-03-1"
category: "Release Notes"
section: "Version 26"
created_at: "2026-03-03T01:54:13Z"
updated_at: "2026-03-03T21:13:34Z"
labels: []
gist: "The updates in this section are generally available to all customers as long as the module in question is within the customer package / licensing scope."
tags: ["release-notes", "inventory", "lab", "migration", "reporting", "vineyard"]
---

# Version 26.03.1

## General availability

*The updates in this section are generally available to all customers as long as the module in question is within the customer package / licensing scope.*

### Lab Integration

**Admeo/BioSystems SPICA Lab Integration**: You can now import lab results directly from SPICA devices into the vintrace lab console. By selecting the "Admeo/BioSystems SPICA" format from the import menu, you can upload CSV files exported from your device, automatically attaching results to the correct analysis lines.

### Blocks

- **Bulk Block Assessment Upload**: You can now upload seasonal block assessments in bulk via CSV. This feature lives in the Blocks screen (click the Action/Plus icon) and allows viticulture teams to manage assessment uploads in bulk for multiple blocks at once.
- **Block Page Accuracy**: Fixed a sorting and pagination issue on the Blocks page. Lab results and maturity metrics (like Brix) will now sort correctly across multiple pages of results.

### Reporting

- The Stock Inventory Report now includes "Time" as a standard field. This allows finance and admin teams to accurately match end-of-month and beginning-of-month inventory, even when multiple transactions occur on the same day.
- To ensure clarity across the system, the "Code filter" in the Bulk Stock Report has been renamed to "Batch filter" to align with standard vintrace naming conventions.
- Internal updates to ensure that various stock and transaction reports remain accurate when filtered by specific time ranges or regional time zones.
- A new column for "Fruit Parcel Batch" has been added to the Grape Delivery CSV report, providing better visibility for reconciling fruit intakes with their respective batches.

### Bug Fixes

- **Job Visibility & Mobile Stability**: We resolved a technical issue where duplicate data entries prevented "In Progress" jobs from loading on the web and blocked work orders from opening on the mobile app.
- Addressed a technical loop in the TankNET integration that could cause temporary server performance spikes during automated polling cycles.

### Other Improvements

- **Work Order name search:** You can now search by First Name (as well as Surname) on Work Orders, both in Assigned To and Issued By fields. This also applies to filter options on the Jobs screen. (Previously limited to Surname)
- **Data Importers:** You can now click on the ‘Upload a File…’ text on all importer windows to choose a file. (Previously limited to the upload icon).![](https://support.vintrace.com/hc/article_attachments/46814638088340)

## Features in pilot

### Contracts Management:

- Significant backend updates have been made to consolidate Contract Management services, improving system performance and setting the foundation for future interface enhancements.
- Fixed an issue where fruit intake bookings could be saved even if the selected vintage did not match the associated grower contract. The system now prevents these mismatched saves to ensure data integrity.
- Resolved a bug where fruit received via the mobile app was not correctly updating the "Received Fruit" totals in the main contract management console.
- Corrected an issue where clearing a contract during an intake correction would sometimes fail to remove the received fruit value from that contract.
- Improved the Remittance report layout to prevent PDF text overlap and provide a clearer export.

### Enhanced Appellation Management (US databases)

- Winemakers can now view appellation breakdowns directly within the Trial Blend console. This includes a new "Appellations" row in the blend charts and a dedicated bar graph to help visualize the geographic composition of your trials.
