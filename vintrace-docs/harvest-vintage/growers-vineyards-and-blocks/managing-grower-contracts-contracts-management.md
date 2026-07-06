---
id: "45962805386004"
title: "Managing Grower Contracts (Contracts Management)"
url: "https://support.vintrace.com/hc/en-us/articles/45962805386004-Managing-Grower-Contracts-Contracts-Management"
category: "Harvest/Vintage"
section: "Growers, Vineyards, and Blocks"
created_at: "2026-02-04T02:24:03Z"
updated_at: "2026-05-01T18:10:48Z"
labels: []
gist: "This article relates to the Contracts Management module."
tags: ["harvest", "vineyard", "cost", "permissions"]
---

# Managing Grower Contracts (Contracts Management)

This article relates to the Contracts Management module. For the classic Grower Contract Console, refer to [Managing Grower Contract Payments and Fruit Costs](https://support.vintrace.com/hc/en-us/articles/32303300639124-Managing-Grower-Contract-Payments-and-Fruit-Costs). The Contracts Management module is disabled by default. To have this feature enabled, contact support.

The cost of fruit coming into the winery can be tracked with or without grower contracts.

Where grower contracts have been set up they will automatically be assigned to fruit when it is booked, based on the block and vintage.

### Managing grower contracts within the Contract Management module

1. [Creating a grower contract](#h_01KQ7ZQBZPNHS1PBC50YY37D57)
2. [Adding fruit to grower contract](#h_01KQ80Q5VXFJ1VPK934AH7SWDM)
3. [Adding bonus and penalty rules](#h_01KQ80Q5VYS8MPV134XPY5QPTX)
4. [Creating an instalment plan for grower payments](#h_01KQ80Q5VZP96P3HCFP42GCD3T)
5. [Assigning levies](#h_01KQ86VR3EMGMS13DW2FD5DVNG)

## Creating a grower contract

Contracts may span multiple years, however the fruit price and expected tonnes need to be set each year.

To create a grower contract:

1. Click ![](https://support.vintrace.com/hc/article_attachments/45962795096980) Contracts in the sidebar.

The Contract page displays.

Access to this menu is only available to users with the [Can manage grower contract permission](https://support.vintrace.com/hc/en-us/articles/32303349421588#Permissions).

2. Click the ‘Add’ button in the top right.

![](https://support.vintrace.com/hc/article_attachments/48663985853588)

The ‘New contract’ page displays:

![](https://support.vintrace.com/hc/article_attachments/45962805374484)

3. Specify the high level, non-vintage details for the contract in the Details section, including the contract name, the grower, and the contract start date. Once these have been saved, fruit details can be entered.

4. Click Save. Fruit contract details page displays:

![](https://support.vintrace.com/hc/article_attachments/48663985854740)

Do not navigate away from this page without [adding at least one fruit (block) record](#h_01KBK3N3Z361S48G839NDFGDTG), or you will not be able to access the contract again.

## **Adding fruit to a grower contract**

Block details need to be added to contracts each year with the expected tonnes (tons) and price.

To add block details to the contract:

1. Click the Add button at the top right of the Fruit section

![](https://support.vintrace.com/hc/article_attachments/48663985855380)

The Add fruit window displays

![](https://support.vintrace.com/hc/article_attachments/45962795097876)

2. Select the vineyard, block, and vintage. Other fields on the left hand side will be automatically populated where there is data available.
3. Enter how much fruit is expected to be received in tonnes, or in areas

If the contract is based on areas, the expected tonnes also need to be entered

![](https://support.vintrace.com/hc/article_attachments/45962795098772)

4. Enter the Base price for the fruit, and the expected cost will be calculated.
5. If no [bonus or penalty rules](#h_01KQ80Q5VYS8MPV134XPY5QPTX) are required, click Save.

## **Adding bonus and penalty rules**

Optionally, you can define bonus and/or penalty rules that can be applied to the fruit cost. These can be based on:

- [the grade of the fruit](https://support.vintrace.com/hc/en-us/articles/40392871621268),
- how it was harvested (machine or hand),
- MOG,
- or [metric value rules](https://support.vintrace.com/hc/en-us/articles/32301340717972). E.g. You can select a pre-defined metric threshold policy for a brix reading between 18-22 that adds a bonus cost of 10%.

1. Click the ![](https://support.vintrace.com/hc/article_attachments/48663985856276) add icon in the Value rules section of the Fruit window and select the type of rule you want to add.

![](https://support.vintrace.com/hc/article_attachments/45962795099156)

2. Select the Condition for the rule to be applied

![](https://support.vintrace.com/hc/article_attachments/45962805379476)

3. Enter the price change and type of change, i.e. % or $/tn.
4. Enter a positive value for bonuses, or a negative value for penalties. The ‘type’ can be a dollar figure (e.g. an additional price per tonne) or a percentage.
5. If the price change should always be automatically applied when the condition is met, then ![](https://support.vintrace.com/hc/article_attachments/48663985858580) check the ‘Auto apply condition’ checkbox.

   If unchecked, you will need to review these rules and [apply or waive each rule](https://support.vintrace.com/hc/en-us/articles/43989505228180) for each intake where the condition has been met before any grower payments can be processed.
6. To add another rule of the same type, click ‘Add another’.
7. To add another rule of a different type click the ‘Add’ drop down button again.

![](https://support.vintrace.com/hc/article_attachments/48663985859476)

8. Once all rules have been defined, click Save.

Once the fruit records have been saved they are listed in the Fruit section of the contract page.

![](https://support.vintrace.com/hc/article_attachments/45962795099668)

These records can be viewed/maintained via the ![](https://support.vintrace.com/hc/article_attachments/45962805379604) ellipse button at the end of each row. There are also options to add and view fruit bookings that navigate to the [Fruit Intake console](https://support.vintrace.com/hc/en-us/articles/32303268370324).

## **Creating an instalment plan for grower payments**

An instalment plan can be created for the contract by clicking the Manage Instalments button in the Payments section.

![](https://support.vintrace.com/hc/article_attachments/45962795100564)

1. Select the vintage you want to add (or update) an instalment plan for.
2. Click the Add dropdown button on the right to select the type of payment to be added

![](https://support.vintrace.com/hc/article_attachments/45962795101076)

3. Repeat this for each instalment required.

Only one of the ‘End of month following month of delivery’ or ‘Fixed amount’ type payments may be selected, and these must be the first instalment in the plan. Multiple ‘Fixed date’ instalments may be included, up to a total of 4 instalments.

For the ‘End of month following month of delivery’ instalment type, an individual payment will be created when fruit is taken in, with the due date being the last day of the month after that fruit intake. If fruit is taken in during the following month an additional payment will be created. Initially - before any fruit has arrived - a placeholder payment will be shown with the due date shown as ‘tbd’.

E.g. When the instalment plan is first created you will see a single row with the date set to ‘tbd.
If fruit is taken in during February then a row will appear with a due date on 31st March. This payment will cover all fruit taken in during February. If additional fruit is then taken in during March then a second row will be shown with a due date of 30th April.

4. For ‘Fixed amount’ and ‘Fixed date’ type instalments you will need to select the date when this is expected to be paid.
5. By default, the cost of the fruit will be split evenly across the instalments. You can adjust the percentage that will be paid in each instalment as required, with the ‘remaining’ percentage covered by the last instalment.
6. Select which levies (aka fruit assessments) should be deducted from each grower payment (if any).

![](https://support.vintrace.com/hc/article_attachments/45962805380628)

7. Click Save.

Once the instalment plan has been saved the payments are listed in the Payments section of the contract page.

![](https://support.vintrace.com/hc/article_attachments/45962805381012)

Initially all $ columns will be $0 except the ‘Forecast payment’ which is calculated based on the expected tonnes multiplied by the base cost of the fruit.

Once [payments are processed](https://support.vintrace.com/hc/en-us/articles/43989505228180) each column will be populated with values based on the actual cost of the fruit taken in.

## **Assigning levies**

If you do not have necessary levies for your vintrace operations, contact support.

One or more levies (also known as fruit assessments) may be assigned to one or more contracted fruit records so that they can be deducted from grower payments.

1. Click Add button at the top right of the Levies section for the contract

![](https://support.vintrace.com/hc/article_attachments/45962795103252)

The Add levy window displays

2. Select the vintage the levy is to be applied for
3. Select which levy you want to apply
4. Select which contracted fruit records (blocks) you want to the levy to be applied to

![](https://support.vintrace.com/hc/article_attachments/45962795104020)

5. Click Save.

Once the levy records have been saved they are listed in the Levies section of the contract page. You can expand each row to list the fruit records linked to the levy.

![](https://support.vintrace.com/hc/article_attachments/45962805382292)

Alternatively levies can be applied to multiple contracted fruit records for multiple contracts at once.

1. In the main contracts list page, select the Fruit tab

![](https://support.vintrace.com/hc/article_attachments/45962805382420)

2. Use the search filters to locate the contracted fruit records you want to link a levy to, e.g. using the Region/Sub AVA search field. Multiple regions can be selected.
3. Select the contracted fruit records you want in the main table. You can select individual records, or select all, or a page of records via the Multi select button at the top left of the table

![](https://support.vintrace.com/hc/article_attachments/45962795104916)

4. Select ‘Add levies’ from the bulk action menu at the bottom left of the table

![](https://support.vintrace.com/hc/article_attachments/45962805382804)

A validation window is displayed

![](https://support.vintrace.com/hc/article_attachments/45962805383060)

5. Select the levies you want to link to the selected contracted blocks
6. Click Update

If the selected levies have already been linked to the selected fruit records then duplicate records will **not** be created.

If you want to calculate the cost of levies without processing grower payments within vintrace, see [Calculating Levies for Grower Contracts without Grower Payments](https://support.vintrace.com/hc/en-us/articles/45568632820756)
