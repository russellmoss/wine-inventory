---
title: "Onboard Starting Costs & Cost Settings"
url: "https://support.innovint.us/hc/en-us/onboard-starting-costs-and-cost-settings"
category: "FINANCE"
section: "Getting Started"
page_type: "page"
lastmod: "2025-11-20"
gist: "Admins can add, remove, and edit winery member permissions by going to Settings:."
tags: ["cost", "migration", "configuration", "getting-started", "permissions", "vineyard"]
---

# Onboard Starting Costs & Cost Settings

#### Topics Covered

- [Setting Costing Access Permissions](#access)
- [Onboarding Starting Bulk or Case Goods Lot Costs](#onboard)
- [Cost Item Lock Backdating](#lock)
- [FAQ](#faqs)

### Setting Costing Access Permissions

Admins can add, remove, and edit winery member permissions by going to Settings:

![Onboard Starting Costs & Cost Settings-order](https://support.innovint.us/hs-fs/hubfs/Onboard%20Starting%20Costs%20%26%20Cost%20Settings-order.webp?width=688&height=31&name=Onboard%20Starting%20Costs%20%26%20Cost%20Settings-order.webp)

Whereas your capability setting (Admin, Team Member, Team Member - Cannot Submit Work Order, and Read Only) impacts user's abilities throughout *all* of InnoVint, cost permissions only impact InnoVint's costing tools.

InnoVint has three different cost permission settings:

- **Full Access**
  This access level allows the winery member to view, record, and edit direct costs and indirect costs in InnoVint, including all costing reports and cost history data. This access level also allows the winery member to view, record, and edit vineyard contracts.
- **Read Only**
  Read Only grants the winery member access to view and export cost data, cost reports, and vineyard contracts. This access level does not allow the winery member to record or edit any cost data or contracts.
- **No access**
  A winery member with No Access to Costing will not be able to view, record, or edit cost data or vineyard contracts in InnoVint.

![Onboard Starting Costs & Cost Settings-edit permissions](https://support.innovint.us/hs-fs/hubfs/Onboard%20Starting%20Costs%20%26%20Cost%20Settings-edit%20permissions.webp?width=414&height=509&name=Onboard%20Starting%20Costs%20%26%20Cost%20Settings-edit%20permissions.webp)

**Owner-based Permissions**: For wineries using our custom crush "owners" module, please contact [support@innovint.us](mailto:support@innovint.us) to update costing access for your members.

### Onboarding Starting Bulk or Case Good Lot Costs

So you've just activated FINANCE with the COGS Tracking module for your winery. Fantastic! Let's get started.

If you are a new customer to InnoVint, you'll want to go through the [inventory onboarding process](https://support.innovint.us/hc/en-us/how-to-onboard?hsLang=en) first by setting up your lots, vessels, and volumes.  If you're an existing customer, make sure your winery inventory is up to date.

Next, **choose a date** (either today or a day in the recent past, such as the first of this month) **that you want to establish all of your current lot costs**. You and/or your accounting team may have an idea of your existing lot cost breakdown. (If not, you can just start tracking your costs going forward).

#### *Bulk Cost method (Recommended)*:

Go to the COGS Tracking Explorer and "[Add/Remove costs](https://support.innovint.us/hc/en-us/allocate-costs-indirect-direct?hsLang=en)."
![Onboard Starting Costs & Cost Settings-bulk cost method](https://support.innovint.us/hs-fs/hubfs/Onboard%20Starting%20Costs%20%26%20Cost%20Settings-bulk%20cost%20method.webp?width=688&height=359&name=Onboard%20Starting%20Costs%20%26%20Cost%20Settings-bulk%20cost%20method.webp)
Enter in your starting bulk cost per lot using the "Bulk Wine" category. Make a note(s) that this is the starting cost of each lot (either as of today or a recent date in the past) now that you're using InnoVint.

This will be your known "snapshot" starting lot cost as of your selected date.  After this point, you can layer in ongoing indirect and direct costs as they occur in your chosen cost categories.

![Onboard Starting Costs & Cost Settings-add remove costs](https://support.innovint.us/hs-fs/hubfs/Onboard%20Starting%20Costs%20%26%20Cost%20Settings-add%20remove%20costs.webp?width=688&height=354&name=Onboard%20Starting%20Costs%20%26%20Cost%20Settings-add%20remove%20costs.webp)

#### *Itemized method*:

If you know the cost category breakdown of each lot, great! You can add each cost category item (ie. additives, labor, fruit, etc) separately per lot for a more detailed starting point. See more about cost categories [below](#cost-category).

Once recorded, the starting lot cost is set, and as more costs are added, and lots are blended together these costs will be distributed according to our [cost distribution rules](https://support.innovint.us/hc/en-us/cost-distribution-rules?hsLang=en).

### Cost Item Lock Backdating

The Lock Cost item backdating function can only be set by users with **Admin** capability. This option is only available for accounts that have activated the COGS Tracking module.

To restrict backdating at the end of a period, go to **Settings > Lock Backdating**. Lock Backdating for cost items allows an Admin to set the earliest date and time at which a Cost Item can be backdated in InnoVint, likely corresponding with the end of the most recent financial reporting period.

![Onboard Starting Costs & Cost Settings-set lock date](https://support.innovint.us/hs-fs/hubfs/Onboard%20Starting%20Costs%20%26%20Cost%20Settings-set%20lock%20date.webp?width=688&height=329&name=Onboard%20Starting%20Costs%20%26%20Cost%20Settings-set%20lock%20date.webp)

If a user tries to backdate a cost item to before the lock date, they will get this error message:

![Onboard Starting Costs & Cost Settings-error](https://support.innovint.us/hs-fs/hubfs/Onboard%20Starting%20Costs%20%26%20Cost%20Settings-error.webp?width=453&height=116&name=Onboard%20Starting%20Costs%20%26%20Cost%20Settings-error.webp)

**Owner-based Permissions**: Lock backdating for Cost Items affects the entire account and is not owner-specific.

### Additional Resources

1. [COGS Tracking in InnoVint (Overview)](https://support.innovint.us/hc/en-us/cogs-tracking-in-innovint?hsLang=en)
2. [Learn how to allocate costs (direct, indirect)](https://support.innovint.us/hc/en-us/allocate-costs-indirect-direct?hsLang=en)
3. [Review cost reports and reconciliation](https://support.innovint.us/hc/en-us/cost-reports?hsLang=en)
4. [Interested in learning more? See how InnoVint distributes costs](https://support.innovint.us/hc/en-us/cost-distribution-rules?hsLang=en)

### FAQ

**Q: How do I decide which cost categories to use?**

*A: You just assigned all your starting lot costs using either the Bulk Cost or Itemized method. In doing so, you may have noticed the list of categories or types. This list is meant to provide you with options to categorize your costs as broadly or granularly as needed.*

*Remember, **Cost Items** are applied "indirectly" and the timing of application is controlled by you. **Raw materials**, such as Fruit, Packaging, and Additives may be applied "directly," or indirectly as a Cost Item.*

💡 Our recommendation, start simple with a few categories, add complexity later.

*Here are some examples to give you an idea:*

|  |  |  |  |
| --- | --- | --- | --- |
| **Winery** | **Size** | **Categories Utilized** | **Details** |
| Winery A | < 5,000cs, 1 site | Fruit (Direct), Packaging (Direct), Lab Analysis, Overheads | Non-estate sourced fruit, packaging applied at bottling, ETS analysis. Otherwise monthly overheads capitalized across inventory in a single category |
| Winery B | 10,000cs, 1 site | Fruit (Direct), Barrel Depreciation, Packaging (Direct), Overheads | 100% farmed, landed fruit cost added after harvest, majority new french oak, packaging applied at bottling, monthly overheads capitalized across inventory |
| Winery C | 50,000cs, 3 sites | Fruit (Cost Item), Bulk Wine, Overheads | 3 locations, constant volume transfers between them. Capitalize direct and overhead costs each month against inventory volume. Fruit cost applied as a cost item once the receiving location is known. |
| Winery D | 100,000cs+, multi-site | Fruit (Direct), Bulk Wine, Custom Crush, Equipment Depreciation, Lab Analysis, Debt Interest, Barrel Depreciation, Labor & Cellar, Storage, Overheads, Other | Input direct raw materials, Labor, then capitalize overhead costs each month. Manage equipment and barrel depreciation schedule outside of InnoVint, then inputs monthly, granularly tracks Custom Crush and other fees |

**Q: I am not an Admin on the account. How can I update the cost item backdating?**

*A: Please coordinate with an Admin on the account to do this for you on a regular schedule, or assess together if additional capability settings are appropriate for your specific role.*
