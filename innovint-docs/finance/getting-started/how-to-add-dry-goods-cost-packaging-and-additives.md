---
title: "How to Add Dry Goods Cost (Packaging and Additives)"
url: "https://support.innovint.us/hc/en-us/articles/assigning-costs-to-drygoods-batches"
category: "FINANCE"
section: "Getting Started"
page_type: "article"
lastmod: "2025-11-20"
gist: "In InnoVint, \"Dry Goods\" is used as a catch all term for both additive products consumed in wine, and packaging products consumed in bottling actions."
tags: ["cost", "packaging", "additives", "getting-started", "inventory", "lot-identity"]
---

# How to Add Dry Goods Cost (Packaging and Additives)

In InnoVint, "Dry Goods" is used as a catch all term for both additive products consumed in wine, and packaging products consumed in bottling actions.  Dry Goods inventory is added and tracked via the Dry Goods Explorer. For our general overview on using the Dry Goods module, check out the support article [here](https://support.innovint.us/hc/en-us/articles/360034896692-navigating-the-additive-explorer?hsLang=en).

You can track your dry goods costs (encompassing packaging and additives) by using either direct or indirect cost allocations.

This article covers:

- [When to use direct or indirect costs for dry goods](#Direct-or-indirect)
- [Adding Direct Cost](#Adding_and_editing_costs)
  - [Calculating costs per batch](#Calculating_costs_per_batch)
- [Adding Indirect Cost](#indirect)
- [Frequently Asked Questions (FAQ)](#FAQ)

### When to use direct or indirect costs for dry goods

You can track your dry goods costs (both packaging and additives) using either direct or indirect cost allocations.

***Direct Costs** - these are the tangible components of making wine whose costs can be set prior to consumption within InnoVint.*

***Indirect Costs** - these are typically overheads that are capitalized across the bulk inventory at a chosen time.*

By and large, because of the large proportion of lot cost that arises from SKU specific packaging, we most often recommend using direct costs for packaging - this allows allocation of higher grade bottle or cork prices to the appropriate wine. However, we also have the cost category "Packaging (cost item)," should you prefer to utilize indirect cost and spread packaging costs across multiple wines. Find out about how your packaging cost entry choice impacts reporting on your finished goods packaging costs [here](https://support.innovint.us/hc/en-us/cogs-and-dry-goods-tracking?hsLang=en#packaging-cost-finished-CG).

For additives, due to the generally small overall impact to lot cost,  many users prefer a simple method, spreading (capitalizing) additive costs for a specific period of time over multiple lots using the cost category "Additions (cost item)."  However, additive cost is also supported by both methodologies, and some users prefer to add direct cost via each additive batch.

**Consistency is the key; coordinate with your accountant to choose the best method for you.**

We often recommend onboarding with production leading dry goods input (receive the quantity) with finance controlling cost inputs. However, communication is key!

It is always a good idea to coordinate with your accountant to confirm who will enter the correct direct cost on the batches, and how information on final invoicing vs applicable batches is communicated between the accounting and winemaking teams.

### Adding Direct Costs

When using direct costs, costs for dry goods inventory can be set in the 'Receive' action of a dry goods batch. Find out more about how to receive dry goods inventory [here](https://support.innovint.us/hc/en-us/articles/115000825066-how-to-create-additives-and-additive-batches?hsLang=en).

When costs are added to dry goods batches, it enables you to **directly** allocate unit costs from that specific product batch.  InnoVint applies the cost per unit of the selected batch to the appropriate lot(s) whenever dry goods are depleted within Addition, Bottling en Tirage, or Bottling  actions.

- In the case of additives, the cost is proportionally distributed downstream to any and all lots that receive volume from the original lot.
- Packaging (direct) costs are normally applied to the finished goods costs at the time of bottling, but may be accrued on a bulk wine lot via the [Bottling en Tirage](https://support.innovint.us/hc/en-us/articles/360051230671-bottling-en-tirage-?hsLang=en) action.

To learn more about the cost distribution of dry goods, go to [this article](https://support.innovint.us/hc/en-us/cost-distribution-rules?hsLang=en) about the system rules for cost distribution in InnoVint.

Direct costs are added to a batch of product as part of the 'Receive Additive' or 'Receive Packaging' action by entering the quantity of the item received, and total cost. InnoVint calculates the cost per unit/item of the received inventory from this information. *This unit cost is allocated to lots through any action that utilizes the corresponding batch.*

*![How to Add Dry Goods Cost-rcv](https://support.innovint.us/hs-fs/hubfs/How%20to%20Add%20Dry%20Goods%20Cost-rcv.webp?width=688&height=627&name=How%20to%20Add%20Dry%20Goods%20Cost-rcv.webp)*

Due to the way InnoVint [calculates unit cost](#Calculating_costs_per_batch), our best recommendation is to create a **new unique batch when there are different costs per batch**. The manufacturer batch ID may remain the same, but the batch ID can be unique within the product to distinguish similar batches by cost.

#### Add costs now or later

When entering direct costs, keep in mind that you may want to also consider final invoiced costs that might be included on an item, such as freight or hazardous materials handling, that may apply to the dry good (versus your initial quoted price). So, if you are still waiting on that final invoice, you can always submit the action to add your inventory into InnoVint and then enter the cost at a later time.

Costs recorded on an existing 'Receive' action can be edited at any time, subject to the winery action backdate lock (editing cost on the Receive Dry Good action is not subject to the cost action backdate lock).

To find the 'Receive' action in the batch history go to the Batch details page, or you can find the action url via the Additive or Packaging History Report.

![How to Add Dry Goods Cost-history](https://support.innovint.us/hs-fs/hubfs/How%20to%20Add%20Dry%20Goods%20Cost-history.webp?width=605&height=218&name=How%20to%20Add%20Dry%20Goods%20Cost-history.webp)

Enter or edit the cost of the item in the "Total Cost" input field and click on "Update Receive Dry Goods action" to save these edits.

![How to Add Dry Goods Cost-edit](https://support.innovint.us/hs-fs/hubfs/How%20to%20Add%20Dry%20Goods%20Cost-edit.webp?width=596&height=290&name=How%20to%20Add%20Dry%20Goods%20Cost-edit.webp)

Any time that costs are added or edited on a 'Receive' action, all related actions involving the batch will update with the new costs. For example, if an additive batch was used last week for an addition but the costs were entered this week, the associated cost of the addition from last week will update to reflect the changes. (Note: You might not see the cost change immediately upon editing. It may take some time for InnoVint to recalculate the new costs.)

We recommend that the cellar be trained to consume batches accurately in order to preserve accurate unit costs. InnoVint does not automatically consume batches on a First in/First out basis, but requires the user to select a specific batch to consume against a lot.

#### Calculating costs per batch

The total cost per batch is the sum of all costs entered across all 'Receive' actions recorded on the batch. InnoVint uses the total cost per batch and the total amount received to determine the cost per item/unit of the batch.

Example:

- 20kg of Tartaric Acid, Batch X was received on Jan. 1, 2021.
  - The total cost of the 'Receive' action was $100.
  - The calculated cost per unit of the 'Receive' action is $5/kg.

Assume that several additions were made using Batch X.

- Then, on June 15, 2021 an additional 50kg of Tartaric Acid was received into Batch X.
  - The total cost of the second delivery was $197.50.
  - The calculated cost per unit of the 'Receive' action is $3.95/kg.

At this point, Batch X has received a total of 70kg for a total cost of $297.50.

- The new cost per unit for Batch X is $4.25/kg.

In this scenario, all previous and future additions will apply a cost of $4.25/kg. Additions recorded before June 15, 2021 will update to reflect the change.

If you are purchasing materials over time, we recommend always creating a fresh batch if the pricing may change for future purchases. This maintains the correct pricing of your original batch.

### Adding Indirect Cost

Dry Goods costs can also be applied to a juice or wine lot indirectly as an overhead cost item, rather than setting the cost per unit of the dry goods batch. To add as a cost item, use the applicable cost category of, "Packaging (Cost Item)" or "Additions (Cost Item)."

Follow the instructions [here](https://support.innovint.us/hc/en-us/allocate-costs-indirect-direct?hsLang=en) to add a cost item for your packaging or additives.

#### Additives

- If you are using indirect cost for additives, we most often recommend adding your total purchases for a span of time (such as would be tracked within a specific cost center in your accounting software), and entering the total additive costs for a given period. This is a simpler method than trying to record cost items every time you receive an invoice.

#### Packaging

- If you are using indirect cost for packaging, be aware that the indirect cost is applied proportionally to all lot contents (i.e. all volume associated to the lot code).

  *For example*, if you are bottling only 500 gallons from Tank 1 of a 2,000 gallon Lot A that is in multiple tanks, and apply indirect packaging to Lot A prior to bottling, then the packaging cost is applied to all 2,000 gallons of Lot A, regardless of vessel. In this case, we recommend [splitting](https://support.innovint.us/hc/en-us/how-to-split-a-lot?hsLang=en) the lot into a unique bottling lot when a lot will be partially bottled.
- Indirect costs added to the bulkjuice/wine lot *prior to the point of bottling*, will be reflected on the Bottled Costs Report.  Find more details on the Bottled Cost Report [here](https://support.innovint.us/hc/en-us/cost-reports?hsLang=en#bottled). Any costs added to the finished **case good** **lot**(s) - either as indirect cost items (including packaging), or additional packaging added via an Add Packaging action - will not be included on the Bottled Costs Report.

### FAQ

**Q. What if I don't want to use the average cost per batch?** (eg I received a second delivery of Batch X at a much higher cost and want to keep the costs separate from the first delivery.)

*A. Our best recommendation is to create a new batch to accommodate separate costs. The manufacturer batch ID can remain the same, but the batch ID must be unique within the product.*

![How to Add Dry Goods Cost-batches](https://support.innovint.us/hs-fs/hubfs/How%20to%20Add%20Dry%20Goods%20Cost-batches.webp?width=688&height=125&name=How%20to%20Add%20Dry%20Goods%20Cost-batches.webp)

**Q. Can I add a cost after I've already received the Dry Good?**

*A. Yes, costs can be added to Dry Goods after the batch has been received and partially depleted. To add a cost, find the "Receive Dry Good" action in the batch history. Click "Edit action" in the upper right-hand corner of the action. Only Admins on the account can edit this action. Enter a cost for the whole batch into the "Total Cost" input field and "Update Receive Dry Goods action" to save these edits.*

*![How to Add Dry Goods Cost-edit cost](https://support.innovint.us/hs-fs/hubfs/How%20to%20Add%20Dry%20Goods%20Cost-edit%20cost.webp?width=621&height=342&name=How%20to%20Add%20Dry%20Goods%20Cost-edit%20cost.webp)*

*This will apply costs across all depletion actions for that batch.*

*Alternatively, an Admin can "Receive more" of a single batch of a particular Dry Good to add costs. Enter in "Zero" in the amount received, and the cost of the batch into the "Total cost" field.*

*![How to Add Dry Goods Cost-rcv cost](https://support.innovint.us/hs-fs/hubfs/How%20to%20Add%20Dry%20Goods%20Cost-rcv%20cost.webp?width=688&height=247&name=How%20to%20Add%20Dry%20Goods%20Cost-rcv%20cost.webp)*

*This will retroactively apply costs to all depletion actions for the history of that dry good.*

**Q: How do I report on my finished goods packaging cost?**

*A: You can find the packaging cost applied to your finished case goods in a few ways, depending on how you recorded those costs. Get more information [here](https://support.innovint.us/hc/en-us/cogs-and-dry-goods-tracking?hsLang=en#packaging-cost-finished-CG). We recommend clearly communicating with your accountant and or finance team as to where packaging should be reported for your final COGS, as this will advise how and when packaging costs should be applied to bulk wine or case good lots.*

**Q: How can I reconcile my Dry Goods Inventory costs?**

*A: To get the total cost of your materials on hand as of a point in time, we recommend using the Additive History Report or Packaging History Report.  Here are a [few options](https://support.innovint.us/hc/en-us/cogs-and-dry-goods-tracking?hsLang=en#cost_on_hand) to get the quantity and cost on-hand.*
