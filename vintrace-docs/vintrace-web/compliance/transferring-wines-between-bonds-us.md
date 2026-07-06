---
id: "32303307244308"
title: "Transferring Wines Between Bonds (US)"
url: "https://support.vintrace.com/hc/en-us/articles/32303307244308-Transferring-Wines-Between-Bonds-US"
category: "vintrace Web"
section: "Compliance"
created_at: "2024-11-20T15:52:09Z"
updated_at: "2026-01-29T06:07:53Z"
labels: ["estate", "Change owner", "Change bond via transfer", "transfer from bond to AP bond", "Transfer wines between bonds", "Change batch"]
gist: "By default, all wines will come under a winery bond in vintrace that’s derived from the wine’s location."
tags: ["transfers", "bond", "lot-identity", "compliance", "reporting", "tax-class"]
---

# Transferring Wines Between Bonds (US)

By default, all wines will come under a winery bond in vintrace that’s derived from the wine’s location.

However, AP bonds are derived from the owner of the wine/batch. If the wine is under an AP or composite/non-reporting bond, that bond takes precedence over the winery bond regardless of location (within vintrace).

Movements between bonds in vintrace will impact the 5120 reports for both bonds. The original bond shows a Removed in Bond amount in the Bulk Wine section. The new bond shows a Received in Bond amount in the Bulk Wine section.

You can use the following vintrace operations to transfer wines between bonds:

- [Change Batch](#h_dda13a5e-0c71-4b20-99d0-431993958451)
- [Transfer](#h_62bd8109-c1b0-4495-972a-64e06b37ef2c)
- [Change Ownership](#h_df74f252-038a-4367-8a43-54e41418ccf7)

## Change Batch Operation

The Change Batch operation changes the wine’s name and its owner at the same time.

You can access the Change Batch operation from the Product page by clicking the ![Operations_Icon_20200407.png](https://support.vintrace.com/hc/article_attachments/32329094434324) Operations icon, then clicking Change Batch in the Admin section.

When performing a Change Batch operation, you’ll want to create a new batch by clicking the ![Plus_in_Green_Circle_20200319.png](https://support.vintrace.com/hc/article_attachments/32329104951060) icon beside the To Wine Batch field.

![Change_Batch_-_Add_Wine_Batch_20200528.png](https://support.vintrace.com/hc/article_attachments/32329120047380)

When you create the new batch, you can set the owner to one that has a different bond attached to it. Generally, this will be an AP bond. We recommend that you suffix the names of these owners with AP in the vintrace address book so you can easily identify them.

![Create_Simple_Wine_Batch_-_Bond_2A_2020528.png](https://support.vintrace.com/hc/article_attachments/32329120082324)

After the change batch operation is saved, a warning displays to inform you that the wine will be changing bond.

![Change_bond_clean.png](https://support.vintrace.com/hc/article_attachments/32329094156308)

## Transfer Operation

The Transfer operation is similar to the Change Batch operation, but it involves a transfer to change the wine’s vessel.

You can access the Transfer operation by clicking the ![Operations_Icon_20200407.png](https://support.vintrace.com/hc/article_attachments/32329094434324) Operations icon, then clicking any of the following:

- Transfer/Rack/Blend
- Multi Transfer (Many to One)
- Multi Transfer (One to Many)

In the To section of the Racking window, you’ll need to replace the batch with a new one. Be sure to set the new batch’s owner as the AP owner.

![Racking_-_Transferring_Bond_20200528.png](https://support.vintrace.com/hc/article_attachments/32329105107348)

When you save the Transfer operation, the wine will be moved to the new vessel, batch, owner, and bond. A warning displays to inform you that the wine will be changing bond.

[![Tfr_warning_-_chg_bond.png](https://support.vintrace.com/hc/article_attachments/32329119848596)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2019/01/transfer-2.png)

If the wine is in a barrel group, you can click the ![Location_20200528.png](https://support.vintrace.com/hc/article_attachments/32329109374228) in the Location tile on the Product page to move/relocate barrels.

If the new location is covered by a separate bond, vintrace will ask you to confirm the change of bond. This is most commonly used when moving barrel groups while performing an inter-winery transfer when you have a multi-winery set up. This does not apply to dispatching to a third-party location.

## Change Ownership Operation

The Change Ownership operation lets you change the bond of the wine without changing the batch code or name, but requires an additional step for reporting purposes. It’s best used for batches that contain a single wine component.

To access the Change Ownership operation, click the ![Operations_Icon_20200407.png](https://support.vintrace.com/hc/article_attachments/32329094434324) Operations icon, then click Change Ownership in the Admin section.

From the Change Ownership window, you’ll change the owner to the AP owner. To do this, click the link beside Ownership.

![](https://support.vintrace.com/hc/article_attachments/45774239723540)

From the Ownership Builder window, select the new owner.

When you save the operation, you’ll need to confirm the change of ownership and the changed bond.

![Confirm_change_owner.png](https://support.vintrace.com/hc/article_attachments/32329119939732)![Tfr_warning_-_chg_bond.png](https://support.vintrace.com/hc/article_attachments/32329119848596)

After the operation is completed, you’ll need to perform a Measurement operation on the wine without changing the volume (zero loss/gain); just enter the date/time then click Save. The Measurement operation is important for reporting purposes as it locks in the bond change as of the date/time measurement.

## Transferring from Another Bond to AP Bond

When you’re changing from a custom crush owner, another AP02 owner, or non-tracking (composite bond) to a regular AP02, the Change Owner operation is the most straightforward method and shows the correct entries for the two 5120 reports.

For this type of bond change, it’s important to perform a Measurement operation without changing the volume (zero loss/gain). Simply enter the date/time into the Measurement window, then click save. This locks in the bond change as of the date/time measurement.
