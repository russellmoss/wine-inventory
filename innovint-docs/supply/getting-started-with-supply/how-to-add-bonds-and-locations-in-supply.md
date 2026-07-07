---
title: "How to Add Bonds and Locations in SUPPLY"
url: "https://support.innovint.us/hc/en-us/how-to-add-bonds-and-locations"
category: "SUPPLY"
section: "Getting Started with SUPPLY"
page_type: "page"
lastmod: "2026-03-23"
gist: "Both bonds and locations must be added on the backend by InnoVint’s Support Team."
tags: ["getting-started", "bond", "inventory", "integrations", "packaging", "barrels"]
---

# How to Add Bonds and Locations in SUPPLY

Both bonds and locations must be added on the backend by InnoVint’s Support Team. We will create these for you at your intial account setup.

Need to add a new bond or location after onboarding? Simply submit a ticket from the Support Center (link in the top right corner), *Subject: Add new bond/location in SUPPLY.*

This article covers:

- [Required information to add a bond](#bond)
- [Required information to add a location](#location)
- [How do I set up my locations?](#how)

If you are just getting started, please consider reviewing and returning t[his template](https://support.innovint.us/hubfs/SUPPLY%20Onboarding%20spreadsheet.xlsx?hsLang=en) to us as it will ensure we have all the required information to create bonds, locations and new users for you.

#### Required Information to Add a Bond

All we need to add a bond to your account is:

- Bond Registry Number
- DBA name
- Legal name, if different

#### Require Information to Add a Location

A location refers to a specific physical space where your finished goods inventory is stored (i.e. in the cellar, in an offsite warehouse, taxpaid closet at the tasting room, etc).

All we need to add a new location is:

- Location Name
- Location Description (optional)
- Tax Status: either In-bond or Taxpaid
  - If the location is "In-bond", please specify the bond in order to link the location to the correct bond.

We *strongly* recommend linking known Commerce7 locations when you first set up SUPPLY and *before* adding inventory to SUPPLY. Please advise InnoVint Support when requesting new locations if you are [integrating with C7](https://support.innovint.us/hc/en-us/supply-commerce7-integration?hsLang=en).

#### How do I set up my locations?

SUPPLY is intended to be the source of truth for all of your on-hand case good inventory - both Taxpaid and In-bond.  Case Good inventory is often spread across multiple locations, i.e. stored in your cellar, fulfillment locations, and tasting rooms.  SUPPLY lets you see the amount of inventory you have available, for each SKU, across multiple locations and tax statuses.

No matter where your wine is physically, compliance-wise these locations must have a tax status - either TAXPAID or IN-BOND. In SUPPLY, a location cannot be both.

- **What is Taxpaid**? Wine that has been taken out of bond after federal excise tax has been paid. Taxpaid wine leaves your bonded inventory, is no longer subject to further excise tax reporting, and is typically intended for sale or consumption.

  **Taxpaid case goods**

  Do you immediately remove your bottled wines from the winery bond as taxpaid and then store them in your taxpaid warehouse for fulfillment? Or do you regularly shift your wines from a bonded storage location into another designated taxpaid location for sale or pouring in the tasting room? Do you store a specific inventory of wine at your winery restaurant?

  Each taxpaid location where you track the overall inventory of your wines should be set up as a Taxpaid location in SUPPLY. In SUPPLY, you can easily see that your Winery Restaurant is low on Chardonnay, and you can arrange to pull inventory from the warehouse to restock.

  Taxpaid locations can not have an affiliated bond. Additions, depletions or movements of inventory within and between these locations will not impact the TTB 5120.17 ("702") report for bonded production.

  - For users with the [Commerce7 integration](https://support.innovint.us/hc/en-us/supply-commerce7-integration?hsLang=en), inventory locations in Commerce7 that contain SKUs should always match up with a locations in SUPPLY (the name does not have to be the same).

- **What is In-bond?** Wine that is held in a bonded winery or bonded wine cellar on which federal excise tax has not yet been paid. It remains under TTB oversight (should be reported on the 5120.17 or "702" report) and must stay in bond until it’s removed for sale, consumption, or further processing.

**In-bond case goods**

If you've just bottled your wines, and they are stacked in the cellar, they are probably in-bond; the cellar is your bonded location for making wine. *Do you need an in-bond location in SUPPLY?*

It depends - when you are relying on SUPPLY to populate [Section B of the TTB Report](https://support.innovint.us/hc/en-us/how-does-supply-populate-the-ttb-report?hsLang=en) (for bottled wines) you can use the [Add Inventory](https://support.innovint.us/hc/en-us/how-to-add-inventory?hsLang=en) action with the reason Bottling into an in-bond winery location. This will map to *line 2, Section B* of the TTB Report export within SUPPLY. If your case goods remain in any bonded location for a period of time prior to their taxpaid removal, it is likely important to have that location set up in SUPPLY.

For example: you bottle at the winery, and then you ship your wine from the winery to a bonded warehouse until release in a few months (or years). If, when you move your wine to that bonded warehouse the "transfer in-bond" box is checked on the BOL, then you should also have an In-bond warehouse location in SUPPLY in order to track that available in-bond inventory. Later on, [inventory can be easily moved](/hc/en-us/how-to-move-or-deplete-inventory?hsLang=en) from any in-bond location to one or more taxpaid locations in SUPPLY. Each of these movements from an in-bond location to a taxpaid location is automatically tracked as Removed Taxpaid for the purposes of the TTB Report export.

These in-bond wines, by virtue of the in-bond definition, should not be tracked in your DTC solution once you have set up SUPPLY. You do not need to track them in C7 anymore - you can keep them properly bonded and accounted for in SUPPLY!
