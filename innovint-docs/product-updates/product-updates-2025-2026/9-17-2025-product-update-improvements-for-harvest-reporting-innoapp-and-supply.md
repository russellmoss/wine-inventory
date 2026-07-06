---
title: "9/17/2025 Product Update: Improvements for Harvest, Reporting, InnoApp and SUPPLY!"
url: "https://support.innovint.us/hc/en-us/9/22/2025-product-update"
category: "Product Updates"
section: "Product Updates: 2025-2026"
page_type: "page"
lastmod: "2025-11-20"
gist: "It's been a busy quarter."
tags: ["release-notes", "harvest", "mobile", "reporting", "transfers", "additives"]
---

# 9/17/2025 Product Update: Improvements for Harvest, Reporting, InnoApp and SUPPLY!

It's been a busy quarter.  Grab a coffee and sit down for a scroll (in all your spare time!) or, jump straight to what interests you!

- Product updates for SUPPLY include the [Action History Feed and the depletions import](#SUPPLY)!
- Product updates for MAKE include:
  - [Multi-lot drain and press](#Multilot-DandP)
  - [Calculated Additives](#CalcAdditives)
  - New [work order print options](#WO_Print)
  - Tweaks and improvements to [actions and tasks](#Tweaks_Additions_Actions_andWOs)
  - Even more additions and updates to [reports and exports](#reporting)
  - Added functionality for [InnoApp](#innoapp)!
- Finally, in case you missed it, we've reposted our Harvest [Weigh Tag Compliance Alert](#WT_Compliance).

### MAKE Features & Improvements

#### Streamline your Drain & Press Workflows!

To help support all the workflows you have over harvest, we updated the [Drain & Press](https://support.innovint.us/hc/en-us/articles/205552639-drain-and-press?hsLang=en) action & task to support draining and pressing multiple lots.

*Combining multiple red fermentation tanks into a single pressed lot?* Do it in one simple step. This action will blend composition proportionally from all drained lots into the filled lots.

![Product Update - D&P](https://support.innovint.us/hs-fs/hubfs/Product%20Update%20-%20D%26P.png?width=688&height=136&name=Product%20Update%20-%20D%26P.png)
*More of an "overnight drain to separate lots, and press skins together" kind of person?* Use our new [Drain action/task](https://support.innovint.us/hc/en-us/how-to-record-a-drain?hsLang=en) in conjunction with the multi-lot drain and press.

![Product Update - Drain](https://support.innovint.us/hs-fs/hubfs/Product%20Update%20-%20Drain.png?width=688&height=198&name=Product%20Update%20-%20Drain.png)

[Back to top](#top)

#### Calculated Additives

Stay compliant and informed, and always know what's in your wine with our new [Calculated Additives](https://support.innovint.us/hc/en-us/calculated-additives?hsLang=en)! Find it in your Lot details page via the new "Additives" tab (formerly "Additions").

See all additives (at a batch level) in a lot, whether derived from additions or movement actions. Use the export for a list of current additives, or use the removed additive exports to report what was removed via volume adjustments like bottling or B2B transfers.

![Screenshot 2025-08-22 at 1.40.12 PM](https://support.innovint.us/hs-fs/hubfs/Screenshot%202025-08-22%20at%201.40.12%20PM.png?width=688&height=200&name=Screenshot%202025-08-22%20at%201.40.12%20PM.png)

*What else happened for this feature?*

In order to properly calculate your additives through movements that occur while a lot is in weight, we've also added a new Estimated Yield field in the [Bleed/Saignee](https://support.innovint.us/hc/en-us/articles/204651979-juice-bleed-saign%C3%A9e?hsLang=en) & [Drain](https://support.innovint.us/hc/en-us/how-to-record-a-drain?hsLang=en) actions/tasks.  This field defaults to the Estimated Yield that is already set on the lot in weight and allows us to immediately calculate the proper amount of additive to distribute out of the lot in weight (and into your new lot in volume).

**This field does NOT change the expected yield on the drained lot, which is automatically adjusted via a recorded Bleed/Saignee or Drain action.** For reference - you can now also find the field in the Winery Activity Feed export.

[Back to top](#top)

#### Editable PDF and Work Order Print improvements

We now support a new editable print version for work orders for all users! This means we support [5 different print options](https://support.innovint.us/hc/en-us/work-order-print?hsLang=en).

The [Editable PDF option](https://support.innovint.us/hc/en-us/work-order-print?hsLang=en#editable), in conjunction with a browser PDF extension, generates a landscape work order that utilizes the new work order instructions field, and allows editing of any blue highlighted fields.

![Editable PDF](https://support.innovint.us/hs-fs/hubfs/Editable%20PDF.png?width=688&height=344&name=Editable%20PDF.png)

> The Editable PDF pulls from the work order instructions field, **but will not populate instructions or note fields on individual work order tasks**. The Summarized Print views and older browser and simplified vessel views support both types of notes and instructions.

[Set your work order print defaults](https://support.innovint.us/hc/en-us/work-order-print?hsLang=en#settings) in the new **Work order print** **settings**! Once you choose your preferred work order print options - you can now set only those you want to display in the print work order dropdown menu.

![Work Order Print Setting](https://support.innovint.us/hs-fs/hubfs/Work%20Order%20Print%20Setting.png?width=688&height=212&name=Work%20Order%20Print%20Setting.png)

[Back to top](#top)

#### More usability for MAKE! Check out work order & direct action updates

- Has an intern made an oops, or you've had a personnel change leave an unwanted Announcement in perpetuity? We've made a change and now allow account admins to delete Notes & Announcements!
- If you ever need to remove a vessel or lot result from your [analysis impor](https://support.innovint.us/hc/en-us/articles/115002687291-how-to-import-analyses-via-csv?hsLang=en)t after selecting the file, you can now do it in app via the Analysis import action  screen
  ![Analysis Import - remove lot-vessel](https://support.innovint.us/hs-fs/hubfs/Analysis%20Import%20-%20remove%20lot-vessel.png?width=688&height=288&name=Analysis%20Import%20-%20remove%20lot-vessel.png)
- Tracking treatment types? We now save the ["Treatment" selection](https://support.innovint.us/hc/en-us/articles/115002976766-using-the-filter-feature?hsLang=en#treatment) for your filter work order templates
- Use our [ETS integration](https://support.innovint.us/hc/en-us/articles/115001540266-ets-integration-overview?hsLang=en)?
  - We updated the ETS Pull Sample direct action (the +Create external sample button in the Samples Explorer) to support a notes field
  - We updated the InnoVint ETS label print to automatically include the sample's variety and appellation to help support the ETS [vintage portal data.](https://www.etslabs.com/our-services/vintage-portal) Find out more or opt-out at info@etslabs.com
- We support more digits on fill fields for all movements involving bottles (bottling, bottle en tirage, and any other movement that supports tirage bins)
- We added a new default addition rate (mL/gal) that you can set on your additives!
- We added [new packaging items](https://support.innovint.us/hc/en-us/articles/115000825066-how-to-create-additives-and-additive-batches?hsLang=en): Can Carrier (under Product Type: Boxes) & Pouches (under Product Type: Glass/Vessels)
- We added a new Lab Source: JH Wine for analysis actions/tasks

[Back to top](#top)

#### Reporting Improvements!

- The Bottled Cost Report: this export now includes a new column for Cost per bottle, owner and bond columns
- The Vessel Explorer export: now supports larger amounts of data, more columns (Lot owner, Lot style and Lot color), and an updated column order to more closely match the format of the vessel import template
- The Vessel at Point in Time Report now includes empty vessels at a point in time!
- The Winery Activity Feed now includes a column for [Shipping Location](https://support.innovint.us/hc/en-us/locations?hsLang=en)! Easily report on where you shipped wines to/from!
- Fruit Cost Worksheet - the Estimated Yields Column is now populating. Estimated yields populate as follows:
  - If the block & vintage have received weight, displays the actual total received weight for the block & vintage
  - If the block & vintage have not received weight, then this displays the crop estimate (if this has been recorded on the block)
  - If fruit has not been received, and no crop estimate has been recorded for the vintage, this displays the block's historical average

[Back to top](#top)

#### InnoApp Updates!

- We added a little extra backup - InnoApp now warns you if you are completing a work order with a lot/vessel mismatch!
  - If the vessel on a lot in the work order details doesn't currently have matching lot contents, you will see a warning icon
  - If you are checking, or scanning vessel into a lot on InnoApp, you will also see a warning when the scanned vessel's contents do not match the lot on the work order
    ![InnoApp-Lot Vessel Mismatch](https://support.innovint.us/hs-fs/hubfs/InnoApp-Lot%20Vessel%20Mismatch.png?width=222&height=400&name=InnoApp-Lot%20Vessel%20Mismatch.png)  ![InnoApp - Vessel scanned different lot](https://support.innovint.us/hs-fs/hubfs/InnoApp%20-%20Vessel%20scanned%20different%20lot.png?width=261&height=400&name=InnoApp%20-%20Vessel%20scanned%20different%20lot.png)

- We've made it easier to see which lots and vessels are involved in each analysis task on the work order details page.
  ![InnoApp - Analysis Meta Data](https://support.innovint.us/hs-fs/hubfs/InnoApp%20-%20Analysis%20Meta%20Data.png?width=225&height=400&name=InnoApp%20-%20Analysis%20Meta%20Data.png)

- There is a new "edit work order" button in InnoApp that will allow users with appropriate permissions to delete an uncompleted work order from the app.
  ![InnoApp - Delete WO](https://support.innovint.us/hs-fs/hubfs/InnoApp%20-%20Delete%20WO.png?width=209&height=400&name=InnoApp%20-%20Delete%20WO.png)

[Back to top](#top)

#### 🚨 Compliance alert! Weigh tag updates for Harvest

*If you've missed our prior announcements and emails: We have an important weight tag compliance update based on recent guidance from the California Department of Food & Agriculture – Division of Measurement Standards (CDFA-DMS):*

Weigh tag numbers in California are required to remain sequential year over year. Any gaps in the numbering—regardless of vintage—can place wineries out of compliance with weigh tag regulations. Other regions are encouraged to check locally.  Historically, InnoVint recommended that users reset their starting weigh tag number each year to include the current vintage. What’s changing now?

- Because this advice breaks the sequence across vintages, **we've now removed the option for users to edit the starting weight tag number in Advanced Receive Fruit Weigh tag settings.** Our weigh tags in this feature will continue to increase by one to otherwise maintain compliance.
- For regions that do not require year over year sequencing (Washington state and New York state are among these), we can update your starting weigh tag on request.
- To support better vintage tracking, we’ve added a dedicated Vintage field to our weigh tag header.
- We now also support weigh tags split over multiple pages! We will have a header on each page including: Vintage, weigh tag number, legal language, Weighmaster, Weighing location, Weighed for, Vehicle info and Commodity section. Weight totals and the signature line will always appear at the end.
- Our weigh tags will now display up to 5 decimal places, if they are present on the fruit lot.

Additionally, we want to share a few reminders to remain compliant in California:

- Common Tare: If using common tares for bins, please ensure your bins have been weighed and submit the required [Common Tare documentation](https://t.churnzero.net/ss/c/u001.4AETqQO1uEI1sPmTZWDmW0BvdsuomjceE9mxpz1TQyoTN2zMCkA8I_LErXUtzOB1NdRF-13VennRO3kK8NFkdcF4R4EpCpBFHuJelqGsG4s/4j8/VpnyE4LMRamfUAAHWqDfbQ/h0/h001.gvqr7skZjuanDYdQQZlO2FFsLMudHs_JJs5uXVj-jmQ). You can then enter your code designations in Weigh Tag Settings, which will appear on printed weigh tags.
- Weighmaster Field: The Weighmaster field on each weigh tag must list the Weighmaster license business name (not an individual). If you utilize our Advanced Receive Fruit feature, Admin users can update this in your Weigh Tag Settings.

The CDFA outlines the necessary requirements for weigh tags in their [Business and Professions Code (Chapter 7)](https://t.churnzero.net/ss/c/u001.ySVL8z5W5BbyIUk9_HnRu0BhuN2nVzcUigjIPncLk8c48Z5T6fgMJ-pZpz-7eICzcSOa5fVOB5HU_Vz_xTxWMNw8vmTX6I4syLuSuy4vQU-TdDyBrka9rtSKHbd44DD7PTHvuww_YBJu_GDwobopHlUnkVEtspQoJNOIeUhehArZCLRE1tN2qr_Mi6TjH6af/4j8/VpnyE4LMRamfUAAHWqDfbQ/h1/h001.8xUb3O8gWBleMSDR4oardpUT3h9yE1Cve6sdHHd-VaE) and [Business Regulations (Chapter 9)](https://t.churnzero.net/ss/c/u001.-NoWkZ2ntgWTNIqIt06WUUVctB04ehhAit6mqq_paOIX1b_Qi0ZVHOZnj4O7u5SvbyS8awgyrl-nMo-PG3CXbmSP3Tv40IX9G8iXcHPKR08SyGZfjlFpn-Cm3D7_Qf0_542upWMPPlQZ4orFHRlnprPbfuNYtFcftLePlGl3nZAolgs9QVNSpqTjGQMiLtrvSz-OtJtZtcQ8HaCDgf1cPaLGyy4zpTnXC5bHlYeh0kJeTPgNsvEqwqRLxh0_psTxuD8oSmGJh2c1Mapa1tvqKAyh7JdF92A59ULgSg5lfh0/4j8/VpnyE4LMRamfUAAHWqDfbQ/h2/h001.WX2O6WJnB576MjBLrHMC51Dc9TlL-sfFsAs8xVH-mig).

[Back to top](#top)

### SUPPLY Features & Improvements

#### Action History Feed

Check out the [Action History Feed!](https://support.innovint.us/hc/en-us/reporting-in-supply?hsLang=en#AHF) Filter, search and export your activity history via the new icon in the lefthand navigation menu.

![SUPPLY Action History](https://support.innovint.us/hs-fs/hubfs/SUPPLY%20Action%20History.png?width=688&height=202&name=SUPPLY%20Action%20History.png)

#### **Import your depletions in one click!**

Truing up your wholesale depletions? We've added new functionality to [import all your depletions at once](https://support.innovint.us/hc/en-us/how-to-import-depletions-in-supply?hsLang=en)!  This features enables you to use a csv or xlsx file to seamlessly create and submit multiple depletion actions at once. These imported ‘Deplete inventory’ actions are separate from each other and can be individually edited or deleted like manually entered actions.

#### Usability features

- We added a new "325mL Bottle" format
- We updated the column widths for SKU and SKU Name in the SKU Explorer - and you can now resize "SKU name" column in both the SKU Explorer and pickers. Simply double click the edge of the column header to automatically expand and contract based on the content, or manually drag it to your desired width.

[Back to top](#top)
