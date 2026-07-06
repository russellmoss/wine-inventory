---
id: "32303316012308"
title: "Charging Clients for Winery Work"
url: "https://support.vintrace.com/hc/en-us/articles/32303316012308-Charging-Clients-for-Winery-Work"
category: "vintrace Web"
section: "Custom Crush Billing"
created_at: "2024-11-20T15:51:33Z"
updated_at: "2024-12-30T19:56:15Z"
labels: ["estate", "wp-page-715", "charge", "billing", "owner"]
gist: "Charges for winery work will be charged to the wine batch’s service order, or to the batches involved in the operation."
tags: ["harvest", "lot-identity", "migration", "barrels", "configuration", "corrections"]
---

# Charging Clients for Winery Work

Charges for winery work will be charged to the wine batch’s service order, or to the batches involved in the operation. If the Service Order setting for the batches isn’t specified, the wine owner’s default service order will be used.

If the wine has multiple product owners, the billing charges will be split between the owners based on the percentage that they own.

After you generate your charges, you can create invoices for them.

Be sure that all wine owners have a default service order specified in the address book. You can do this by viewing the owner in the address book and clicking Edit beside the Owner role.
![Update_Basic_Org_Widget_-_Default_Service_Order_20200715.png](https://support.vintrace.com/hc/article_attachments/32329021502228)

## Billing for Single Ownership Wine Operations

When you complete an operation that’s linked to a billing item, and the batch involved has a service order specified, the Service Charges window displays.

[![](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2018/12/Winery-work-8.jpg)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2018/12/Winery-work-8.jpg)

The service date, units, volume, barrel count or pallets from the winery operation will be automatically populated in the Service Charges window. You can enter notes in the provided field.

If the item or service is to be discounted, enter the discounted value in the Subtotal field; vintrace automatically calculates the discount for you. For example, you might offer a client a discounted labor charge. You can adjust the charges if needed and enter an explanation in the Line Note field. Any note that you enter in the Line Note field will be printed on the invoice. When the charges displayed are correct, click Save.

[![](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2018/12/Winery-work-9.jpg)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2018/12/Winery-work-9.jpg)

## Billing for Split Ownership Wine Operations&nbsp

When an operation is performed on a wine with a single owner, all charges will be billed against the batch’s service order. If a wine has multiple owners, the charges will be split between the owners based on the percentage that they own.

After saving a winery operation, the Service Charges window displays. The charges will be split based on the ownership percentage.

For example, suppose 1000g of the CUSO4 additive was used in an operation. If the JX2 Winery owns 60% of the wine, 600g would be charged to their service order. East Side Winery owns 40% of the wine so they’d be charged the remaining 400g.

[![](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2018/12/Winery-work-4-2.jpg)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2018/12/Winery-work-4-2.jpg)

## Billing for Transfer Operations

For transfer operations, the destination wine owner’s service order will be charged for the billing items. If the destination wine has multiple owners, the charges will be split between the owners based on the percentage that they own. If the source wine has multiple owners and ownership is specified on the transfer, the owner selected on the transfer will be charged.

In the Services Charges window, the billing items are charged based on their destination batch. Within each destination batch , the billing items are for the volume transferred.

[![](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2018/12/Winery-work-11.jpg)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2018/12/Winery-work-11.jpg)

## Billing for Labor or Time" Billing for Labor or Time

If you’re billing for labor or time, enter the number of hours worked in the Man Hours field of the Service Charges window.

When billing for labor or time on operations that involve multiple batches, the hours are split based on the quantity charged for the batch

For example, suppose you perform a one-to-many transfer where two batches are charged for the transfer of 400 gallons of wine. Batch 1 is charged with 300 gallons, and batch 2 is charged with 100 gallons. Now suppose there was a total of 10 man hours entered. In this example, batch 1 will be charged 7.5 hours and batch 2 will be charged 2.5 hours.

[![](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2018/12/Winery-work-12.jpg)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2018/12/Winery-work-12.jpg)
