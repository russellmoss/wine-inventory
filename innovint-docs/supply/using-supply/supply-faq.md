---
title: "SUPPLY FAQ"
url: "https://support.innovint.us/hc/en-us/supply-faq"
category: "SUPPLY"
section: "Using SUPPLY"
page_type: "page"
lastmod: "2025-11-20"
gist: "There are some common questions that come up when you are exploring SUPPLY."
tags: ["packaging", "ux-friction", "inventory", "integrations"]
---

# SUPPLY FAQ

There are some common questions that come up when you are exploring SUPPLY. Here are some answers!

- [Do my bottling actions in InnoVint's MAKE product create new SKUs in SUPPLY?](#MAKE)
- [Does SUPPLY integrate with Quickbooks?](#QB)
- [I'm a C7 user. I've got wine that is “on order” and sold, but not yet fulfilled (picked up/shipped).](#on-order)
- [Do you support allocations?](#allocations)
- [I've got multiple brands. Can I link more than one C7 account to 1 SUPPLY account?](#brands)
- [I use outsourced fulfillment and logistics providers and have multiple shipping locations. How does that work in SUPPLY with C7?](#outsource)

**Q: Do my bottling actions in InnoVint's MAKE product create new SKUs in SUPPLY?**
A: *Currently, when wine becomes finished, meaning its fully packaged and ready to be sold/stored you’d move it to SUPPLY. "Moving it to SUPPLY" means adding a [new SKU](https://support.innovint.us/hc/en-us/how-to-add-skus?hsLang=en) in SUPPLY, and then performing an [Add Inventory action](https://support.innovint.us/hc/en-us/how-to-add-inventory?hsLang=en) to trigger new inventory from bottling. Bottling actions in MAKE do not automatically trigger this new SKU in SUPPLY.  At this point in time, unwanted case good lots created in MAKE via bottling actions will need to be removed manually to tidy up that inventory.*

*A lot of wineries also have unfinished case goods for a period of time, meaning that there are shiners or lots that need to add packaging using the Add Packaging action in MAKE. Given some of the complexity here, we are working with our customers to ensure they have an appropriate workflow from bottling to finished case goods. The Case Goods Explorer in MAKE will continue to be the solution for “unfinished” case goods. We plan to directly integrate these platforms in the future to make this relationship seamless. Right now, you can check out [this article](https://support.innovint.us/hc/en-us/tracking-case-goods-make-to-supply?hsLang=en) for some recommended workflows.*

**Q: Does SUPPLY integrate with Quickbooks?**
*A: Currently, we do not integrate with Quickbooks (desktop or online). We understand that wineries commonly use Quickbooks for distribution order processing, and we also believe that SUPPLY should be the source of truth for available inventory. Therefore, we currently recommend that orders should continue to be processed through QB, and then manually depleted in SUPPLY. The recommended  frequency varies based on the amount of orders on a weekly/monthly basis.*

*Making depletions in SUPPLY is a streamlined process that allows you to update inventory across locations in a single action, and it generally takes no more than 10-15 minutes (based on order volume) to make these depletions in SUPPLY.*

*![SUPPLY-FAQ-Depletions](https://support.innovint.us/hs-fs/hubfs/SUPPLY-FAQ-Depletions.png?width=688&height=322&name=SUPPLY-FAQ-Depletions.png)*

*In the future, we will be integrating this to help automate and streamline both DTC and 3-tier sales orders, but are not able to share a timeline for the feature.*

**Q: I'm a C7 user. I've got wine that is “on order” and sold, but not yet fulfilled (picked up/shipped).**
*A:  With the [Commerce7 integration](https://support.innovint.us/hc/en-us/supply-commerce7-integration?hsLang=en), SUPPLY automatically depletes inventory once the order is completed (fulfilled in C7). Therefore, any orders that are not fulfilled will still be shown as on hand inventory in SUPPLY. C7 has a report which shows orders not fulfilled and can report on these SKUs to help reconciliation with SUPPLY. We are working towards evolving our integration to designate inventory that is truly available while having an “on order” status for inventory that has already been sold but still needs to be fulfilled/completed.*

**Q: Do you support allocations?**
*A: We understand that wineries often allocate inventory towards specific sales channels (DTC/3-tier) or may further allocate inventory for distributor customers, internal distribution, or future wine club shipments/planning.*

*SUPPLY does not have allocation capabilities yet. We plan to incorporate inventory allocations in the future but it is not available at this time.*

**Q: I've got multiple brands. Can I link more than one C7 account to 1 SUPPLY account?**
*A: Currently SUPPLY can only integrate with a single C7 account instance. Reach out to us with any queries for more complex configurations with multiple brands and/or C7 instances.*

**Q: I use outsourced fulfillment and logistics providers and have multiple shipping locations. How does that work in SUPPLY with C7?**
*A: C7 pairs an order type with 1 pick up and 1 shipping location, and doesn't support multiple shipping locations through the same order type. This means that our integration is also supports only one shipping location as generated from C7.  SUPPLY will deplete from the locations that C7 depletes from.  Typically, wineries who have these multiple shipping locations look at the “fulfillment provider” as one location in C7 and SUPPLY, and use the “fulfillment provider” portal to get more granular inventory spread across fulfillment locations.*
