---
id: "32301265307284"
title: "Exporting and Importing Allocated Products"
url: "https://support.vintrace.com/hc/en-us/articles/32301265307284-Exporting-and-Importing-Allocated-Products"
category: "vintrace Web"
section: "Finished Goods Allocations"
created_at: "2024-11-20T14:46:05Z"
updated_at: "2025-04-08T18:40:41Z"
labels: []
gist: "In order to export and import allocated products, you will need the Can Add/Edit Allocation Products permission."
tags: ["exports", "migration", "permissions", "packaging", "configuration"]
---

# Exporting and Importing Allocated Products

In order to export and import allocated products, you will need the [Can Add/Edit Allocation Products permission](https://support.vintrace.com/hc/en-us/articles/360000813755-Roles-and-Permissions#Permissions). You will also need the [Import/Export Setup Data permission](https://support.vintrace.com/hc/en-us/articles/360000813755-Roles-and-Permissions#Permissions) or the [Local vintrace Administrator permission](https://support.vintrace.com/hc/en-us/articles/360000813755-Roles-and-Permissions#Permissions).

When you [export allocated products to a CSV](#exporting) from vintrace, you can make changes to the file to add or update products. You can then [import the CSV file](#importing) into vintrace to update existing allocated products or create new ones.

## Exporting Allocated Products from vintrace

To export allocated products from vintrace:

1. Click ![Products Icon 20200715.png](https://support.vintrace.com/hc/article_attachments/32329196754836) products in the sidebar. The [Product Allocations page](https://support.vintrace.com/hc/en-us/articles/32301319185940) displays.
2. Click the ![Plus in Green Circle 20200319.png](https://support.vintrace.com/hc/article_attachments/32329196744852) add icon.
3. Select Import or Export Products.

![Import or Export Products 20240430.png](https://support.vintrace.com/hc/article_attachments/32329205313940)

The Product Importer window displays.

4. Click Export Product Records.

![Product Importer - Export Button 20240430.png](https://support.vintrace.com/hc/article_attachments/32329196831764)

5. Specify the location where you would like to save the CSV file.

## Importing Allocated Products

After editing the [CSV file that you exported](#exporting) to reflect changes to your allocated products or include new allocated products, you can import the file into vintrace.

Allocated products from the CSV that do not exist in vintrace will be created. If an allocated product already exists in vintrace, the import will update the product’s demand.

To import your allocated products into vintrace:

1. Click ![Products Icon 20200715.png](https://support.vintrace.com/hc/article_attachments/32329196754836) products in the sidebar. The [Product Allocations page](https://support.vintrace.com/hc/en-us/articles/32301319185940) displays.
2. Click the ![Plus in Green Circle 20200319.png](https://support.vintrace.com/hc/article_attachments/32329196744852) add icon.
3. Select Import or Export Products. The Product Importer window displays.
4. Click Upload a File.

![Product Importer - Upload a File 20240430.png](https://support.vintrace.com/hc/article_attachments/32329225819924)

5. Click Choose File.
6. Select the CSV file you would like to import.
7. If your CSV file is updating existing products, be sure to select the Update Existing Records checkbox.
8. Click Import Product.
9. Review and confirm that the columns from the CSV file are mapped to the correct field in vintrace.

![Product Importer - Column Matching 20240430.png](https://support.vintrace.com/hc/article_attachments/32329225788692)

10. Click Continue.
