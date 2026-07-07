---
id: "45697447322772"
title: "Version 26.02.1"
url: "https://support.vintrace.com/hc/en-us/articles/45697447322772-Version-26-02-1"
category: "Release Notes"
section: "Version 26"
created_at: "2026-01-27T02:55:07Z"
updated_at: "2026-02-11T05:25:32Z"
labels: []
gist: "Version roll-out dates: Mon, 2 Feb - Mon, 16 Feb 2026."
tags: ["release-notes", "cost", "configuration", "reporting", "barrels", "inventory"]
---

# Version 26.02.1

Version roll-out dates: Mon, 2 Feb - Mon, 16 Feb 2026

## General availability

*The updates in this section are generally available to all customers as long as the module in question is within the customer package / licensing scope.*

### Reporting

- An issue has been fixed in the Bulk Inventory By Allocation Report where occasionally a 0 gallon row was included . This was due to minute remainder amounts after the allocation was fulfilled, or redistributed. This has now been addressed to prevent these 0 gallon rows from showing.

### Manage Tags

- You can now you're own Manage Tags

  - A new Set Up tile has been introduced to allow the maintenance of Tags. This new tile can be found under Set Up > Classification.

![image-20260129-034931.png](https://support.vintrace.com/hc/article_attachments/45895704721684)

- On clicking ‘Configure’ a list of existing Tags will display where these can be updated, including an option to make them inactive.
- Inactive Tags will no longer be available to attach to entities throughout vintrace.
- Any currently deployed Tags will remain in situ against bulk wines, blocks etc. after being made inactive. These tags can be manually removed against the individual entities.

### Naming Consistency

- Cost console relabelled

  - The link to the Cost console was previously labelled ‘Cost admin’ under More options > Accounts. This label change helps provide better consistency throughout vintrace.
- Tax Event console

  - The link to the Tax Event console was previously labelled ‘Tax Class Event history’ under More options > TTB. This label change helps provide better consistency throughout vintrace.
  - This console is applicable to the US only.
- Change Ownership

  - The link to the Change Ownership operation was previously labelled ‘Change Owner' under Vessels > Operations. This label change helps provide better consistency throughout vintrace.
- Bulk Intakes

  - For the US, if a bulk intake of wine had the Product type ‘Neutral condensate’ then this caused issues with the TTB report. This Product type option has been removed for US based databases.
  - The ‘Neutral condensate’ Product type is still available for those outside of the US.

### App UX update (available from 12 February 2026)

- Work Order search

  - Users can now search for Work Order from the App home screen by using the Quick Search field to search for ‘TWL' followed by the Work Order number. Simply typing TWL will show a list of the most recent Work Orders.

![Screenshot 2026-01-29 at 4.54.10 pm.png](https://support.vintrace.com/hc/article_attachments/45895688382228)

- You may also search for the work order number alone. Note that if your winery has a location prefix, e.g. TWL**JX**1234, you will need to include the prefix in your search, e.g. ‘JX1234’.

![Screenshot 2026-01-29 at 5.03.06 pm (1).png](https://support.vintrace.com/hc/article_attachments/45895664700948)

### APIs

Performance of the v7 **vintrace Report API** has been improved to continue to bring you a better user experience

## Features in Pilot

### Enhanced Appellation Management (US databases)

- Appellation support

  - Appellation data can now be assigned to vineyards, which in turn is inherited by the blocks within those vineyards.
  - This can be added by editing individual vineyards, or uploaded in bulk using the vineyard importer (Set Up > Fruit Sources > Fruit Sources > Import/Export options) with Appellations added to the new ‘Appellations’ column. Separate multiple entries with a comma.
- Linear structure

  - Unlike the traditional tiered hierarchy of AVAs, Sub-AVAs and Micro-AVAs, Appellations are flat in that a vineyard can have multiple Appellation attributes assigned to it. This allows for instances where a vineyard falls within multiple, sometimes overlapping, Appellations.
- Historical assignment option

  - Existing bulk wines with defined block sources are eligible to have Appellation data assigned to them. Please contact vintrace Support to facilitate this.

### Contract Management

Finalise Instalment Plans for individual Contracts:

- When instalments in the instalment plan modal are in a read-only state the date picker is still enabled.
- Ability to edit instalments after one payment has already been processed.

Instalment Costs Splitting:

- Ability to define how the cost of a contract is split across installments.
- Process payments for instalments that have had costs manually split.
- Reverse payments for instalments that have had costs manually split
- Correct cost split payment values in the Payment Details Report.
