---
id: "32303348279956"
title: "Importing Client Billing Invoices into Xero"
url: "https://support.vintrace.com/hc/en-us/articles/32303348279956-Importing-Client-Billing-Invoices-into-Xero"
category: "Setup and Admin"
section: "Integrations: Accounting"
created_at: "2024-11-20T15:52:20Z"
updated_at: "2024-11-21T10:29:34Z"
labels: ["estate", "wp-page-767"]
gist: "You can import a CSV file into Xero with your invoice details."
tags: ["integrations", "migration", "configuration", "exports", "harvest"]
---

# Importing Client Billing Invoices into Xero

You can import a CSV file into Xero with your invoice details. Before you can do this, you’ll need to [set up vintrace](#h_01ERZ182B379GV6995AEMEQSDC) so that it can export the necessary invoice information for Xero. Once this set up is completed, you’ll be able to [export the invoices from vintrace to a CSV file](#h_01ERZ18CFEKN7H7Q31NQG7HSE3), the [import that file into Xero](#h_01ERZ18MYPZSA93VG7YDEWEKQC).

## Setting Up vintrace for Xero Export of Invoices

There are a few steps you’ll need to take to ensure that invoices generated in vintrace can be successfully imported into Xero.

Contact your accountant if you’re unsure of the value that you should specify for the following.

- Ensure each [billing item’s Linked Item ID field](https://support.vintrace.com/hc/en-us/articles/32303340023316) matches the number in the Xero Account Code. For example, if you want a billable item to impact the *200 - Contract Services* account in Xero, then you’d set the item’s Linked Item Id to *200*.
- Specify each billing item’s External Tax Code. This should match the Tax Type in Xero.

![Billing_Item_-_Xero_Integration_20201202.png](https://support.vintrace.com/hc/article_attachments/32329136464148)

- In order to prevent redundant entries, we recommend that the customer names [set up in your vintrace address book](https://support.vintrace.com/hc/en-us/articles/32301367488788) match the customers configured in Xero.

## Exporting Invoices from vintrace

Xero requires that the CSV file include a Due Date. When you export invoices from vintrace, its default is 30 days from the date the invoice was created in vintrace. If you would like to change the default number of days, contact vintrace Support.

To export an invoice for a single order, refer to our [Managing Custom Crush Charges article](https://support.vintrace.com/hc/en-us/articles/32303324686612).

To export multiple invoices:

1. Click ![More_Options_20200323.png](https://support.vintrace.com/hc/article_attachments/32329107706772) More Options in the sidebar.
2. From the Client Billing tile, click Invoice Management.
3. Filter the invoices displayed in the [Client Billing Invoices window](https://support.vintrace.com/hc/en-us/articles/32303339169300).
4. Click the ![Download_20200323.png](https://support.vintrace.com/hc/article_attachments/32329097564948) Download icon.
5. Select Xero CSV.

![Client_Billing_Invoices_-_Download_-_Xero_CSV_20201207.png](https://support.vintrace.com/hc/article_attachments/32329136494228)

6. Select whether you want to download all invoices that meet your filters, or invoices on the current page.
7. Save the file to your computer.

## Importing Invoices into Xero

After you export the invoices from vintrace, you can import the CSV file into Xero.

A few notes about Xero’s import process:

- Xero’s CSV import doesn’t automatically match inventory items that are configured in both Xero and vintrace. This is a Xero limitation and they suggest manually selecting the inventory items when you review the invoice when it’s initially imported in a Draft state.
- The vintrace item’s code is recorded as the line item’s Description when you import invoices into Xero.
- The imported invoices will have a Draft status and will be ready for review and approval.
  Refer to [Xero’s guide to importing customer invoices](https://central.xero.com/s/article/Import-customer-invoices-AU) for additional details.

To import the CSV file of your invoices into Xero:

1. Click Import.

[![import_xero](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2016/05/import_xero.jpg)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2016/05/import_xero.jpg)

2. Ensure that the Xero option is selected.
3. Click Browse to select the CSV file that you exported from vintrace.

![](https://support.winery-software.com/hc/en-us/article_attachments/360001836716/be42368acd2500270157b09b57c6151c4e91bb683e2b72367713cedfa40519d9.png)

4. Click Import. Xero checks the file for any problems. This is useful as it prevents you from accidentally importing the same invoices multiple times. If any problems are found, they’ll be reported to you.

![](https://support.winery-software.com/hc/en-us/article_attachments/360001836736/d2a3526209b8e2abdc289649a83043fbb232118db54b8aa79677095877844be3.png)

5. Click Complete Import.
