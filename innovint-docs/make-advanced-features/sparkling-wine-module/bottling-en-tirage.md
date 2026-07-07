---
title: "Bottling en Tirage"
url: "https://support.innovint.us/hc/en-us/articles/360051230671-bottling-en-tirage-"
category: "MAKE: Advanced Features"
section: "Sparkling Wine Module"
page_type: "article"
lastmod: "2025-11-20"
gist: "Bottling en Tirage is a special movement that allows you to move your sparkling base wine into bottles for the secondary fermentation, and track those bottles within tirage bins in your bulk inventory (Part 1, Section A of the TTB Report)."
tags: ["packaging", "work-orders", "barrels", "cost", "inventory", "transfers"]
---

# Bottling en Tirage

Bottling en Tirage is a special movement that allows you to move your sparkling base wine into bottles for the secondary fermentation, and track those bottles within tirage bins in your bulk inventory (Part 1, Section A of the TTB Report).  Bottling en Tirage also allows you to deplete dry goods and packaging consumed at this point of the wine's lifecycle (for winery accounts with Dry Goods Tracking), and track any direct cost (for winery accounts with COGS Tracking activated) as a category of the bulk wine cost.

This article covers:

- [How to record a Bottling en Tirage action or task](#action)
- [Frequently Asked Questions (FAQ)](#faq)

The Bottling en Tirage action is only available with the [Sparkling module](https://support.innovint.us/hc/en-us/sparkling-wine-production-feature-overview?hsLang=en) activated.  If you wish to activate it, or have any questions, please contact our Customer Success Team at [support@innovint.us](https://innovint-6865708.hs-sites.com/hc/en-us/kb-tickets/new?hsLang=en).

### How to record a Bottling en Tirage action or task

1. Select the Bottling en Tirage action from the "Record action" menu in either the top navigation bar, or the Lot details page.  Bottling en Tirage is also available as a task in work orders on the desktop and InnoApp.
   ![Bottling en Tirage-record](https://support.innovint.us/hs-fs/hubfs/Bottling%20en%20Tirage-record.webp?width=216&height=142&name=Bottling%20en%20Tirage-record.webp)
2. Select your "Transfer from" lot from the dropdown or lot picker. This is your bulk base wine.
3. Select one or move vessels to remove volume from:
   1. InnoVint defaults to remove the entire contents of each vessel. If you need to remove a partial volume from a vessel, adjust the value in the "Ending Fill" column. In work order tasks, you may instead opt to specify a volume to "Remove."![Bottling en Tirage-select vessels](https://support.innovint.us/hs-fs/hubfs/Bottling%20en%20Tirage-select%20vessels.webp?width=688&height=234&name=Bottling%20en%20Tirage-select%20vessels.webp)
4. Select a lot to transfer volume into. You have three options:
   - "Retain lot code" - to keep the volume in the same lot code
   - "Combine with existing lot" - to move the volume into another lot code that already exists.
     - Please note that if an existing lot already has volume, then submitting this action will blend the composition of both drained and filled lots.
   - "Create a new lot" - to move the volume into a new, separate lot
   - You can use multiple options in the same action. To transfer volume into multiple lots, click on **+ Add Lot** under the Transfer to header.
     - We recommend creating and filling separate lot codes when you utilize different bottle formats (sizes).
5. Select one or more vessels to transfer the volume into.   The Bottling en Tirage action or task vessel picker will default to filter for the Tirage Bin vessel type.
   Adjust the "Ending Fill" column as needed in the action, or you can specify *either* the added number of bottles or the ending number of bottles within the work order task. This field represents a number of bottles; InnoVint will calculate the actual filled volume based on the bottle format/capacity of the tirage bins.

   ![Bottling en Tirage-ending fill](https://support.innovint.us/hs-fs/hubfs/Bottling%20en%20Tirage-ending%20fill.webp?width=688&height=340&name=Bottling%20en%20Tirage-ending%20fill.webp)
6. Add packaging. Click on the Edit packaging link to open up the Edit packaging screen. Here, you can allocate bottles, closures, bidules, or any packaging consumed in the Bottling en Tirage action.
   ![Bottling en Tirage-packaging](https://support.innovint.us/hs-fs/hubfs/Bottling%20en%20Tirage-packaging.webp?width=688&height=405&name=Bottling%20en%20Tirage-packaging.webp)
7. Lot Stage updating.
   - If you are retaining the lot code, you will also see an option to update the Lot stage via the action or task.  Leave the box checked to change the Lot Stage to En Tirage if desired.
   - If you are filling an existing lot code, or creating a new lot, you will not see this option (the Lot Stage on the existing or newly created lot takes precedence).
   ![Bottling en Tirage-lot stage](https://support.innovint.us/hs-fs/hubfs/Bottling%20en%20Tirage-lot%20stage.webp?width=688&height=411&name=Bottling%20en%20Tirage-lot%20stage.webp)
8. Select to save the lees to a different lot or not. You may select an existing lees lot code, or create a new one.
9. Double-check the action summary for correctness. Any losses or gains as a result of the transfer will be calculated as the Net Change. Volume losses and gains for declared lots within a single tax class are reported on the TTB 5120.17 report as Inventory Losses and Inventory Gains.
   ![Bottling en Tirage-summary](https://support.innovint.us/hs-fs/hubfs/Bottling%20en%20Tirage-summary.webp?width=688&height=359&name=Bottling%20en%20Tirage-summary.webp)
10. Click on ![Bottling en Tirage-record button](https://support.innovint.us/hs-fs/hubfs/Bottling%20en%20Tirage-record%20button.webp?width=136&height=28&name=Bottling%20en%20Tirage-record%20button.webp)to submit the action.

### Frequently Asked Questions (FAQ)

**Q: I do not see the Bottling en Tirage action or task - where is it?**

*A: The Bottling en Tirage action is an action only available within InnoVint's Sparkling module, and is an add-on feature.  If you cannot see the action, please reach out to [support@innovint.us](mailto:support@innovint.us) to check your subscription.*

**Q: I do not see the Edit packaging link in my Bottling en Tirage action - where is it?**

*A: Packaging within the Bottling en Tirage action is not available for actions submitted prior to the release of the functionality. You will not be able to add packaging to actions submitted prior to January 1 2025. If you are creating a new Bottling en Tirage action and do not see the link, please reach out to [support@innovint.us](mailto:support@innovint.us).*

**Q: Where I can find a report with the packaging I consumed in the Bottling en Tirage action?**

*A: Users with the Packaging History Report will be able to find line items for each packaging batch consumed by their Bottling en Tirage actions.*

![Bottling en Tirage-history report](https://support.innovint.us/hs-fs/hubfs/Bottling%20en%20Tirage-history%20report.webp?width=688&height=127&name=Bottling%20en%20Tirage-history%20report.webp)

*You will also be able to view consumed packaging batch actions via the individual Product batch history.*

![Bottling en Tirage-batch history](https://support.innovint.us/hs-fs/hubfs/Bottling%20en%20Tirage-batch%20history.webp?width=688&height=239&name=Bottling%20en%20Tirage-batch%20history.webp)

**Q: Is the packaging cost allocated to my tirage lot?**

*A: Yes! Check out Direct Packaging costs via the lot cost tabs, and any of our standard COGS Reports in the Packaging (Direct) columns.*
