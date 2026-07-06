---
id: "32301386209556"
title: "Writing Off or Transferring Cost of Bulk Wine When Measured Down to Zero"
url: "https://support.vintrace.com/hc/en-us/articles/32301386209556-Writing-Off-or-Transferring-Cost-of-Bulk-Wine-When-Measured-Down-to-Zero"
category: "vintrace Web"
section: "Costing"
created_at: "2024-11-20T14:48:36Z"
updated_at: "2024-11-21T10:19:45Z"
labels: ["estate", "wp-faq-4801", "write off costs", "transfer costs", "measuring down wine"]
gist: "An overview of the process is below."
tags: ["cost", "transfers", "configuration", "getting-started", "lot-identity"]
---

# Writing Off or Transferring Cost of Bulk Wine When Measured Down to Zero

An overview of the process is below. The process is similar until the last step when you decide whether to write off, or transfer the cost.

1. Decide if you want to use the default Write Off account that’s provided, or [create a new Write Off account](#h_6d84d2f7-aa50-4f02-9afd-8c2c84a2a970).
2. [Set up a loss reason that links to your Write Off account](#h_04d7a005-a28d-47a8-a952-253ad2ceb0b0).
3. [Measure down the bulk wine to zero](#h_89d6d4f7-d286-4f9f-8fbe-2aef524b76e6).
4. Either [write off the cost](#h_a4f62334-4d8e-4db3-8f18-56f44e8fe34d), or [transfer the cost to an active wine batch](#h_678d8972-3d88-4974-a1a3-66a3ca06602a).

The details for each part of the process are described below.

## Setting Up a Write Off Account

You can set up a new Write Off account from the Winery Setup window (Setup Options > Accounts > Account):

1. Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32329201513620) Set Up in the sidebar.
2. Click Accounts.
3. From the Accounts tile, click Configure.
4. Click New Ledger Account.
5. Specify the details for the account. Be sure to set the account’s Type to *Write Off*.

![Update_Account_-_Write_Off_Account_20200610.png](https://support.vintrace.com/hc/article_attachments/32329193194388)

6. Click Save.
7. Follow the steps to [set up a loss reason](#h_04d7a005-a28d-47a8-a952-253ad2ceb0b0) that's linked to your Write Off account.

## Setting Up a Loss Reason

You can set up a loss reason that links to your Write Off account from the Winery Setup window (Setup Options > Production > Reason for Loss):

1. Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32329201513620) Set Up in the sidebar.
2. Click Winemaking.
3. From the Reason for Loss tile, click Configure.
4. Click New Loss Reason.
5. Specify the details for the loss reason. Be sure to set the Write Off Account to the [Write Off account that you created](#h_6d84d2f7-aa50-4f02-9afd-8c2c84a2a970).

![Loss_Reason_Update_-_Write_Off_20200610.png](https://support.vintrace.com/hc/article_attachments/32329187667092)

6. Click Save.
7. Follow the steps to [measure down the bulk wine to zero](#h_89d6d4f7-d286-4f9f-8fbe-2aef524b76e6).

## Measuring Down a Bulk Wine to Zero

To measure down a bulk wine to zero:

1. View the wine’s Product page.
2. Click the ![Product_-_Measurement_Icon_20200429.png](https://support.vintrace.com/hc/article_attachments/32329192987412) Measurement icon.

![Product_-_Measurement_Icon_20200610.png](https://support.vintrace.com/hc/article_attachments/32329187701268)

3. In the New Amount field, enter *0*.
4. Click the Calculator icon to calculate the loss.
5. Set the Loss Reason to the loss reason you created.

![Measuring_Down_to_0_-_Write_Off_20200610.png](https://support.vintrace.com/hc/article_attachments/32329201595668)

6. Click Now + Save.
7. Click OK. A warning message displays giving you the option to write off or transfer the cost.
8. Follow the steps for either [writing off](#h_a4f62334-4d8e-4db3-8f18-56f44e8fe34d), or [transferring the cost](#h_678d8972-3d88-4974-a1a3-66a3ca06602a).

## Writing Off the Cost

To write off the cost:

1. When prompted to write off or transfer, click Write Off.

![Warning_-_Measuring_Down_to_0_-_Write_Off_20200610.png](https://support.vintrace.com/hc/article_attachments/32329149866260)

A warning message displays to confirm the account to use for the write off. It defaults to the Loss Reason that you selected in the Measurement window.

![Warning_-_Measuring_Down_to_0_-_Write_Off_Account_20200610.png](https://support.vintrace.com/hc/article_attachments/32329173197588)

2. Click OK.

## Transferring Cost to an Active Product Costing

Be sure to confirm that the batch you want to measure down to zero has an active costing.

To transfer cost to an active product costing:

1. When prompted to write off or transfer, click Transfer.

![Warning_-_Measuring_Down_to_0_-_Transfer_20200610.png](https://support.vintrace.com/hc/article_attachments/32329201648020)

A window displays asking you to select the costing event for the stock item that was used in the previous operation.

![Select_Costing_to_Transfer_20200610.png](https://support.vintrace.com/hc/article_attachments/32329183163284)

2. Click the costing event.
