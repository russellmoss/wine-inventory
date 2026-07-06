---
id: "32301321506708"
title: "Using vintrace for Hard Seltzer"
url: "https://support.vintrace.com/hc/en-us/articles/32301321506708-Using-vintrace-for-Hard-Seltzer"
category: "vintrace Web"
section: "Hard Seltzer"
created_at: "2024-11-20T14:47:22Z"
updated_at: "2025-01-07T18:02:55Z"
labels: []
gist: "You can easily use vintrace for hard seltzers by doing the following:."
tags: ["additives", "ttb", "configuration", "tax-class", "bond", "reporting"]
---

# Using vintrace for Hard Seltzer

You can easily use vintrace for hard seltzers by doing the following:

1. Contact vintrace Support to request a hard seltzer bond for your account.
2. [Add a new owner for the hard seltzer bond.](#Adding_Org)
3. [Add a new tax class.](#Adding_Tax_Class)
4. [Add your sugar and concentrate additives.](#Setting_Up_Additives)
5. [Add your sugar and concentrate as additive stock items.](#Adding_Stock_Items)

When using vintrace for hard seltzer, the operations for additions and movement are handled in the same way as for wine. However, there are a few settings that you’ll need to specify when you [receive water for a bulk intake](#Receiving_Water) that are detailed below.

## Adding a New Organization

Add an organization named *Hard Seltzer* to your vintrace address book. Be sure to assign the organization the Owner role.

![Update_Basic_Organization_Widget_-_Hard_Seltzer._20201216.png](https://support.vintrace.com/hc/article_attachments/32328950061332)

## Adding a New Tax Class

vintrace does NOT fill out form 5130. For details on completing your 5130, refer to the [TTB’s website](https://www.ttb.gov/beer/forms).

[Set up a new tax class](https://support.vintrace.com/hc/en-us/articles/32301306220180) for hard seltzer with the following settings:

- TTB Part — Select *Part IV - Materials*.
- TTB Column Ref — Enter *Z*.

![Tax_Class_20201210.png](https://support.vintrace.com/hc/article_attachments/32328904716180)

## Setting Up Additives

Although sugar that you use for winemaking is included in the TTB report, sugar and concentrate that you use for hard seltzer does not need to be included in the report. Because of this, you’ll want to [set up a separate sugar and concentrate additive](https://support.vintrace.com/hc/en-us/articles/32301344910740) in vintrace.

When you add the sugar and concentrate for your hard seltzer, be sure to set the owner to the [Hard Seltzer owner you created earlier](#Adding_Org).

![Additives_20201210.png](https://support.vintrace.com/hc/article_attachments/32328925688468)

## Setting Up Additive Stock Items

Similar to the [sugar and concentrate additives that you added](#Setting_Up_Additives), you’ll also need to set up additive stock items. When setting up your additive stock items, be sure to set the owner to the [Hard Seltzer owner that you created earlier](#Adding_Org).

![Additive_Items_20201216.png](https://support.vintrace.com/hc/article_attachments/32328881445268)

## Receiving Water

Operations such as additions and movements for hard seltzer are done in the same way as you’d do them for wine.

When you receive water for hard seltzer, you’ll want to use the [Bulk Intake operation](https://support.vintrace.com/hc/en-us/articles/32303303281428) in vintrace. For bulk intakes, there are a few settings that pertain specifically to hard seltzers.

On the Wine Details tab, you’ll want to specify the following:

![Bulk_Intake_-_Wine_Details_20201216.png](https://support.vintrace.com/hc/article_attachments/32328904901652)

- Type — Select *Hard Seltzer*.

If you don’t have this type set up, you can click the ![Plus_in_Green_Circle_20200319.png](https://support.vintrace.com/hc/article_attachments/32328904729748) add icon to create it. You may want to select a color for the new type that will allow you to easily identify it.
![Type_-_Hard_Seltzer_20201216.png](https://support.vintrace.com/hc/article_attachments/32328881467028)

- Batch — When you set up the batch, be sure its owner is *Hard Seltzer*.

![Batch_20201210.png](https://support.vintrace.com/hc/article_attachments/32328950216340)

- Product Type — Select *Wine/Juice*.
- Fraction Type — Select *Unknown*.
- Ferment State — Select *Unfermented*.

On the Composition tab, you’ll want to specify the following:

![Bulk_Intake_-_Composition_20201216.png](https://support.vintrace.com/hc/article_attachments/32328931912212)

- Composition — Enter *100%*.
- Vintage — Select *Non-Vintage*.
- Sub-AVA — Select *Unknown*.
- Variety — Select *Water*.

On the Costing & Labs tab, be sure to set the tax state to *Non-Declared*.

![Bulk_Intake_-_Costing_and_Labs_20201216.png](https://support.vintrace.com/hc/article_attachments/32328950337300)

After you create the batch, you can view your hard seltzer batches by filtering the [Vessels page](https://support.vintrace.com/hc/en-us/articles/32301344827924) by Wine Type or Batch Owner.

![Vessels_Page_Filters_20201216.png](https://support.vintrace.com/hc/article_attachments/32328922157460)
