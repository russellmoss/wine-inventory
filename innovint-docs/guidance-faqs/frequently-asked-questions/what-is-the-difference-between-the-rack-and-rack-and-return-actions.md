---
title: "What is the difference between the \"Rack\" and \"Rack and Return\" actions?"
url: "https://support.innovint.us/hc/en-us/articles/204133239-what-is-the-difference-between-rack-and-rack-and-return-"
category: "Guidance & FAQs"
section: "Frequently Asked Questions"
page_type: "article"
lastmod: "2025-11-20"
gist: "Racking your barrels or other vessels off lees?"
tags: ["transfers", "barrels", "ux-friction", "work-orders", "getting-started", "lot-identity"]
---

# What is the difference between the "Rack" and "Rack and Return" actions?

## The "Rack" and "Rack and Return" actions have different capabilities and achieve different outcomes. Read on for the details!

Racking your barrels or other vessels off lees?  InnoVint supports two actions that sound similar but work very differently.  One or the other may be the best option for you, depending on your cellar workflows, and the fill levels of your vessels.  This article will describe the differences, and the benefits and drawbacks of each action.

- [Action overviews](#overview)
- [What is a Rack action?](#What-is-Rack)
  - [Suggested Rack and Return sequence using the Rack action](#Rack-sequence)
- [What is a Rack and Return action?](#What-is-R-and-R)
  - [Tips for Rack and Return](#R-and-R-Tips)
- [Video tutorial](#video-tutorial)

### Action overviews

A **Rack** action is an action that moves a lot out of its original vessel(s) into different ones (it is a specially named Transfer action). A Rack action/task cannot return the lot being racked back to the vessels it came out of within the same action or task. It allows the creation or use of an existing lees lot within the action.

The **Rack and Return** actionis a unique action that **"**moves" a lot from its vessel(s), references a temporary holding vessel, and records an adjusted volume to the original vessel(s) within a single action. The lot code cannot be changed. It provides a specific option for Breakdown Vessels, as well as allows for the creation or use of an existing lees lot within the action.

### **What is a Rack action?**

This action can be used singly to record a one way wine movement, or in combination with other actions to request a rack and return sequence.  This action moves a lot out of its original vessel(s) and into a different one(s). A Rack action/task cannot return the lot to the vessels it came out of within the same action or task. Get the step by step details on performing a Rack [here](https://support.innovint.us/hc/en-us/articles/204768955-using-the-rack-action?hsLang=en).

- When a lot is being racked, it can keep its initial lot code, be racked into another existing lot (blended), or be racked and end with a new lot code
- A lot can be racked to more than one final destination lot
- The Rack action does not include a specific breakdown vessel section (the Rack and Return does specify breakdown vessels)
- Lees can be kept or discarded. If kept, it can either be combined into an existing lot or a new lees lot can be created for them (this also applies to Rack and Return)

#### Suggested Rack and Return sequence using the Rack action

- Rack out in one action into a specified vessel:
  ![What is the difference between the Rack and Rack and Return actions-rack](https://support.innovint.us/hs-fs/hubfs/What%20is%20the%20difference%20between%20the%20Rack%20and%20Rack%20and%20Return%20actions-rack.webp?width=670&height=445&name=What%20is%20the%20difference%20between%20the%20Rack%20and%20Rack%20and%20Return%20actions-rack.webp)
- While the lot is in tank, you can record or request addition or analysis actions/tasks
- Rack back to barrel using a **second** Rack (or Barrel Down) action:
  ![What is the difference between the Rack and Rack and Return actions-rack to](https://support.innovint.us/hs-fs/hubfs/What%20is%20the%20difference%20between%20the%20Rack%20and%20Rack%20and%20Return%20actions-rack%20to.webp?width=670&height=427&name=What%20is%20the%20difference%20between%20the%20Rack%20and%20Rack%20and%20Return%20actions-rack%20to.webp)

Tip: Create a work order (or work order template) with multiple tasks to request a Rack (out of barrels to tank), Analysis/Addition (check and adjust your lot in tank), and a Barrel Down task (return your lot to barrels).  This allows you easily select the same barrels to return the lot to at work order creation.

### **What is a Rack and Return action?**

This action is intended to allow you to easily record a wine movement from one or many topped vessels (i.e. racking barrels during the aging process) and keep it in the same starting vessels. It assumes that a homogenized wine lot will be moved back into the same vessels, and that one or more of those starting vessels may now be partial or empty due to lees loss.

Rack and Return is a one step action that records a lot as being moved from it's vessel(s), to a temporary holding vessel, and then back to the original vessel(s). **The holding vessel details are only recorded as a text note - there is no true movement of lot contents in InnoVint.** Get the step by step details on performing a Rack and Return [here](https://support.innovint.us/hc/en-us/articles/204178409-using-the-rack-and-return-action?hsLang=en).

- Lots being racked and returned retain the same lot code throughout the movement
- The lot is not moved into a different vessel(s) via the action. It will return to all or some of the same vessels selected for racking
- Additional breakdown vessels can be added in the action (not available in Rack action)
- Lees can be kept or discarded. If kept, it can either be combined into an existing lot or a new lees lot can be created for them within the action (same as Rack action)
- Existing individual vessels in the lot cannot show a gain in volume (you cannot top off vessels)
- An overall net gain on the action may be recorded by utilizing breakdown vessels or lees lots. Breakdown and lees individual vessels may record a gain in volume

  ![What is the difference between the Rack and Rack and Return actions-rack and return](https://support.innovint.us/hs-fs/hubfs/What%20is%20the%20difference%20between%20the%20Rack%20and%20Rack%20and%20Return%20actions-rack%20and%20return.webp?width=670&height=581&name=What%20is%20the%20difference%20between%20the%20Rack%20and%20Rack%20and%20Return%20actions-rack%20and%20return.webp)

#### Tips for Rack and Return

- It may not be the most efficient option to use a rack and return action with a lot of partial barrels that you want to rack *and* top off while returning to barrel.  **Rack and Return won't accept a volume gain on an individual vessel**. Consider using a Rack action instead, in conjunction with a Barrel Down action, per the Rack section above.
- You cannot "hold" wine in the holding vessel in InnoVint and perform an Analysis or Addition action on that individual vessel.  You can complete a Rack and Return and then perform an Analysis or Addition action/task to the lot but it will need to be applied to the lot's starting or ending vessels.

### Video Tutorial
