---
title: "How to Archive or Delete SKUs"
url: "https://support.innovint.us/hc/en-us/how-to-archive-or-delete-skus"
category: "SUPPLY"
section: "Using SUPPLY"
page_type: "page"
lastmod: "2026-01-28"
gist: "This article explains how to archive, unarchive, and delete SKUs in SUPPLY."
tags: ["packaging", "inventory", "ux-friction", "dtc-sales", "getting-started", "integrations"]
---

# How to Archive or Delete SKUs

This article explains how to **archive**, **unarchive**, and **delete** SKUs in SUPPLY.

### Overview

Managing SKUs cleanly is critical for accurate reporting and a usable day‑to‑day workflow. SUPPLY supports two ways to remove SKUs from active use. Read more below about how and when to [archive](#archive) or [delete](#delete) a SKU.

- [Archiving and Unarchiving SKUs](#archive)

  - [When to Archive a SKU](#when-archive)
  - [How to Archive (or Unarchive) a SKU](#archive)
  - [What Happens If Inventory Is Added to an Archived SKU?](#Automatic)
  - [Commerce 7 Integration Behavior](#C7)

- [Deleting SKUs](#delete)

  - [When to Delete a SKU](#delete-when)
  - [How to Delete a SKU](#Delete-how)
- [FAQ](#faq)

### Archiving and Unarchiving SKUs

#### When to Archive a SKU

Archive a SKU when it is no longer active but should remain in the system for historical accuracy. You can archive a SKU if:

- The SKU has **zero inventory** (including no negative inventory), and
- There are **no open orders or open depletions** associated with it.

#### How to Archive (or Unarchive) a SKU

- Navigate to the **SKU Details** page.
- Open the **More** menu.
- Select **Archive SKU** or **Unarchive SKU**![SUPPLY_Archive SKU](https://support.innovint.us/hs-fs/hubfs/SUPPLY_Archive%20SKU.jpg?width=670&height=335&name=SUPPLY_Archive%20SKU.jpg)

You will see when a SKU was archived (or unarchived) in the SKU’s history.

![SUPPLY_Archive SKU_SKU History Event](https://support.innovint.us/hs-fs/hubfs/SUPPLY_Archive%20SKU_SKU%20History%20Event.jpg?width=670&height=337&name=SUPPLY_Archive%20SKU_SKU%20History%20Event.jpg)

**📌 Tip:** Use the Archived filter in the SKU Explorer or Inventory Explorer to find previously archived SKUs.

#### What Happens If Inventory Is Added to an Archived SKU?

Sometimes a backdated action or an edit to a past action can result in inventory being added to a SKU that is currently archived.

When this happens:

- SUPPLY will **automatically unarchive the SKU**
- An **Unarchived** event is added to the SKU’s history
- That history entry includes a **link to the action** that caused the SKU to be unarchived

#### Commerce7 Integration Behavior

Commerce7 can still interact with archived SKUs.

- Archived SKUs **can remain linked** to Commerce7 products
- Commerce7-driven actions can create inventory on archived SKUs
- If that happens, SUPPLY will **automatically unarchive the SKU** and log the event in SKU History

### Deleting SKUs

#### When to Delete a SKU

Delete a SKU when it was created in error and should be fully removed from the system.You can delete a SKU if:

- The SKU has **no remaining actions associated with it** (or all actions involving the SKU have been deleted or edited to remove it), ***and***
- The SKU is **not linked to a Commerce7 product**.

Deletion is best for SKUs created by mistake that should not exist in reporting or workflows going forward. Once a SKU has been deleted, the SKU code can be reused.

#### How to Delete a SKU

- Navigate to the **SKU Details** page.
- Open the **More** menu.
- Select **Delete SKU**. ![SUPPLY_SKU Details_Delete SKU](https://support.innovint.us/hs-fs/hubfs/SUPPLY_SKU%20Details_Delete%20SKU.jpg?width=670&height=338&name=SUPPLY_SKU%20Details_Delete%20SKU.jpg)
- Review the warning and confirm deletion. ![SUPPLY_Delete SKU Warning](https://support.innovint.us/hs-fs/hubfs/SUPPLY_Delete%20SKU%20Warning.jpg?width=391&height=142&name=SUPPLY_Delete%20SKU%20Warning.jpg)

### Frequently Asked Questions

**Q. Can I reuse an archived SKU code?**
*A. Archived SKUs keep their codes permanently.*

*If you want to move more inventory into an existing archived SKU, with the same format and grouping, and any existing history, you can unarchive it and reuse it. Or, just use the Archived filter in the SKU or Inventory picker of an action to find and add inventory to an already archived SKU and automatically unarchive it.*

*If you do not want to associate new inventory with those existing SKU details, you can consider renaming the archived SKU and then recreating the desired SKU code.*

**Q. Can I reuse a SKU code after deleting?**
*A. Yes. Once deleted, the SKU code is completely available for reuse. Any past reference is removed from the database.*

**Q. Are archived SKUs included in reporting?**
*A. Yes. Archived SKUs remain part of historical reporting and exports. You can always find archived SKUs using the Archived filter available in the SKU and Inventory Explorers.*
