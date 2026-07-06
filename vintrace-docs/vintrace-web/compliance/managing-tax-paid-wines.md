---
id: "32303294533780"
title: "Managing Tax-Paid Wines"
url: "https://support.vintrace.com/hc/en-us/articles/32303294533780-Managing-Tax-Paid-Wines"
category: "vintrace Web"
section: "Compliance"
created_at: "2024-11-20T15:51:39Z"
updated_at: "2026-06-15T19:48:15Z"
labels: ["estate", "Tax-paid wines", "Tax paid wines", "Tax-paid returned to bond"]
gist: "Tax-paid wines are those that have had the excise tax paid and which must now be kept separate from wines that are in bond (i.e., taxes not yet paid)."
tags: ["compliance", "inventory", "packaging", "configuration", "tax-class", "ttb"]
---

# Managing Tax-Paid Wines

Tax-paid wines are those that have had the excise tax paid and which must now be kept separate from wines that are in bond (i.e., taxes not yet paid). Check with your compliance officer or your legal advisor to determine when the excise tax should be paid and the wine moved/dispatched as tax-paid.

## Setting Up a Tax-Paid Area

You can set up a tax-paid area from the Winery Setup window (Setup Options > Infrastructure > Storage Area).

To set up a new storage area:

1. Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32329023179412) Set Up in the sidebar.
2. Click Locations.
3. From the Storage Areas tile, click Configure.
4. Click New Storage Area.

![Winery_Setup_-_Storage_Areas_-_New_Storage_Area_20200506.png](https://support.vintrace.com/hc/article_attachments/32329023150740)

5. Enter the information for the tax-paid area in the Storage Area window. It’s a good practice to include the tax state in the storage area’s name so that stock isn’t moved to the wrong area.

![Storage_Area_-_Name_with_Tax_State_20200506.png](https://support.vintrace.com/hc/article_attachments/32329023120148)

6. Click Save.

## Managing Tax-Paid Wines

There are some simple rules to keep in mind when dealing with tax-paid stock.

Only the first operation (movement into a tax-paid area, or dispatch as tax-paid) will show on the TTB report. Once a wine or stock item is identified as tax-paid, it’s never again reported on the 5120 report.

For example:

- Wine is bottled on 1/15/2019 into your warehouse and routed to a bonded storage area.
- The wine is immediately moved into a tax-paid storage area.
- The TTB report for January 2019 will show the bottled gallons in the Removed Tax-Paid (line 8) of SECTION B - BOTTLED WINES.
- When the wine is dispatched to a retail customer in February 2019, the dispatch won’t be included in the Removed Tax Paid (line 8) of SECTION B - BOTTLED WINES.

For the most part, when packaging (bottling) or manufacturing, the value specified for the Route To field on the operation should be to a bonded storage area. Next, perform a Move operation from the bonded area to a tax-paid area. The results on the TTB report are the same as the example above where only the first tax-paid operation shows up on the TTB report as *Removed Tax-Paid*.

Dispatches performed as Removed Tax-Paid may be routed from either a bonded or tax-paid storage area.

## Tax-Paid Wines Returned to Bond

On rare occasions, bottled wines on which excise tax has already been paid has to be returned. The most common event is tax-paid wine that’s returned and decanted back to bulk.

To return tax-paid wines to bond you’ll need to perform a stock receival and route the wine into a tax-paid storage area.

![Receive_-_Route_to_Tax-Paid_Area_20200506.png](https://support.vintrace.com/hc/article_attachments/32329013470740)

Then perform a stock movement from the tax-paid area to a bonded area.

![Move_-_Route_to_Bonded_Area_20200506.png](https://support.vintrace.com/hc/article_attachments/32329023168404)

You’ll need to confirm that you want the volume to appear on the TTB report as Taxpaid wine returned to bond.

![Move_from_tax-paid_to_bond3.png](https://support.vintrace.com/hc/article_attachments/32329013371284)

This is how this volume will appear on your TTB report.

![Move_from_tax-paid_to_bond4.png](https://support.vintrace.com/hc/article_attachments/32328996011540)

Wines that have already had their taxes paid and are returned to bond may be eligible for a refund. Check with your compliance officer or your legal advisor.
