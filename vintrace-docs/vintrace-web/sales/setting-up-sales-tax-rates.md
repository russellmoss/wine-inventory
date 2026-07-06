---
id: "32303335629332"
title: "Setting Up Sales Tax Rates"
url: "https://support.vintrace.com/hc/en-us/articles/32303335629332-Setting-Up-Sales-Tax-Rates"
category: "vintrace Web"
section: "Sales"
created_at: "2024-11-20T15:52:25Z"
updated_at: "2025-01-09T17:21:40Z"
labels: ["estate", "WET", "NZ Excise tax", "GST", "Special Case Tax Rates", "Tax rates and Xero"]
gist: "vintrace’s tax rate editor allows you to manage more complex tax procedures, especially tax classes used in Australia and New Zealand."
tags: ["configuration", "packaging", "ttb", "dtc-sales", "integrations", "tax-class"]
---

# Setting Up Sales Tax Rates

vintrace’s tax rate editor allows you to manage more complex tax procedures, especially tax classes used in [Australia](https://support.vintrace.com/hc/en-us/articles/32303294708884) and [New Zealand](https://support.vintrace.com/hc/en-us/articles/32303303127572). Other countries can use the GST tax rate.

Tax rates are used in both [price lists](https://support.vintrace.com/hc/en-us/articles/32303325767316) and in [sales orders](https://support.vintrace.com/hc/en-us/articles/32303318150164). The tax rates that you set up can be used when you invoice from vintrace, or when you pass sales invoices to a third-party accounting package.

For information on WET or excise tax components, refer to our [Handling the Wine Equalisation Tax (WET)](https://support.vintrace.com/hc/en-us/articles/32303294708884) and [Handling Excise Tax (New Zealand)](https://support.vintrace.com/hc/en-us/articles/32303303127572) articles to learn more.

## Setting Up a Tax Rate

You can create tax rates from the Winery Setup window (Setup Options > Tax > Tax Rates):

1. Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32329089583252) Set Up in the sidebar.
2. Click Tax.
3. From the Tax Rates tile, click Configure.
4. Click New Tax Rate. The Tax Rate window displays.

![Create_Tax_Rate_20200807.png](https://support.vintrace.com/hc/article_attachments/32329123945492)

5. Specify the details for the tax rate. Click Add Line for each component that you want to add to the tax rate. There must be at least one tax rate component. It can be 0% for tax-free rates.

- Name — The name of the tax rate component.

SPECIAL CASE TAX RATES
The names *WET* and *Excise Tax* are considered special case tax rates. A ![Exclamation_Point_in_Yellow_Triangle_20200811.png](https://support.vintrace.com/hc/article_attachments/32329123896852) displays beside these names to indicate that they use calculations based on different circumstances.

- Ext Tax Account Ref — The account to link to the tax rate component.
- Tax Rate (%) — The tax rate component’s percentage.
- Compound — Select the Compound checkbox if the previous tax rate component (i.e., tax rate components with a previous priority) should be calculated before this rate component is applied to it. In the following GST + WET example, the WET tax rate is 29% and the GST tax rate is 10%. Because GST has its Compound checkbox selected, WET will be calculated before the GST is applied to it. This resulting tax rate is 41.9%.

![GST_and_WET_Example_20200812.png](https://support.vintrace.com/hc/article_attachments/32329112512148)

- Inclusive — Select the Inclusive checkbox if the tax rate component is inclusive.
- Priority — If you’re using a compound tax rate, enter the order that the tax rate component is calculated (i.e., 1 indicates that the tax rate component is calculated first). For example, the tax rate for a New Zealand winery might look as follows.

![Create_Tax_Rate_-_Excise_and_GST_20200812.png](https://support.vintrace.com/hc/article_attachments/32329123916948)

6. Click Save.

## Linking to Third-Party Accounting Packages

If you’re [linking to a third-party accounting package](https://support.vintrace.com/hc/en-us/articles/32303315132180) such as [Xero](https://support.vintrace.com/hc/en-us/articles/32303310784660), you can enter a Linked Tax Rate ID to specify the ID that is passed to the accounting package.
