---
id: "32303294668436"
title: "Billing for Tank and Barrel Storage, Hire, and Hosting"
url: "https://support.vintrace.com/hc/en-us/articles/32303294668436-Billing-for-Tank-and-Barrel-Storage-Hire-and-Hosting"
category: "vintrace Web"
section: "Custom Crush Billing"
created_at: "2024-11-20T15:51:41Z"
updated_at: "2024-12-30T19:51:45Z"
labels: ["wp-page-2617", "customcrush", "custom crush"]
gist: "You can bill your clients for a number of storage and hosting scenarios."
tags: ["barrels", "harvest", "configuration", "cost", "exports", "migration"]
---

# Billing for Tank and Barrel Storage, Hire, and Hosting

You can bill your clients for a number of storage and hosting scenarios. With the flexibility that vintrace provides, you can mix and match these scenarios to meet the needs of your pricing schedules.

Below is a matrix of the different charge types for storage, hire, and hosting, and their applications in vintrace.

|  |  |  |  |
| --- | --- | --- | --- |
|  | **Storage charge** | **Hire charge** | **Barrel hosting** |
| Per volume per period | Yes | No | No |
| Per vessel fixed charge per period | No | Yes | Yes |
| Bill for empty vessels | No | No | Yes |
| Monthly utility to use | Wine storage | Wine storage | Hosting charges |

## Configuring Storage Charges

Before you can generate storage charges, you’ll need to do the following:

1. Decide whether you want to bill customers with a per day, or a per month rate. By default, vintrace will charge per day. If you’d prefer your charges to accumulate on a per month rate, [contact our support team](https://support.winery-software.com/hc/en-us/requests/new). Vintrace will calculate applicable storage rates using a pro-rata formula for wines held for part of a month.
2. Configure tank and barrel categories. Your categories should group the different vessels together by the same storage rate; typically this is done by size. For example, you might create categories such as “5 to 9kL” and “>10kL”. After you’ve created the categories, you’ll need to link them to the vessels. This is best done using the Import/Export functionality for tanks and barrels.
3. [Create your billing items](https://support.vintrace.com/hc/en-us/articles/32303340023316) based on how you bill your customers:

- [Wine storage by volume](#h_01ECTJ38VCHPP6EQ6C1HRSGVTN)
- [Vessel hire (fixed rate per vessel)](#h_01ECTJAS21YAQ67BJEKD7P10CZ)
- [Barrel hosting](#h_01ECTJ9RN5HTN0BJGCH9WHX9NE)

Then, add the billing item to the appropriate [price lists](https://support.vintrace.com/hc/en-us/articles/32303296160916).

### Wine Storage by Volume

If you bill your customers based on the volume held in a vessel, you’ll need to set the billing item’s Charge Type to *Volumetric*.

![Update_Billing_Item_-_Item_-_Charge_Type_Volumetric_20200709.png](https://support.vintrace.com/hc/article_attachments/32329036736916)

You’ll also need to select the vessel categories you want to charge for using this method from the Storage Links tab’s Wine Storage section.

![Update_Billing_Item_-_Storage_Links_-_Wine_Storage_20200709.png](https://support.vintrace.com/hc/article_attachments/32329036806548)

### Vessel Hire (Fixed Rate Per Vessel)

If you bill your customers using a fixed rate per vessel, you’ll need to set the billing item’s Charge Type to *Fixed*.

![Update_Billing_Item_-_Item_-_Charge_Type_Fixed_20200709.png](https://support.vintrace.com/hc/article_attachments/32329036681620)

You’ll also need to select the appropriate values from the Storage Links Tab’s Vessel Hire section.

![Update_Billing_Item_-_Storage_Links_-_Vessel_Hire_20200709.png](https://support.vintrace.com/hc/article_attachments/32329015397780)

You can now add the billing item to your price list and enter the fixed amount you want to charge per vessel in use.

To bill for empty vessels, refer to the [Barrel Hosting Charges section](#h_01ECTJ9RN5HTN0BJGCH9WHX9NE).

If you’re charging a different fee per month for different vessel types, we recommend setting up multiple billing items. For example, if you charge one rate for kegs and another rate for barrels, you’d set up a billing item for each.

### Barrel Hosting Charges

Barrel hosting charges apply when you host client barrels onsite and want to bill them for the storage of those barrels, regardless of whether they’re full or empty. To do this, set the billing item’s Charge Type to *Per Barrel*.

![Update_Billing_Item_-_Item_-_Charge_Type_Per_Barrel_20200709.png](https://support.vintrace.com/hc/article_attachments/32329036699412)

You can select the appropriate values from the Storage Links Tab’s Barrel Hosting section.

![Update_Billing_Item_-_Storage_Links_-_Barrel_Hosting_20200709.png](https://support.vintrace.com/hc/article_attachments/32329015417364)

After adding the billing item, you can add it to the price lists with the price per vessel. You’ll also need to ensure that you’re tracking the time a barrel is onsite. You can do this by updating the barrel and specifying the details in the Tracking tab.

![Barrel_Update_-_Tracking_20200709.png](https://support.vintrace.com/hc/article_attachments/32329041809556)

Barrels that don’t have a Time Out value are considered active, while barrels with a Time Out value are considered inactive. Barrels will only generate charges if they have a Time In value. If you need help adding this information to your barrel, contact the vintrace support. When barrels change from active or inactive, you’ll be prompted to specify the date the barrel arrived or left the site.

![Barrel_Status_Change_-_Required_Field_Window_20200709.png](https://support.vintrace.com/hc/article_attachments/32329041835028)

## Generating Charges

You’ll need to generate charges to your customers each billing period for their use of your vessels. The method that you use to generate charges will depend on the method of billing.

|  |  |
| --- | --- |
| **Method of Billing** | **Generate Charges Using** |
| [Wine Storage](#h_01ECTJ38VCHPP6EQ6C1HRSGVTN) | [Wine Storage Charge Generator](#h_01ECTJQBTCZH9KRBJNPDDA65CG) |
| [Vessel Hire](#h_01ECTJAS21YAQ67BJEKD7P10CZ) | [Wine Storage Charge Generator](#h_01ECTJQBTCZH9KRBJNPDDA65CG) |
| [Barrel Hosting](#h_01ECTJ9RN5HTN0BJGCH9WHX9NE) | [Barrel Hosting Charge Generator](#h_01ECTJRM9S1TJG05VJZZET6ZKD) |

Each billing period you will need to generate charges for the use of your vessels to be billed to your customers.

### Wine Storage Charge Generator

The Wine Storage Charge Generator is used for both the Wine Storage and Vessel Hire billing methods.

![Wine_Storage_Charge_Generator_20200709.png](https://support.vintrace.com/hc/article_attachments/32329041892500)

To use the Wine Storage Charge Generator:

1. Select ![More_Options_20200323.png](https://support.vintrace.com/hc/article_attachments/32328997612820) More Options from the sidebar.
2. From the Client Billing tile, click Wine Storage Charges.
3. Specify the date range for which you want to generate charges. You can also filter the charges by the service order or owner.
4. Click Determine Charges.
5. Edit the quantity, unit price, subtotal, or notes if needed. You can also remove a charge by clicking the ![X_in_Gray_Circle_20200330.png](https://support.vintrace.com/hc/article_attachments/32329015502484) beside it. The Notes field displays the calculated quantity. For Wine Storage, this will be the average volume on hand for the period. For Vessel Hire, this will be the quantity of the vessels used.
6. Click Save. This will add them to the service order that’s ready to be raised on an invoice.

### Barrel Hosting Charge Generator

The Barrel Hosting Charge Generator is used for the Barrel Hosting method of billing your customers.

![Barrel_Storage_Charge_Generator_20200709.png](https://support.vintrace.com/hc/article_attachments/32328997631252)

To use the Barrel Storage Charge Generator:

1. Select ![More_Options_20200323.png](https://support.vintrace.com/hc/article_attachments/32328997612820) More Options from the sidebar.
2. From the Client Billing tile, click Barrel Hosting Charges.
3. Specify the date range for which you want to generate charges. You can also filter the charges by the service order or owner.
4. Click Determine Charges.
5. Edit the days, barrel count, quantity, or unit price if needed. You can also remove a charge by clicking the ![X_in_Gray_Circle_20200330.png](https://support.vintrace.com/hc/article_attachments/32329015502484) beside it.
6. Click Save. This will add them to the service order that’s ready to be raised on an invoice.
