---
title: "How to Import Dry Goods via CSV file"
url: "https://support.innovint.us/hc/en-us/how-to-import-dry-goods"
category: "MAKE"
section: "Dry Goods"
page_type: "page"
lastmod: "2026-05-08"
gist: "The Import Packaging action allows you to create new packaging products and batches, and receive new inventory via a CSV file."
tags: ["packaging", "migration", "exports", "lot-identity", "inventory", "ux-friction"]
---

# How to Import Dry Goods via CSV file

The Import Packaging action allows you to create new packaging products and batches, and receive new inventory via a CSV file. You can create your own CSV file for importing or use the template provided [here](https://support.innovint.us/hc/en-us/templates?hsLang=en) to get you started (recommended).

This article covers:

- [Using the Import Packaging Action](#using_action)
- [Specifications for the CSV import file](#specifications)
- [Troubleshooting the import](#troubleshooting)

### Using the Import Packaging Action

1. Go to the Dry Goods Explorer page,
2. Click the carat next to **Receive Packaging** and select **Import Packaging**.
   ![How to Import Dry Goods via CSV file-import button](https://support.innovint.us/hs-fs/hubfs/How%20to%20Import%20Dry%20Goods%20via%20CSV%20file-import%20button.webp?width=582&height=191&name=How%20to%20Import%20Dry%20Goods%20via%20CSV%20file-import%20button.webp)
3. Click **Upload CSV** and choose your file to upload. Make sure the CSV file matches the required format exactly.
   ![How to Import Dry Goods via CSV file-upload csv](https://support.innovint.us/hs-fs/hubfs/How%20to%20Import%20Dry%20Goods%20via%20CSV%20file-upload%20csv.webp?width=383&height=266&name=How%20to%20Import%20Dry%20Goods%20via%20CSV%20file-upload%20csv.webp)
4. Click the green "Import Packaging" button to start the import.

### Specifications for the CSV import file

- Each line of the CSV file represents a 'Receive Packaging' action. You can create new products and batches via the import, as well as 'Receive' new inventory into an existing batch.
- Files *must* be in the same format as the example CSV provided. Columns across the top, in order, include:
  - **Date** (optional)
    Include a date to backdate the 'Receive Packaging' action(s), otherwise leave this field blank to use the current date and time. Dates must in the following format: MM/DD/YY or YYYY-MM-DD.

#### Product Details

- - **Product type**
    Product type must match the packaging product types listed in InnoVint.

    |  |
    | --- |
    | **Product types** |
    | Boxes |
    | Capsules/Foils |
    | Closures |
    | Glass/Vessels |
    | Labels |

- - **Product name**To match the 'Receive Packaging' action to an existing product, the product name in the CSV file must match the product name in InnoVint exactly. If the product name does not already exist in your account, the import will create a new product.
  - **Manufacturer** (optional)
    If a manufacturer is included on an existing product, the manufacturer name on the csv import must match.

- - **Product default vendor** (optional)
    Match a vendor to InnoVint's provided vendors list or your proprietary 'winery vendor' list. If the vendor name does not match exactly, a new 'winery vendor' will be created.

- - **Inventory unit**
    Accepted inventory units are specific to each product type.

    |  |  |
    | --- | --- |
    | **Product type** | **Inventory unit** |
    | Boxes | packs, pallets |
    | Capsules/Foils | bags, boxes, cases |
    | Closures | bags, boxes, cases |
    | Glass/Vessels | boxes, cases, pallets |
    | Labels | rolls, sheets, sleeves, stacks |

- - **Individual item**
    Accepted individual items are specific to each product type.

    |  |  |
    | --- | --- |
    | **Product type** | **Individual item** |
    | Boxes | boxes, can carriers, inserts |
    | Capsules/Foils | capsules, wire hoods |
    | Closures | bidules, can ends, corks, crown caps, glass closures, screw caps |
    | Glass/Vessels | bottles, cans, growlers, kegs, pouches |
    | Labels | labels, stickers |

- - **Default number of items per inventory unit**

- - **Product tag(s)** (optional)
    To match a product tag to an existing tag in your account, the text must match exactly. If the tag does not already exist, the import will create a new tag. Use a comma to separate multiple tags.
  - **Owner(s)** (if Custom Crush Permissions are activated)
    Owners must match existing owner tags in your InnoVint account. If an owner is not included in the CSV file, the product will be created with *'No owner'*. Use a comma to separate multiple owners.

    Note: *'Global'* ownership cannot be applied to dry goods inventory via the import. To set *'Global'* ownership on a product, we recommend importing with no owner and manually updating the owner tag from the product details page.

#### Batch Details

- - **Batch default vendor** (optional)
    Match a vendor to InnoVint's provided vendors list or your proprietary 'winery vendor' list. If the vendor name does not match exactly, a new 'winery vendor' will be created.
  - **Mfg batch ID**If unknown or not applicable, then match to batch name

- - **Batch name**
    To import into an existing batch, the batch name in the CSV file must match the batch name in InnoVint exactly. If the batch name does not already exist in your account, the import will create a new batch.
  - **Batch tag(s)** (optional)
    To match a batch tag to an existing tag in your account, the text must match exactly. If the tag does not already exist, the import will create a new tag. Use a comma to separate multiple tags.

#### Receive Packaging Details

- - **Inventory units received**
    Positive numbers only.

- - **Individual items per inventory unit**
    Positive integers (ie whole numbers) only. This number does not need to be the same as the default number of items per inventory unit. InnoVint will use this number to calculate the total items received.
  - **Total cost ($)** (optional, if Cost Tracking activated)
    Positive numbers only. Do not include the currency unit.
  - **Receive Packaging vendor** (optional)
    Match a vendor to InnoVint's provided vendors list or your proprietary 'winery vendor' list. If the vendor name does not match exactly, a new 'winery vendor' will be created.
  - **PO number** (optional)
  - **Purchase date** (optional)
    Dates must in the following format: MM/DD/YYYY or YYYY-MM-DD.
  - **Carrier** (optional)
  - **Driver** (optional)

### FAQs

**Q. I can't get my file to upload! What should I try?**

*A. Please be sure to double check the following items:*

- *If importing into existing products and/or batches, make sure all details in the CSV file match your existing inventory.*
- *Be sure you are uploading a .csv file*

**Q. Can I upload a .txt or .xls file instead?**

*A. Currently, we do not accept .txt or .xls files.*

**Q. I'm getting this error message:**

***![How to Import Dry Goods via CSV file-error](https://support.innovint.us/hs-fs/hubfs/How%20to%20Import%20Dry%20Goods%20via%20CSV%20file-error.webp?width=313&height=133&name=How%20to%20Import%20Dry%20Goods%20via%20CSV%20file-error.webp)***

*A. You likely have a typo for an 'exact match' field, or you are missing required details. Check the list of errors provided on the screen to troubleshoot any issues.*

**Q. I noticed a mistake on one of my 'Receive Packaging' actions after importing. Can I edit or delete the action or inventory item?**

*A. You can manually edit any imported product or batch (eg name, vendor, tags, etc.), as well as imported 'Receive' actions, including adding or adjusting costs or received units. You can also delete products, batches and 'Receive' actions individually.*
