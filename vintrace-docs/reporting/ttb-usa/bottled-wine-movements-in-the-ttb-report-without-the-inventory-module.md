---
id: "32303269141780"
title: "Bottled Wine Movements in the TTB Report without the Inventory Module"
url: "https://support.vintrace.com/hc/en-us/articles/32303269141780-Bottled-Wine-Movements-in-the-TTB-Report-without-the-Inventory-Module"
category: "Reporting"
section: "TTB (USA)"
created_at: "2024-11-20T15:51:15Z"
updated_at: "2024-11-21T10:16:52Z"
labels: ["estate", "wp-faq-3412", "702", "ttb"]
gist: "Users without the Inventory module can view bottled wine movements in the TTB Report."
tags: ["ttb", "reporting", "inventory", "packaging", "bond", "tax-class"]
---

# Bottled Wine Movements in the TTB Report without the Inventory Module

Users without the Inventory module can view bottled wine movements in the TTB Report. In order for bottled movements to display in Section B - Bottled Wine of the TTB Report, you’ll need to select a bottling dispatch type when you do a dispatch.

![Bulk_Dispath_-_Dispatch_Type_20210128.png](https://support.vintrace.com/hc/article_attachments/32328979120788)

The dispatch type you select determines where the movement shows up in the 5120.17.

|  |  |
| --- | --- |
| **DISPATCH TYPE** | **WHERE MOVEMENTS DISPLAY IN 5120.17** |
| Bottling | Section B, row 19 (Inventory Shortage) |
| Removed Taxpaid | Section B, row 8 (Removed Taxpaid) |
| Transferred in Bond | Section B, row 9 (Transferred in Bond) |

Vintrace writes bottled gallons to Section A, row 13 AND Section B, row 2, for that period only. A begin and end (Section B, row 1) aren’t tracked so you’ll still need to manually complete Section B, including any transfers.
