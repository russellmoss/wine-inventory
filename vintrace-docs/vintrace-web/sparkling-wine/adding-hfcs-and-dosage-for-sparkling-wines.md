---
id: "32301312580244"
title: "Adding HFCS and Dosage for Sparkling Wines"
url: "https://support.vintrace.com/hc/en-us/articles/32301312580244-Adding-HFCS-and-Dosage-for-Sparkling-Wines"
category: "vintrace Web"
section: "Sparkling Wine"
created_at: "2024-11-20T14:46:24Z"
updated_at: "2025-01-15T19:23:21Z"
labels: []
gist: "This functionality is available starting with vintrace 9.4.3, but not enabled by default."
tags: ["additives", "tax-class", "ttb", "reporting", "transfers", "configuration"]
---

# Adding HFCS and Dosage for Sparkling Wines

This functionality is available starting with [vintrace 9.4.3](https://support.vintrace.com/hc/en-us/articles/32303276816020), but not enabled by default. If you would like to use this functionality, please contact our support team.

When high fructose corn syrup (HFCS) is added to a wine in the Non-Sparkling tax class, it increases the volume for the *Produced by Sweetening* TTB reason. To add HFCS to sparkling wine you can record an addition or a transfer.

For the addition, you’ll need to first [set up a loss reason](#loss_reason). Once you’ve set up the loss reason, you can [record an Additive or Multi Addition operation](#adding_hfcs_to_sparkling). For the [Transfer operation of the HFCS](#transfer_hfcs_to_sparkling), this increases the volume and is recorded using the Other reason on the TTB Report.

If you are [making a dosage](#making_dosage), you’ll want to ensure that you follow the workflow described below.

## Setting Up a Loss Reason

Because there isn’t a Dosage reason in the TTB Report, you’ll need to [set up a loss reason](https://support.vintrace.com/hc/en-us/articles/32301302947092) to record the event on line 10 of the TTB. The loss reason should have its Tax Class Change Reason set to *Other (Bulk)*.

![Loss Reason 20230712.png](https://support.vintrace.com/hc/article_attachments/32328575676948)

## Adding HFCS to Wine in Sparkling Tax Class

To add HFCS to wines in a Sparkling tax class and record a gain, record an Additive or Multi Addition operation using the [loss reason that you set up](#loss_reason).

![Additive Using HFCS Loss Reason 20230724.png](https://support.vintrace.com/hc/article_attachments/32328588953748)

The additive selected will need to be linked to a stock additive in the *Liquid Sugar* tax class.

This will generate a tax event for *Other (Bulk)* which will be reported in the TTB Report’s part 1, line 10 or 11 (Other, or Combination if there are three or more lines), column e (Sparkling Wine).

## Transferring HFCS to Wine in a Sparkling Tax Class

To transfer HFCS that’s stored in a vessel to a wine in a sparkling tax class, record a Transfer operation. This transfer will change the fruit composition of the wine.

The HFCS will need to be in the Liquid Sugar tax class.

![Transfer 20230925.png](https://support.vintrace.com/hc/article_attachments/32328561434004)

The tax event for Other (Bulk) will be generated when:

- The HFCS in the source vessel is in the Liquid Sugar tax class.
- The destination is in the Sparkling tax class.

## Making a Dosage

Blending a spirit with liquid sugar such as HFCS to make a dosage that’s blended with a wine in a Sparkling Wine tax class can be accomplished in vintrace using any of the following operations:

- Blend
- Transfer
- Multi transfer (many-to-one)
- Multi transfer (one-to-many)

To blend the dosage into a Sparkling Wine tax class:

1. Transfer the spirits into an empty dosage vessel by recording a Transfer operation.
2. Blend HFCS into the spirits in the dosage vessel.
3. Change the batch name of the destination vessel. This can be done as part of the blend operation, or by using the Change Batch operation.
4. View the dosage batch from the Products page and edit its Alcohol %. This will be used in the proof gallons calculation for the dosage.
5. Transfer the contents from the dosage vessel to the wine in the destination vessel.

There will be a negative tax event for the HFCS or spirits transferred out of the source vessel in the TTB Report. This will be recorded in either:

- Part IV, line 6 (Used in Juice or Concentrate Production), column i (Liquid Sugar), or
- Part III, line 6 (Trans. to Col. (e)), column a, b, c, or d (Grape)

The spirits and HFCS used to make the dosage will result in a positive event that’s recorded in part III, line 2 (Received), column e (For Preparation of Dosage or Essences).
