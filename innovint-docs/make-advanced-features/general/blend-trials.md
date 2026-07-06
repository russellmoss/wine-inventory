---
title: "Blend Trials"
url: "https://support.innovint.us/hc/en-us/blend-trials"
category: "MAKE: Advanced Features"
section: "general"
page_type: "page"
lastmod: "2026-06-24"
gist: "The Blend Trials feature is a way for users to mock up potential blends in the winery to see if they meet composition, production, cost, analysis and taste targets."
tags: ["blending", "cost", "permissions", "ux-friction", "lab", "configuration"]
---

# Blend Trials

The Blend Trials feature is a way for users to mock up potential blends in the winery to see if they meet composition, production, cost, analysis and taste targets. This allows users to compare against internal targets and better manage their lot inventory.

*Users with access to **Everything in Winery** are able to access this feature. Admin, Team Member, and Team Member Cannot Submit Work Order users will be able to view, create new, and edit blend trials, mock blends, and related mock blend lots. Read Only users can view blend trials and mock blends but will not see options to add, edit, or delete them.

Users with Owner tag access are not currently supported.*

For users with the FINANCE product - which includes our COGS Tracking module - the calculated costs contributing to a blend will always be included in the mock blends. Users without COGS Tracking permissions will not see these predicted blend costs.

This article covers:

- [How to create a new blend trial](#newblend)
- [Working with blends in percentages](#blendperc)
- [Working with blends in volume](#blendvol)
- [Duplicate, edit or delete a mock blend](#duplicate)
- [What to expect with Predictive Analysis](#What-to-expect)
- [Video tutorial](#video-tutorial)
- [FAQ](#faq)

### How to create a new blend trial

The Blend Trial Explorer can be found in the left-hand Navigation Bar.

![Blend Trials-new](https://support.innovint.us/hs-fs/hubfs/Blend%20Trials-new.webp?width=307&height=378&name=Blend%20Trials-new.webp)

Click the "**+ Add blend trial**"button in the upper right-hand corner to create a new blend trial. Give your trial a descriptive name, and click "Add blend trial."

![Blend Trials-add](https://support.innovint.us/hs-fs/hubfs/Blend%20Trials-add.webp?width=670&height=376&name=Blend%20Trials-add.webp)

Click into any blend trial to access the Blend trial details page. From here you can click "**+Add mock blend**" to create a new mock blend within the blend trial. You can create up to 30 mock blends within a trial.

![Blend Trials-mock blend](https://support.innovint.us/hs-fs/hubfs/Blend%20Trials-mock%20blend.webp?width=670&height=156&name=Blend%20Trials-mock%20blend.webp)

Click into the new mock blend to add lots and select target volumes and percentages.

#### Add Lots

Before you can set target volumes or percentages for your blend, click "Select lots" to choose specific lots to blend:

![Blend trials - add lots](https://support.innovint.us/hs-fs/hubfs/Blend%20trials%20-%20add%20lots.png?width=670&height=384&name=Blend%20trials%20-%20add%20lots.png)

Use the standard lot picker filters to select your lots.

Mock blends can contain up to 100 lots. If users attempt to save the mock blend with more than 100 lots, they will see an error message and will need to remove lots in order to move forward.

#### Choose to blend by percentages or volume

Once the mock blend lots have been selected, users can choose to blend by percentage or a specific volume of each lot.

When using "Set blend %" make sure to specify your target volume in order to have InnoVint calculate your component blend volumes based on the requested percentage. To allocate blend components by volume instead of percentage, click on "Set blend volume."

![Blend trials - percent-volume](https://support.innovint.us/hs-fs/hubfs/Blend%20trials%20-%20percent-volume.png?width=670&height=381&name=Blend%20trials%20-%20percent-volume.png)

InnoVint will calculate (or recalculate) the blend cost, analysis, and composition in the widgets below the blend table only after you click on "Save blend."  The costs and analyses in the blend table itself will update dynamically.

### Working with blends in percentages

#### Target volume & blend percentage

The Blend % edit workspace requires users to set a target volume and modify the percentages of each mock blend lot. The related volumes needed will automatically calculate based on the "Target volume" and percentages entered.

![Blend trials - max blend vol](https://support.innovint.us/hs-fs/hubfs/Blend%20trials%20-%20max%20blend%20vol.png?width=670&height=381&name=Blend%20trials%20-%20max%20blend%20vol.png)

As you edit each mock blend lot percentage, the corresponding lot blend volume (the amount from each lot required to make the requested target blend volume) will update, as well as the max blend volume in the bottom right corner.

The lot "Cost contribution" in the blend table will also update as you click through the fields.  Cost and composition do not update in real time on the widgets below the table - you must click "Save blend" to see these update.

#### Max blend volume

The Max blend volume is the largest possible blend based on the component that is the limiting factor. In this example, the 295 gallons of BDCH24PEAK-CUVEE limits the maximum blend size to only 983.3 gallons (at 30% of the total blend = 295/0.3 = 983.3 gallons).

InnoVint *will* allow you to enter a percentage that calculates a volume larger than the available volume of a lot, and will calculate the blend composition according to that calculated volume. Generally, this will reflect in the Max blend volume being less than the target volume (since the actual Max blend volume is limited by the actual potential contribution of the over allocated lot).

![Blend Trials-max blend volume](https://support.innovint.us/hs-fs/hubfs/Blend%20Trials-max%20blend%20volume.webp?width=670&height=117&name=Blend%20Trials-max%20blend%20volume.webp)

#### Composition and Cost

Click Save blend to "lock in" the lots and percentages. You must click "Save blend" to see updated composition, analysis and cost information in the widgets below the blend table.

Export! Once the blend is saved, you will also have the opportunity to export the blend. This csv export provides additional cost category details in addition to the blend component percentages, analysis data, blend component volumes, and calculated composition.

![Blend trials saved updated widgets](https://support.innovint.us/hs-fs/hubfs/Blend%20trials%20saved%20updated%20widgets.png?width=670&height=374&name=Blend%20trials%20saved%20updated%20widgets.png)

InnoVint allows you to enter a percentage that calculates a volume larger than the currently available volume of a lot.  The blend composition, analysis and cost (based on the unit cost) will be calculated according to the input percentage and calculated volume.

### Working with blends in volumes

User can also choose to build a blend based on volume rather than percentages, via the "volume edit" workspace.

To start from scratch, create a mock blend, then select your lots, and click "Set blend volume."

To change an existing mock blend that was built on percentage, click on "Edit blend" first to enable the "Set blend volume" toggle.

![Blend trials - change to volume](https://support.innovint.us/hs-fs/hubfs/Blend%20trials%20-%20change%20to%20volume.png?width=670&height=300&name=Blend%20trials%20-%20change%20to%20volume.png)

#### Units and target volume

In the volume edit workspace, users will be able to change the unit they want to use to build their mock blend. If you haven't already started by setting a target volume with units in the Blend % screen, you should set your units here first. InnoVint defaults to display mL (for bench trial samples):

![Blend trials - volume units](https://support.innovint.us/hs-fs/hubfs/Blend%20trials%20-%20volume%20units.png?width=670&height=186&name=Blend%20trials%20-%20volume%20units.png)

Alternately, you can go back to the % Blend workspace to set the target volume and units. However, in the Blend volume workspace, the target blend volume will continually update with the total volume selected for the blend.

Users can also easily choose to “Use entire lot” when building blends. The "Use entire lot" feature is most useful when mocking-up life-size blends, and will provide the max percentage a lot can provide (calculated against the target volume). When using the entire lot, the Max blend volume will be equal to the Target volume.

![Blend trials - volume details](https://support.innovint.us/hs-fs/hubfs/Blend%20trials%20-%20volume%20details.png?width=670&height=223&name=Blend%20trials%20-%20volume%20details.png)

#### Max blend volume

The Max blend volume is the largest possible blend based on the component that is the limiting factor. InnoVint will allow you to reach a target volume that is greater than your available number of gallons. This target volume automatically calculates the blend percentage. The Max blend volume is calculated based on these blend percentages, within the limitation of the actual lot volumes.

![Blend Trials-max blend](https://support.innovint.us/hs-fs/hubfs/Blend%20Trials-max%20blend.webp?width=670&height=119&name=Blend%20Trials-max%20blend.webp)

#### Composition and Cost

Click Save blend to "lock in" the lots and percentages. You must click "Save blend" to see updated composition and cost information in the widgets below the blend table.

Export! Once the blend is saved, you will also have the opportunity to export the blend. This csv export provides additional cost category details in addition to the blend component percentages and volumes.

![Blend trials - volume final](https://support.innovint.us/hs-fs/hubfs/Blend%20trials%20-%20volume%20final.png?width=670&height=370&name=Blend%20trials%20-%20volume%20final.png)

InnoVint allows you to enter a volume larger than the currently available volume of a lot, and will calculate the blend composition and cost (based on the unit cost) according to the input volume.

### Duplicate, edit or delete a Mock Blend

You can duplicate, edit or delete any of your mock blends.

From the Mock blend details page, click the "More" button in the upper right-hand corner to find your menu.

![Blend trials - duplicate](https://support.innovint.us/hs-fs/hubfs/Blend%20trials%20-%20duplicate.png?width=670&height=187&name=Blend%20trials%20-%20duplicate.png)

#### **To duplicate a mock blend**

Like a blend but want to tweak it and re-taste?

Select "Duplicate mock blend", modify the mock blend name, and click "Create duplicate" to be taken to a new mock blend details page with all of the saved lots and the volume or percentage settings. This may be very helpful for users that have mock blends with many lots, or try many variations on similar (but not identical) mock blends.
![Blend trials - create duplicate](https://support.innovint.us/hs-fs/hubfs/Blend%20trials%20-%20create%20duplicate.png?width=373&height=178&name=Blend%20trials%20-%20create%20duplicate.png)

**To edit the Mock Blend name**

Click "Change mock blend properties" and edit the blend name as required. Click "Save mock blend properties" for the new name to save.

![Blend Trials-edit mock](https://support.innovint.us/hs-fs/hubfs/Blend%20Trials-edit%20mock.webp?width=307&height=121&name=Blend%20Trials-edit%20mock.webp)

**To delete a Mock Blend:**

You know what to do! You will get a confirmation screen before clearing out your blend.
![Blend Trials-delete mock](https://support.innovint.us/hs-fs/hubfs/Blend%20Trials-delete%20mock.webp?width=304&height=96&name=Blend%20Trials-delete%20mock.webp)

### What to expect with Predicted Analysis

The Predicted Analysis feature estimates analytical values—such as alcohol, TA, VA, and sugar—for any mock blend you create in Blend Trials. These values update automatically based on the blend volumes you enter, giving you a quick insight into how the final wine is expected to behave.

This feature helps you to quickly evaluate blend scenarios, reduce manual calculations, and ensure blends stay within stylistic and regulatory targets before performing the physical trial.

This feature:

- Shows existing analysis results for each contributing blend lot.
- Calculates predicted analysis values for the mock blend using a volume-weighted weighted average.

#### **Which Analysis Types Are Supported?**

Predicted Analysis generates values for specific supported analysis types, including: Alcohol, Ethanol (including @20C and 60F), Titratable Acidity, Malic Acid, Volatile Acidity, Acetic Acid, Free SO₂, Total SO₂, Residual Sugar, Glucose/Fructose, Glucose, Fructose, and Total Sugar.

- *Only these supported analysis types are included at this time.*
- *pH is excluded due to its logarithmic behavior and poor predictive accuracy.*
- *Only analyses that exist on at least one blend lot will appear.*

#### **How Predicted Analysis Works**

- It uses the **most recent *Lot Composite*** analysis for each lot, **excluding Individual vessel analyses**
- Lots do not need to share the same units.

  - Analysis values are converted automatically and display the unit most commonly used across the lots.
- Predicted analyses is calculated using a **volume-weighted average**:
  - Weighted average = ∑(Blend vol of "lot x" analysis value) ➗ Total Blend Vol
    ![Blend trials - weighted average](https://support.innovint.us/hs-fs/hubfs/Blend%20trials%20-%20weighted%20average.png?width=469&height=185&name=Blend%20trials%20-%20weighted%20average.png)
  - If some lots do not contain a particular analysis, the calculation uses only the volumes from lots that do. A **Blend % total** shows the portion of the blend included in the calculation.
- Values will update over time as lots receive new analyses.

#### **Where can I find Analysis in Blend Trials?**

###### **In the Blend Lots Table****Blend trials - blend lot table**

- - This table displays the latest lot composite analyses for each lot.
  - Only columns for existing analysis values appear.
  - Lots without a value display “–”

##### **In the Predicted Blend Analysis Widget**

**![Blend trials - predicted analysis widget](https://support.innovint.us/hs-fs/hubfs/Blend%20trials%20-%20predicted%20analysis%20widget.png?width=306&height=223&name=Blend%20trials%20-%20predicted%20analysis%20widget.png)**

- - This widget shows the predicted analysis value, displayed unit, and Blend %.
  - Only visible for analysis types that have data on at least one lot.
  - These values only update when you click **Save blend**.

###### **In the Mock Blend Export**

The export includes:

- - Columns for each blend lot's analysis values (following the cost category columns), which include the most recent lot composite analysis value, units, and effective at date.
  - A row labeled **Predictive analyses** beneath the blend lots that includes: the predicted analysis value and the total included **Blend %** (the percentage of the blend that contains analysis values) for predicted values.

Predicted Analysis is an estimation tool and not a replacement for laboratory verification.

### Video tutorial

### FAQ

**Q: Can I change the name of a Blend Trial?**

*A: Yes! Go to the More menu in the Blend trial details, and select "Change blend trial properties."*

**Q: My composition isn't updating!**

*A: You must click on "Save blend" in order for the composition (and/or calculated blend cost) to recalculate.*

**Q: I don't see the calculated blend cost**

*A: Calculated blend cost is only available to accounts with a FINANCE subscription, which includes the COGS Tracking module. Individual users must have appropriate permissions to view COGS data. Please reach out to [support@innovint.us](mailto:suport@innovint.us) and we can check on the status of your account, and your user permissions.*

**Q: The mock blend is not displaying. I have an orange banner regarding costs instead :(**

*A: In the event that costs have been added or updated within your account, InnoVint will take some time to recalculate all downstream costs. In this event, users with COGS Tracking activated may not be able to access blend trials.*

*![Blend Trials-orange banner](https://support.innovint.us/hs-fs/hubfs/Blend%20Trials-orange%20banner.webp?width=506&height=136&name=Blend%20Trials-orange%20banner.webp)*

**Q: I don't want to completely delete my Blend Trial, can I archive it?**

*A: No, InnoVint doesn't support archiving Blend trials.  We would recommend renaming it in order to move it to the bottom of the page.*

**Q: I'm getting an error when trying to save my Mock Blend. What's happening?**

*Please note that currently only 30 Mock blends are allowed for each Blend trial.*

**Q: I don't see Blend Trials in my navigation menu**

*A: Blend Trials are currently only accessible to users with Admin permissions. Unfortunately, they are not available for custom crush owners at this time.   If you are an Admin on your account, and you cannot see Blend Trials, please reach out to [support@innovint.us](mailto:suport@innovint.us) and we can check on the status of your account.*

**Q: Can I access wines that are in another InnoVint account in my trial blend?**

*A: Blend trials are not currently "multi-winery" and you can only add juice/wine lots that exist in a single InnoVint account.*

*However, InnoVint will allow you to add archived or empty lots to the mock blend.  As long as these lots have composition, you can manually enter the volume (when working with blends in volume) or percentage (when working with blends in percentages) and InnoVint will allow you to work with that non-existent volume.  Composition will be calculated using the calculated lot blend volume. Cost can only be calculated if there is cost on an empty lot (this is not a recommended workflow).*
