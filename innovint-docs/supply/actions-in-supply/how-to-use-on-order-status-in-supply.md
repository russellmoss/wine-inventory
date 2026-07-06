---
title: "How to use \"On order\" Status in SUPPLY"
url: "https://support.innovint.us/hc/en-us/supply-on-order-status"
category: "SUPPLY"
section: "Actions in SUPPLY"
page_type: "page"
lastmod: "2026-02-11"
gist: "\"On order\" status in SUPPLY helps you more easily understand which inventory is attributed to an unfulfilled order and is not currently available to sell."
tags: ["dtc-sales", "inventory", "integrations", "ux-friction", "packaging"]
---

# How to use "On order" Status in SUPPLY

**This article covers:**

- [What is "on order" status in SUPPLY?](#What)
- [How does "on order" status work?](#How)
  - [In SUPPLY](#How-In-SUPPLY)
  - [With Commerce7](#How-In-C7)
- [Where do I find "on order" status for my inventory?](#where)
- [FAQ](#FAQ)
- [Terminology used in Commerce7 & SUPPLY](#help-terms)

### **What is "on order" status in SUPPLY?**

"On order" status in SUPPLY helps you more easily understand which inventory is attributed to an unfulfilled order and is not currently available to sell.

SUPPLY tracks "On order" status from two sources:

- Open Depletions created within SUPPLY

  - In SUPPLY, an "On order" status will be attributed to a quantity of inventory when an [open depletion is created](/hc/en-us/how-to-move-or-deplete-inventory#deplete-inventory).
- Allocated inventory in Commerce7

  - In SUPPLY, "On order - C7" status reflects the ‘allocated’ inventory quantities displayed in C7 for linked SKUs at linked locations.

![](https://support.innovint.us/hs-fs/hubfs/image-png-Feb-09-2026-10-40-07-7496-PM.png?width=670&height=130&name=image-png-Feb-09-2026-10-40-07-7496-PM.png)

### How does "on order" status work?

#### In SUPPLY

In SUPPLY, "On order" status is created through Open Depletions.

- Create an Open Depletion via the [Deplete Inventory action](https://support.innovint.us/hc/en-us/how-to-move-or-deplete-inventory?hsLang=en#deplete-inventory).
  ![SUPPLY - Create Open Depletion](https://support.innovint.us/hs-fs/hubfs/SUPPLY%20-%20Create%20Open%20Depletion.png?width=670&height=263&name=SUPPLY%20-%20Create%20Open%20Depletion.png)
- You can view these open depletions via the Open Depletion explorer - found in the left hand navigation bar.
  ![SUPPLY - open depletions](https://support.innovint.us/hs-fs/hubfs/SUPPLY%20-%20open%20depletions.png?width=670&height=216&name=SUPPLY%20-%20open%20depletions.png)
- Open depletions can be edited and saved again and left open - thus updating the quantity of inventory in "On order" status - or they can be submitted to finalize a depletion.
- You may not backdate an Open depletion - if you check the backdate box, then the ‘Create open depletion’ button will be greyed out until you uncheck it.
- Upon submission, the inventory that was previously in an "On order" status is removed from "On order", and the total inventory of the SKU will be reduced as of the submitted date/time of the action.
- You may delete an Open Depletion. After deleting the open task, ALL inventory quantities entered in the task will be removed from the "On order" status and moved back to "Available".

#### **With the Commerce7 integration**

If your organization is connected to Commerce7, SUPPLY displays C7 allocated inventory as "On order".

How On order - Commerce7 Works

- “Allocated” in C7 shows inventory tied to unfulfilled orders. The allocated inventory number will appear in SUPPLY as "**On order – C7"**
  ![SUPPLY-C7-Allocated](https://support.innovint.us/hs-fs/hubfs/SUPPLY-C7-Allocated.png?width=670&height=177&name=SUPPLY-C7-Allocated.png)
  ![SUPPLY-C7 on order](https://support.innovint.us/hs-fs/hubfs/SUPPLY-C7%20on%20order.png?width=670&height=183&name=SUPPLY-C7%20on%20order.png)
  - Only linked locations & SKUs will show C7 values in SUPPLY.
    - If a linked SKU has no allocated inventory in C7, it will show "0"
  - Unlinked locations will show “–"

- Upon fulfillment (when inventory is removed from "allocated" in C7), the inventory that was previously in an "On order" status is removed from "On order", and the total inventory of the SKU will be depleted as of the submitted date/time of the action in C7.
- SUPPLY actions will only update **Available for sale** inventory in C7

### Where do I find "on order" status for my inventory?

A SKU's "On order" status is displayed throughout SUPPLY  to give you the best understanding of the state of your inventory at all times. When the Commerce7 integration is configured, the "On order" column displays the sum of the "On order" quantities from SUPPLY and Commerce7 within all tables

- **SKU Explorer & Inventory Explorer.** Available and "On order" status is always pinned to the right side of the explorer.
  ![](https://support.innovint.us/hs-fs/hubfs/image-png-Oct-15-2025-11-07-19-0817-PM.png?width=670&height=326&name=image-png-Oct-15-2025-11-07-19-0817-PM.png)
- **SKU picker.** Available and "On order" status is always pinned to the right side of the picker.
  ![SUPPLY - SKU picker with available-on-order](https://support.innovint.us/hs-fs/hubfs/SUPPLY%20-%20SKU%20picker%20with%20available-on-order.png?width=670&height=391&name=SUPPLY%20-%20SKU%20picker%20with%20available-on-order.png)
- **Inventory picker**. Available and "On order" status is always pinned to the right side of the picker.
  ![SUPPLY - Inventory pick with on-order](https://support.innovint.us/hs-fs/hubfs/SUPPLY%20-%20Inventory%20pick%20with%20on-order.png?width=670&height=391&name=SUPPLY%20-%20Inventory%20pick%20with%20on-order.png)
- SKU details page. Dive into the nitty gritty of what contributes to your "On order" inventory and where it is located.
- View "On order" status via the Inventory Availability breakdown, or the Inventory by Location widget. Both sections offer views broken down into:
  - On order - SUPPLY
  - On order - C7 (if applicable)
  ![SUPPLY - On order - SKU Details](https://support.innovint.us/hs-fs/hubfs/SUPPLY%20-%20On%20order%20-%20SKU%20Details.png?width=670&height=180&name=SUPPLY%20-%20On%20order%20-%20SKU%20Details.png)

- Record Action screens. Available and "On order" status is always pinned to the right side of the picker, allowing you to see what is truly available in an action.
  ![SUPPLY - movement - on-order](https://support.innovint.us/hs-fs/hubfs/SUPPLY%20-%20movement%20-%20on-order.png?width=670&height=238&name=SUPPLY%20-%20movement%20-%20on-order.png)

### FAQ

**Q: How does On Order status impact my TTB reporting?**

*A: The Available/On-order status of in-bond inventory does not affect TTB reporting. SUPPLY only reviews the tax status of inventory line items when compiling the TTB export.*

**Q: Can I use the Depletion Import to create Open Depletions?**

*A: No - currently open depletions do not interact with the Import Depletions functionality.*

**Q: Why did my Available inventory decrease after connecting Commerce7?**

**A:** If you have unfulfilled orders in C7, and you have a quantity of inventory listed as "allocated", this allocated inventory is now included in your “On order” total, reducing Available inventory.

**Q: Why do I see “–” in the On order – C7 column?**

***A:** This means the SKU or location is not linked to Commerce7.*

### Terminology used in Commerce7 & SUPPLY

- **Allocated**
  This is the term for ‘on-order’ inventory status in Commerce7. It refers to inventory sold that has not yet been picked up or shipped.
- **Available for sale**
  The term for ‘available’ inventory status in Commerce7. It refers to inventory that has not yet been sold and is available to be sold.
- **Available inventory**
  In SUPPLY, this refers to the status of inventory quantities that are not attributed to any orders and are available for sale.  In SUPPLY:
  *(Available inventory) + (On-order inventory) = Total inventory*
- **On-order inventory**
  In SUPPLY, this refers to the status of inventory quantities that are attributed to an open order that has been created in SUPPLY but has not yet been fulfilled (ie: shipped or picked up).  The location is still physically holding the inventory but this inventory is not available for sale because it’s already earmarked for a specific order. In SUPPLY:
  *(Available inventory) + (On-order inventory) = Total inventory*
- **Reserve**
  The term used in Commerce7 to denote inventory that is manually sequestered and held from being purchased.  This inventory status does not map to any inventory status in SUPPLY and is not used in the integration.
