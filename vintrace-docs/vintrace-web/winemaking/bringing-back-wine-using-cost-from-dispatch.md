---
id: "32301312556820"
title: "Bringing Back Wine Using Cost from Dispatch"
url: "https://support.vintrace.com/hc/en-us/articles/32301312556820-Bringing-Back-Wine-Using-Cost-from-Dispatch"
category: "vintrace Web"
section: "Winemaking"
created_at: "2024-11-20T14:46:24Z"
updated_at: "2025-01-15T19:44:08Z"
labels: []
gist: "This functionality is available starting with vintrace 9.4.2, but not enabled by default."
tags: ["cost", "inventory", "additives", "packaging"]
---

# Bringing Back Wine Using Cost from Dispatch

This functionality is available starting with [vintrace 9.4.2](https://support.vintrace.com/hc/en-us/articles/32303276924308), but not enabled by default. If you would like to use this functionality, please contact our support team.

A dispatched wine or product’s costs (with the exception of the labs and additives costs) can be copied during a bulk intake. This might be useful in situations where your winery dispatches wine for bottling, but brings the bottled wine back and dumps it to bulk.

To do this, you’ll need to record either a Bulk Dispatch or Bulk Dispatch (Inter-Winery) operation. To copy the cost of a dispatched wine or product:

1. From the Bulk Intake window (General tab, Delivery Details sub-tab), click Search Records.

![Bulk Intake - Search Records Button 20230905.png](https://support.vintrace.com/hc/article_attachments/32328544582036)

2. From the Search For window:

- Select Dispatch.
- Enter the BOL number.

![Search For 20230905.png](https://support.vintrace.com/hc/article_attachments/32328561286036)

- Click Search.

3. To copy the costs, select the Include Cost at Dispatch checkbox.

![Bulk Intake - Include Cost at Dispatch Checkbox 20230905.png](https://support.vintrace.com/hc/article_attachments/32328570074516)

In addition to the costs, the selected wine or product’s information will be used to populate the fields in the Wine Details, Composition, and Costing & Labs tabs.

4. To edit individual costs, select the Costing & Labs tab.
5. Click Edit in the Cost Details

![Bulk Intake - Costing Labs - Edit Button 20230905.png](https://support.vintrace.com/hc/article_attachments/32328570090004)

6. Specify the cost in the Add/Edit Bulk Wine Costs window.

![Add Edit Bulk Wine Costs 20230905.png](https://support.vintrace.com/hc/article_attachments/32328561334548)

- The bulk wine cost of the bulk intake will equal the bulk wine cost specified in the Add/Edit Bulk Wine Costs window.
- The freight costs of the bulk intake will be the combined total of the freight cost specified in the Add/Edit Bulk Wine Costs window and the historical costs specified in the Costing & Labs tab.
- The specified costs will be included in the Bulk Stock Receipt Report.

7. Click Save.
