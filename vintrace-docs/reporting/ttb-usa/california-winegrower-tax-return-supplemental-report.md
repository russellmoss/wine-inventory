---
id: "32301282187156"
title: "California Winegrower Tax Return (Supplemental Report)"
url: "https://support.vintrace.com/hc/en-us/articles/32301282187156-California-Winegrower-Tax-Return-Supplemental-Report"
category: "Reporting"
section: "TTB (USA)"
created_at: "2024-11-20T14:46:34Z"
updated_at: "2025-02-21T03:09:31Z"
labels: []
gist: "This article is specifically for U.S. customers in California."
tags: ["reporting", "compliance", "ttb", "configuration", "bond", "tax-class"]
---

# California Winegrower Tax Return (Supplemental Report)

This article is specifically for U.S. customers in California.

This report provides data that can be used by California wineries in the U.S. to submit the Winegrower Tax Return. It includes information for bonded and taxpaid bulk wines.

The [Bulk Intake](https://support.vintrace.com/hc/en-us/articles/32303303281428) or Import Product operations with a *Taxpaid* Tax State will be able to specify a tax class.

## Running the Winegrower Tax Return Report

To run the Winegrower Tax Return report:

1. Click ![Reports_Menu_Option_20200406.png](https://support.vintrace.com/hc/article_attachments/32328591891476) Reports in the sidebar.
2. Select Government Reports.
3. Specify the filters and options for the report.

You can click Launch Tax History to Compare to compare your tax report values with the operations they came from. This enables you to correct any irregularities you might find so that you can produce an accurate TTB report for submission.

4. Click Generate or Email.

To generate the report with the expected data, you’ll need to set up the winery addresses and organisations that wine is received from or shipped to with the physical address.

## Setting up Winery Address Details

1. Click ![Setup](https://support.vintrace.com/hc/article_attachments/34975746800532) Set Up in the sidebar.
2. Click Locations, or search for *Winery*.
3. From the Winery tile, click Configure.
4. Select the Winery. The Winery window displays.

![Winery Window 20250220.jpg](https://support.vintrace.com/hc/article_attachments/34975746802708)

5. Select the Bond tab.
6. Specify the registered address details.

![Winery Window Bond Address 20250220.jpg](https://support.vintrace.com/hc/article_attachments/34975786385044)

7. Click Add.
8. Click Save.

## Setting up Organisation Address Details

1. Click ![More_Options_20200323.png](https://support.vintrace.com/hc/article_attachments/34975786386964) More Options in the sidebar.
2. From the Address Book tile, click Open Address Book.
3. Filter the Type (Organisation) by the type of organisation you want to edit.

![Address Book Organization Type 20250220.jpg](https://support.vintrace.com/hc/article_attachments/34975786389140)

4. Click Advanced for the Organisation.
5. Select the Addresses tab.
6. Specify the physical address details.

![Address Book Addresses Tab 20250220.jpg](https://support.vintrace.com/hc/article_attachments/34975786390676)

7. Click Add.
8. Click Save.

## Report Transaction Details

Wines must be bulk received into a California winery and bulk dispatched from a California winery.

| Report Transactions | Description |
| --- | --- |
| Removed from Internal Revenue Bond on payment of tax | Includes the total volume of wine that has been [bulk dispatched](https://support.vintrace.com/hc/en-us/articles/32303327348116) out to any destination.  The [Dispatch Type](https://support.vintrace.com/hc/en-us/articles/32301281828500) selected must be linked to Removed taxpaid (bulk) for Section A. |
| Imported into California | Includes the total volume of Bonded and Taxpaid wine that has been [bulk received](https://support.vintrace.com/hc/en-us/articles/32303303281428) into California from a destination outside California and the U.S.  The Received From field on the [Bulk Intake](https://support.vintrace.com/hc/en-us/articles/32303303281428) operation must be entered.  The Tax Class field must be entered for Taxpaid wines. |
| Federal tax-paid wine exported outside of California | Includes the total volume of wine that has been [bulk dispatched](https://support.vintrace.com/hc/en-us/articles/32303327348116) out to a destination outside of California and the U.S.  The [Dispatch Type](https://support.vintrace.com/hc/en-us/articles/32301281828500) selected must be linked to Removed taxpaid (bulk) for Section A. |
| Imported in or bulk transfers to U.S. Internal Revenue Bond | Includes the total volume of Bonded wine that has been [bulk received](https://support.vintrace.com/hc/en-us/articles/32303303281428) into California from a destination outside California and the U.S.  The Received From field on the [Bulk Intake](https://support.vintrace.com/hc/en-us/articles/32303303281428) operation must be entered. |
| Transferred to other wine cellars within California | Includes the total volume of wine that has been dispatched out to a destination within California for the following operations: - [Bulk dispatch](https://support.vintrace.com/hc/en-us/articles/32303327348116) - [Bulk dispatch (inter-winery)](https://support.vintrace.com/hc/en-us/articles/32301313513620)  The [Dispatch Type](https://support.vintrace.com/hc/en-us/articles/32301281828500) selected must be linked to Transfers in bond for Section A. |
| Transferred to other wine cellars outside California | Includes the total volume of wine that has been dispatched out to a destination outside California and only within the U.S. for the following operations: - [Bulk dispatch](https://support.vintrace.com/hc/en-us/articles/32303327348116) - [Bulk dispatch (inter-winery)](https://support.vintrace.com/hc/en-us/articles/32301313513620)  The [Dispatch Type](https://support.vintrace.com/hc/en-us/articles/32301281828500) selected must be linked to Transfers in bond for Section A. |
| In bond wine exported outside the U.S. | Includes the total volume of wine that has been [bulk dispatched](https://support.vintrace.com/hc/en-us/articles/32303327348116) out to a destination outside of the U.S.  The [Dispatch Type](https://support.vintrace.com/hc/en-us/articles/32301281828500) selected must be linked to Removed for export (bulk) for Section A. |
| Inventory on hand at the end of the reporting period | This is the total Bonded wine on hand per tax class groupings/columns at the end of the reporting period. |
