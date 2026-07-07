---
id: "32301359713428"
title: "Setting Up a Product Treatment"
url: "https://support.vintrace.com/hc/en-us/articles/32301359713428-Setting-Up-a-Product-Treatment"
category: "vintrace Web"
section: "Winemaking"
created_at: "2024-11-20T14:48:26Z"
updated_at: "2026-04-10T18:20:52Z"
labels: []
gist: "Product treatments are used to record any actions you may perform on a wine that don’t change the composition or components of the wine, but that may change its state or are simply actions that you wish to track."
tags: ["configuration", "barrels", "fermentation", "inventory", "transfers", "additives"]
---

# Setting Up a Product Treatment

Product treatments are used to record any actions you may perform on a wine that don’t change the composition or components of the wine, but that may change its state or are simply actions that you wish to track. Examples include:

- Cross flow, DE or pad filtration
- Drain and return (splash rack)
- Heating/chilling
- Restarting a ferment
- Stirring barrels

It's also important to note that a Product treatment is affecting the *wine product* specifically, and is recorded against the history of the *wine*. There is no stock depletion or addition recorded against a wine with a Product Treatment. This is in contrast to a barrel or equipment treatment for example, such as sanitation or sousing, where the treatment is recorded against the *vessel*.

## Setting Up a Product Treatment

You can add a product treatment from the Winery Setup window:

1. Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32329163539860) Set Up in the sidebar.
2. Click Treatments.
3. From the Product Treatments tile, click Configure.
4. Click New Product Treatments.
5. Specify the details for the product treatment.
6. Click Save.

In its most basic form, a treatment need indicate only the *treatment name* and what kind of product it *applies to* (fruit, wine/juice, or ferments). These are required fields. In this case, vintrace simply records the treatment in the history of the wine product to show that the treatment has occurred.

It's always a good idea to included a brief *description* of the treatment for clearer identification, but this is an optional step.

![Product_treatment_basic.png](https://support.vintrace.com/hc/article_attachments/48103949166356)

*Fig. 1 - Setting up a Product Treatment - Required fields*

A Product treatment also allows for more advanced features, including automatic changes to a wine state.

![Product_treatment_detailed.png](https://support.vintrace.com/hc/article_attachments/48103949167892)

*Fig 2. Setting up Product Treatments - Advanced options*

In the instance where a particular input is required to perform the treatment, such as a filter pad or gas, you might choose to use a *Treatment agent* and/or S*tock item* to indicate this.

- A *Treatment agent* can be created without ties to any physical stock and allows for ad hoc entry of a required chemical/product/component etc. which displays on the task details for cellar staff to review.
- A *Stock item* from your inventory can be added, in which case the treatment will also consume the appropriate stock from your inventory, impacting your inventory levels.

Note: a stock item can also be nested within a treatment agent if so required, allowing stock to be consumed while displaying the customized treatment agent name on the Work Order.

IMPORTANT: **Treatment agents** and/or **Stock items**used in a Product treatment do *NOT* appear in the additive records of the wine product, nor does any **allergen advice** for these agents or stock items. If you wish to record an additive in the additive history of a wine, please use an **Additive** or **Multi additions** task. However, any treatment agent or stock item used for the treatment will be deducted from inventory.

*Grading* can be used if the product treatment will cause an automatic change to product grading.

A product treatment may also trigger a change in [*product state*](https://support.vintrace.com/hc/en-us/articles/32301350848916) when the treatment is completed. To use this feature, be sure to tick the *Change product state* checkbox and select the product state the wine will adopt from the drop down list.

*Change staves state* is used to update the status of the vessel the

*Cost* can be assigned to the treatment if appropriate. Note that this is *your cost* and is separate from any onward charge to a client. A **cost item** is required for appropriate recording and routing of costs.

Any *Technique/Procedure Information* included with the product treatment will be included in a printed Work Order. This field is free text and is optional.

Special uses:

- For US databases, product treatments can also be used to *change tax class* where appropriate.
- Users with a multi-winery license can specify which product treatments are available at each winery. Refer to our [Configuration for Multi-Winery Support article](https://support.vintrace.com/hc/en-us/articles/32301304791316) for details.
