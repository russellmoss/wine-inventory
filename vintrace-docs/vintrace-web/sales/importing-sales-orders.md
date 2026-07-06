---
id: "32303305308692"
title: "Importing Sales Orders"
url: "https://support.vintrace.com/hc/en-us/articles/32303305308692-Importing-Sales-Orders"
category: "vintrace Web"
section: "Sales"
created_at: "2024-11-20T15:51:47Z"
updated_at: "2026-01-29T23:50:29Z"
labels: ["estate", "POS import", "wp-faq-10299", "Import Sales orders", "eCommerce import"]
gist: "Using data from a third-party point-of-sales (POS) or eCommerce systems, you can import sales orders into vintrace."
tags: ["dtc-sales", "migration", "exports", "integrations", "inventory", "ttb"]
---

# Importing Sales Orders

Using data from a third-party point-of-sales (POS) or eCommerce systems, you can import sales orders into vintrace. This enables you to track the sales to deplete stock and calculate wine industry-specific tax liabilities such as [WET (Australia)](https://support.vintrace.com/hc/en-us/articles/32303294708884) and [Excise (NZ)](https://support.vintrace.com/hc/en-us/articles/32303303127572).

To import sales orders:

1. [Download the import template](#Download_CSV_Template). The import template provides the column headers that vintrace expects the CSV file that you’re importing to include.
2. [Enter your sales order data into the CSV file](#Enter_Data_In_CSV).
3. [Upload the CSV file to vintrace](#Upload_CSV).

## Downloading the CSV Import Template

To download the CSV import template:

1. Click ![More_Options_20200323.png](https://support.vintrace.com/hc/article_attachments/32329026524436) More Options in the sidebar.
2. From the Sales tile, click Manage Sales Orders.
3. Click Import.
4. From the Sales Order Importer window, click Download Headers.

![Sales_Order_Importer_-_Download_Headers_Button_20200813.png](https://support.vintrace.com/hc/article_attachments/32329067325460)

5. Save the file.

## Entering Sales Orders in the CSV file

After you've downloaded the template, enter the sales order details that you want to import into vintrace in the CSV file.

Descriptions for the columns in the import template are below.

- Customer — The customer’s name. We recommend [adding a *Walk In* contact to your vintrace address book](https://support.vintrace.com/hc/en-us/articles/32301367488788) for sales where the customer couldn’t be identified.
- Sales Type — The type of sales (i.e., Wholesale, Retail, Staff, Export, Distributor, or Tasting/Own Use). If not provided, this information will be deduced based on the price list or item code.

It’s important to use a specific sales type when possible; discounted staff sales have a different WET liability.

- Price List — The name of the price list in vintrace. The price list determines the WET tax liability for staff purchases, override revenue accounts per item, and tax inclusive/exclusive rules.
- External Reference — The sales order reference used by the POS/eCommerce system. This should be unique per upload.
- Invoice Date — The invoice date should be based on the locale and in the format dd/mm/yyyy or mm/dd/yyyy.
- Region — The sales region.
- Item Code — The vintrace item code for the stock item.
- Unit Price — The price for the item. If not provided, this information will be deduced based on the price list or item code.
- Qty — The number of items.
- Discount — The discount amount as either an amount or percentage. To specify a discount amount, enter the amount without the currency symbol (e.g., 10.50). To specify a percentage, enter the percentage amount with the percent sign (e.g., 10%).
- Account — The revenue account. If not provided, this information will be deduced based on the price list or item code.
- Tax Rate — The tax rate to use. If not provided, this information will be deduced based on the price list or item code.
- Fulfilled — Indicates whether stock should be depleted within vintrace. Enter *Y* or *N*.

## Uploading the CSV File into vintrace

To upload the CSV file:

1. Click ![More_Options_20200323.png](https://support.vintrace.com/hc/article_attachments/32329026524436) More Options in the sidebar.
2. From the Sales tile, click Manage Sales Orders.
3. Click Import.

![Sales_Orders_-_Import_Button_20200813.png](https://support.vintrace.com/hc/article_attachments/32329038617876)

4. Click Upload File.

![Sales_Order_Importer_-_Upload_a_File_20200814.png](https://support.vintrace.com/hc/article_attachments/32329059265044)

5. From the Upload window, click Choose File.

![Upload_-_Choose_File_Button_20200814.png](https://support.vintrace.com/hc/article_attachments/32329067373716)

6. Select the CSV file you want to upload.
7. Click Upload.
8. From the Sales Order Importer window, click Import Sales Order.
