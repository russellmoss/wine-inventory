---
title: "Tracking Oak Costs in InnoVint"
url: "https://support.innovint.us/hc/en-us/tracking-barrel-costs-in-innovint"
category: "FINANCE"
section: "Guidance & FAQ"
page_type: "page"
lastmod: "2025-11-20"
gist: "Looking for guidance on the best way to track your oak costs in InnoVint?"
tags: ["cost", "barrels", "ux-friction", "additives"]
---

# Tracking Oak Costs in InnoVint

Looking for guidance on the best way to track your oak costs in InnoVint? Different wineries have different strategies to account for barrel & other oak costs. Read on for common practices.

- [Barrel Depreciation](#barrel-depreciation)
- [Barrel Leasing Cost](#barrel-leasing-costs)
- [Oak Additives](#oak-additives)

### **Barrel Depreciation**

There are several different ways wineries may account for barrel depreciation. One strategy is to use a straight line depreciation schedule over 3-5 years (a typical barrel life). Another is to use a weighted schedule, in which the barrels are depreciated more in the first few years than in subsequent years, with a total schedule still over 3-5 years. A final method might be to base depreciation off of the number of fills, rather than the number of years the barrel has been in the cellar.

Ultimately, there is not a one-size-fits-all method, so you and your finance team should determine the best barrel depreciation schedule for your facility and keep this cost allocation schedule in order to track cost entries made in InnVint.

#### How to Apply Barrel Depreciation Using InnoVint's COGS Tracking

Individual *vessels* cannot carry cost; in InnoVint, cost must be assigned to a *lot*.  Barrel depreciation costs can therefore be entered in InnoVint as indirect cost item entries on lots.  Any depreciation cost entries will be applied to the chosen lots at the time you've specified. You should *only* add the cost you want to apply at that time.

For example, imagine you have a new barrel that costs $1,000 dollars, and you are depreciating the barrel over 3 years on a weighted schedule: 50% - 40% - 10%.

Year 1 cost entry would be $500

Year 2 cost entry would be $400

Year 3 cost entry would be $100, after which the barrel is fully depreciated

Most likely, you're not entering barrel depreciation costs on a per vessel basis however, and instead you are entering total barrel depreciation costs for numerous vessels on numerous lots at once.

Winery finance professionals in InnoVint tend to use one of these 3 methodologies:

1. **Method One** is to calculate a $/gal depreciation rate that is applied to all lots in oak at a single rate each month. For instance, a user has calculated a rate of $0.2458/gal for January 2024 barrel depreciation allocation.  They will enter the barrel depreciation allocation as a total cost, then distribute that cost proportionally across all lot volume in barrel as of January 31, 2024 at 11:59pm.
2. **Method Two** is to estimate the percentage of new oak in each lot, and tag lots with the percentage of new oak. Use those lot tags when selecting lots in the lot picker in order to allocate a set depreciation rate to the appropriate lots based on that percentage of new oak, i.e. 100%, 75%, 50%, 30%. This method also uses a calculated $/gal depreciation rate and the total cost is entered as a cost item distributed proportionally across all lots.  Multiple cost items may be entered for the different percentages of new oak barrel depreciation allocations.  For example, the 100% new oak rate is $0.1717 and the 75% rate is $0.1288 for all months of 2023. Be sure that all individual depreciation cost items equal the total scheduled depreciation cost.
3. **Method Three** is to record depreciation cost as a single cost entry for the entire year as of 12/31 at 11:59pm, and apply that cost across all lots. This cost is not necessarily distributed proportionally across all lots. Instead cost might be weighted differently to reflect the calculated barrel depreciation cost of known barrels associated with specific lots, using the $/lot option on the Add/remove Cost action.

**Need to record barrel depreciation for previous years?** One way to do so is by entering a cost item for older barrels per your depreciation schedule and backdate it to 12/31 for the year in which you want to account for that barrel depreciation. Backdated costs will be automatically recalculated through to update the current lot cost.

**Entering Barrel Depreciation As a Cost Item**

1. Head to the COGS Tracking Explorer and click the blue "Add/Remove Cost" button in the upper-right hand corner.
2. Select the Add Cost radio button and "Barrel Depreciation" from the Category dropdown menu.
3. Enter in any relevant details for the Cost Item, such as the period, and enter the total cost of the barrel depreciation.
4. Now select the appropriate date to apply the barrel depreciation and use your lot picker to select the lots to which you will be applying barrel depreciation cost.
5. Add the appropriate cost to each lot in the "Cost to Add" text fields. InnoVint provides options to "Distribute total cost proportionally across volume", to specify "$/lot" or "$/unit", or to manually enter a known cost for each lot.
6. Click "Record cost addition".

![Tracking Oak Costs in InnoVint-record](https://support.innovint.us/hs-fs/hubfs/Tracking%20Oak%20Costs%20in%20InnoVint-record.webp?width=688&height=353&name=Tracking%20Oak%20Costs%20in%20InnoVint-record.webp)

### **Barrel Leasing Cost**

If you lease barrels, the recommended workflow  to track your leased barrel costs in InnoVint is to add your leased barrel costs as an indirect overhead costs, similarly to barrel depreciation, in which the cost is being applied to the wine lots in the barrels.

For example, let's say your total monthly barrel lease cost is $500/month and you want to apply that proportionally across all your lots that are in barrel each month.

Record a cost item, selecting the most appropriate cost category from the dropdown menu.

Currently, InnoVint does not include a "Barrel Lease" or "Barrels" cost category; we would suggest utilizing the “Other” cost category unless you prefer another existing category.

Include the period in the details section and $500 in the "Total cost" field. Then select the appropriate date, and all wine lots in leased barrels on that date, selecting "Distribute cost proportionally across all volume" from the Cost to Add dropdown.

If your barrel lease price varies depending on barrel type, you could also manually add in cost for each wine lot in the Cost to Add text fields, perhaps specifying barrel lease price in the Note field.

![Tracking Oak Costs in InnoVint-specify](https://support.innovint.us/hs-fs/hubfs/Tracking%20Oak%20Costs%20in%20InnoVint-specify.webp?width=688&height=356&name=Tracking%20Oak%20Costs%20in%20InnoVint-specify.webp)

If you'd like to associate the barrel invoice number with your vessel, rather than applying barrel leasing costs to wine lots, you can use either a tag or note on the barrel. We'd recommend using standardized language in the note, such as "Barrel Invoice #", to make this information easy to search in the Note Explorer.

### Oak Additives

The cost of oak additives such as stave inserts, cubes, etc. can be tracked just like other additives in your account. Simply [create and receive the additive](https://support.innovint.us/hc/en-us/articles/115000825066-how-to-create-additives-and-additive-batches?hsLang=en), choosing "Other/Custom" for the product type, and adding amount received and total cost.

![Tracking Oak Costs in InnoVint-oak add](https://support.innovint.us/hs-fs/hubfs/Tracking%20Oak%20Costs%20in%20InnoVint-oak%20add.webp?width=499&height=463&name=Tracking%20Oak%20Costs%20in%20InnoVint-oak%20add.webp)![Tracking Oak Costs in InnoVint-rcv add](https://support.innovint.us/hs-fs/hubfs/Tracking%20Oak%20Costs%20in%20InnoVint-rcv%20add.webp?width=497&height=396&name=Tracking%20Oak%20Costs%20in%20InnoVint-rcv%20add.webp)

When you record an Addition action to add oak additives to a wine lot, [the cost will be distributed as it normally would for any other additive](https://support.innovint.us/hc/en-us/allocate-costs-indirect-direct?hsLang=en#drygoods).
