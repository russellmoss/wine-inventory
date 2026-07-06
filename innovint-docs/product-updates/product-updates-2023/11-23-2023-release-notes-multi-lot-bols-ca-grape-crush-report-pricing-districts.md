---
title: "11/23/2023 Release Notes: Multi-lot BOLs & CA Grape Crush Report Pricing Districts"
url: "https://support.innovint.us/hc/en-us/release-notes-11"
category: "Product Updates"
section: "Product Updates: 2023"
page_type: "page"
lastmod: "2025-11-20"
gist: "Release Notes through November 23, 2023 include:."
tags: ["harvest", "release-notes", "reporting", "cost", "compliance", "vineyard"]
---

# 11/23/2023 Release Notes: Multi-lot BOLs & CA Grape Crush Report Pricing Districts

Release Notes through November 23, 2023 include:

### Features

#### NEW! Add multiple lots to a single Bill of Lading

We knew that you and the truck driver didn't want to sign 30 pieces of paper... instead of producing a Bill of Lading per lot, you can now easily add multiple lots to your BOL by creating the document via the [Report Explorer](https://support.innovint.us/hc/en-us/articles/360055473151-how-to-create-a-bill-of-lading-bol-?hsLang=en#Reportexplorer) and using the **+Add lot** button next to your Lot & Vessel information.

![](https://support.innovint.us/hs-fs/hubfs/image-png-Nov-27-2023-06-40-25-7410-PM.png?width=400&height=292&name=image-png-Nov-27-2023-06-40-25-7410-PM.png)

![](https://support.innovint.us/hs-fs/hubfs/image-png-Nov-27-2023-06-38-06-7264-PM.png?width=400&height=506&name=image-png-Nov-27-2023-06-38-06-7264-PM.png)

#### California Grape Crush Report Pricing Districts in InnoVint!

For our California users who have to complete the California Crush Report, we're trying to make life easier for you! We've now added the Pricing District to the Fruit Intake Report, so you now have a single location to find your variety, district, brix, and weights.

![](https://support.innovint.us/hs-fs/hubfs/image-png-Nov-28-2023-07-32-26-3529-PM.png?width=670&height=176&name=image-png-Nov-28-2023-07-32-26-3529-PM.png)

If you are a California winery and cannot see this additional Pricing District column, reach out to us at support@innovint.us and we will make sure your winery account is set up correctly.

### Improvements

**View vineyard block tags in your lot composition**

Your vineyard block tags, which can be used to designate organic, sustainable, or other certifications at the block level, are now visible in your lot composition! Find this data on your Lot details page on the Composition tab, and in the "Export components" file.

**![](https://support.innovint.us/hs-fs/hubfs/image-png-Nov-22-2023-05-44-46-2181-PM.png?width=213&height=340&name=image-png-Nov-22-2023-05-44-46-2181-PM.png)  ![](https://support.innovint.us/hs-fs/hubfs/image-png-Nov-22-2023-05-46-20-0392-PM.png?width=460&height=340&name=image-png-Nov-22-2023-05-46-20-0392-PM.png)**

**Better clarity around action edits!**

If you've [edited a task](https://support.innovint.us/hc/en-us/articles/208141233-how-to-edit-or-delete-recorded-actions?hsLang=en), the original task will display an "Edited" tag and link to the most recent version of the action.  The original action will also show an "Edited" tag, and link to the most recent version of the action.

![](https://support.innovint.us/hs-fs/hubfs/image-png-Nov-27-2023-11-13-35-8544-PM.png?width=686&height=50&name=image-png-Nov-27-2023-11-13-35-8544-PM.png)

An action that has actually been deleted will have a Deleted tag on it.

![](https://support.innovint.us/hs-fs/hubfs/image-png-Nov-27-2023-11-37-49-3324-PM.png?width=307&height=50&name=image-png-Nov-27-2023-11-37-49-3324-PM.png)

Please note that the edited versions of actions are *not* snapshots of those actions at the point in time they were edited.  Starting weights or volumes are not saved and so changes to weights and volumes, and the action summary will not look like the original edited action. We hope to improve this in the future.

**Lab Source field now available on Work Order analysis tasks**

If you use more than one type of lab output, you will find that we have surfaced the [Lab Source](https://support.innovint.us/hc/en-us/articles/360006665732-options-to-record-analysis-datachoose?hsLang=en#choose) field for you to specify on Analysis tasks at work order creation and completion. This brings the work order function in-line with our direct actions, and allows your lab result source to correctly reflect on your lot's analyses.

![](https://support.innovint.us/hs-fs/hubfs/image-png-Nov-27-2023-08-54-39-6957-PM.png?width=552&height=265&name=image-png-Nov-27-2023-08-54-39-6957-PM.png)

**Multiple trailer licenses display on separate lines on weigh tags**

**![](https://support.innovint.us/hs-fs/hubfs/image-png-Nov-28-2023-05-55-17-4392-PM.png?width=390&height=159&name=image-png-Nov-28-2023-05-55-17-4392-PM.png)**

For our users who may [receive fruit](https://support.innovint.us/hc/en-us/articles/360005125552-receive-fruit?hsLang=en#ad-da) on trucks with more than one trailer, we've made it easier to clearly record multiple trailer licenses on the weight tag.

To enter multiple trailer licenses (road train!?), enter a comma and space between each to separate them on the Receive Fruit action or task.  This will allow them to break across lines and display properly on your weigh tag:

![](https://support.innovint.us/hs-fs/hubfs/image-png-Nov-27-2023-08-57-58-9833-PM.png?width=519&height=227&name=image-png-Nov-27-2023-08-57-58-9833-PM.png)

**Updated requirements for username entry at login**

InnoVint was previously case sensitive for the username field at login, and we realize this caused confusion and frustration at times.  You would have seen the "Invalid login credentials" error when logging in if you capitalized your email.  To make life easier, the email field is no longer case sensitive... go wild!

![](https://support.innovint.us/hs-fs/hubfs/image-png-Nov-28-2023-06-05-39-4416-PM.png?width=350&height=197&name=image-png-Nov-28-2023-06-05-39-4416-PM.png)

### Bugs

- For a few days, November 1 through November 3, the backdate function was not working as intended on the Cost Item Lot Picker, and *current* lot volumes were being loaded rather than volumes at the specified point in time.

If you entered your monthly indirect costs in the first week of November, we recommend re-checking your lot costs.

- Annoying but true!  For our Sparkling module users, inputting bottles added in the "Add" input of box of the Bottle en Tirage &  Disgorge/Dosage and Package action would not correctly update volumes in the action, and a workaround was needed. Fixed!
- Sell Vineyard Contracts designated as "Written" would default to "Verbal" if opened for editing. If you've found an unusual number of Verbal contracts that you don't remember creating, this may be the culprit. You can now correctly save these as "Written" with no issues going forward.
- The Drain & Press action was automatically changing some lot stages to "Fermenting" and Saignee/Bleed actions were automatically changing some lot stages to "Processed."  We've updated this behavior and now:
  - Lot stage changes can be triggered in a Drain and Press action by using the "Change Lot Stage" radio button at the bottom of the action, or by creating a new lot in-line with a different lot stage.
    If you uncheck the Change lot stage box, and "Retain lot code" the lot stage will not change. For "Combine with existing lot" the lot stage will reflect the stage of the lot with which you are combining new wine.
    ![](https://support.innovint.us/hs-fs/hubfs/image-png-Nov-27-2023-09-35-19-1818-PM.png?width=400&height=132&name=image-png-Nov-27-2023-09-35-19-1818-PM.png)
  - Bleed actions will only cause a lot stage change if you create a new lot in the action with a different lot stage. Otherwise, if you select "Combine with existing lot,"  the lot stage will be retained from that existing lot.
  - Find out more details on Changing Lot Stages and the implications [here](https://support.innovint.us/hc/en-us/articles/204339859-how-to-change-lot-stage?hsLang=en).
