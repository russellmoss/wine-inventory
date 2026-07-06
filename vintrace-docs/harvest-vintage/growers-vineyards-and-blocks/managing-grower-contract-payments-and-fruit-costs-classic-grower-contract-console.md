---
id: "32303300639124"
title: "Managing Grower Contract Payments and Fruit Costs (Classic Grower Contract Console)"
url: "https://support.vintrace.com/hc/en-us/articles/32303300639124-Managing-Grower-Contract-Payments-and-Fruit-Costs-Classic-Grower-Contract-Console"
category: "Harvest/Vintage"
section: "Growers, Vineyards, and Blocks"
created_at: "2024-11-20T15:51:07Z"
updated_at: "2026-05-01T18:16:44Z"
labels: ["estate", "wp-faq-3430"]
gist: "This article relates to the classic Grower Contract Console."
tags: ["harvest", "cost", "vineyard", "configuration", "integrations"]
---

# Managing Grower Contract Payments and Fruit Costs (Classic Grower Contract Console)

This article relates to the classic Grower Contract Console. For the Contracts Management module, refer to [Managing Grower Contracts (Contracts Management)](https://support.vintrace.com/hc/en-us/articles/45962805386004).

If the [Defer Payments](#h_2ff56a1c-292f-4b83-836d-f48b792e302b) setting is enabled for a grower's contract, no costs are added to the fruit until an [installment payment is made](#h_9c1c8b4e-0328-4e48-8622-8aa0b9842f3f) for the contract. This allows you to manage flexible payment terms to your growers and have the cost set following harvest when you know the full amount received.

## Enabling Deferred Payments for the Account

Using a contract with deferred payments enabled delays costs being added to the fruit until a payment installment is made against the contract.

If accounting integration is enabled, deferred payments are enabled by default; otherwise you’ll need to enable deferred payments manually.

To enable the defer payment option:

1. Click ![More_Options_20200323.png](https://support.vintrace.com/hc/article_attachments/32328982882452) More Options in the sidebar.
2. From the Accounts tile, click Manage Grower Contracts. the Grower Contract Console displays.
3. From the Grower Contract Console, click Settings.

![Grower_Contract_Console_-_Settings_Button_20200416.png](https://support.vintrace.com/hc/article_attachments/32328982918932)

4. Select the Grower Contracts Installments checkbox.

![Enabling_Deferred_Payments_20200416.png](https://support.vintrace.com/hc/article_attachments/32328976061332)

5. Set the Received Fruit Payment Threshold. This value determines whether to base your installment payment on the contracted tonnage, or the received tonnage. The default is 85%.

For example, if you’ve received less than 85% of the contracted amount of fruit against a contract and an installment is made, it will be calculated using the contracted tonnage.

If you’ve received more than this setting (i.e., more than 85% of the contracted amount), the installment calculation uses the actual received tonnage in its calculation.

6. Click OK.

After enabling deferred payments you can enter the [number of installments in the grower's contract](https://support.vintrace.com/hc/en-us/articles/32301282381972).

![Grower_Contract_Create_-_Deferred_Payment_Fields_20200416.png](https://support.vintrace.com/hc/article_attachments/32328947287700)

When you receive fruit, the QA / Cost / Analysis tab of the Intake Details window displays the linked contract when subsequent fruit intakes are saved. There won’t be any cost saved against the fruit until payments are submitted.

![Intake_Details_-_QA_Cost_Analysis_-_Contract_20200416.png](https://support.vintrace.com/hc/article_attachments/32328947316116)

## Making an Installment

You can specify the number of installments that you want to split the cost of the contract in the No. of Installments field of the Grower Contract window.

To make an installment:

1. Select the Installments tab of the Grower Contract window.
2. Click Make Installment.

## Installment Example

Suppose your contracts’ Received Fruit Payment Threshold is set to 85% and you have a contract for 4T of fruit with 4 installments. You’ve received 3.6T of fruit for the contract which is 90% of the Contracted (T).

![Example_Contract_Installments_20200416.png](https://support.vintrace.com/hc/article_attachments/32328947301396)

You can create an installment from the Grower Contract Console by clicking the down arrow beside the contract, then selecting Create Next Installment.

![Grower_Contract_Console_-_Create_Next_Installment_20200416.png](https://support.vintrace.com/hc/article_attachments/32328983169812)

Since our contract is 4 installments, the first installment is 25% of the total payment value. Since we’ve received more than the Received Fruit Payment Threshold, we have the option to pay based on received tonnage instead of the contracted amount when you create an installment.

![Create_Next_Installment_-_Pay_Recd_Tonnage_20200416.png](https://support.vintrace.com/hc/article_attachments/32328976378644)

You can view the installments made and any future installments in the [Installments tab of the Grower Contract window](https://support.vintrace.com/hc/en-us/articles/32301319829268-Setting-Up-a-Grower-Contract#h_01FC6KYQMBY8JZVGV7PSC70E47).

Suppose you’ve made 2 installments against the contract and decide that the 3rd installment will be the last one. To do this, you’d select the Last Installment checkbox when you make an installment.

![Create_Next_Installment_-_Last_Installment_20200416.png](https://support.vintrace.com/hc/article_attachments/32328976400020)

By doing this, all the remaining costs for the contract are applied to the fruit in one final installment. This requires all fruit to have been received for the contract; otherwise, you’ll have to create a new grower contract if you have more fruit coming in.

The full amount is applied to the fruit intake and no more payments are expected.

## Metric Value Rule Bonuses

A metric value bonus rule lets you add a bonus cost if an analysis reading against a fruit intake meets your metric policy.

To trigger a bonus using one of the metric value rules on the contract there needs to be an analysis reading against the fruit intake and metric policy.

For example, any fruit intake with an analysis reading that satisfies the metric policy named Ideal Brix adds a bonus cost of 10%. To do this, we’ve created a policy where the brix reading is between 18-22.

![Metric_Threshold_Policy_Create_20200416.png](https://support.vintrace.com/hc/article_attachments/32328983016468)

The brix metric can be done when entering fruit intake data, or added in retrospect using the correct option on a particular intake.

![Example_Intake_Analysis_Brix_20200416.png](https://support.vintrace.com/hc/article_attachments/32328947345172)

If a bonus is applied to a fruit intake, it displays as a bonus in the Adjustments tab of the Grower Contract window.

![mceclip11.png](https://support.vintrace.com/hc/article_attachments/32328975958036)
