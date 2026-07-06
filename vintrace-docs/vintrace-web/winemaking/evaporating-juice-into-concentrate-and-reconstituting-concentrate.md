---
id: "32301281778708"
title: "Evaporating Juice into Concentrate and Reconstituting Concentrate"
url: "https://support.vintrace.com/hc/en-us/articles/32301281778708-Evaporating-Juice-into-Concentrate-and-Reconstituting-Concentrate"
category: "vintrace Web"
section: "Winemaking"
created_at: "2024-11-20T14:46:27Z"
updated_at: "2025-02-03T06:22:03Z"
labels: []
gist: "This article is specifically for US customers."
tags: ["configuration", "tax-class", "ttb", "reporting"]
---

# Evaporating Juice into Concentrate and Reconstituting Concentrate

This article is specifically for US customers.

In order to ensure that evaporating juice into concentrate, and reconstituting concentrate to juice are properly recorded in the [TTB Report](https://support.vintrace.com/hc/en-us/articles/32303292459668), you’ll need to first [set up product treatments](#product_treatments) and [loss reasons](#loss_reasons). After setting up the product treatments and loss reasons, refer to the workflows below for [evaporating juice](#evaporating_juice) and reconstituting concentrate.

## Setting Up Product Treatments

You’ll need to [set up two product treatments](https://support.vintrace.com/hc/en-us/articles/32301359713428).

The first product treatment will be used when you evaporate juice into concentrate. This product treatment should change the tax class to *Part IV - Concentrate* with a *Juice or Concentrate Produced* reason.

![Product Treatment Definition Create - Juice to Concentrate 20230713.png](https://support.vintrace.com/hc/article_attachments/32328562421140)

The second product treatment will be used when you reconstitute the concentrate to juice. This product treatment should change the tax class to *Part IV - Juice* with a *Juice or Concentrate Produced* reason.

![Product Treatment Definition Create - Concentrate to Juice 20230713.png](https://support.vintrace.com/hc/article_attachments/32328562299540)

## Setting Up Loss Reasons

You’ll need to [set up two loss reasons](https://support.vintrace.com/hc/en-us/articles/32301302947092).

The first loss reason will be used when concentrate is produced and uses the *Juice or Concentrate Produced* reason.

![Loss Reason - TTB Concentrate Produced 20230719.png](https://support.vintrace.com/hc/article_attachments/32328576556436)

The second loss reason will be used for reconstitution. This loss reason also uses the *Juice or Concentrate Produced* tax class change reason.

![Loss Reason - TTB Reconstitution 20230719.png](https://support.vintrace.com/hc/article_attachments/32328576528788)

## Evaporating Juice into Concentrate

To evaporate juice into concentrate:

1. Transfer the juice to an empty vessel. Be sure to select the [*TTB - Concentrate Produced* loss reason](#loss_reasons) that you created and change the batch on this transfer.

![Transfer - TTB Concentrate Produced 20230719.png](https://support.vintrace.com/hc/article_attachments/32328576610196)

In order for this to be correctly reported, be sure that the base material is juice.

2. Record a product treatment using the [product treatment you created](#product_treatments) to change the tax class to *Concentrate*.
3. From the wine’s [Product page](https://support.vintrace.com/hc/en-us/articles/32303310460948), change the wine’s type to Concentrate by clicking the ![Pencil Gray Icon 20200414.png](https://support.vintrace.com/hc/article_attachments/32328570995604) pencil icon in the Wine Type tile.

![Product Page - Editing Wine Type 20230725.png](https://support.vintrace.com/hc/article_attachments/32328545480340)

This will be reported in the [TTB Report (5120.17)](https://support.vintrace.com/hc/en-us/articles/32303292459668) as follows:

- Part IV, column c (Juice), line 6 (Used in Juice or Concentrate Production).
- Part IV, column d (Concentrate), line 3 (Juice or Concentrate Produced).

## Reconstituting Concentrate to Juice

To reconstitute concentrate to juice:

1. Record an Additive or Multi Addition operation to add water. Be sure to do the following:

- Select the [reconstitution product treatment](#product_treatments).
- Increase the volume.
- Select [*TTB - Reconstitution* loss reason](#loss_reasons) that you created.

![Additive - TTB Reconstitution 20230725.png](https://support.vintrace.com/hc/article_attachments/32328576649236)

In order for this to be correctly reported, be sure that the base material of the concentrate are grapes.

2. Record a Change Batch operation to update the batch of the concentrate as needed and update the wine type to juice.

This will be reported in the [TTB Report (5120.17)](https://support.vintrace.com/hc/en-us/articles/32303292459668) as follows:

- Part IV, column c (Juice), line 3 (Juice or Concentrate Produced).
- Part IV, column d (Concentrate), line 6 (Used in Juice or Concentrate Production).
