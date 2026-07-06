---
title: "How to Add and Remove Fruit Costs"
url: "https://support.innovint.us/hc/en-us/articles/assigning-fruit-costs"
category: "FINANCE"
section: "Getting Started"
page_type: "article"
lastmod: "2026-06-24"
gist: "Fruit cost is generally one of the largest contributors to the cost of goods sold for winery businesses."
tags: ["cost", "harvest", "vineyard", "getting-started", "transfers"]
---

# How to Add and Remove Fruit Costs

Fruit cost is generally one of the largest contributors to the cost of goods sold for winery businesses. The cost of fruit can be applied in different ways to your lots in InnoVint.

Whether your winery is farming estate vineyards or sourcing fruit from other vineyards or growers, the cost of each vineyard block or the price of the grapes can be applied at any time in InnoVint. When applied as direct costs via vineyard blocks, these costs will be [distributed](https://support.innovint.us/hc/en-us/cost-distribution-rules?hsLang=en#direct) to all lots that inherit composition from these blocks. Fruit cost can also be applied indirectly to bulk juice/wine lots as overhead, which maximizes flexibility for cost tracking methods.

This article covers:

- - [How do I add direct fruit cost?](#how)
    - [Fruit Cost Worksheet](#fruitcostworksheet)
    - [Vineyard Explorer](#vineyardexplorer)
    - [Vineyard Contracts](#contract)
    - [Fruit cost and units](#cost-and-units)
  - [How do I add indirect fruit cost?](#indirect)
  - [How do I remove fruit cost?](#remove)

### How do I add direct fruit cost?

When using direct fruit cost, the cost or price assignment is set for a specific vineyard block per vintage. This cost is applied to all fruit brought in via a [**Receive Fruit action**](https://support.innovint.us/hc/en-us/articles/360005125552-receive-fruit?hsLang=en). Receive Fruit actions add fruit weight to the winery, and are linked to a specific vineyard block via a [Fruit lot](https://support.innovint.us/hc/en-us/what-is-the-difference-between-a-fruit-lot-and-a-juice/wine-lot?hsLang=en). Direct fruit costs can be added or edited at any time, before or after the fruit has been received in InnoVint.

Direct fruit costs will be most accurately reflected in the costing history of a juice/wine lot after all fruit received from a block is tracked in volume (i.e. after Process to Volume, Juice Bleed/Saignée, and/or Drain & Press actions are submitted).

There are three methods to enter in your direct fruit costs:

- Use the [Fruit Cost Worksheet](#fruitcostworksheet) to apply costs/prices to many blocks at once (highly recommended: this is the most efficient method).
- Use the [Vineyard Explorer](#vineyardexplorer) to apply costs/prices to one block at a time, or to zero out costs.
- Use [Vineyard Contracts](#contract) to set costs/prices via a vineyard contract for a set number of years on specific blocks (not available at all subscription levels. For more information, please contact Customer Success at [support@innovint.us](mailto:support@innovint.us))

**Note**: These processes are linked. Costs added or updated via any of these direct cost methods will be reflected across the platform. For example, if costs are added in a contract, those same costs are displayed in the Fruit Cost Worksheet, and under the Vintages tab in the Block details page. Costs edited in the Fruit Cost Worksheet or in the Vintages tab will update the costs in the contract (if one has been created). Updated contract costs will reflect in the Fruit Cost Worksheet and Vintages tab.  **For costs entered via any of these methods, InnoVint will use the most recent entry to update the other(s).**

#### Assigning costs using the Fruit Cost Worksheet

This tool is valuable for fast and easy data entry of all your fruit costs per vineyard block for a single vintage. The fruit cost worksheet also allows you to compare and work with costs from previous vintages.

To navigate to the Fruit Cost Worksheet, go to the COGS Tracking Explorer, and select the worksheet for the desired vintage year:

![How to Add and Remove Fruit Costs-cogs tracking menu](https://support.innovint.us/hs-fs/hubfs/How%20to%20Add%20and%20Remove%20Fruit%20Costs-cogs%20tracking%20menu.webp?width=670&height=348&name=How%20to%20Add%20and%20Remove%20Fruit%20Costs-cogs%20tracking%20menu.webp)

InnoVint displays the current calendar year and the previous vintage year. Looking for an unlisted vintage? Use the url in the browser tab to update the year. In this case, replace 2023 with 2022 to access the 2022 Fruit Cost Worksheet:

![How to Add and Remove Fruit Costs-vintage](https://support.innovint.us/hs-fs/hubfs/How%20to%20Add%20and%20Remove%20Fruit%20Costs-vintage.webp?width=670&height=80&name=How%20to%20Add%20and%20Remove%20Fruit%20Costs-vintage.webp)

In the Fruit Cost Worksheet, you'll see columns for the vineyard, the block, the previous vintage cost, the selected vintage cost, and the estimated cost of the selected vintage.

You can easily review a block's previous vintage's costs here, and these previous costs can be copied to the current vintage, or new cost information can be entered. Additional columns for the grower, varietal, clone, area, estimated yield, owner (if applicable) and vineyard/block tags are visible to help distinguish each block.

Use the **New [YEAR] Cost** and **Unit** columns to set the block pricing.

- Enter specific block costs row by row, or...
- From the blue 'NEW [*YEAR*] COST' drop down, your bulk selection options are:
  - **Previous vintage** - copy costs from the previous vintage to the current/new vintage
  - **$ [   ] apply** - enter a value to apply to the entire worksheet, and across all pages
  - **Clear all** - remove all previously entered costs on all blocks

Consider using your search field (this searches the vineyard, block name and tags!) or filters to view desired blocks and leverage the bulk fill options.

![How to Add and Remove Fruit Costs-worksheet](https://support.innovint.us/hs-fs/hubfs/How%20to%20Add%20and%20Remove%20Fruit%20Costs-worksheet.webp?width=635&height=333&name=How%20to%20Add%20and%20Remove%20Fruit%20Costs-worksheet.webp)

- In the Unit selection column, your unit options are:
  - **Previous vintage** - copy whatever unit was used from the previous vintage
  - **per acre (or hectare, stremma or dunam)** - cost is set based on the total area of the block (this area must be set in the block details page). The area unit can be acre, hectare, stremma or dunam and depends on the area setting of your InnoVint account
  - **per ton (tonne, pound, or kilogram)** - cost is set based on the total weight received from that block (unit display is based on your winery's weight unit)
  - **per block** - cost is flat (regardless of area or weight) for all fruit received from that block
    ![How to Add and Remove Fruit Costs-unit](https://support.innovint.us/hs-fs/hubfs/How%20to%20Add%20and%20Remove%20Fruit%20Costs-unit.webp?width=178&height=221&name=How%20to%20Add%20and%20Remove%20Fruit%20Costs-unit.webp)
    Find out more about selecting units [below](#cost-and-units).
- After a value and unit are selected, the row will highlight green, indicating that the cost has been set and will be applied when you click the green button to "**Assign costs**":![How to Add and Remove Fruit Costs-assign costs](https://support.innovint.us/hs-fs/hubfs/How%20to%20Add%20and%20Remove%20Fruit%20Costs-assign%20costs.webp?width=670&height=354&name=How%20to%20Add%20and%20Remove%20Fruit%20Costs-assign%20costs.webp)

You cannot change fruit cost to zero via the Fruit Cost Worksheet. Check out the next section on updating costs via the Vineyard Explorer.

#### Assigning costs in the Vineyard Explorer

Block costs can be applied and removed via the Block Details page. To navigate here, go to  ![vineyards icon](https://support.innovint.us/hs-fs/hubfs/vineyards%20icon.png?width=126&height=852&name=vineyards%20icon.png)  in the left navigation bar and go to the Vineyard Explorer. Select a vineyard and then select the desired block. Go to the 'Vintages' tab.

![How to Add and Remove Fruit Costs-block details vintage](https://support.innovint.us/hs-fs/hubfs/How%20to%20Add%20and%20Remove%20Fruit%20Costs-block%20details%20vintage.webp?width=670&height=255&name=How%20to%20Add%20and%20Remove%20Fruit%20Costs-block%20details%20vintage.webp)

If the vintage exists, you can click on 'Edit cost' to set, edit, or delete the cost information. If it does not exist yet, you can click "Add vintage" to add that year, then set the cost.

This is also the best method to zero out costs that have been set via the Fruit Cost Worksheet!

#### Setting fruit costs in a vineyard contract

This section generally outlines how to access contracts for adding fruit costs.  Find the full article on *How to Manage Vineyard Contracts* [here](https://support.innovint.us/hc/en-us/articles/360027080951-how-to-manage-vineyard-contracts?hsLang=en).

Vineyard Contracts require activation of both FINANCE and GROW modules. Reach out to [support@innovint.us](mailto:support@innovint.us) for more information.

1. To begin, hover over Vineyards in the left navigation bar.  Then go to the Contract Explorer in the slideover menu.
   ![How to Add and Remove Fruit Costs-menu contract explorer](https://support.innovint.us/hs-fs/hubfs/How%20to%20Add%20and%20Remove%20Fruit%20Costs-menu%20contract%20explorer.webp?width=252&height=268&name=How%20to%20Add%20and%20Remove%20Fruit%20Costs-menu%20contract%20explorer.webp)
2. Go to ![How to Add and Remove Fruit Costs-add contract button](https://support.innovint.us/hs-fs/hubfs/How%20to%20Add%20and%20Remove%20Fruit%20Costs-add%20contract%20button.webp?width=133&height=29&name=How%20to%20Add%20and%20Remove%20Fruit%20Costs-add%20contract%20button.webp) in the top right corner of the Contract Explorer.
3. Select the vineyard, all or some of the blocks, and the applicable vintages for the contract
4. Under **Vineyard, Block** and **Vintages:** For each block and vintage, enter the cost and select the unit. Units may be per ton [tonne, pound or kilogram], acre [or hectare], or block). If you enter a price *per ton*, you must also enter the contracted tonnage.
5. If the cost and unit remain consistent across vintages, click on *Apply to all vintages.*![How to Add and Remove Fruit Costs-apply to all vintages](https://support.innovint.us/hs-fs/hubfs/How%20to%20Add%20and%20Remove%20Fruit%20Costs-apply%20to%20all%20vintages.webp?width=670&height=317&name=How%20to%20Add%20and%20Remove%20Fruit%20Costs-apply%20to%20all%20vintages.webp)
6. Update the remainder of the desired fields regarding Evergreen clauses, Provisions, Viticulture, harvest, and delivery specifications, and Payment Terms.
7. Add any desired Tags or Notes (you will be able to attach a file, such as pdf, only *after* the contract is created).
8. Record the contract!

#### A bit more about fruit cost and units

You have three options to assign costs: Cost/ton (or your winery's selected weight unit), Cost per Block and Cost per Acre (or Hectare, per your winery's country setting). Here are a few details about how these selections impact you:

**Cost per ton (or other winery weight unit)**

InnoVint calculates direct fruit costs by weight using the following formulas:

*1. Total fruit cost = (Weight received from vineyard block) \* (cost/weight)*

*2. Fruit cost per lot = (Total fruit cost/Total tons processed) \* (Tons processed to juice lot)*

This is a unit cost based on the weight received into [Fruit Lots](https://support.innovint.us/hc/en-us/what-is-the-difference-between-a-fruit-lot-and-a-juice/wine-lot?hsLang=en) via [Receive Fruit](https://support.innovint.us/hc/en-us/articles/360005125552-receive-fruit?hsLang=en) actions.  If you edit a previously recorded Receive Fruit action and change the received weight, then the total cost of fruit received from that block will also update.

**Cost per block and Cost per area (acre or hectare)**

InnoVint proportionally distributes the cost per block or acre according to the total weight received from that block per vintage and the distribution of that weight at the process step.

In the case of cost set on the block, the total cost assigned to the block is static, and will not change, but the downstream allocation of cost to fruit and juice/wine lots may change if received weight is edited.

> For example, if 3 tons from Block X is received and processed into Lot A, the system will apply the total cost per block to Lot A as of the date and time of the process action. If later, an additional 7 tons from Block X is received and processed into Lot B, the system will then proportionally distribute the total cost of the block according to the weight processed into both Lot A and Lot B. This will require the system to recalculate and update the costs that it previously applied to Lot A (thus decreasing the fruit costs on Lot A).

In the case of assigned cost per acre, the unit of area is technically a variable.  *If you edit the block's area then costs from the block will recalculate.*  Please note that InnoVint will distribute and apply costs using all the submitted information available at the time of the process step.

> For example, if 3 tons from Block X is received and processed into Lot A, the system will apply the total cost per block (unit cost \* area) to Lot A as of the date and time of the process action. If later, an additional 7 tons from Block X is received and processed into Lot B, the system will then proportionally distribute the total cost of the block according to the weight processed into both Lot A and Lot B. This will require the system to recalculate and update the costs that it previously applied to Lot A.  *If a user updates the area on Block X in the following vintage, costs applied to Lot A and Lot B in the prior vintage will recalculate accordingly.*

### How do I add indirect fruit cost?

Use the Add/Remove Cost action to add "indirect" fruit costs that are allocated to specific Fruit or Juice/wine lots.

Indirect costs can be added or removed at any time to active or archived Juice/wine lots, Fruit lots, or even Case Good lots. Whether it's a one-time fruit cost that needs to be allocated to a single lot, a vineyard overhead that needs to be capitalized across many lots, or an adjustment to reconcile specific lot costs, you're able to do so with the 'Add/Remove Cost' action.

This section generally outlines how to add indirect fruit costs.  Find the full article on How to Allocate Indirect Cost [here](https://support.innovint.us/hc/en-us/allocate-costs-indirect-direct?hsLang=en#costitem).

1. To begin, go to COGS Tracking in the left navigation bar.  Then go to the Add/Remove cost button in the top right corner.
   ![How to Add and Remove Fruit Costs-add remove costs](https://support.innovint.us/hs-fs/hubfs/How%20to%20Add%20and%20Remove%20Fruit%20Costs-add%20remove%20costs.webp?width=670&height=350&name=How%20to%20Add%20and%20Remove%20Fruit%20Costs-add%20remove%20costs.webp)
2. Complete the form. Select the cost category Fruit (Cost Item), enter any details about the cost (such as the period covered), and the total amount to apply across your lot(s).
3. For the Effective At section, you have the option to apply the costs to inventory as of today, or work with the inventory as of a date in the past.
   ![How to Add and Remove Fruit Costs-record effective date](https://support.innovint.us/hs-fs/hubfs/How%20to%20Add%20and%20Remove%20Fruit%20Costs-record%20effective%20date.webp?width=670&height=296&name=How%20to%20Add%20and%20Remove%20Fruit%20Costs-record%20effective%20date.webp)
4. When you click to select the lots, the header on the lot picker confirms you're viewing inventory as of the date specified. You can use the filters to narrow down the list of lots, if needed.  Consider using filters on the Add/Remove cost lot picker to find lots from a specific vintage or vineyard, or to select Fruit lots (via the Lot type filter).

   Be sure that the desired lots have contents as of the selected date, or *will* have contents after that date. If lots have already been emptied, added costs will not flow as desired, but will stay on an empty lot.
5. Enter costs. You can do this manually, entering in the desired cost for each lot, or you can use the 'Lot Cost' blue column header to select bulk fill options (including to distribute the cost proportionally).
6. Record your costs!

### How do I remove fruit cost?

InnoVint distributes cost proportionally to lot volume in all actions. This includes Bleed/Saignee actions (draining volume from a lot tracked in weight), Drain and Press actions (including press cut lots) and lees lots on Transfer/Rack actions.

In some cases, having the full direct fruit cost proportionally transferred into less valuable bleed or lees lots is not desirable. When this occurs, that fruit cost (direct or indirect) can be removed from the "devalued" lot and reallocated back to the parent or desired lot. Find a short video on this process [here](#remove-fruit-video) - or read on.

A good way to find and total these fruit costs is using the [Cost Audit Report](https://support.innovint.us/hc/en-us/cost-reports?hsLang=en#audit), which lists all lots and cost transfers (by cost category) on a given movement. The Cost Audit Report provides a full activity history of lots in the winery, and includes every action that impacted cost in a select date range, including cost items.

You can remove cost using the [Add/Remove cost](https://support.innovint.us/hc/en-us/allocate-costs-indirect-direct?hsLang=en#costitem) button.  When you select the option to "Remove" cost (rather than "Add"), you will have additional cost categories available in the Cost Category list. These additional cost categories are those for direct costs, including Fruit.

![How to Add and Remove Fruit Costs-category](https://support.innovint.us/hs-fs/hubfs/How%20to%20Add%20and%20Remove%20Fruit%20Costs-category.webp?width=302&height=208&name=How%20to%20Add%20and%20Remove%20Fruit%20Costs-category.webp)

1. Remove the unwanted cost in the selected cost category from a "devalued" lot.

   *Be sure to select the correct fruit cost (either direct or indirect) category, as you can only remove a cost category that exists on the selected lot at the specified point in time. This means that the cost removal must be timed to occur after the action that caused the cost to move (i.e. after the bleed action).* ![How to Add and Remove Fruit Costs-category costs specific date](https://support.innovint.us/hs-fs/hubfs/How%20to%20Add%20and%20Remove%20Fruit%20Costs-category%20costs%20specific%20date.webp?width=670&height=317&name=How%20to%20Add%20and%20Remove%20Fruit%20Costs-category%20costs%20specific%20date.webp)
2. Add all removed costs back into the higher value "mother" lot using the Add/remove cost action. See the section [above](#indirect) on adding or removing indirect costs. Add the cost back in the same category it was removed from.
3. Use the Notes field on the cost actions to reference or link lots as necessary.

It’s recommended that adjustments to remove and then add back costs to the mother lot occur on the same date, which should be just after the action that distributed the costs originally. For example, select the same date, and a time just after the final Bleed/Saignée action occurred. This ensures the cost changes flow correctly through all subsequent activities on the involved lots.

#### How to Remove Fruit Costs - Video

*Check out this instructional video for how to remove cost (extracted from our full InnoVint Academy ["Knock out your Production Costs!"](https://support.innovint.us/hc/en-us/knock-out-your-production-costs?hsLang=en))*
