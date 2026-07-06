---
title: "How to Record a Rack and Return"
url: "https://support.innovint.us/hc/en-us/articles/204178409-using-the-rack-and-return-action"
category: "MAKE"
section: "Movement Actions"
page_type: "article"
lastmod: "2025-11-20"
gist: "Note: The Rack and Return action does not allow multiple lots to be blended then returned to the same vessels."
tags: ["transfers", "barrels", "work-orders", "blending", "ux-friction"]
---

# How to Record a Rack and Return

## The Rack and Return action allows you to move one lot from its current vessels and return that lot into the same vessels within one action or task.

This article contains:

- [About the Rack and Return](#about)
- [How to record a Rack and Return](#how-to)
- [What is the difference between a "Rack and Return" and a "Rack"](#what)
- [FAQ](#FAQ)

### About the Rack and Return

- Rack and Return is an action and a task
- Rack and Return can be accessed via the 'record action' dropdown in the top navigation bar or the lot details page, or added as a task to a work order
- Each Rack and Return can only apply to one lot, and that lot's selected vessels cannot show a gain

**Note:** The Rack and Return action does not allow multiple lots to be blended then returned to the same vessels. Go to [this post](https://support.innovint.us/hc/en-us/how-do-i-record-a-blend-and-return?hsLang=en) on how to record a Blend and Return.

### How to record a Rack and Return

In either the action or task, the steps are the same:

1. Select the lot from the lot dropdown or in the lot picker

2. If you want to record or request a specific vessel for the racking, then enter a holding vessel into the text field. This field is optional

3. Select which vessels to rack and return

- The ending fill in the action or completed task should reflect the volume *after* the 'return'. If a vessel is now empty or partial, make sure the ending fill volume is updated.
  *Example below: 5 barrels are racked. Barrel 17BAR-A001 is now empty (it will be completely broken down in the action). The ending fill shows 0 gallons remaining in that barrel. (Alternatively, barrel 17BAR-A001 could have been left partial by adjusting the ending fill accordingly.)*
  ![How to Record a Rack and Return-how to](https://support.innovint.us/hs-fs/hubfs/How%20to%20Record%20a%20Rack%20and%20Return-how%20to.png?width=688&height=597&name=How%20to%20Record%20a%20Rack%20and%20Return-how%20to.png)

4. Add any breakdown vessels (optional)

- The ending fill of the breakdown vessels should reflect the volume after the lot has been 'returned'.
  Example: A partial barrel was fully broken down into 4 kegs after the rack and return. From the example in Step 3 (above), barrel 17BAR-A001 started with 60 gal and is now empty - but 55 gallons have been added to kegs.

5. Select whether to save lees to a different lot.

- Lees volume can be saved to a new or existing lot.

  ![How to Record a Rack and Return-breakdown vessels](https://support.innovint.us/hs-fs/hubfs/How%20to%20Record%20a%20Rack%20and%20Return-breakdown%20vessels.webp?width=688&height=597&name=How%20to%20Record%20a%20Rack%20and%20Return-breakdown%20vessels.webp)

### What is the difference between the "Rack and Return" and "Rack" actions?

Check out the full article comparing these two actions [here](https://support.innovint.us/hc/en-us/articles/204133239-what-is-the-difference-between-rack-and-rack-and-return-?hsLang=en), or read through a summary of the main differences below:

#### **Rack and Return**

This is a one step action that records a lot as being moved from it's vessel(s), to a temporary holding vessel, and then back to the original vessel(s). The lot cannot change lot code.

- Breakdown vessels can be added in the action
- Lees can be kept or discarded, and either combined into an existing lot or a new lees lot within the action
- Existing individual vessels in the lot cannot show a gain in volume - this action cannot be used to top off partial vessels

Tip: Use a Rack and Return for lots in full barrels. The action will not allow a net gain in volume for a vessel.

#### **Rack**

This action moves a lot out of its original vessel(s) and into a different one(s). A [Rack action/task](https://support.innovint.us/hc/en-us/articles/204768955-using-the-rack-action?hsLang=en) cannot return the lot to the vessels it came out of within the same action or task. However, this action can be used in combination with other actions to record or request a [rack and return sequence](https://support.innovint.us/hc/en-us/articles/204133239-what-is-the-difference-between-rack-and-rack-and-return-?hsLang=en#Rack-sequence).  The lot can keep its initial code, be racked into another existing lot, or be racked into a new lot code.

- A lot can be racked to more than one final destination lot
- The Rack action does not include a specific Breakdown vessel section
- Lees can be kept or discarded, and either combined into an existing lot or a new lees lot within the action

Tip: Create a work order with multiple tasks to request a Rack (out of barrels to tank), Analysis/Addition (check and adjust your lot in tank), and a Barrel Down task (return your lot to barrels).  This allows you easily select the return barrels at work order creation.

### FAQ

**Q: I'm getting an error "Oops, we can't record this action. Positive volume change in a drain for vessel ..." What gives?**

*A: The Rack and Return action/task will not allow you to take an ending gain on any vessel from the racked lot.  If you racked partial barrels, you can not top them off using the Rack and Return action. If you need to top off barrels, you can use a second Top Off or Transfer action.*

**Q: I've ended up with a partial barrel? How do I top it up in the action?**

*A: A Top Off cannot be completed within a Rack and Return task or action and must be completed as a second task or action after the original Rack and Return is submitted. Use an additional [Top Off](//innovint-6865708.hs-sites.com/hc/en-us/articles/115002951483-using-the-top-off-feature?hsLang=en) action to top with either the same or different lot.*

**Q: Why can't I can't select a holding vessel**

*A: The "Holding Vessel" is just a text field and does not require you to select a vessel via the vessel picker.*
