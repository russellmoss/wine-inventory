---
title: "Dry Goods and COGS Reporting"
url: "https://support.innovint.us/hc/en-us/cogs-and-dry-goods-tracking"
category: "FINANCE"
section: "Reporting"
page_type: "page"
lastmod: "2026-03-25"
gist: "In this article, we share some tips on finding and reporting on dry goods costs."
tags: ["cost", "reporting", "packaging", "additives", "lot-identity", "inventory"]
---

# Dry Goods and COGS Reporting

In this article, we share some tips on finding and reporting on dry goods costs.  For our general overview on using the Dry Goods module, check out the support article [here](https://support.innovint.us/hc/en-us/articles/360034896692-navigating-the-additive-explorer?hsLang=en). Get an introduction on adding cost to Dry Goods [in this article.](https://support.innovint.us/hc/en-us/articles/assigning-costs-to-drygoods-batches?hsLang=en)

This article covers:

- [How to find your on-hand cost per batch/product](#cost_on_hand)
  - [Dry Goods Explorer](#drygoods-ex)
  - [Additive & Packaging History Reports](#additive-history-report)

- [What is my packaging cost on a finished case good?](#packaging-cost-finished-CG)
- [Why is my batch cost weird and other FAQ](#weird-costs)

### How to find your on-hand cost per batch/product

#### Dry Goods Explorer

Access the Dry Good Explorer from the left hand navigation bar. Here, you can check to see which dry goods have direct costs entered. *Export* this explorer in order to have a current snapshot of on-hand dry goods costs:

![Dry Goods and COGS Reporting-menu toggle](https://support.innovint.us/hs-fs/hubfs/Dry%20Goods%20and%20COGS%20Reporting-menu%20toggle.webp?width=670&height=285&name=Dry%20Goods%20and%20COGS%20Reporting-menu%20toggle.webp),

To look at batches, select the Additive or Packaging product that you wish to view from the Dry Goods Explorer. This opens the Product details page, with the average unit cost of all received batches (both active and archived), as well as the total actual on hand quantity and cost of current *active* batches.

![Dry Goods and COGS Reporting-dashboard](https://support.innovint.us/hs-fs/hubfs/Dry%20Goods%20and%20COGS%20Reporting-dashboard.webp?width=670&height=313&name=Dry%20Goods%20and%20COGS%20Reporting-dashboard.webp)

**View Additive or Packaging History per Batch**

From the Product details page, in the Batches widget, click on *Details* (far right) to open the Batch details page.

In the Batch details page, you can see the on hand batch quantity and cost on hand (cost on hand = on-hand quantity x unit cost), plus the original total cost and quantity received (which is the basis for the batch unit cost calculation).

![Dry Goods and COGS Reporting-on hand batch](https://support.innovint.us/hs-fs/hubfs/Dry%20Goods%20and%20COGS%20Reporting-on%20hand%20batch.webp?width=670&height=308&name=Dry%20Goods%20and%20COGS%20Reporting-on%20hand%20batch.webp)

The Batch detail is a good place to check into a specific batch when you need to dive into the nitty gritty for a query, such as questioning the order of backdated actions or received batches.

Batch histories can be exported to a csv file by clicking on Export in the top far right of the Batch History card.

#### Additive & Packaging History Reports

These reports are part of the advanced reporting features available with a MAKE PLUS subscription. Please reach out to [Support](mailto:support@innovint.us) to learn more!

To see product and batch information at a point in time, download the Additive or Packaging History Reports to view all actions and adjustments involving batches within a date range. Use these reports to find on-hand quantity and cost at a past point in time.

*Go to Reporting > Activity Reports >*

![Dry Goods and COGS Reporting-activity reports](https://support.innovint.us/hs-fs/hubfs/Dry%20Goods%20and%20COGS%20Reporting-activity%20reports.webp?width=670&height=327&name=Dry%20Goods%20and%20COGS%20Reporting-activity%20reports.webp)

- **Additive History Report.** Select your date range, then download.
  This report includes addition actions, additive adjustments and depletions, and receive dry goods actions for additive products.![Dry Goods and COGS Reporting-add history report](https://support.innovint.us/hs-fs/hubfs/Dry%20Goods%20and%20COGS%20Reporting-add%20history%20report.webp?width=670&height=161&name=Dry%20Goods%20and%20COGS%20Reporting-add%20history%20report.webp)The export provides a batch-by-batch, lot-by-lot breakdown of used, scrap, and adjusted amounts in each action, including cost changes when COGS Tracking is activated.
  - In order to find your point in time on-hand quantity and cost, we recommend utilizing a pivot table from the *first date product was received* to the desired point-in-time.

- **Packaging History Report.** Select your date range, then download.
  View all actions and adjustments involving packaging batches within a date range, including bottling actions, add packaging actions, adjustments, depletions, and receive dry goods actions for packaging batches.
  ![Dry Goods and COGS Reporting-pack history report](https://support.innovint.us/hs-fs/hubfs/Dry%20Goods%20and%20COGS%20Reporting-pack%20history%20report.webp?width=670&height=99&name=Dry%20Goods%20and%20COGS%20Reporting-pack%20history%20report.webp)

The export provides a batch-by-batch breakdown of used, scrap, and adjusted amounts. Sort by product name, juice/wine lot code, case good lot code, product owner, etc. All cost changes are included when COGS Tracking is activated.

- - In order to find your point in time on-hand quantity and cost, we recommend utilizing a pivot table from the *first date product was received* to the desired point-in-time.

[Back to top](#top)

### What is my packaging cost on a finished case good?

Best practice is to have packaging cost included in your COGS as part of your finished goods cost. The final Cost of Goods Sold is the number that drives your gross margin calculations, and accuracy is a must.

It is important to confirm with your finance team how and where you expect your packaging costs to report, as this is will directly inform how and where to apply costs in InnoVint.

In InnoVint, there can be differences in how to accurately report COGS data when utilizing direct packaging costs added *via Bottling actions,* which are applied as the last step in producing finished goods on the bulk wine, versus direct costs added *via Add packaging actions,* which are applied to case good lots.The Add packaging action applies direct packaging cost *to the case good*, and it is not reported on the bulk wine finished goods costs (screenshot below) or the [Bottled Costs Report](https://support.innovint.us/hc/en-us/cost-reports?hsLang=en#bottled).

![Dry Goods and COGS Reporting-bottled cost report](https://support.innovint.us/hs-fs/hubfs/Dry%20Goods%20and%20COGS%20Reporting-bottled%20cost%20report.webp?width=670&height=172&name=Dry%20Goods%20and%20COGS%20Reporting-bottled%20cost%20report.webp)

You can see the cost tab of this case good lot (output from the bottled bulk wine) which has additional direct cost added via Add packaging, and it is added to a new WIP cost on the case good - it would be omitted from the Bottled Costs Report.

![Dry Goods and COGS Reporting-cost report](https://support.innovint.us/hs-fs/hubfs/Dry%20Goods%20and%20COGS%20Reporting-cost%20report.webp?width=670&height=271&name=Dry%20Goods%20and%20COGS%20Reporting-cost%20report.webp)

This reporting nuance also applies to how and when you apply indirect costs (to either a case good lot or bulk wine lot).  Find out more about how indirect costs can be applied before, during and after the Bottling action [here](https://support.innovint.us/hc/en-us/articles/207265686-how-to-record-or-edit-a-bottling-action?hsLang=en#lotcost). Adding packaging as an indirect cost to *case good* lots will not be surfaced on the [Bottled Cost Report](https://support.innovint.us/hc/en-us/cost-reports?hsLang=en#bottled).  If you are adding direct packaging or indirect packaging costs to **case good lots**, it can be best reported using the Lot Cost Report (filtered for your case goods), or the Cost Over Time Report.

Because of these nuances, depending on how your team records packaging, there are multiple ways to report on this cost for a finished lot.

**Case Goods Lot Details**

- If you are interested in viewing the packaging cost on an individual case goods lot, the total packaging cost can be found under the **Cost tab** on the Case Goods lot details page. This will show the total packaging costs applied to the lot, both direct and indirect, including all costs applied to the bulk wine at the point of bottling, and the associated actions.
  - To view additional details and costs of individual packaging items applied to the lot, click the **Packaging tab** on the Case Goods lot details page. This page can be exported.
    ![Dry Goods and COGS Reporting-pack tab](https://support.innovint.us/hs-fs/hubfs/Dry%20Goods%20and%20COGS%20Reporting-pack%20tab.webp?width=670&height=173&name=Dry%20Goods%20and%20COGS%20Reporting-pack%20tab.webp)

**Reports**

If you'd like to view the packaging costs for multiple lots in a single report, check out these reports:

- Packaging History Report - export this report on the date range, and sort by lot.
  - This will allow you to see the batches of each product (quantity and cost) applied to the lot at any point in time.
  - Or, sort by packaging product or batch to see the details of where and when it was consumed.
- Bottled Cost Report - run this report on a selected date range to see all final WIP costs (including packaging), **as of the point your bulk wine is bottled**.
  - This report won't show costs applied to the case good lot, such as additional packaging added via the Add packaging case good action.
  - This report shows the total direct packaging cost category, and is not broken down by packaging type.

📌 **Note**: Direct packaging costs applied to a wine lot via a Bottling action will populate the Packaging columns of the Bottled Cost Report. Direct packaging costs applied to a case good lot via an Add Packaging action will *NOT* populate the Bottled Cost Report.

[Back to top](#top)

### Why is my batch cost weird & other FAQ

Scroll down and browse through, or jump to the issue that fits your question!

- [How does InnoVint calculate the unit cost per Batch?](#cost-per-batch)
- [How does InnoVint calculate the Avg. Cost per Item for a dry good product?](#Avg_Cost_Product)
- [Why does my on-hand inventory show a negative number?](#On-hand_negative)
- [My batch is depleted, but ensuing bottling actions caused negative on-hand qty](#Depleted_Negative)
- [My packaging was received, but wasn't depleted by bottling](#Received_not_depleted)
- [How do I cost packaging for Sparkling en tirage bottlings?](#entirage)
- [I bottled part of a lot but the Packaging cost item is showing on the whole thing. Why?](#packaging-indirect)

**Q: How does InnoVint calculate the unit cost per Batch?**

*A: The total cost per batch is the sum of all costs entered across all 'Receive' actions recorded on the batch. InnoVint uses the total cost per batch and the total amount received to determine the cost per item/unit of the batch.*

*Here's an example using an Additive:*

- *20kg of Tartaric Acid, Batch X was received on Jan. 1, 2021.*
  - *The total cost of the 'Receive' action was $100.*
  - *The calculated cost per unit of the 'Receive' action is $5/kg.*

*Assume that several additions were made using Batch X.*

- *Then, on June 15, 2021 an additional 50kg of Tartaric Acid was received into Batch X.*
  - *The total cost of the second delivery was $197.50.*
  - *The calculated cost per unit of the 'Receive' action is $3.95/kg.*

*At this point, Batch X has received a total of 70kg for a total cost of $297.50.*

- *The new cost per unit for Batch X is $4.25/kg.*

*In this scenario, all previous and future additions will apply a cost of $4.25/kg. Additions recorded before June 15, 2021 will update to reflect the change.*

**Q. How does InnoVint calculate the Avg. Cost per Item for a dry good product?**

*A. The Average Cost per Item (in the Product details page) is calculated using the total cost received divided by total number of units received on all batches (including historic or archived batches).*

*In the example below, the Cost on hand for this product is $4,486.00, with an average cost per item of $0.50/bottle.*

![Dry Goods and COGS Reporting-cost on hand](https://support.innovint.us/hs-fs/hubfs/Dry%20Goods%20and%20COGS%20Reporting-cost%20on%20hand.png?width=670&height=249&name=Dry%20Goods%20and%20COGS%20Reporting-cost%20on%20hand.png)

*There is one batch for this product, and one Receive Dry Good action in which 12,000 bottles were received for a total cost of $6,000. This is calculated to give a cost per item of $0.50/bottle. 3028 bottles were then used in a bottling action, removing $1,514.00 in cost and leaving the cost on hand as $4,486.00.*

![Dry Goods and COGS Reporting-change on hand](https://support.innovint.us/hs-fs/hubfs/Dry%20Goods%20and%20COGS%20Reporting-change%20on%20hand.png?width=670&height=350&name=Dry%20Goods%20and%20COGS%20Reporting-change%20on%20hand.png)

*Then on 2/5/24, an additional 6,000 bottles were received, but **no cost** was entered for the new batch of bottles. The Avg. cost per item is now $0.33/bottle, calculated using the total cost entered for all batches ($6,000) divided by the total number of bottles received for all batches (18,000). ![Dry Goods and COGS Reporting-avg cost per item](https://support.innovint.us/hs-fs/hubfs/Dry%20Goods%20and%20COGS%20Reporting-avg%20cost%20per%20item.webp?width=670&height=305&name=Dry%20Goods%20and%20COGS%20Reporting-avg%20cost%20per%20item.webp)*

**Q. Why does my on-hand inventory show a negative number?**

*A. Negative on-hand inventory indicates that more additive was used of that batch than was entered into the system. For example, 5kg of DV10 yeast, Batch # 12345 was entered into InnoVint as the Total Amount. Over the course of harvest, 6.2kg of DV10 yeast, Batch #12345 was used. InnoVint will show that Batch # 12345 now has an on-hand inventory of -1.2kg.*

*For accounts with the COGS activated, a negative batch inventory will still apply costs on a price-per-unit basis. For example, 5kg of DV10 yeast, Batch # 12345 might cost $450, or $0.09 per gram. If Batch # 12345 currently has a negative inventory and is selected and used in an Addition action, InnoVint will still calculate and apply the $0.09 per gram of yeast to the appropriate lot(s). However, the on-hand cost on the batch and product will not go negative.*

*To update the on-hand inventory, you'll need to either A) edit the batch to change the total amount of the additive received, or B) adjust the on-hand inventory from the Additive details page.*

*Adjusting the on-hand inventory changes the on-hand quantity AND the cost on-hand for the batch and product, although the original total received quantity and cost does NOT change.*

**Q: My batch is marked as depleted, but ensuing bottling actions caused negative on-hand numbers & incorrect costs on the Packaging History Report! Help!**

*Users are allowed to edit a bottling action and add packaging to that bottling action at any time. However, the packaging is always consumed on the date of the bottling, regardless of the editing date. Potential variation between the order in which you update packaging on bottling actions, and the chronological order of the bottling actions themselves, may cause unusual depletion timing and discrepancies in on-hand quantities, and therefore, on-hand batch cost.*

![Dry Goods and COGS Reporting-depleted](https://support.innovint.us/hs-fs/hubfs/Dry%20Goods%20and%20COGS%20Reporting-depleted.webp?width=670&height=130&name=Dry%20Goods%20and%20COGS%20Reporting-depleted.webp)

*We suggest that in cases where a lot of packaging is being added after a bottling run, to avoid using the "Fully Deplete" checkbox in the edit packaging slideover. Instead, keep a Dry Goods tab open, and click on "Fully Deplete" on each Batch after all bottling actions are updated.*

**Q: My packaging was received, but wasn't depleted by bottling - now I have extra on-hand quantity and cost in the Packaging History Report?**

*InnoVint is extremely flexible when it comes to adding and depleting packaging or additives. It is possible to input your Receive Dry Good action AFTER a bottling takes place, and then update the packaging on that past bottling action. However, when receiving backdated packaging, users should ensure that they backdate that packaging receipt **prior** to the first bottling action that takes place.*

*Some wiggle room exists here, if the batch will not be depleted prior to the Receive Dry Good action. However, problems may be perceived on the Dry Goods History Reports if auser **fully depletes a batch on a bottling or addition action backdated before the dry goods receipt.***

![Dry Goods and COGS Reporting-depleted2](https://support.innovint.us/hs-fs/hubfs/Dry%20Goods%20and%20COGS%20Reporting-depleted2.webp?width=670&height=106&name=Dry%20Goods%20and%20COGS%20Reporting-depleted2.webp)

**Q: How do I cost packaging for Sparkling en tirage bottlings?**

*A: The [Bottling en Tirage action](https://support.innovint.us/hc/en-us/articles/360051230671-bottling-en-tirage-?hsLang=en) lets you consume the packaging/cost directly, similar to* *the Bottling action.  This is function is available for Bottling en Tirage actions recorded after January 2025.*

**Q: I bottled part of a lot but the Packaging cost item is showing on the whole thing. Why?**
*A: Indirect cost is applied proportionally to all lot contents (i.e. all volume associated to a lot code).  If you are using indirect packaging costs, and only partially bottling a lot of wine, we recommend splitting off any partially to-be-bottled portion of a bulk wine lot into a unique lot code prior to bottling and applying indirect costs to the new lot. Otherwise, any indirect bottling specific costs will be applied equally to the entire lot contents.*

[Back to top](#top)
