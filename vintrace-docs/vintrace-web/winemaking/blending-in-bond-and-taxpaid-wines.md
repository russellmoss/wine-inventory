---
id: "32301313077908"
title: "Blending In Bond and Taxpaid Wines"
url: "https://support.vintrace.com/hc/en-us/articles/32301313077908-Blending-In-Bond-and-Taxpaid-Wines"
category: "vintrace Web"
section: "Winemaking"
created_at: "2024-11-20T14:46:32Z"
updated_at: "2025-01-15T19:34:16Z"
labels: ["TTB"]
gist: "This functionality is available starting with vintrace 9.4.3, but not enabled by default."
tags: ["blending", "bond", "tax-class", "transfers", "permissions", "configuration"]
---

# Blending In Bond and Taxpaid Wines

This functionality is available starting with [vintrace 9.4.3](https://support.vintrace.com/hc/en-us/articles/32303276816020), but not enabled by default. If you would like to use this functionality, please contact our support team.

If you want to blend an in-bond wine with a taxpaid wine, you’ll need to [create a new product treatment](#product_treatment) and [apply it to your bonded wine](#h_01H5Q4G376SXP6AQHJPPRFD5FZ).

After applying the product treatment to your wine, you can blend it with taxpaid wines using a number of operations, including:

- Blend
- Multi transfer (many-to-one)
- Multi transfer (one-to-many)
- Transfer
- Racking
- More options > Manage trial blends > Blend transfer (this uses the multi transfer operations)

## Setting Up a Product Treatment

In order to blend an in-bond wine with a taxpaid wine, you’ll need to [set up a product treatment](https://support.vintrace.com/hc/en-us/articles/32301359713428) that changes the wine’s state from *bonded* to *taxpaid*. When setting up the new product treatment, be sure to select the Move to Taxpaid checkbox.

![Product Treatment - Move to Taxpaid 20230711.png](https://support.vintrace.com/hc/article_attachments/32328614315668)

Applying the product treatment to a wine changes its tax state to *Taxpaid* with a Tax Change Reason of *Removed taxpaid (bulk)*; the tax class will be retained. The wine’s tax event will have a negative value; this is the total volume of wine in the vessel that the product treatment was applied to.

The volume of the wine that was updated will be included in Part I, line 14 (Removed Taxpaid) of the TTB Report (5120.17).

## Applying the Product Treatment

In order to use the [new product treatment that changes the tax class to *Taxpaid*](#product_treatment), you must have the [*Can Adjust Tax State* permission](https://support.vintrace.com/hc/en-us/articles/360000813755-Roles-and-Permissions#Permissions).

The product treatment to change the tax class to *Taxpaid* can only be used with the Treatment (Product) operation. It cannot be used on transfers. In addition, it can only be applied to declared wines. In other words, both of the following must be true:

- The wine has a *Bonded* tax state.
- The wine has a tax class that’s in Part I of the TTB.

Although the product treatment can be used to schedule a job on a non-bonded wine, the job cannot be completed until the wine’s tax state is bonded.
