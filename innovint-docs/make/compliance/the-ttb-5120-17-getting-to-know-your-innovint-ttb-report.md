---
title: "The TTB 5120.17: Getting to know your InnoVint TTB Report"
url: "https://support.innovint.us/hc/en-us/ttb-101"
category: "MAKE"
section: "Compliance"
page_type: "page"
lastmod: "2025-12-29"
gist: "Whether you report monthly, quarterly or annually, InnoVint can streamline your reporting process… as long as you and your team understand how InnoVint populates the TTB Report."
tags: ["ttb", "compliance", "reporting", "getting-started", "tax-class", "ux-friction"]
---

# The TTB 5120.17: Getting to know your InnoVint TTB Report

Whether you report monthly, quarterly or annually, InnoVint can streamline your reporting process… as long as you and your team understand how InnoVint populates the TTB Report.

But as we all know, sometimes things happen, and you might find volume populating lines where it shouldn’t be and you can’t figure out why. Welcome to our TTB Guide that will walk you through understanding the basics, and how to solve common errors.

- [Getting Started](#Getting-started)
  - [The basics](#basics)
  - [Using other supporting reports](#supporting-reports)
- [FAQ and Common Issues Explained](#FAQ)

### Getting Started

#### First, download both the TTB Report *AND* Audit Report for the appropriate reporting period.

🛑 **Before going too far, read these articles to become an InnoVint compliance whiz!**

- **[How InnoVint populates the TTB Report](https://support.innovint.us/hc/en-us/articles/360020824392-how-does-innovint-populate-the-ttb-report-?hsLang=en)**
  Quickly get an overview on which actions will populate specific parts and lines of the report. This is the best way to understand how to get volume onto specific lines.
- **[Understanding the TTB Audit Report](https://support.innovint.us/hc/en-us/understanding-the-ttb-audit-report?hsLang=en)**
  Did you know the Audit Report will tell you all of the actions that contributed to specific lines on the TTB Report? Find out how to use it!

Some of our support videos are using different terminology. In mid 2025, the tax class name populating Part VII *In Fermenters End of Period* was changed from "Fermenting Juice" to "In Fermenters".  The tax class name populating Part IV *Summary of Materials Received and Used* in Column C "Juice" changed from "Sweetening Juice" to "Juice". All mapping and functionality remain the same, but you may see the old tax class names in some video content.

#### Next, get to know the basic structure of InnoVint's report mapping

Understanding these underlying concepts will help solve or prevent many common issues.

**👉 Review how tax classes and recorded actions in InnoVint impact the TTB Report.**

1. Every juice/wine lot has a [tax class](https://support.innovint.us/hc/en-us/articles/207936576-declare-or-edit-tax-class?hsLang=en), which is selected when first creating a new lot code, and can be changed in the lot details page. Every tax class matches to a specific column or section of the TTB 5120.17. The lot's tax class directs *where* the gallons sit on the report.![](https://support.innovint.us/hs-fs/hubfs/image-png-Mar-09-2024-02-59-48-1698-PM.png?width=670&height=145&name=image-png-Mar-09-2024-02-59-48-1698-PM.png)
   ![](https://support.innovint.us/hs-fs/hubfs/image-png-Mar-07-2024-03-24-04-0399-PM.png?width=670&height=121&name=image-png-Mar-07-2024-03-24-04-0399-PM.png)
   ![](https://support.innovint.us/hs-fs/hubfs/image-png-Mar-07-2024-03-38-29-9218-PM.png?width=600&height=73&name=image-png-Mar-07-2024-03-38-29-9218-PM.png)
2. It is the tax class of the involved lot(s) AT THE TIME OF an action that determines in which part or column the *changes* to gallons are reported on the TTB 5120.17.

How do you know the tax class at the time of the action? You can determine the tax class at the time of the action by referencing the current tax class in the Lot Attributes section on the Lot Details page and checking the Lot History to see if the tax class has ever changed.![Current vs Historic Tax Class](https://support.innovint.us/hs-fs/hubfs/Current%20vs%20Historic%20Tax%20Class.png?width=670&height=361&name=Current%20vs%20Historic%20Tax%20Class.png)

Any actions recorded on this lot prior to the Tax Class Change on 12/12/25 at 10:03am would have been reported on the TTB Report in Part VII, "In Fermenters End of Period."

Any actions recorded on this lot after the Tax Class Change to <16% would populate Part I, Column (a) "Not over 16 Percent."

**No tax class change in the Lot History?** The lot was created with its current tax class.

#### Using other supporting reports

In addition to the TTB 5120.17 Report and the TTB Audit Report, we recommend referencing these reports when troubleshooting your report.

- I**nventory at Point in Time Report:** *This report shows the lot volume and tax class as of a particular date in the past.* Use this report to confirm on hand end of period values for each tax class, as well as your overall inventory as of the end of the reporting period.
- **Winery Activity Feed:***The Winery Activity Feed displays all of the activities recorded in InnoVint, by date, across all of your inventory; it can be filtered for specific actions, lot codes, a specific date range, involved tax classes, bond and owner.* Use this report to isolate winery activity during your reporting period. Find non B2B transactions across bonds here.
- **Taxpaid Report:** *This report is an export of all taxpaid actions recorded within a date range.*Use this report to confirm your taxpaid removals volume on Part I, Section B, Line 8.

### FAQ & Common Issues Explained

Check out these commonly experienced issues to find out how to resolve them!

⚠️ Be advised that making changes to recorded actions may impact previously filed TTB Reports.  Please check in with your Compliance team or advisor before making changes to past reporting periods!

1. [Why is my "**On hand beginning of period**" different than my "**On hand end of period**" from last year/month/quarter?](#on-hand-beginning-on-hand-end)
2. [Why does my report show a "**change of tax class**"?](#change-of-tax-class)
3. [Why does my report show volume as "**return to fermenters**"?](#return-to-fermenters)
4. [Why does my report show still weight in Part IV - "**Grape Material**"? I've processed all the fruit I brought in!](#part-iv-grape-material)
5. [Why does my report show volume in Part VII - "**In Fermenters End of Period**"](#part-vii-in-fermenters)
6. [Why does my report show volume as "**produced by blending**"?](#produced-by-blending)
7. [Why does my report show volume as "**used for blending**" but not "**produced by blending**"?](#used-for-blending-produced-by-blending)

#### 1. Why is my "On hand beginning of period" different than my "On hand end of period" from last year/month/quarter?

Most often, the reason for this is because a user recorded a Volume Adjustment action and selected a reason of "Onboarding (on hand beginning of period)", meaning that gallons were applied to Line 1 after the period had started. Luckily, this is generally an easy fix. Follow the bullet points, or check out the video tip below!

- First, click into the **Report Explorer** and pull up the **Winery Activity Feed**, filtering "Volume Adjustment" actions and the same date range as your TTB Report.
- Next, look for any volume adjustments that have a reason of "Onboarding (on hand beginning of period)". Note that there may be one or multiple actions that have this reason. TIP: if you have *many* volume adjustment actions, export the Winery Activity Feed for the desired period, and then filter the Notes column for the volume adjustment reason.
- Click into the action and click the blue edit pencil next to the reason to select a different "gain" reason, such as B2B Transfer In or Inventory Gains. It's important not to use the "Onboarding (on hand beginning of period)" reason after you have finished onboarding with InnoVint.
- Click the blue "Set new reason" button!

#### 2. Why does my report show a "change of tax class"?

You may see a "change of tax class" on your TTB Report in Part I, Section A, on Lines 10 or 24, when a lot is changed from one declared tax class to another, such as from 16-21% to <16%.

Follow the bullet points to address an unwanted tax class change, or check out the video tip below!

![](https://support.innovint.us/hs-fs/hubfs/image-png-Mar-24-2024-08-41-17-3681-PM.png?width=593&height=273&name=image-png-Mar-24-2024-08-41-17-3681-PM.png)

- Filter your TTB Audit Report for Part I, Section A, and Lines 10 and/or 24 (wherever you see volume populating unexpectedly) to see all InnoVint actions and volumes populating those lines. Paste the action URL into your browser to quickly access the tax class change action.
- If necessary, click into the lot on the action to pull up the lot details page and view the lot history to confirm that the tax class change was accidental. For example, the lot may have been created in the wrong tax class and a user attempted to correct it by changing the tax class.
- Return to the action details page for an undesired tax class change and click "Delete action."
  Note that unlike other actions in InnoVint, tax class change actions are only dependent on each other, and you can delete or enter tax class changes independent of a lot's existing movement history.
- If correction is required, from the lot details dashboard, click the blue edit pencil next to the tax class and set the appropriate tax class and the "Effective at" date as of today, a previous date, or at the time of lot creation.

#### 3. Why does my report show volume as "**return to fermenters**"?

Volume populates Line 25 "Return to Fermenters" when a lot's tax class is changed from a declared tax class (like <16%) to an undeclared tax class (most often, "In Fermenters").

This can occur in error, when a user has accidentally *created* the lot in a declared tax class, i.e. <16%, and then tries to correct it by changing the tax class to "In Fermenters" when they notice the error. Follow the bullet points to correctly update a lot's tax class in this scenario, or just check out the video tip below!

- Filter your [TTB Audit Report](/hc/en-us/understanding-the-ttb-audit-report?hsLang=en) for Part I, Section A, and Line 25 to see all InnoVint actions and volumes populating that line. Paste any action URL (from column G) into your browser to quickly access the tax class change action.
- Click into the lot in the action to pull up the lot details page and view the lot history tab, looking for *ALL* tax class changes.
  ![Lot created in wrong taxclass](https://support.innovint.us/hs-fs/hubfs/Lot%20created%20in%20wrong%20taxclass.png?width=670&height=312&name=Lot%20created%20in%20wrong%20taxclass.png)
- If the lot was *created* in the incorrect tax class and had subsequent tax class changes, delete all tax class changes in order from most recent to least recent.
  **TIP**: We recommend taking a screenshot of all tax class changes before deleting to easily re-record the correct tax class changes (like when the lot was declared). Or, you can export your deleted actions (including Tax Class changes, from the Winery Activity Feed).
- From the lot details dashboard, click the blue edit pencil next to the tax class and set the appropriate tax class and the "Effective at" date as "**When lot was created**." Do not backdate to a specific date, as this will record a new tax change action.
- Now, re-record any subsequent required tax class changes by clicking the Tax Class change edit pencil on the lot, and selecting the "Effective at" date as of a "Previous date."

#### 4. Why does my report still show weight in Part IV - "Grape Material"? I've processed all the fruit I brought in!

Weight populates Part IV, Column (a) *Uncrushed  Pounds* from fruit that was received into the winery via a Receive Fruit action/task. When users see unexpected or unwanted remaining weight in Part IV during a reporting period, it's frequently a result of unprocessed fruit weight remaining on Fruit lots.

This unprocessed fruit weight will also contribute to volume in Part VII - "In Fermenters End of Period" (see FAQ #5), so we really want to remove any unprocessed fruit, and tidy up your [Fruit Lot Explorer](/hc/en-us/clean-up-your?hsLang=en)!

- To see fruit lots that still contain weight, click Vineyards>Vineyard Explorer, then click the [Fruit Lot Explorer](/hc/en-us/where-to-find-your-fruit-lots?hsLang=en) tab. Remove the auto-populated "Vintage Filter" to show all unarchived fruit lots for all vintages.
  ![](https://support.innovint.us/hs-fs/hubfs/image-png-Mar-12-2024-02-40-13-7936-PM.png?width=670&height=339&name=image-png-Mar-12-2024-02-40-13-7936-PM.png)
- Click on a fruit lot to view the lot details page.
  - Depending on your reporting period frequency, and when the action occurred, you may be able to edit the Process Fruit action(s) for the fruit lot to ensure all fruit weight was processed. Find out more about what actions you can edit [here](https://support.innovint.us/hc/en-us/articles/208141233-how-to-edit-or-delete-recorded-actions?hsLang=en).  **When making inventory changes that will impact your TTB Report, it is always a good idea to confirm with your compliance team whether the affected period should be edited or not.**
    - Updating your process fruit action will be recorded as "Used in wine production" in Part IV on Line 5.
  - If you can't or don't want to update the process fruit action, click the **Record action** dropdown menu and select Fruit Weight Adjustment. Set the the new fruit weight tonnage to 0, backdating if necessary to remove the tonnage from the appropriate reporting period.
    - A Fruit Weight adjustment down will be recorded as "Removed" from Part IV on Line 8. **These adjustments will not impact recorded weigh tags or fruit weights in the Fruit Intake Report.**
    - If you have FINANCE and use COGS Tracking, you will need to work with your finance/accounting users to reallocate the cost from the removed fruit weight. A [Fruit Weight Adjustment](/hc/en-us/cogs-considerations#vol-adj) will not remove cost.
    ![](https://support.innovint.us/hs-fs/hubfs/image-png-Mar-26-2024-03-00-39-0329-PM.png?width=670&height=311&name=image-png-Mar-26-2024-03-00-39-0329-PM.png)

#### 5. Why does my report show volume in Part VII - "In Fermenters End of Period"?

Volume populates Part VII - "In Fermenters End of Period" from all inventory in the tax class *In Fermenters* **and** the estimated volume of all lots currently in weight. See FAQ #4 about updating any remaining fruit weight that may be populating this line.

To move gallons from Part VII to Part I, Section A, Line 2 - "Produced by Fermentation," you must record appropriate tax class changes within the date range of the report for any involved juice/wine lots. Follow the bulleted instructions, or check out the video clip on declaring fermenting lots below:

- Filter your TTB Audit Report for Part VII to see all lots with gallons populating that line.
- If any of the involved lots are fruit lots, refer to the previous section [Why does my report still show weight in Part IV - "Grape Material"?](#part-iv-grape-material) for steps to resolve this.
- To backdate a tax class change for each involved lot, head to the lot details page and click the blue edit pencil next to the tax class on the lot details dashboard under "Attributes".
- Select the appropriate tax class and the "Effective at" date as of a previous date.

#### 6. Why does my report show volume as "produced by blending"?

The TTB defines "used for blending" or "produced by blending" as blending across tax classes. Volume will populate Part I, Section A, Lines 5 (Produced by) and/or 20 (Used for) when a movement action is recorded where 2 or more of the lots involved had different tax classes. Please note that involved lots may include Lees lots, and undeclared tax classes.

- Filter the TTB Audit Report for Part I, Section A, Line 5 to see all movement actions that are populating that line.
- Copy and paste the action URL (Column G) into your browser to view the action and see all lots involved in the action. Note the date and time the action was recorded. Then, pull up the lot details page for all involved lots to check the tax class of each lot *at the time the movement action was recorded*.
  - To easily find all related lots, you can also use the TTB Audit Report: 1) remove the Line 5 filter 2) filter by the Action ID (Column H) to find all lots involved involved on that action
- To correct this, make the appropriate tax class changes to ensure that all involved lots are in the same tax class *at the time the movement action is recorded*.
- After making your changes, rerun your TTB Report and Audit Report to check Line 5 and Line 20 again.

#### 7. Why does my report show volume as "used for blending" but not "produced by blending"?

The TTB defines "used for blending" or "produced by blending" as blending across tax classes. Volume will populate Part I, Section A, Lines 5 (Produced by) and 20 (Used for) when a movement action is recorded where 2 or more of the lots involved had different tax classes. But why is there not volume showing in line 5?

1. Filter the TTB Audit Report for Part I, Section A, Line 20. Use the action ID for any movement actions populating that line to see what other lines of the TTB Report that particular action might also be impacting.
   1. For example, a lot was in a declared tax class of <16% and was transferred into a lot in the In Fermenters tax class. Because the volume was transferred from a lot in a **declared** tax class into a lot in an **undeclared** tax class, the volume is not populating Line 5, but would be moved to Part VII instead.
2. To correct this, make sure that the tax classes of all involved lots are the same *at the time the movement action is recorded*. Follow the same steps as in FAQ #6 above to resolve the issue.
3. If you intended to blend across tax classes, check out [this article on best practices](/hc/en-us/articles/208245003-blending-across-tax-classes?hsLang=en).
