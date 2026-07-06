---
id: "41552727335188"
title: "Version 25.10.1"
url: "https://support.vintrace.com/hc/en-us/articles/41552727335188-Version-25-10-1"
category: "Release Notes"
section: "Version 25"
created_at: "2025-09-25T06:10:14Z"
updated_at: "2026-05-18T19:29:08Z"
labels: []
gist: "Version roll-out dates: Mon, 6 Oct - Wed, 15 Oct 2025."
tags: ["release-notes", "api", "harvest", "bond", "cost", "reporting"]
---

# Version 25.10.1

**Version roll-out dates**: Mon, 6 Oct - Wed, 15 Oct 2025

## General availability

*The updates in this section are generally available to all customers as long as the module in question is within the customer package / licensing scope.*

### API enhancements

We've completed enhancements for two of our APIs to further improve data access and reporting.

- [Transaction search API](https://api-docs.vintrace.com/docs/vintrace-server/branches/v6/b9942325fe9d2-transaction-search) - Adding bond details to report on movements between bonds.
  - Additional fields: Bond number and bond registered name.
- [Create a block API](https://api-docs.vintrace.com/docs/vintrace-server/3b15cf4c098f4-create-a-block) - Extra fields were added to enable clients to have better data maintenance.
  - Additional fields: Code, comments, description, default harvest method, grafted date, intended use, row numbers and vine structure.

## Features in pilot

*The features in this section are available to selected pilot clients only. If you are interested in joining the pilot customer group and trialling any of the features below, please contact our support team.*

### Grower contract management module

**Landing page filtering**

Following on from recent changes to include a default vintage filter to the main landing page for Grower Contracts, columns have been updated to reflect this filter. Previously the columns included data from all vintages.![](https://support.vintrace.com/hc/article_attachments/41888085992212)

- **Contracted tons / tonnes** renamed (previously labelled 'Contracted fruit')
- **Received tons / tonnes** renamed (previously labelled 'Received fruit')
- **Estimated contract value** (previously labelled 'Contract value'). This column is now focused on the contracted tons for the selected vintage only. It used to display the cost based on received fruit where fruit had been received, otherwise the cost based on the contracted tons.
- **Received fruit base cost**. This is a new column that displays the base cost of all received fruit for the selected vintage. Note that any bonuses or penalties applied to fruit intakes are **not** included in this value.
- **Payments to date** renamed (previously labelled 'Total payments')
- **Next payment cost** renamed (previously labelled 'Next payment')
- **Next payment date** renamed (previously labelled 'Payment date')

### Harvest Module

**Enhanced Appellations Management (US only)**

Continuing to make available the opportunity to track wine origin by recording appellations against received bulk wine. Additional importer tools have also been added to bulk upload and attach to vineyards.

- **Import Appellations:** Making available an importing interface allowing you to bulk import appellations.
- **Updating vineyards:** Enabling you to bulk manage appellations for your vineyards via our existing vineyard importer.
- **Receive bulk wine:** Appellations is now a field that can be populated when receiving bulk wine.
