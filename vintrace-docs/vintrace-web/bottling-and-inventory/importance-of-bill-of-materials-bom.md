---
id: "32303320516372"
title: "Importance of Bill of Materials (BoM)"
url: "https://support.vintrace.com/hc/en-us/articles/32303320516372-Importance-of-Bill-of-Materials-BoM"
category: "vintrace Web"
section: "Bottling and Inventory"
created_at: "2024-11-20T15:52:25Z"
updated_at: "2026-05-18T22:25:05Z"
labels: ["estate", "wp-page-5068"]
gist: "One of the last steps in the production cycle for most wines is to bottle them into your chosen format which could be a shiner (cleanskin), labelled bottle, or case."
tags: ["inventory", "packaging", "configuration", "fermentation"]
---

# Importance of Bill of Materials (BoM)

One of the last steps in the production cycle for most wines is to bottle them into your chosen format which could be a shiner (cleanskin), labelled bottle, or case.

Regardless of the final format, we recommend using the [Packaging (Bottling) operation](https://support.vintrace.com/hc/en-us/articles/32303327186836) to single bottle stock items before using the [Manufacture operation](https://support.vintrace.com/hc/en-us/articles/32303341990548) to create your cased format. This gives you the most flexibility and saves time while ensuring that you account for every single bottle you produce.

The key component of the bottling, packaging, and manufacturing is the Bill of Materials (BOM) that’s associated with a stock item. A Bill of Materials is a hierarchical structure that defines the component stock items - including bulk wine - that make up the finished bottle or case. The BOM tells vintrace how to create a single unit of the final product that you’re making and what dry good stock to use.

For example, the BOM on the left is for a single bottle. The BOM on the right is for a case that includes 12 of the single bottles.

![BOM_for_Bottle_and_Case_20200525.png](https://support.vintrace.com/hc/article_attachments/32329137132820)

Regardless of the individual container size (187 mL up to large format or special kegs), or configuration (6-pack, 12-pack case), the process of building the BOM is the same.

1. [Create all stock items](https://support.vintrace.com/hc/en-us/articles/32303296023316) associated with a bottling. Be sure your stock levels are updated.
2. [Create your single-bottle stock item](https://support.vintrace.com/hc/en-us/articles/32301345671956) with a stock type set to *Single x1*. Assemble the BOM for the single bottle that includes all its components including the bulk wine. For the dry goods, the quantity will be 1. For the liquid component (bulk wine), use the volume in a single bottle. For example, for a 750 mL bottle, enter 0.75L. (Alternatively, you could [create a case item](https://support.vintrace.com/hc/en-us/articles/32301360537876-Setting-Up-a-Case-Stock-Item), depending on your situation and needs).
3. [Package the single bottle](https://support.vintrace.com/hc/en-us/articles/32303327186836-Recording-a-Bottling-Packaging-Operation) (or case item).
4. Create your manufacture stock item. This is done in the same way as step 2 but should include your already packaged item as well as anything else you would like to add such as labels, dividers, waxing, etc. in appropriate amounts.
5. [Manufacture](https://support.vintrace.com/hc/en-us/articles/32303341990548) the packaged single bottle (or case) using your manufacture stock item.

A BOM can be edited as long as you haven’t performed a Package or Manufacture operation with it. The most common case is that you’ve added an incorrect item to the BOM. If you find that you’ve added an incorrect item to the BOM, remove the item from the BOM, then add the correct one. You can also add items that you may have left off.

## Packaging Directly to a Case

If you choose to package directly to a case, the BOM for the case would include the components that would be added to a single-bottle stock item. In this situation, the quantities for the items - except for the bulk wine, carton, and divider - would be 12 and the bulk wine amount would be 9 L.

![Create_Stock_Item_-_Case_of_Bottles_20200525.png](https://support.vintrace.com/hc/article_attachments/32329123807892)

**WARNING**: Packaging straight to the case prevents tracking loose bottles that almost always result from a bottling. If your winery doesn’t track loose bottles, then packaging straight to case works well.

**WARNING**: Packaging without a bulk wine in the BoM will cause issues with reporting and costing. A bulk wine MUST BE INCLUDED on a packaging BoM.
