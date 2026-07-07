---
title: "FINANCE Best Practices for Small Producers"
url: "https://support.innovint.us/hc/en-us/cogs-tracking-best-practices-for-small-producers-dont-be-fancy"
category: "FINANCE"
section: "Guidance & FAQ"
page_type: "page"
lastmod: "2025-11-20"
gist: "By Peter Stegner - Owner/Winemaker/InnoVint User, Parea Wines."
tags: ["cost", "vineyard", "ux-friction", "harvest"]
---

# FINANCE Best Practices for Small Producers

## "Don't be fancy" - Small Winery CFO

*By Peter Stegner - Owner/Winemaker/InnoVint User, Parea Wines*

Using InnoVint’s FINANCE functionality, it is possible for small producers, particularly those working out of shared or custom crush facilities, to arrive at accurate COGS for the wines they produce with a minimal amount of time and effort.

I devote four - eight hours per year to COGS tracking, and am confident that my COGS are quite accurate. The keys to success are accurate and precise production data, access to all of the real costs (accounting software, invoices, bank statements, etc.), a consistent and intentional approach to cost entry, and embracing simplicity wherever possible.

### **Adding Costs**

#### [**Fruit Costs**](https://support.innovint.us/hc/en-us/articles/assigning-fruit-costs?hsLang=en)

InnoVint supports both direct and indirect cost allocation for the cost of fruit. There are good reasons why one might choose one method over the other, and ensuring accuracy requires making the right decisions based on the circumstances.

[**Direct cost allocation**](https://support.innovint.us/hc/en-us/articles/assigning-fruit-costs?hsLang=en#how) for fruit, usually via the fruit cost worksheet, is easy and accurate in many circumstances:

- Fruit Cost is contracted on a *per block* basis - the cost is straightforward to calculate and is simple to apply, using either the Fruit Cost Worksheet or the Contracts module. The cost can be applied to a vineyard block either before the fruit arrives or long after the fact.
- Fruit Cost is contracted on a *per acre* basis and the acres to be received are known before harvest - the cost is straightforward to calculate and is simple to apply, using either the Fruit Cost Worksheet or the Contracts module. The cost can be applied to a vineyard block either before the fruit arrives or long after the fact. (It probably goes without saying, but it's critical that the acreage per the grower matches the acreage entered in InnoVint.)
- Fruit Cost is contracted on a *per ton* basis and the grower accepts the winery’s weight (it's critical that the weight entered in InnoVint and the weight used by the grower to calculate their invoice are the same).

[**Indirect cost allocation**](https://support.innovint.us/hc/en-us/articles/assigning-fruit-costs?hsLang=en#indirect) for fruit, via *add cost* actions, is more accurate and convenient in other circumstances:

- Fruit Cost is contracted on a *per ton* basis, but the amount charged by the grower is based on a weight obtained at the vineyard - in this situation, the weight used to calculate the price of the fruit is often not the same as the weight received in InnoVint. If the invoiced weight will not be equal to the weight received in InnoVint, then InnoVint’s calculated fruit cost will not tie out with the invoiced amount. When that is the case, use an add cost action to assign the invoiced cost of fruit to the applicable fruit lots, at a time when the fruit lots have active weight.
- Fruit is from an *estate vineyard* - InnoVint does not support detailed vineyard cost tracking. In many cases, it is easier to track vineyard costs outside of InnoVint. After fruit is received in the system, an externally calculated cost can be assigned to the specific fruit lot using an *add cost* action. This is not to say that costs from an estate vineyard can't be applied directly, some people calculate a *per acre* cost for their estate and apply that directly, but many users apply the cost of estate fruit with *add cost* actions.

**Tip:** The cost of trucking for fruit can be added indirectly using an *add cost* action - use either Fruit (Cost Item) or Freight as the cost category, and spread proportionally across the fruit lots that were shipped together.

📌 **Note:** Indirect fruit costs will not be reported in the Fruit Cost Report

#### [**Packaging Costs**](https://support.innovint.us/hc/en-us/articles/assigning-costs-to-drygoods-batches?hsLang=en)

While InnoVint supports both direct and indirect cost allocation for packaging items, if you are tracking your packaging inventory in the platform, it makes the most sense to allocate that cost directly. You can enter the cost of your packaging in the Dry Goods Explorer, either when you receive the inventory or after the fact, and the appropriate amount of cost will be added to each lot when packaging is added, based on the quantity consumed in the action. You can add packaging as part of a bottling action, or to any case goods lot via an add packaging action.

Packaging is typically one of the largest cost centers for any wine, so I prefer the precise nature of InnoVint's direct cost allocation method in this case. Furthermore, I like to add all direct packaging costs as part of the bottling action, so that those costs will be included in the Bottled Cost Report.

#### [**Additive Costs**](https://support.innovint.us/hc/en-us/articles/assigning-costs-to-drygoods-batches?hsLang=en)

Additive costs can also be added either directly, via the Dry Goods Explorer and *addition actions*, or they can be added indirectly, as overheads. Choose which option is best for your operation based on a conversation with your accountant, but I tend to lean toward the easier option of applying the cost as an overhead in the month that the money is spent.

Since additives are such a small cost center for most wines, and as I assume that the additions to the majority of my wines are fairly similar, I prefer to allocate the cost and be done with it. I allocate total additive costs on a monthly basis, and apply them proportionally to all of the bulk wine in the cellar.

#### [**Overhead Costs**](https://support.innovint.us/hc/en-us/allocate-costs-indirect-direct?hsLang=en)

In winery COGS tracking, overhead costs are the “soft costs” that represent all of the non-material costs that go into making your wine. What they are and how complicated they are will depend on your circumstances (do you own a small winery, or do you produce wine in a custom crush facility?). Overheads should be entered into InnoVint via indirect *add cost* actions, from the COGS Tracking Explorer. They should be entered regularly, using the same set of InnoVint cost categories each period, for your recurring costs.

When approaching overhead costs, start by choosing several InnoVint cost categories into which your recurring costs could fit. Review your bookkeeping software or bank statements and map those recurring costs to the categories you’ve chosen. For example, if you work in a custom crush facility, find all the fees you paid your facility during each cost period, and assign those to the category Custom Crush. If you own a small winery, identify all the recurring costs that go into keeping your building running (rent or mortgage, electric bill, water bill, waste management, etc.), and assign those costs to the Overhead category. Identify all costs associated with analysis, internal and external, and map those costs to the category Lab Analysis. Then, once a quarter or so, go through your financial records and total up the costs that should be assigned to each category for each complete month. Once you have those numbers, you can make one entry per category in InnoVint for each month, and distribute that cost proportionally across all of your bulk volume.

The goal with approaching overheads this way is to embrace simplicity, avoid entering every invoice in InnoVint, and avoid mapping every cost to the specific lot or lots involved. Doing so can be extremely time consuming and is rarely worth the effort. As one wine industry financial expert explained to me, these costs represent a very small percentage of the total cost of production, and specific allocation vs. the blanket approach explained above only makes a difference of a few cents per bottle, at the end of the day. As they put it, “Don’t spend $200 to find $0.25.”

For my wines, which I produce at a custom crush facility, I use the cost categories Custom Crush, Lab Analysis, Other, and Overhead. All of the fees I pay to my host winery go under Custom Crush, and are distributed across my bulk volume. The costs associated with my laboratory analysis go, shockingly, under Lab Analysis, and I simply total those costs every month and distribute them proportionally across all my wines. Overhead, I use for miscellaneous purchases like barrels, kegs, and additives (I use very few), and Other, I use for bottling expenses (mobile cross-flow filtration, mobile bottling, bottling line labor, etc.). The *only* category I allocate to specific wine lots is Other, which goes to the lots being bottled.

### [**Cost Reconciliation**](https://support.innovint.us/hc/en-us/cost-reports?hsLang=en)

Once you’ve entered your costs into InnoVint, it’s important to make sure that they’re all accounted for, so a regular process of reconciliation between your accounting software and InnoVint is crucial. This ensures that all of the money spent to make your wine is contributing to your COGS.

#### **Direct Fruit Cost Reconciliation**

The [Fruit Cost Report](https://support.innovint.us/hc/en-us/cost-reports?hsLang=en#fruitcost) is a go-to tool to reconcile the direct fruit cost applied in InnoVint for a vintage with the actual, invoiced cost of your fruit. Found in the COGS Tracking Explorer, the Fruit Cost Report is an export that lists direct costs applied to each fruit lot, along with varietal, vineyard, grower, etc., for those lots. One can easily compare total direct fruit cost in InnoVint with actual fruit cost. If there is a discrepancy between actual fruit cost and direct fruit cost in InnoVint, that difference can be found by applying filters to the Fruit Cost Report using your spreadsheet program of choice, and filtering by vineyard, grower, or whatever is helpful. Once the discrepancy has been identified, it can be balanced, or “trued up,” either by using an indirect cost entry or editing the originally entered direct cost.

#### [**Direct Additive and Packaging Cost Reconciliation**](https://support.innovint.us/hc/en-us/cogs-and-dry-goods-tracking?hsLang=en)

Direct additive and packaging cost can be slightly more complicated to reconcile than direct fruit cost. The best reports to use for reconciliation are the Additive and Packaging History Reports (found in the Report Explorer for MAKE Plus subscriptions only), which can be exported for a specific period of time. These reports show detailed information regarding costs added to inventory and costs applied to lots (removed from inventory) during a specified period. Used in conjunction with the Dry Goods Explorer export you can surface the total dry goods cost on hand at the end of the period in question. Those numbers can be used to reconcile your total cost outlay and cost remaining in inventory for the period.

However, if those reports are not available to you, it’s necessary to export your Dry Goods Explorer regularly (I recommend doing it on the last day of every month), to evaluate the change over the cost period. The Explorer export does not break things down by batch, so there is somewhat less visibility than there is on the two “history” reports. If you only use direct costing for packaging, and add packaging as part of bottling actions, then the Bottled Cost Report will also be useful for reconciliation.

If you find any discrepancies, possibly due to human error when entering costs or differences between estimated and invoiced costs, they can be trued up either by editing the direct costs associated with the product(s), or by using add/remove cost actions.

#### **Indirect, “Overhead,” Cost Reconciliation**

Indirect costs are relatively easy to reconcile using the [Cost Item Report](https://support.innovint.us/hc/en-us/cost-reports?hsLang=en#costitem), found in the COGS Tracking Explorer. Filter for the cost period in which you’re interested, export the report, and then calculate the total cost added to InnoVint to check for any discrepancy with your account statements. If there is one, you can filter further by cost category, after which it should be simple to see the discrepancy itself, and true it up either by making a new entry or editing the entry that is incorrect.

### **Takeaway**

COGS tracking in InnoVint doesn’t need to be complicated in order for you to arrive at per bottle costs that are accurate enough to be tremendously valuable from an operational standpoint. Based on my own experience tracking wine COGS, and after numerous conversations with wine industry financial experts, several overarching truths have become apparent.

1. First, using InnoVint to track COGS in conjunction with tracking production makes it possible to arrive at much more accurate and specific per bottle costs than is possible without it, and with significantly less effort. My feeling is that, since you’re already tracking your production, it’s not much additional effort to add in the costs, and the value added is huge.
2. Second, consistency and regularity of cost entry is key. I add the same costs to the same categories and distribute them across my inventory in the same ways, at a consistent cadence.
3. Third, embrace simplicity and efficiency whenever reasonable - meticulous application of minor costs does not move the needle enough at the level of the bottle cost to be worth the effort.
4. And finally, reconcile your true costs with your costs in InnoVint regularly.

The strategies outlined above allow me to efficiently and accurately determine the cost of producing my wines and operate my business responsibly. If I can do it, so can you.
