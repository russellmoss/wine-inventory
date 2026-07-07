---
id: "32303305784724"
title: "Managing Wines for Your Tasting Room"
url: "https://support.vintrace.com/hc/en-us/articles/32303305784724-Managing-Wines-for-Your-Tasting-Room"
category: "vintrace Web"
section: "Compliance"
created_at: "2024-11-20T15:51:52Z"
updated_at: "2024-12-05T17:35:40Z"
labels: ["estate", "tasting room stock"]
gist: "When you receive your basic bond from the TTB, you have a concurrent bond which covers your tasting room if it’s part of the winery bonded area."
tags: ["dtc-sales", "bond", "configuration", "tax-class", "compliance", "inventory"]
---

# Managing Wines for Your Tasting Room

When you receive your basic bond from the TTB, you have a concurrent bond which covers your tasting room if it’s part of the winery bonded area.

## Transferring in Bond

There are two reasons wine will transfer to the tasting room in bond: to be sold, or for tastings. You use the bond in transfer to delay paying excise until the wine is used up for tastings, or sold from the tasting room.

To set this up, you’ll need to do the following:

1. Set up your tasting room as a customer in the [address book](https://support.vintrace.com/hc/en-us/articles/32301367488788). To access the address book, select More Options from the sidebar, then click Address Book.

![Tasting_Room_Customer_20200507.png](https://support.vintrace.com/hc/article_attachments/32329074503060)

2. Set up your tasting room as a building owned by your winery. You can do this from the Winery Setup window (Setup Options > Infrastructure > Winery Building).

![Winery_Building_Create_-_Tasting_Room_20200601.png](https://support.vintrace.com/hc/article_attachments/32329074569236)

3. Create a new storage area in the tasting room building with its Tax State set to *Bonded*. You can do this from the Winery Setup window (Winery Setup > Infrastructure > Storage Area). It’s a good practice to include the tax state in the storage area’s name so that stock isn’t moved to the wrong area.

![Storage_Area_Create_-_Tasting_Room_20200604.png](https://support.vintrace.com/hc/article_attachments/32329028395284)

4. Set up a Used for Tasting adjustment reason. You can do this from the Winery Setup window (Setup Options > Manufacturing > Adjustment Reason).

![Stock_Adjustment_-_Used_for_Tasting_20200601.png](https://support.vintrace.com/hc/article_attachments/32329028362644)

Once moved into the tasting room in bond, your wines that are used for tastings can be adjusted using the *Used for Tasting* reason.

These adjustments will be under Used for Tasting (section B) of your [TTB report](https://support.vintrace.com/hc/en-us/articles/32303269223316).

It’s not uncommon for tasting rooms to run weekly or monthly sales and consumption reports, or maintain a hand-written inventory list or Excel spreadsheet. You may use these reports after the fact to adjust your tasting room stock to reconcile sales and tasting pours. You’ll want to ensure that you’re able to cut off these entries by the end of each of your TTB reporting periods by [adjusting the stock](https://support.vintrace.com/hc/en-us/articles/32303269835156). The adjustment will be for 0 volume which will be used to register the Adjustment Reason, *Used for Tasting*.

## Transferring to Tax-Paid Area

If your tasting room has a tax-paid area, set up a storage area in vintrace with its Tax State set to *Taxpaid*.

![Storage_Area_Create_-_Tasting_Room_Tax_Paid_20200604.png](https://support.vintrace.com/hc/article_attachments/32329045997460)

You’ll [move wines](https://support.vintrace.com/hc/en-us/articles/32303355248916) from a bonded area into this tax-paid area, then dispatch wines for sale and tasting as tax-paid from this location.

You can use this tax-paid storage area when you want to pay your excise taxes as soon as wine is transferred to the tasting room, instead of waiting to adjust for tasting or dispatching tax-paid for tasting room sales.

## Dispatching from the Tasting Room

When you’re ready to remove wine from the tasting room’s stock, the operation is the same regardless of whether wine is being stored in bonded, or tax-paid storage.

Only the first operation (i.e, movement into a tax-paid area, or dispatch as tax-paid) will be on the TTB report for that period. Once a wine/stock item is identified as tax-paid, it won’t ever be reported on the 5120 report again.

If you have any questions, contact your compliance officer, legal adviser, or the TTB.
