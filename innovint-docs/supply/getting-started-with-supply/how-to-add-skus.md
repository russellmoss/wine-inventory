---
title: "How to Add SKUs"
url: "https://support.innovint.us/hc/en-us/how-to-add-skus"
category: "SUPPLY"
section: "Getting Started with SUPPLY"
page_type: "page"
lastmod: "2026-03-23"
gist: "SUPPLY is the source of truth for your case goods inventory."
tags: ["packaging", "integrations", "getting-started", "ux-friction", "inventory", "tax-class"]
---

# How to Add SKUs

SUPPLY is the source of truth for your case goods inventory.  In SUPPLY, the SKU represents the specific wine, format and grouping being tracked (e.g., 750ml bottle, 12-bottle case) across inventory locations. This article details:

- [How to Add a SKU](#how-to-add-a-sku)
- [Video Tutorial](#video)
- [New SKU Attributes](#sku-attributes)
- [FAQ](#faq)

### How to Add a SKU

1. From the SKU Explorer, click on **+ Add SKU** in the top right corner. ![Add SKU_SKU Explorer_Annotated](https://support.innovint.us/hs-fs/hubfs/Add%20SKU_SKU%20Explorer_Annotated.jpg?width=670&height=378&name=Add%20SKU_SKU%20Explorer_Annotated.jpg)
2. This opens the “Add SKU” window. Enter all SKU attributes. Required attributes include SKU code, color, style, format, grouping, tax class and stage. If you are a Commerce7 user and you’d like to link the SKU to a C7 product, check the C7 Product checkbox. We recommend that a unique SKU is created for each format (variant) that may exist in C7. Find out more about the Commerce7 integration [here](https://support.innovint.us/hc/en-us/supply-commerce7-integration?hsLang=en).
   ![How to Add SKUs_Add SKU](https://support.innovint.us/hs-fs/hubfs/Knowledge%20Base%20Import/How%20to%20Add%20SKUs_Add%20SKU.png?width=338&height=444&name=How%20to%20Add%20SKUs_Add%20SKU.png)
3. Click the **Add SKU** button in the bottom right corner to generate the SKU.

### Video Tutorial

### New SKU Attributes

When creating a new SKU, you will need to set all the attributes linked to your SKU, including the new SKU code.

- **SKU Code (Required)**: Enter a SKU code. The SKU code is the alphanumeric code (eg SB24MBV1A75012) and must be unique, meaning it cannot already be used for another SKU. The SKU code can contain numbers, letters, dashes and underscores. The system will not accept character accents such as ü in Gewürztraminer or ã in Tinto Cão. SKU codes have a character limit of 50. The code can be edited after SKU creation.
- **SKU Name** (optional): Enter a SKU name. The SKU name is text that makes it visibly easy to identify SKUs (eg 2024 Mockingbird Vista Sauvignon Blanc). SKU names do not need to be unique and have a character limit of 250. If no SKU name is entered, *No name* will display in the SKU Explorer and on the SKU details page. The name can be edited after SKU creation.
- **Color (Required)**: Select a SKU color from the list. This can be edited after creation.
- **Style (Required)**: Select a wine style using the radio buttons - still or sparkling. You may edit the style after SKU creation.
- **Format (Required)**: Select a bottle format for the SKU from the list. This cannot be edited after SKU creation.
- **Grouping (Required)**: Select a grouping for the SKU. The grouping describes the packaging of the selected format, and includes the number of individual units that are contained in a SKU item, such as a 3-pack, a 6-pack or a case (a "case" always contains 12 bottles). The Grouping name selected determines the number of bottles or cans per group, and it cannot be edited after SKU creation.
  ![How to add a SKU_Grouping](https://support.innovint.us/hs-fs/hubfs/How%20to%20add%20a%20SKU_Grouping.png?width=273&height=390&name=How%20to%20add%20a%20SKU_Grouping.png)   ![How to add a SKU_SKU modal](https://support.innovint.us/hs-fs/hubfs/How%20to%20add%20a%20SKU_SKU%20modal.png?width=297&height=390&name=How%20to%20add%20a%20SKU_SKU%20modal.png)
- **Tax Class (Required)**: Select a tax class from the list. You may not edit the tax class after creating the SKU.
- **Stage (Required)**: Select a stage from the list. Stages are helpful to generally classify where SKUs are in their lifecycle. You can filter by stage in the SKU Explorer and SKU Picker. You may edit the stage after creating the SKU.
  - *Stages have no bearing on compliance reports. Available stages include: Pre-bottling, Pre-release, Shiner, Labeled, en Tirage, Aging, Ready for Release, Released and Library.*
- **C7 Product (optional)**: Check the box to link the SKU to a product in Commerce 7. Learn more about the C7 integration [here](https://support.innovint.us/hc/en-us/supply-commerce7-integration?hsLang=en).

### FAQ

**Q: Ooops!  Can I edit my SKU after it is created?**

*A: You may edit some SKU attributes after creation, including the SKU code, SKU name, color and style, and Commerce7 product.  You may not edit the format or grouping, or the tax class.*

*To edit the SKU properties, go to your SKU details page, and use the "More" menu at the top righthand corner.*

*![How to add a SKU_Edit](https://support.innovint.us/hs-fs/hubfs/How%20to%20add%20a%20SKU_Edit.png?width=297&height=301&name=How%20to%20add%20a%20SKU_Edit.png)*

*To edit the Commerce7 Product, go to your [SKU details page](https://support.innovint.us/hc/en-us/sku-details-page?hsLang=en), and use the "More" menu at the top righthand corner. Select "Edit C7 product."*

*To edit the SKU Stage - go directly to the Attributes tile in the SKU details page and click on the blue pencil.*

**Q: I added my SKU but how do I update the number of cases I have?**

*A: If you are onboarding current case goods inventory to bring SUPPLY up to date - use the "Onboard Inventory" action. This will populate the line "On hand at beginning of period" for in-bond products on the TTB export. Learn more about this action [**here**](https://support.innovint.us/hc/en-us/how-to-onboard-inventory-in-supply?hsLang=en).*

*If you are adding inventory to SUPPLY via a bond transfer or bottling - be sure to use the "Add Inventory" action which will allow you to specify the desired reason for adding the inventory, and properly [populate the TTB export.](https://support.innovint.us/hc/en-us/how-does-supply-populate-the-ttb-report?hsLang=en)  Learn more about this action [**here**](https://support.innovint.us/hc/en-us/how-to-add-inventory?hsLang=en).*

**Q: Can I delete or archive a SKU?**

*A: Find out how to archive or delete a SKU [here](/hc/en-us/how-to-archive-or-delete-skus?hsLang=en)!*
