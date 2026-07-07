---
id: "40643128330004"
title: "Version 25.09.1"
url: "https://support.vintrace.com/hc/en-us/articles/40643128330004-Version-25-09-1"
category: "Release Notes"
section: "Version 25"
created_at: "2025-08-27T00:13:37Z"
updated_at: "2025-09-11T06:29:23Z"
labels: []
gist: "Version roll-out dates: Mon, 1 Sep - Wed, 10 Sep 2025."
tags: ["release-notes", "api", "vineyard", "harvest", "dtc-sales", "integrations"]
---

# Version 25.09.1

**Version roll-out dates**: Mon, 1 Sep - Wed, 10 Sep 2025

## General availability

*The updates in this section are generally available to all customers as long as the module in question is within the customer package / licensing scope.*

### API enhancements

We've completed some validation and filter enhancements for two of our APIs to further improve data access and data integrity ensuring a more seamless integration.

- [Record a new fruit intake transaction API](https://api-docs.vintrace.com/docs/vintrace-server/85f8619d302f5-record-a-new-fruit-intake-transaction) - Adding further validation to ensure that the fruit intake winery matches with the specified booking winery.
- [List available sales orders API](https://api-docs.vintrace.com/docs/vintrace-server/branches/v6/bfe708e80efa0-list-available-sales-orders) - Adding an external transaction ID filter to validate if a sales order was created successfully with that linked ID.

### Harvest module

**Blocks Listing Page**

- Expanding to improve for a more detailed reporting we've now enabled three additional fields to be available on the blocks page as selectable columns.
- Fields - Expected harvest date, intended product and seasonal intended use.

![Screenshot 2025-08-29 at 10.28.46 am.png](https://support.vintrace.com/hc/article_attachments/40717690706196)![Screenshot 2025-08-29 at 10.32.15 am.png](https://support.vintrace.com/hc/article_attachments/40717690710164)

**Terminology update: Consistent wording for AVAs**

To improve clarity, we have standardised terminology within the US version of vintrace. All references to American Viticultural Areas, previously labelled 'appellation' will now consistently appear as **'AVA'**.

This update is for US customers only, other regions will continue to use the standard term 'Geographic Indicators' (GI).

---

## Features in pilot

*The features in this section are available to selected pilot clients only. If you are interested in joining the pilot customer group and trialling any of the features below, please contact our support team.*

### Grower contract management module

**New Levy Rates list page**

A new 'Levies' page has been introduced to show the levies (aka fruit assessments) that have been defined. This page is accessed via the 'Configure' button at the top right of the Contracts page.![](https://support.vintrace.com/hc/article_attachments/40720065781012)

The page lists all levies that have been defined for each year.![](https://support.vintrace.com/hc/article_attachments/40720339036308)

**Contracted fruit and blocks**

- On creating an assessment for a block that is included in a contract for the selected vintage then the contract is automatically populated for that assessment![](https://support.vintrace.com/hc/article_attachments/40720269876372)
  - Note that there is a known issue where the Contract price is not populated in the Blocks page list view for these contracts. This issue will be addressed in a future vintrace release.
- When adding, amending, or viewing a contracted fruit record for a block that has an 'Intended product' listed in an assessment for the contract vintage, that product is displayed on the contracted fruit window.![](https://support.vintrace.com/hc/article_attachments/40720135348628)

### Harvest Module

**Introducing Enhanced Appellations Management (US only)**

Providing a new data layer for tracking wine origin. This new field allows users to define and assign multiple appellations to vineyards in a single place, allowing our customers to readily have visibility to all appellations of origin for your wines.

- **Appellation configuration:** you can now create and manage a custom list of appellations.
- **Vineyard and block assignment:** A multi-select field allows for the assignment of one or more configured appellations directly to a vineyard.
- **Enhanced block reporting:** The blocks list page now includes 'Appellations' as a selectable column with a multi-select filter.
- **Fruit intake:** Appellations is now a field that can be populated on bookings and fruit intake.
- **Terminology Standardisation:** For further consistency, clarity and to support this new enhancement, all previous references to 'Appellation' in the US locale have been standardised to 'AVA' (American Viticultural Area).

Further to the inclusions above, the ability to view in wine composition, assign to bulk intakes and enhanced reporting for this field is planned.
