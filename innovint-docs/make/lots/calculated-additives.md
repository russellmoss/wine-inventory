---
title: "Calculated Additives"
url: "https://support.innovint.us/hc/en-us/calculated-additives"
category: "MAKE"
section: "Lots"
page_type: "page"
lastmod: "2026-01-05"
gist: "The Calculated Additives feature helps you trace and track additive amounts in your wine and juice lots—automatically."
tags: ["additives", "blending", "transfers", "ux-friction", "compliance", "exports"]
---

# Calculated Additives

### What is the Calculated Additives Feature?

The Calculated Additives feature helps you trace and track additive amounts in your wine and juice lots—automatically. It’s especially useful for blending and label compliance, as well as ingredient tracking and allergen disclosures.

As wine is moved, blended, or removed from InnoVint, additive amounts in each lot are recalculated and tracked to ensure your compliance records and product makeup stay accurate.

This article contains

- [How it Works](#how)
- [Where to Find Calculated Additive Information](#where)
- [When Do Additive Amounts Update?](#when)
- [How Additives Are Calculated](#How_Calculated)
- [FAQ](#FAQ)

### How It Works

#### Additive Tracking

- When you record an **Addition** to a juice/wine lot, InnoVint tracks the additive type, product, batch and amount.
- As wine **moves** (via transfer, topping, blends, etc.), additive amounts contained in the lot are proportionally recalculated based on volumes.
- If an action is **edited** or **backdated**, the additive amounts update accordingly.

  - Please note that there is a backdating limit for Additions: Addition actions may only be backdated up to 14 months (430 days). If exceeded, you'll see this error:

    “Unable to record this action. Addition actions may not be backdated more than 430 days.”

#### Snapshots on Wine Removal

When wine leaves your system (e.g., via bottling, B2B transfer out or volume adjustments), InnoVint captures a snapshot of all additive products and their calculated amounts at that moment. These are included in the "Removed Additives Export".

### Where to Find Calculated Additive Information

You can view calculated additive details in two main places:

#### **1. Lot details > Additive tab**

**![Calc Additives-UI](https://support.innovint.us/hs-fs/hubfs/Calc%20Additives-UI.png?width=670&height=368&name=Calc%20Additives-UI.png)**

The Additive tab in the Lot details page contains the following columns to view the total amount of additives in the lot:

- **Product**: Additive product name
- **Type**: Product type (e.g., acid, enzyme)
- **Amount**: Total calculated amount by product and units
- **Indicators**: Any associated [additive indicator](https://support.innovint.us/hc/en-us/articles/115000825066-how-to-create-additives-and-additive-batches?hsLang=en#NewProduct) designations (e.g., Allergen, Organic)
- **Batch**: Up to 3 listed on-screen - all batches are listed in the export
- **Last Added**: Displays the date of most recent action per batch
- **Via**: Links to the action where additive was last added

#### 2. **Export**

The Additive table includes an export with more detailed information.

![Calc Additives - export](https://support.innovint.us/hs-fs/hubfs/Calc%20Additives%20-%20export.png?width=670&height=349&name=Calc%20Additives%20-%20export.png)Find the Export button at the top right of the table - it provides you with two export options: "Current additives" and "Removed additives".

- The **Current Additives** export includes:
  - Additive Name (product name)
  - Batch ID
  - Current calculated amount & units
  - Additive Indicators
  - Date & Action of Last Addition of the batch
  - Action URL
- The **Removed Additives** export is a snapshot triggered when wine leaves the system. Includes:
  - Removed Volume/Weight
  - Removal Reason (indicates the action and the reason, ie Volume Adjustment: Inventory losses)
  - Additive Details (same format as above)
  - Action URL

### When Do Additive Amounts Update?

- When wine is moved in/out of a lot (directly or via work order).
- When a new or backdated Addition action is submitted.
- When historical actions are edited or deleted.
- On [**Bleed**](https://support.innovint.us/hc/en-us/articles/204651979-juice-bleed-saign%C3%A9e?hsLang=en) or [**Drain** actions](https://support.innovint.us/hc/en-us/how-to-record-a-drain?hsLang=en) (for lots in weight) we distribute additives from the lot in weight into a lot in volume based on the special "Expected Yield for calculated additives" field that exists on these actions. This field defaults to the lot's expected yield, but can be updated independently and does not impact the *lot’s* expected yield.

A visual indicator will block access to the Additive tab during extended additive recalculations to avoid errors.

![Calc Additives - recalcuting screen](https://support.innovint.us/hs-fs/hubfs/Calc%20Additives%20-%20recalcuting%20screen.png?width=670&height=58&name=Calc%20Additives%20-%20recalcuting%20screen.png)

### How Additives Are Calculated

- Additives follow volume (similar to cost). A proportional amount will be removed from a lot via movement or an action loss.
- Additives are lost during action (inventory) losses, but we never add additional additives during a gain.
- Additives are calculated in the **addition unit**, not inventory unit (e.g., mL, g) and are tracked to 5 decimal places.
- Trace additive amounts remain visible (as "<0.0001") until the lot is completely emptied.

#### Special notes to keep in mind

- When multiple batches are consumed in an addition, they are split based on the amount removed. If no amount is removed from a batch, then the additives per batch are applied equally to the involved lots.

  ![Calc additive - amt removed](https://support.innovint.us/hs-fs/hubfs/Calc%20additive%20-%20amt%20removed.png?width=670&height=371&name=Calc%20additive%20-%20amt%20removed.png)
- B2B within winery and B2B to another IV winery actions do not transfer additives (but [Transfer (Inter-facility)](https://support.innovint.us/hc/en-us/bond-to-bond-b2b?hsLang=en#B2B_IV) does!
- During an action which retains the lot code, if there is no volume change in the retained lot code, but there is a net gain on the action from another filled lot such as a lees lot, then additives are redistributed proportionally to all involved lots. The total additives overall will not increase across the filled lots, but the retained lot's additives will decrease (because they are distributed proportionally by volume into the other lot(s)).

### FAQ

**Q: I don't see my Additives tab on my case good lots!**

*A: Only juice/wine lots (when in volume and weight) support calculated additives. Fruit lots and case goods lots are not supported.*

**Q: I don't see the additives on my "from" blend lot component!**

*A: If a movement action drains ALL content from a lot (if volume and weight are equal to zero), all additives are cleared from that lot.  This is because the Additives tab is intended to show how much, in absolute terms, of an additive is a part of the lot contents. If the lot contents are 0, then the additives are also gone. You can find these additives "transferred" into the filled lot(s).*

**Q: I bond transferred my lot into another InnoVint winery, but my lot at the new winery isn't showing any additives!**

*A: The "B2B within winery" and "B2B to another IV winery" actions do not copy additives into the new lot. For these actions, we recommend exporting the source lot's additive snapshot (from the B2B action). Then, re-record an Addition action with zero removed from the batch (this maintains your dry goods inventory), but adding the desired quantity into the lot, in order to add the additives back into the new lot. We do recommend doing an addition task per product batch instead of including all batches at once.*
