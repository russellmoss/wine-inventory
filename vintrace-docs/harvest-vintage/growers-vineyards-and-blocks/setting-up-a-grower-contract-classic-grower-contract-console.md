---
id: "32301319829268"
title: "Setting Up a Grower Contract (Classic Grower Contract Console)"
url: "https://support.vintrace.com/hc/en-us/articles/32301319829268-Setting-Up-a-Grower-Contract-Classic-Grower-Contract-Console"
category: "Harvest/Vintage"
section: "Growers, Vineyards, and Blocks"
created_at: "2024-11-20T14:47:02Z"
updated_at: "2026-05-01T18:23:41Z"
labels: []
gist: "This article relates to the classic Grower Contract Console."
tags: ["harvest", "configuration", "vineyard", "cost", "lab"]
---

# Setting Up a Grower Contract (Classic Grower Contract Console)

This article relates to the classic Grower Contract Console. For the Contracts Management module, refer to [Managing Grower Contracts (Contracts Management)](https://support.vintrace.com/hc/en-us/articles/45962805386004).

Refer to our [Managing Growers](https://support.vintrace.com/hc/en-us/articles/32301351385364) article for details on setting up a grower.

The cost of fruit coming into the winery can be tracked with or without grower contracts.

Grower contracts will automatically be assigned to fruit on delivery; the contract with the highest number of matching properties is selected.

Any contracts that have contradictory properties will not be selected. For example, if the vineyard on the fruit and a contract don't match, the contract is not considered for that delivery. Alternatively a contract can be manually assigned on booking, or delivery.

By default a contract will assign a dollar per ton cost to the fruit, this method multiplies the configured price per ton (tonne) by the fruit received. If [value ranges](#Value_Rules_Tab) are configured (e.g., brix ranges) that may increase or decrease the default price per ton (tonne).

New contracts will need to be set up each year.

To create a grower contract:

1. Click ![Sidebar - More Options 20241119.png](https://support.vintrace.com/hc/article_attachments/33731720607508) More Options in the sidebar.
2. From the Accounts tile, click Manage Grower Contracts.

![Accounts Tile - Manage Grower Contracts Link 20200415.png](https://support.vintrace.com/hc/article_attachments/33731720614036)

The Grower Contract Console displays.

3. From the New menu located in the lower left, select Contract.

The [Grower Contract window](#h_01FC6KYQMBY8JZVGV7PSC70E47) displays.

![Grower_Contract_Create_20230202.png](https://support.vintrace.com/hc/article_attachments/32328876508692)

4. Specify the details for the contract in the [Details](#Details_Tab) and [Value Rules tabs](#Value_Rules_Tab). The Details tab contains fields for providing the contract details. The Value Rules tab contains fields for setting up adjusted costs.
5. Click Save.

## Grower Contract Window

### Details Tab

- Default Price — The base price per ton/area.
- Contracted (T) — The expected tonnage of fruit for the contract.
- Expected Cost — An expected cost based off the default price and contract amount. You can use this value to compare to the actual cost of the contract at the end of harvest.
- Defer Payment — Determines whether costs are tracked by payments against the grower contract.
- No. of Installments — The number of payment installments the contract is split into.
- Payment Status — Either Complete or In Progress. When the last payment is made, the status changes to Complete. You can filter by this field in the Grower Contract Console to track contracts that aren’t complete.
- Fruit Cost Option — Select when fruit costs are realized.

Refer to our [Managing Grower Contract Payments and Fruit Costs article](https://support.vintrace.com/hc/en-us/articles/32303300639124) to learn more about making an installment on a grower contract.

### Value Rules Tab

This tab contains the metric value rules. You can set up grading categories in the Winery Setup under Setup Options > Work-Flow > Grading Scales. When this grading is applied on each fruit intake, the allocated price will be loaded against the fruit.

![Grower Contract Update - Value Rules Tab 20200416.png](https://support.vintrace.com/hc/article_attachments/33731720617364)

If deferred payments are enabled, the Value Rules Tab also displays a Metric Value Rules section where you can define metric threshold policies. For example, a brix reading between 18-22 adds a bonus cost of 10%.

### Harvest Tab

This tab shows a list of fruit intakes and bookings that use the grower contract.

![Grower Contract Update - Harvest Tab 20200416.png](https://support.vintrace.com/hc/article_attachments/33731688781204)

### Installments Tab

The Installments tab displays if the Defer Payments setting is enabled for the contract. The tab displays [installments that have been made](https://support.vintrace.com/hc/en-us/articles/32303300639124) as well as any future installments.

![Grower Contract Update - Installments Tab 20200416.png](https://support.vintrace.com/hc/article_attachments/33731720624788)

You can [make a new installment](https://support.vintrace.com/hc/en-us/articles/32303300639124) by clicking Make Installment.
