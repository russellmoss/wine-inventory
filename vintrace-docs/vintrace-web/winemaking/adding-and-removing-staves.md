---
id: "32301317775252"
title: "Adding and Removing Staves"
url: "https://support.vintrace.com/hc/en-us/articles/32301317775252-Adding-and-Removing-Staves"
category: "vintrace Web"
section: "Winemaking"
created_at: "2024-11-20T14:46:33Z"
updated_at: "2025-01-15T19:32:11Z"
labels: []
gist: "This functionality will be available to all accounts starting with vintrace 9.6.1b01."
tags: ["cost", "lot-identity", "work-orders", "configuration", "packaging"]
---

# Adding and Removing Staves

This functionality will be available to all accounts starting with vintrace [9.6.1b01](https://support.vintrace.com/hc/en-us/articles/32303261607828).

You can set up an [equipment treatment](https://support.vintrace.com/hc/en-us/articles/32301313669524) to add and remove staves from your tanks. When you [create a work order](#h_01GHBX92WKSK1ENJ8ZAD6C12VQ), you'll be able to select the equipment treatment so that your tank's accurately reflect whether they contain staves.

The first batch that the staves were applied covers the cost of the staves. If staves are added to a tank already containing a batch, the cost of the staves are applied to that batch. If staves are added to an empty tank, the costs of the staves are applied to the first batch that's transferred into the tank.

In either case, when the batch is removed from the tank, the staves remain in the tank. Although the staves will be added to any batch that is subsequently transferred into the tank, the cost of the staves will not be applied since the first batch covered the cost.

## Setting Up Equipment Treatments for Staves

From the [Equipment Treatment Definition window](https://support.vintrace.com/hc/en-us/articles/32301313669524), you’ll want to select the stave option:

- Add staves - Marks the tank as containing staves (i.e., selects the tank’s Contains Staves checkbox).
- Remove staves - Marks the tank as not containing staves (i.e., de-selects the tank’s Contains Staves checkbox).
- Leave staves state unchanged - Leaves the tank’s Contain Staves attribute unchanged.

## Creating a Work Order to Add or Remove Staves

To create a work order to add or remove staves from a tank:

1. [Create a work order](https://support.vintrace.com/hc/en-us/articles/32303315610388). When you get to the step to add a job to the work order, follow the steps below.
2. From the Work Order window click Add Job.
3. Select *Treatment (Equipment)*. The Treatment (Equipment) window displays.
4. From the Treatment list, select the *Add Staves* or *Remove Staves* equipment treatment that you created.

![Search_For_Equipment_Treatment_-_Add_or_Remove_Staves_20221108.png](https://support.vintrace.com/hc/article_attachments/32328622473492)

5. Be sure to select the inventory staves additive.

![Treatment Equipment - Stock Item 20231116.png](https://support.vintrace.com/hc/article_attachments/32328578422420)

If any of the tanks that you selected does not allow for staves (i.e., its Allow Staves checkbox is unchecked), vintrace displays the following warning:

The tank does not allow staves to be applied via the equipment treatment. Do you want to apply the product treatment to the tank anyway?

![Warning_-_Tank_Does_Not_Allow_Staves_20221108.png](https://support.vintrace.com/hc/article_attachments/32328606322196)

To add staves to the listed tanks, click OK.

## Vessels Page

You can [customize the Vessels page to display the Contains Staves column](https://support.vintrace.com/hc/en-us/articles/360001505616#ChangingtheColumnsDisplayed). You’ll also be able to [filter the Vessels page](https://support.vintrace.com/hc/en-us/articles/360001550655-The-Vessels-Page#FilteringtheVesselsPage) by the Contains Staves column.

![Vessels Page - Contains Staves Column 20231116.png](https://support.vintrace.com/hc/article_attachments/32328614603540)
