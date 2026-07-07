---
id: "32303278405012"
title: "Can I save the column mapping for a sales order import?"
url: "https://support.vintrace.com/hc/en-us/articles/32303278405012-Can-I-save-the-column-mapping-for-a-sales-order-import"
category: "FAQ"
section: "Common Questions"
created_at: "2024-11-20T15:51:04Z"
updated_at: "2024-11-21T10:17:01Z"
labels: ["estate", "oldui", "Column mapping for importers", "Save column mapping", "remembering column mapping"]
gist: "vintrace lets you import data from third-party point-of-sales or eCommerce systems."
tags: ["dtc-sales", "migration", "ux-friction", "integrations", "exports"]
---

# Can I save the column mapping for a sales order import?

vintrace lets you import data from third-party point-of-sales or eCommerce systems. Sometimes, the third-party system’s column names differ from those used in vintrace. When this happens, you’ll need to map the columns. Mapping tells vintrace how to import the data when the source’s column name differs from the vintrace’s column name. For example, the source may have a column named Sales Area that corresponds to vintrace’s Sales Region column.

Instead of mapping the columns each time you import data from the source, you can save the column mappings so that it can be re-used.

To save a sales order column mapping:

1. Click ![More_Options_20200323.png](https://support.vintrace.com/hc/article_attachments/32329225437716) More Options in the sidebar.
2. From the Sales tile, click Manage Sales Orders.
3. Click Import.

![Sales_Orders_-_Import_Button_20200813.png](https://support.vintrace.com/hc/article_attachments/32329252916628)

4. Click Upload File.

![Sales_Order_Importer_-_Upload_a_File_20200814.png](https://support.vintrace.com/hc/article_attachments/32329252949524)

5. From the Upload window, click Choose File.
6. Select the CSV file you want to upload.
7. Click Upload.
8. From the Sales Order Importer window, click Import Sales Order.

![Sales_Order_Importer_-_Import_Sales_Order_Button_20211102.png](https://support.vintrace.com/hc/article_attachments/32329252933908)

The Column Matching screen displays. When no value is selected from the Mapped to vintrace Field list, it indicates that the third-party system’s column names don’t match vintrace’s column names.

![Sales_Order_Importer_-_Column_Matching_-_Blanks_20211102.png](https://support.vintrace.com/hc/article_attachments/32329259076500)

9. From the Mapped to vintrace Field list, select the column that you’d like to map the data to. Be sure to do this for each column that isn’t mapped.

![Sales_Order_Importer_-_Column_Matching_-_Mapped_20211102.png](https://support.vintrace.com/hc/article_attachments/32329244663060)

10. Click Continue. A window displays asking if you want to save the column mapping.

![Sales_Order_Importer_-_Save_Column_Mapping_20211102.png](https://support.vintrace.com/hc/article_attachments/32329232064020)

11. To save the column mapping, enter a name for the mapping, then click Save. Otherwise, click Ignore.

The next time you import sales order data from the third-party system, you can select the saved column mapping.

![Sales_Order_Importer_-_Select_Saved_Mapping_20211102.png](https://support.vintrace.com/hc/article_attachments/32329277956628)
