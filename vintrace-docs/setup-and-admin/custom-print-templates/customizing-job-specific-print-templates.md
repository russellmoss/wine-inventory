---
id: "32303308638740"
title: "Customizing Job-Specific Print Templates"
url: "https://support.vintrace.com/hc/en-us/articles/32303308638740-Customizing-Job-Specific-Print-Templates"
category: "Setup and Admin"
section: "Custom Print Templates"
created_at: "2024-11-20T15:52:26Z"
updated_at: "2025-09-08T07:26:45Z"
labels: ["estate", "oldui", "wp-page-8180"]
gist: "If you’re interested in customizing your work order’s print template, you’ll need to customize the job-specific print templates that it uses using Microsoft Word."
tags: ["configuration", "exports", "work-orders", "transfers", "additives", "blending"]
---

# Customizing Job-Specific Print Templates

If you’re interested in customizing your work order’s print template, you’ll need to customize the job-specific print templates that it uses using Microsoft Word.

BEFORE YOU BEGIN: You may want to [download the default print templates](https://support.vintrace.com/hc/en-us/articles/32301356341396) for the different job types from vintrace. Although you could create a print template from scratch, we recommend that you download the default print template from vintrace and edit it as needed. This approach is particularly helpful if you only want to make minor adjustments to the default templates.

To customize a job-specific print template:

1. Open the DOCX file.
2. Place your cursor where you want to add a tag.
3. Enter the tag by either copying and pasting it from our [Print Template Tags article](https://support.vintrace.com/hc/en-us/articles/32303349626004), or manually typing it in.

The tags that are available for the following templates are detailed in our [Print Template Tags article](https://support.vintrace.com/hc/en-us/articles/32303349626004).

|  |  |
| --- | --- |
| - Additive - Analysis - Barrel treatment - Break and top - Bulk wine intake - Change batch - Equipment treatment - Extraction - Footer - General task - Header - Intake Delivery - Measurement - Multi additions | - Multi transfer - Multi transfer (multi to one) - Multi topping - New bulk dispatch - New packaging run - Press cycle - Product treatment - Rack and return - Riddling - Tasting note - Tirage - Tirage admin - Transfer rack blend - Trial blend |

Users with a multi-winery license can specify which print templates are available at each winery. Refer to our [Configuration for Multi-Winery Support article](https://support.vintrace.com/hc/en-us/articles/32301304791316-Configuration-for-Multi-Winery-Support) for details.

## Helpful Tips

Below are some tips to keep in mind when you're editing the print templates.

- Be sure that each tag that you add to the template is enclosed within the double curly braces (i.e., {{ or }})

![Curly_Braces_20201118.png](https://support.vintrace.com/hc/article_attachments/32329124022548)

- The contents of the template must be enclosed within the {{TableStart:info}} and {{TableEnd:info}} tags.

![TableStart_info_and_TableEnd_Info_20201118.png](https://support.vintrace.com/hc/article_attachments/32329098488596)

- If you want to apply any formatting (e.g., bold, italics, etc.), be sure to apply the formatting to the tag.

## Mini Templates

Mini templates provide a way to include information that may be relevant to multiple jobs. For example, the Additions mini template inserts a table with the additive, rate of add, add amount, and addition notes. This mini template can be included in the templates for different jobs such as multi additions, multi topping, multi transfer, and rack and return.

![Additions_Mini_Template_-_MS_Word_20201112.png](https://support.vintrace.com/hc/article_attachments/32329124015636)

You can include the Additions mini template in other templates by including the appropriate tag. For example, to include the additions table for the destination vessels in a multi transfer template, you’d need to add the {{VesselDetails}} and {{AdditionsList}} tags.

![MultiTransfer_Template_-_VesselDetails_and_AdditionsList_20201118.png](https://support.vintrace.com/hc/article_attachments/32329089830676)

Below is an example of a generated work order for a multi transfer. By including the {{VesselDetails}} tag, the work order displays the two destination vessels for the transfer: a tank and a barrel group. The vessel details included for the tank displays the dip measurement table. The vessel details included for the barrel group displays the barrels list. Because the template also included the {{AdditionsList}} tag, the additions for each vessel are also displayed.

![Custom_print_template_4.png](https://support.vintrace.com/hc/article_attachments/32329112600852)

The tags that are available for the following mini templates are detailed in our [Print Template Tags article](https://support.vintrace.com/hc/en-us/articles/32303349626004).

- Additions
- Analysis details
- Barrels addition
- Barrels list
- Bin details
- Dip measurements
- Simple tanker details
- Tanker details
- Transfer additions
- Transfer to tank

## Lists in a Print Template

Several of the job-specific templates include a tag that enables you to include a list of items. For example, the multi additions template has a tag for including a wine list.

If you want to add a tag that inserts a list into your print template, be sure to enclose the content and tags that you want to display for each list item with {{TableStart:<listName>}} and {{TableEnd:<listName>}}.

In the following example, the {{TableStart:wineList}} and {{TableEnd:wineList}} tags surround a table that displays information about the vessel, batch code, treatment, and product state.

![wineList_20201118.png](https://support.vintrace.com/hc/article_attachments/32329112588180)

When this print template is used, the table that displays information about the vessel, batch code, treatment, and product state will be repeated for each entry in the wine list. In the example below, the table is repeated for the two vessels in the multi additions list.

![Multi_Additions_Work_Order_20201118.png](https://support.vintrace.com/hc/article_attachments/32329098614548)

In the example below, the opening and closing tags are in the same row of a table. This example uses the bomItems tag to include a list of the Bill of Materials in a packaging template.

![TableStart_bomItems_and_TableEnd_bomItems_20201118.png](https://support.vintrace.com/hc/article_attachments/32329112614804)

The bill of materials for each stock item in the packaging operation displays in a single row.

![Transfer_Work_Order_-_BOM_20201118.png](https://support.vintrace.com/hc/article_attachments/32329089810964)
