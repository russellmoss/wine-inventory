---
title: "Which B2B Action should I use?"
url: "https://support.innovint.us/hc/en-us/which-b2b-action-should-i-use"
category: "Guidance & FAQs"
section: "Frequently Asked Questions"
page_type: "page"
lastmod: "2026-04-08"
gist: "Do you have more than one bond in your winery?"
tags: ["bond", "transfers", "work-orders", "inventory", "tax-class"]
---

# Which B2B Action should I use?

Do you have more than one bond in your winery? Or do you ship wine/cider or juice between more than one InnoVint Winery account?

InnoVint has a selection of different actions that will allow to you to move volumes between bonds in your winery account, and also into and out of your winery (or cidery or meadery). It can be tricky to know which one to use!

This article contains some guidelines for which bond transfer action you should choose and why.

- [Are you bond transferring volume **out** of your InnoVint winery?](#B2B-out)
- [Are you bond transferring volume **into** your InnoVint winery?](#B2B-in)
- [Are you bond transferring volume **between bonds within** your InnoVint winery?](#within)
  - [Comparison of B2B within winery and B2B Transfer (Inter-facility) actions](#Compare-B2B-IF)
- [Other actions resulting in bond transfers](#other)

The *B2B within InnoVint Winery*and *B2B Transfer (inter-facility)* actions are features that may need to be activated, or are available at certain subscription levels. If you do not see these actions in your **Lot details > Record action** menu (for *B2B within InnoVint Winery* *)*, or in your **Record action/work order task lists** (for *B2B Transfer (inter-facility))*, then please contact InnoVint Support at [support@innovint.us](mailto:support@innovint.us) to learn more and gain access.

### Bond transfer volume out of your winery

InnoVint has two actions that will work for this type of movement.

The *B2B Transfer Out* action is for wine that needs to be removed from your inventory and that you will not access again in another InnoVint winery space (you are shipping wine for sale, or to another facility where you will no longer track it).

The *B2B to another InnoVint winery* action is for wine that you may be transferring to another InnoVint winery account, that you (or another user) may continue to access.

#### B2B Transfer Out

Use this action when removing wine permanently from your account (e.g., shipping for sale or to a facility where you won’t track it. Find all details on executing this action in [this article](https://support.innovint.us/hc/en-us/articles/360018542692-bond-to-bond-transfers?hsLang=en#TransferOut). This action/task:

- Reports in the correct TTB tax class
- Removes cost and volume from your winery
- Exists as a direct action, or a work order task
- Provides a BOL generation button in-action or task
- This action does not work for Case Good or Fruit lots

#### B2B to Another InnoVint Winery

Use this action when transferring wine to another InnoVint winery account; this is a two part action that creates a new lot code with all of the copied attributes and costs in the destination winery.  More details are in [this article](https://support.innovint.us/hc/en-us/articles/360018542692-bond-to-bond-transfers?hsLang=en#B2B_IV). This action:

- Reports in the correct TTB tax class
- Removes cost and volume from your winery
- Requires user access at the destination winery
- Creates a new, unique lot code in the destination winery (cannot merge into existing lots; no repeated transfers into the same lot)
- Copies lot notes, lot composite analyses, and costs (summarized by cost category) to the destination winery
  - Costs do not update on the copied lot if the originating lot cost is updated after the transfer is recorded
  - Does not transfer any lot history (movements) into the new lot
- Requires a second B2B Transfer In action to receive volume at the new winery
- Is supported as a direct action only (no work order task)
  - Only available in Lot details > Record action menu.
- Provides a BOL generation button in-action
- This action does not work for Case Good or Fruit lots

### Bond transfer volume into your winery

#### B2B Transfer In

Use this action when adding wine, juice, cider or mead to your inventory. More details on executing this action are in [this article](https://support.innovint.us/hc/en-us/articles/360018542692-bond-to-bond-transfers?hsLang=en#transfer-in). This action:

- Reports in the correct TTB tax class
- Adds volume to your winery
- Requires lot code and composition to exist beforehand (create the lot outside the action)
- Does not import analysis or cost.
  - Use Cost Items to add costs, and analysis imports to add analysis
- Is supported as a direct action, and a work order task
- Provides a BOL generation button in-action or task
- Does not work for Case Good or Fruit lots

Receiving wine from another InnoVint winery? Coordinate with that winery to initiate a [B2B to another InnoVint Winery](#B2B-to-winery) transfer.

### Bond transfer volume between bonds in your InnoVint winery

InnoVint has two actions that will work for this type of movement. These are differentiated by a few points, including the requirements to change vessel, as well as cost and additive tracking implications. These are the *B2B within winery* action and the *B2BTransfer (Inter-facility)* action.

#### B2B within winery

Use this action to move wine into another bond within your winery account without changing vessels. Get more detailed information on executing this action [here](https://support.innovint.us/hc/en-us/bond-to-bond-b2b?hsLang=en#B2B-within). This action:

- Reports in the correct TTB tax class for both bonds
- Requires that a new, unique lot code be created in the new bond
- Copies lot notes, all composite analyses, and a cost category snapshot into a new lot in another bond
  - Copied costs will not update on the new lot if originating lot costs update after the transfer
- Keeps lot contents in the same vessels
- Retains the lot history, divided between the two lots at the point of transfer
- Displays as two actions (one B2B-In and one B2B-Out) in action histories
- Is supported as a direct action only (no work order task)
  - Only available in Lot details > Record action menu
- Provides a BOL generation button in-action
- Does not work for Case Good or Fruit lots

#### B2B Transfer (Inter-facility)

Use this action to move wine into another bond within your winery account. This is a superior action to the *B2B within winery* action when working with lot costs and additive tracking. Get more details on completing this action [here](https://support.innovint.us/hc/en-us/bond-to-bond-b2b?hsLang=en#B2B_IV). This action:

- Reports in the correct TTB tax class for both bonds
- Transfers volume into a new or existing lot in another bond
- Lot composite [analysis will be copied](https://support.innovint.us/hc/en-us/lot-analysis-copy?hsLang=en) into the new lot/bond if the new lot is empty
- Moves lot costs with the volume like any other movement action
  - Costs changes on the originating lot continue to flow to and update on the destination lot

- Requires moving lot into new vessels
- Retains the lot history, divided between the two lots at the point of transfer
- Displays as a single action in action histories
- Is supported as a direct action and work order task
- Has no direct action BOL generation button
  - BOLs are available via [work orders](https://support.innovint.us/hc/en-us/articles/360055473151-how-to-create-a-bill-of-lading-bol-?hsLang=en#WO_details) or via [the BOL generator in the Report Explorer](https://support.innovint.us/hc/en-us/articles/360055473151-how-to-create-a-bill-of-lading-bol-?hsLang=en#Reportexplorer)
- Does not work for Case Good or Fruit lots

#### Comparison of B2B within winery and B2B Transfer (Inter-facility) actions

Visually, these actions will display differently in the winery activity feed and lot histories:
![Which B2B Action should I use-winery activity feed](https://support.innovint.us/hs-fs/hubfs/Which%20B2B%20Action%20should%20I%20use-winery%20activity%20feed.webp?width=670&height=196&name=Which%20B2B%20Action%20should%20I%20use-winery%20activity%20feed.webp)

This table shows a head to head comparison with the actions' functionality:

|  |  |  |
| --- | --- | --- |
| **Feature** | **B2B Transfer Inter-facility** | **B2B within Winery** |
| TTB Reporting | ✅ Both bonds | ✅ Both bonds |
| Cost Tracking | ✅ Updates with source lot | ✅ Cost category snapshot only |
| Composition | ✅ Carries/blends composition | ✅ Copies composition |
| Analysis | ✅ Most recent lot composite (if an *empty* lot) | ✅ All lot composite analyses copied |
| Lot notes | ❌ Not transferred | ✅ All lot notes copied |
| BOL generation | ✅ Via work orders or Reports | ✅ Available on action or task |
| Lot code re-use | ✅ Yes - can transfer into existing lot | ❌ No - may not transfer into an existing lot |
| Additive tracking | ✅ Maintains calculated additive tracking | ❌ Does not copy additives |
| Vessel Change | ✅  Yes - required | ❌ No - not possible |

### Other actions resulting in bond transfers

Most standard movement actions (e.g., topping, blending, transfers) will also move wine between bonds.

Ex. If you top a lot in bond 1 with a lot associated to bond 2, then the volume consumed in the topping will show as removed from bond 2, and received in Bond 1 in the InnoVint TTB Report.

- When moving wine across bonds, InnoVint issues a soft warning to alert you:![Which B2B action_bond warning](https://support.innovint.us/hs-fs/hubfs/Which%20B2B%20action_bond%20warning.png?width=500&height=357&name=Which%20B2B%20action_bond%20warning.png)
- These volumes report correctly in TTB by bond
- To review bond-crossing actions, export the Winery Activity Feed and filter by the Bond column![Which B2B action - movement ](https://support.innovint.us/hs-fs/hubfs/Which%20B2B%20action%20-%20movement%20.png?width=670&height=203&name=Which%20B2B%20action%20-%20movement%20.png)
