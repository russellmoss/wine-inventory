---
id: "32303268239508"
title: "Crush and Extraction"
url: "https://support.vintrace.com/hc/en-us/articles/32303268239508-Crush-and-Extraction"
category: "Harvest/Vintage"
section: "Crush and press"
created_at: "2024-11-20T15:51:04Z"
updated_at: "2024-11-21T10:28:02Z"
labels: ["estate", "wp-page-1132"]
gist: "The extraction operation records the initial extraction of must/juice from the fruit by crusher or press."
tags: ["harvest", "transfers", "additives", "barrels", "lot-identity", "work-orders"]
---

# Crush and Extraction

The extraction operation records the initial extraction of must/juice from the fruit by crusher or press.

For details on specifying the default extraction, refer to our [Preparing for Harvest/Vintage article](https://support.vintrace.com/hc/en-us/articles/32303268508564).

## Accessing the Extraction Window

There are several ways to access the [Extraction window](#h_e30db31d-a888-4a90-8129-7240002abba2).

- From the Fruit Intake Console, click the down arrow beside Arrive, select Crush/Press, then click Crush/Press Now.
- From the Job Management page, click the Operation icon, then click Extraction under Vintage/Harvest.

The Extraction window has two distinct areas: extraction and the fraction details table.

![Extraction_Window_Components_20200410.png](https://support.vintrace.com/hc/article_attachments/32328961371156)

## Crushing a Portion of Fruit

If you bring your fruit in by bins, you won't be able to specify the weight. You'll need to select the bins that you want to crush and crush the entire bin.

You can select partial amounts of each fruit parcel by specifying the amount to use in the Weight field in the Extraction area of the window. Each line specifies the available amount left to extract if it’s already been processed.

![Specifying_Amount_to_Use_20200413.png](https://support.vintrace.com/hc/article_attachments/32328961394452)

## Crushing into Multiple Tanks

You can record the break of juice into several tanks at crush/press. This is useful if you’re keeping track of free run, pressings, or simply want to place the juice into multiple lots or batches.

To add multiple vessels and batches for the juice to be crushed into, click Add Line. Below is an example of separating free run and pressings into different vessels.

![Extraction_-_Multiple_Vessels_20200413.png](https://support.vintrace.com/hc/article_attachments/32328930631060)

## Recording Additions

To record additions for a particular fraction, click the ![Additions_Icon_20200413.png](https://support.vintrace.com/hc/article_attachments/32328930606868) icon displayed below the fraction. This displays the Additions window for the fraction.

![Additions_for_Fraction_20200413.png](https://support.vintrace.com/hc/article_attachments/32328956541716)

## Requesting Lab Analysis on Fraction

If you want to request a lab analysis on a fraction, you’ll need to manually create a work order.

![Confirm_Crush_Press_Task_-_Manual_Work_Order_20200422.png](https://support.vintrace.com/hc/article_attachments/32328930645140)

Click the ![Lab_Analysis_20200422.png](https://support.vintrace.com/hc/article_attachments/32328945152404) icon displayed below the fraction.

## Note About Fraction Weight and Volume

At the point of extraction, the system converts from weight- to volume-based measurements for the resulting wine fractions. Therefore, each fraction will require a volume to be calculated, even if it’s just an estimate based on a standard rate of extraction. The volume is coupled with the known weight and both are displayed. For example, until you take an accurate dip measurement, you’ll see both an estimated volume and a weight in tonnes (tons) for a wine in ferment. The three fields used for calculating this amount are weight, rate, and volume. You’re only required to supply values for any two of these fields before clicking the calculate button to calculate the other.

## Note About Musts

vintrace expects all red grapes to initially extract as must. If any other fraction type is selected, a warning displays when you save the extraction operation. Of course, if you’re making sparkling wine, it wouldn’t be unusual for you to press directly to combined or other fractions so you can ignore the warning.

Conversely, if you’re performing on-skin fermentation of white juice and you select Must as the fraction type, you can ignore the warning that displays when you save the operation. You’ll need to do a separate Press Cycle later when you’re ready to press off the skins. Refer to our [Using the Press Cycle article](https://support.vintrace.com/hc/en-us/articles/32303268282132) to learn more about musts and pressing off the skins.

## Extraction Window

This section describes the tabs and fields in the Extraction window.

![Extraction_20200420.png](https://support.vintrace.com/hc/article_attachments/32328961534740)

### General Tab

- Load from Booking — The booking containing the parcels (fruit deliveries) you want to extract.
- Load from Crush Load — If the Crush/Press Load feature is enabled, you can select the appropriate crush/press load. This associates the correct fruit to this work order.
- Parcels — Add each parcel that you’re including in this crush load by clicking Add Line. Parcels from different blocks or growers can be added. You can search by docket number, varietal code, region code, or booking number.
- Fruit Process — Select the fruit process treatment. These can be used to supply instruction on a crush/press note. Examples include treatments that define the procedure for Destem Only, Whole Bunch Press, Crush No Rollers, etc… You can set up fruit process treatments in the Winery Setup window, under Setup Options > Treatment > Treatment (Crush).
- Crushers/Rollers — Select the crusher or rollers to use to extract the fruit. Leave this blank if you’re using a press (e.g., you may press some whites without the rollers or crusher).
- Press — Select a press to use.
- Destem — Select the Destem checkbox if the fruit is to be de-stemmed.
- Must Chill — Select the Must Chill checkbox if the must is to be chilled.

### Fraction Details Table on General Tab

The Fraction Details section of the Extraction window relates to information for each resulting fraction of must or juice from the crush. You’ll need to complete these fields for each fraction before clicking Add to add an entry to the fraction list.

- Vessel — The destination vessel or fermenter where the fraction should be processed to.
- Batch —The destination wine batch for the fraction. Fractions can be placed in different vessels and associated with the same wine batch. For example, in the case of pressings vs. free run, you may likely keep the two wine components within the same batch but simply store them separately. You can create a new wine batch by clicking New, or search for an existing batch in the system.
- Fraction Type — Select the type of fraction (e.g., free run, pressings, or must).
- Weight (t or T) — The weight in tonnes/tons being extracted for this fraction. This value should consider the total weight of the selected parcels in the Extraction area of the window and should be proportional to the extracted fraction.
- Rate (L/t) or GT — The rate of extraction per tonne/ton for the fraction. Unless the exact weight and volume are known, it should be entered as an estimate. You can configure default rates per fraction type (pressings, free run, must, etc…) in the Winery Setup window under Setup Options > General > System Policy and clicking Edit Default Extraction Rates.
- Volume (L or G) — The volume in litres/gallons of the crushed fraction. If estimating this amount, you’re only required to enter a Weight and a Rate (L/t) (G/T) before clicking ![Calculator_Icon_20200410.png](https://support.vintrace.com/hc/article_attachments/32328936866836) calculate.
- Dips — If you have dip measurements for the fraction of wine, click Dips and calculate before clicking Close. To toggle between the Dips and the Weight/Rate options, click Toggle.

### Additions Tab

The Additions tab lets you record additions for the operation based on weight, and not on the individual fraction. These additions can be listed on the work order for crush or press operations. Both of these operations include an Additions tab where you can indicate and record all additions made at the must pump or press tray. You can calculate the rates per ton, pound, tonne, or kilogram.

## Creating a Work Order for Extraction

To create a work order for extraction:

1. Create a work order.
2. From the Work Order window, click Add Job.

![Create_Work_Order_-_Add_Job_Button_20200420.png](https://support.vintrace.com/hc/article_attachments/32328930732180)

1. Select Extraction. The [Extraction window](#h_e30db31d-a888-4a90-8129-7240002abba2) displays.
2. Specify the details for the extraction.
3. Click Add to Work Order.

You can add any additional operations such as Additive or Analysis. By not specifying any fractions, the system prints a blank template note with space for up to three fractions.

TIP: You can start the crush/press and put the operation directly on a work order from the Fruit Intake Console. To do this:

1. From the Fruit Intake Console, click the down arrow beside Arrive.
2. Select Crush/Press.
3. Click Manual Work Order to create the work order manually, or Use a Template to select a template to create the work order.

## Completing the Work Order

To complete the work order:

1. Scan the barcode, or locate the work order in the Job Management console.
2. Click Complete. The Extraction window displays.
3. Fill in the completed work order. Be sure to double check that the correct parcels are selected and that the total weight of extraction iw what you’d expect.
4. Match the docket numbers entered on the note to those of the parcels in the list.
5. Select each fraction, completing any missing information.
6. Click Save.

You can also complete a task from the Fruit Intake Console by clicking the down arrow beside Arrive and selecting Crush/Press. If you have any work orders associated with the booking, these will be listed for completion.

Another option is to create a new work order, or complete the operation without assigning a work order by clicking Crush/Press Now.
