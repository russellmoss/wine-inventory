---
title: "How to Record a Blend"
url: "https://support.innovint.us/hc/en-us/articles/204742525-how-to-record-a-blend-action"
category: "MAKE"
section: "Movement Actions"
page_type: "article"
lastmod: "2025-11-20"
gist: "The Blend action is used for combining two or more lots together to create a new wine lot or a new composition of an existing lot."
tags: ["blending", "barrels", "work-orders", "ux-friction", "inventory", "transfers"]
---

# How to Record a Blend

The Blend action is used for combining two or more lots together to create a new wine lot or a new composition of an existing lot.

This article covers:

- [How to create a Blend task in a work order](#blend_task)
  - [When to Request a specific Remove Volume vs an Ending fill](#relative)
- [How to record a Blend direct action](#direct_action)
- [Frequently Asked Questions](#faq)

WARNING: You cannot use a Blend action to perform a Blend and Return (ie removing volume from vessels to blend multiple lots and then returning the volume to the same vessels). If you wish to record a Blend and Return, please follow the instructions in [this post](https://innovint-6865708.hs-sites.com/hc/en-us/manage-barrel-fermentations?hsLang=en).

### Create a Blend task in a work order

1. Select the first lot to blend from the dropdown list or the lot picker
   ![How to Record a Blend-select lot-1](https://support.innovint.us/hs-fs/hubfs/How%20to%20Record%20a%20Blend-select%20lot-1.webp?width=688&height=277&name=How%20to%20Record%20a%20Blend-select%20lot-1.webp)
2. Select all or only some vessels from the lot. Use the Edit vessels option to select specific vessels.
   ![How to Record a Blend-vessels](https://support.innovint.us/hs-fs/hubfs/How%20to%20Record%20a%20Blend-vessels.webp?width=688&height=278&name=How%20to%20Record%20a%20Blend-vessels.webp)
3. Show the vessels list, and then decide whether to request the *specific amount to remove* from a vessel, or, the *ending fill* on a vessel. Find out more about the option to request "Remove" volume versus an "Ending Fill" [here](#relative).
   ![How to Record a Blend-show vessels](https://support.innovint.us/hs-fs/hubfs/How%20to%20Record%20a%20Blend-show%20vessels.webp?width=688&height=305&name=How%20to%20Record%20a%20Blend-show%20vessels.webp)
4. Adjust the gallons to remove from or leave in each vessel.
   1. If you are not depleting the full volume of the lot, make sure to double check the gallons removed from each vessel.
5. Select additional lots to blend and follow the same instructions as above.
   ![How to Record a Blend-additional lots](https://support.innovint.us/hs-fs/hubfs/How%20to%20Record%20a%20Blend-additional%20lots.webp?width=688&height=375&name=How%20to%20Record%20a%20Blend-additional%20lots.webp)
6. Choose "Combine with existing lot" to select an existing lot code,  or "Create new lot" for the Final Blend.
7. Choose to let cellar staff choose vessels or choose specific vessels to fill.
8. Choose to save or discard the lees and check the final summary before creating the work order. ![How to Record a Blend-finish blend](https://support.innovint.us/hs-fs/hubfs/How%20to%20Record%20a%20Blend-finish%20blend.webp?width=688&height=341&name=How%20to%20Record%20a%20Blend-finish%20blend.webp)

See the WARNING at the top of this page about filling vessels with contents. You *can* choose vessels that currently have contents if:

1) another action or work order to empty those vessels is submitted prior to the completion of this Blend task and

2) that vessel is not already selected as a drain vessel in the *same* work order task.

For example, Lot A and Lot B are getting blended into Lot X. Lot A is in Tank 1 at the time that the work order is written. Before the Blend work order is started, the entire volume in Tank 1 is transferred to Tank 5. Tank 1 is now empty and is selected as "removed" from the blend lot. Tank 1 is still not available to fill with the final blend because it was previously selected as a drain vessel.

Our best recommendation is to select "let cellar staff choose vessels" for the final blend, allowing them to select any available vessel at the time of the blend.

#### When to Request a specific Remove volume vs an Ending Fill

This option is available to allow users more flexibility and clarity when requesting volume changes in a work order, and is the difference between you telling the cellar what the **ending fill** on a vessel should be, versus telling them how exactly much volume to **remove** from a vessel.

It can be especially useful to use the Request "Remove" option:

- when creating multiple sequential work orders, especially those involving the same lot and vessels
- when you measure your blend components using a flow meter in the cellar

It is useful to use the Request "Ending Fill" option:

- when creating standalone blends, especially "all-in" blends

Check out the video segment on these different volume request options in the InnoVint Academy [here](https://support.innovint.us/hc/en-us/innovint?hsLang=en).

You can see how the “Ending Fill” and “Remove” volume fields display differently at Work Order Creation:

![How to Record a Blend-end fill](https://support.innovint.us/hs-fs/hubfs/How%20to%20Record%20a%20Blend-end%20fill.webp?width=688&height=298&name=How%20to%20Record%20a%20Blend-end%20fill.webp)And, after work order creation.

![How to Record a Blend-work order](https://support.innovint.us/hs-fs/hubfs/How%20to%20Record%20a%20Blend-work%20order.webp?width=688&height=325&name=How%20to%20Record%20a%20Blend-work%20order.webp)

- The “Ending Fill” Request allows the user to record the final volume (or tank gauge if your dip charts are enabled and added), and the task then updates the vessel with a calculated removed volume.
- The "Remove" Request allows the user to record the actual amount removed, and the vessel updates with a calculated ending fill.

Please note that this choice will impact how your cellar would complete a work order, and that the "Request: Remove" option does not display the dip chart option on a vessel for work order completion. In this case, specific tank gauges would best be requested via the Notes field on the Blend Task. If you need the cellar to record a dip and/or an actual final fill volume on a "Remove" Requested vessel, we recommend having them use the notes field electronically, or else handwrite the gauge/ending volume on the printed work order for verification while you are reviewing and submitting the task.

The "Request" option is applied to all vessels in a lot, and cannot be changed after work order creation. For instance, you cannot decide to set a removed volume, after first requesting the ending fill at WO creation.

Depending on your workflow, if you are referencing the same lot and vessel in two different work orders that are open at the same time, we would recommend using the Request "Remove" function. This is because the the Request “Ending Fill” volume remains static, even if the volume changes in that vessel occur before the work order is begun:

This can impact the actual volume change of the request, and therefore, your blend.

![How to Record a Blend-start end fill](https://support.innovint.us/hs-fs/hubfs/How%20to%20Record%20a%20Blend-start%20end%20fill.webp?width=688&height=359&name=How%20to%20Record%20a%20Blend-start%20end%20fill.webp)

On the other hand, the Request "Remove" option has a strong benefit when you are planning multiple blends that impact the same lots and vessels, because it locks in that requested volume, even when the on-hand volume in the involved vessels might change due to other related work orders.

### Record a Blend direct action

![How to Record a Blend-order](https://support.innovint.us/hs-fs/hubfs/How%20to%20Record%20a%20Blend-order.webp?width=688&height=31&name=How%20to%20Record%20a%20Blend-order.webp)

To record a Blend as a direct action, follow steps 1-6 (skip step 3!) as outlined above for work order tasks.

7. Select your vessel(s). See the WARNING at the top of this page about filling vessels that currently contain volume. (i.e. recording a 'Blend and Return').

8. Double check the gallons Added and the Ending Fill of the vessel(s) before you record the action.

![How to Record a Blend-finish](https://support.innovint.us/hs-fs/hubfs/How%20to%20Record%20a%20Blend-finish.webp?width=688&height=337&name=How%20to%20Record%20a%20Blend-finish.webp)

### FAQ

**Q: Can I blend a lot weighed in tons?**

*A: No. The Blend action is specific to wine/juice lots measured in volume. To "blend" lots currently measured in tons, use the Process to Tons action to process multiple fruit lots together, or to process a fruit lot into an existing juice lot in tonnage. You can also record a Weight Transfer.*

**Q: Can I blend one or more lots into a vessel with contents?**

*A: Yes, but we don't recommend it! If you are blending one or more lots into an existing lot, we recommend using the Rack or Transfer actions/tasks. Each lot is racked or transferred separately to capture any gains and losses on the correct lot. If you blend into an existing lot across tax classes, the TTB Report may not capture Lines 5 (Produced by Blending) and Line 20 (Used for Blending) correctly.*

**Q: If I save the lees, how does that affect the final blend composition?**

*A: Any lees, whether saved or discarded, will have the same varietal composition as the final blend and will be proportionally subtracted from the final blend volume.*

**Q: How do I only use *some* barrels in the blend? and leave some barrels out?**

*A: When selecting your vessels, click on the blue text 'Edit vessels', instead of checking the 'All vessels' box. You can also remove only a portion of the contents of a vessel by typing in the correct volume from the 'Removed' box.*

**Q:  I want to only use half of a tank in a blend, how do I record that? Do I need to use the entire vessel?**

*A: You do not need to empty entire vessels in a blend action. The action (and task) does default to empty entire vessels, but you can partially empty the “from” tank within a blend action.  Just click on the "show vessels list" underneath the blend lot, and you'll be able to adjust the volume removed from the vessel.*

*![How to Record a Blend-show vessels2](https://support.innovint.us/hs-fs/hubfs/How%20to%20Record%20a%20Blend-show%20vessels2.webp?width=688&height=298&name=How%20to%20Record%20a%20Blend-show%20vessels2.webp)
![How to Record a Blend-show vessel3](https://support.innovint.us/hs-fs/hubfs/How%20to%20Record%20a%20Blend-show%20vessel3.webp?width=688&height=417&name=How%20to%20Record%20a%20Blend-show%20vessel3.webp)*
