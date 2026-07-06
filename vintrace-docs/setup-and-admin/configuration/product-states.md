---
id: "32301350848916"
title: "Product States"
url: "https://support.vintrace.com/hc/en-us/articles/32301350848916-Product-States"
category: "Setup and Admin"
section: "Configuration"
created_at: "2024-11-20T14:46:55Z"
updated_at: "2024-11-21T10:28:33Z"
labels: []
gist: "Each step in your winemaking process can be set up in vintrace as a product state."
tags: ["configuration", "fermentation", "lab", "additives", "work-orders"]
---

# Product States

Each step in your winemaking process can be set up in vintrace as a product state. These product states tell you where your wines are in their lifecycle so that you can manage the operations that need to be performed next. As you complete operations, you can configure vintrace so that it [automatically changes a wine’s product state](#h_01FM2WXGEEGKKP205D8XDM5CWT). Below is an example showing operations on a wine and the resulting product state.

![Action_and_Product_State_Example_20211109.png](https://support.vintrace.com/hc/article_attachments/32328886163476)

Rather than manually changing a wine’s product state, you can set up [product treatments](https://support.vintrace.com/hc/en-us/articles/32301359713428), [additive templates](https://support.vintrace.com/hc/en-us/articles/32301359803412), and [analysis templates](https://support.vintrace.com/hc/en-us/articles/32301372281748) to automatically change the product state. For example, the Juice Panel analysis template can automatically change the product state to *TTA/H2O Add*.

![Analysis_Template_-_Juice_Panel_20211028.png](https://support.vintrace.com/hc/article_attachments/32328886069524)

You can use a [saved search to identify wines in a particular product state](#h_01FM2WY4HKNQ957V5A4AN9QZXP) so that you can take any necessary actions on it. For example, you can [create a work order](https://support.vintrace.com/hc/en-us/articles/32303315610388) to add yeast to wines that have a *Ready for Yeast* product state.

## Setting Up a Product State

You can create a product state from the Winery Setup window (Setup Options > Work-flow > Product States):

1. Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32328875494420) Set Up in the sidebar.
2. Click Winemaking.
3. From the Product States tile, click Configure.
4. Click New Product State. The Product State window displays.

![Product_State_Create_20211028.png](https://support.vintrace.com/hc/article_attachments/32328871792404)

5. Specify the details for the product state.
6. Click Save.

## Automatically Changing a Product State

Although you can manually change a wine’s product state as part of an operation, it’s easier and faster to change the product state as part of your product treatments, additive templates, and analysis templates. Each of these can be configured to automatically change a wine’s product state. Below are some examples.

- The *Filter - Cross Flow* product treatment can change the product state to *Finish Filtered*.

![Product_Treatment_-_Filter_Cross_Flow_20211028.png](https://support.vintrace.com/hc/article_attachments/32328863618836)

- The *Yeast Inoculation* additive template can change the product state to *Inoculated*.

![Additive_Template_-_Yeast_Inoculation_20211028.png](https://support.vintrace.com/hc/article_attachments/32328871815444)

- The *Press Panel* analysis template can change the product state to *Pressed Off*.

![Analysis_Template_-_Press_Panel_20211028.png](https://support.vintrace.com/hc/article_attachments/32328863668244)

## Product States and Saved Searches

You can [create saved searches](https://support.vintrace.com/hc/en-us/articles/360001842276-Searching-the-Vessels-Page#SavedSearches) to find wines in a particular state. For example, you can create a saved search to identify the wines that have had their first nutrient add.

Or, you can create a saved search to identify the wines that need acid and water added to them. You can then select all of these wines for a multi addition operation.

![Vessels_Page_-_TTA_H2O_Adds_20211109.png](https://support.vintrace.com/hc/article_attachments/32328892162708)

Another way to use product states is to [include the column on the Vessels page](https://support.vintrace.com/hc/en-us/articles/32301323976084). When you view your wines that are currently fermenting, you can easily see the different product states that the wines are in.

![Vessels_Page_-_Product_State_Column_20211028.png](https://support.vintrace.com/hc/article_attachments/32328847184532)
