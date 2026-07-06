---
id: "32303304202260"
title: "Client Billing Installments"
url: "https://support.vintrace.com/hc/en-us/articles/32303304202260-Client-Billing-Installments"
category: "vintrace Web"
section: "Custom Crush Billing"
created_at: "2024-11-20T15:51:49Z"
updated_at: "2024-12-30T20:09:23Z"
labels: ["billing", "custom crush", "installment", "fruit installment"]
gist: "You can use vintrace to bill your clients in installments for contracted fruit tonnage at harvest."
tags: ["harvest", "configuration", "packaging", "integrations"]
---

# Client Billing Installments

You can use vintrace to bill your clients in installments for contracted fruit tonnage at harvest.

To set up client billing installments, you ‘ll need to [create an installment item](#Adding_Installment_Item) in vintrace, then [update the service order where you want to create the installment](#Adding_Installment_to_Service_Order).

## Adding an Installment Item

You can create installment items from the Winery Setup window (Setup Options > Billing > Items).

To add a new installment item:

1. Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32329060155028) Set Up in the sidebar.
2. Click Client Billing.
3. From the Installment Items tile, click Configure.
4. Click New Installment Item. The Installment Item window displays.

![Installment_Item_Create_20200714.png](https://support.vintrace.com/hc/article_attachments/32329068316564)

5. Specify the details for the installment item, including:

- Code
- Applies To — Select Type or Variety that you want to bill for the installment item, then select the specific items.
- Account — If accounting integration is enabled and you want to send the installment invoices to your accounting package, select the account that’s linked to your accounting package.

6. Click Save.

You can now [update the service order](#Adding_Installment_to_Service_Order) where you want to create the installment.

## Adding an Installment to a Service Order

You can update your service order from the Winery Setup window (Setup Options > Billing > Service Orders).

To add the installment to a service order:

1. Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32329060155028) Set Up in the sidebar.
2. Click Client Billing.
3. From the Service Orders tile, click Configure.
4. Click the service order.
5. Select a Vintage. The vintage is one of the criteria that’s used to search for billable fruit receivals for the installment.
6. For each installment charge that you want to add to the service order, click Add Line beside Installment Charges, then set its Rate and Contracted settings.
7. For each installment you want to add, click Add Line beside Installment Billing Schedule, then set its Date to Invoice and Portion of Contract.

![Update_Service_Order_-_Installment_Billing_Schedule_20200714.png](https://support.vintrace.com/hc/article_attachments/32329068330644)

When you perform a New Invoice Run operation from the Client Billing Console, an invoice will be generated if the installment’s Date to Invoice falls within the selected date range.

8. Click Save.

## Generating Installment Invoices

Generate the invoice as detailed in our [Managing Client Billing Invoices article](https://support.winery-software.com/hc/en-us/articles/360000812855-Managing-Client-Billing-Invoices#CreatingInvoices). The printed invoice includes the details for the installments.

![Printed_Invoice_-_Installment_20200714.png](https://support.vintrace.com/hc/article_attachments/32329060284692)

After you generate the invoice for the installment, you can view the details of the invoice and its installments in the service order. You can also print or reverse the invoice from the Service Order window.

![Update_Service_Order_-_Installment_Billing_Schedule_with_Invoice_Number_20200714.png](https://support.vintrace.com/hc/article_attachments/32329039800980)

## Calculating the Final Installment

The final installment will be based on the actual received fruit minus the contracted weight already billed. The received weight is the sum of all received fruit for the service order’s selected vintage and installment type. This is calculated based on the service order specified in the fruit booking.

![Update_Scale_Booking_-_Service_Order_20200714.png](https://support.vintrace.com/hc/article_attachments/32329039824660)

If the service order isn’t set when the fruit booking is scheduled, it’ll be automatically populated with the service order of the batch to which the fruit was crushed into.

![Update_Service_Order_-_Installment_Billing_Schedule_with_Invoice_Number_20200714.png](https://support.vintrace.com/hc/article_attachments/32329039800980)

When you bill for the final installment the quantity will be the total received weight minus the already-invoiced contracted weight. The printed final installment invoice will show the fruit receival details per installment item.
