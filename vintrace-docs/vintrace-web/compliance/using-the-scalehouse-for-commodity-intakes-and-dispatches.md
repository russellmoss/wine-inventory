---
id: "47362838054036"
title: "Using the Scalehouse for Commodity Intakes and Dispatches"
url: "https://support.vintrace.com/hc/en-us/articles/47362838054036-Using-the-Scalehouse-for-Commodity-Intakes-and-Dispatches"
category: "vintrace Web"
section: "Compliance"
created_at: "2026-03-19T02:26:09Z"
updated_at: "2026-05-28T23:59:43Z"
labels: []
gist: "This feature is currently being piloted."
tags: ["compliance", "corrections", "inventory", "exports", "harvest"]
---

# Using the Scalehouse for Commodity Intakes and Dispatches

## Enabling the Scalehouse

This feature is currently being piloted. If you would like to turn this feature on please reach out to your account manager or support

Before the Scalehouse can be used, a [local vintrace administrator](https://support.vintrace.com/hc/en-us/articles/32303349421588) must enable the feature via system policies.

---

The **Scalehouse** feature provides a streamlined, high-efficiency interface for managing deliveries and dispatches that utilize a weigh in/out scale. It is designed specifically for scale operators and weighbridge staff to quickly record gross and tare weights, capture relevant commodity details, and generate weight tickets/dockets.

This article covers:

- [Enabling the Scalehouse](#h_01KM1P2S2HGX42DJ00CHWXHS94)
- [Accessing the Scalehouse](#h_01KM1XW2QB34S3E4DGACM4PHZY)
- [Processing a New Delivery or Dispatch](#h_01KM1NXTCBBFP6X988X131V603)
- [Printing the Weigh Certificate](#h_01KM1NXTD02N91M55SNVG1NJQN)
- [Voiding and correcting Weigh Records](#h_01KM24FQEYDCKJJ4QCRBZGAX06)
- [Frequently Asked Questions](#h_01KM1NXTD9G4DEBTCEQA8TRPDY)

## Accessing the Scalehouse

The Scalehouse is accessible via the truck icon in the sidebar menu ![](https://support.vintrace.com/hc/article_attachments/49614761901844).

- The Scalehouse page displays a list of weigh records that have come across the scales - whether delivered to the winery, or dispatched out.![](https://support.vintrace.com/hc/article_attachments/49614761902228)
- **Finding a record**: Use the search section on the left to filter the records, e.g. by selecting a date range, or weigh tag/docket number.

## Processing an Intake or Dispatch

1. Click the **Add** button at the top right of the page. The Weigh Record window is displayed**![](https://support.vintrace.com/hc/article_attachments/47362822711828)**
2. Select the type of commodity being weighed. These can be defined via the ![](https://support.vintrace.com/hc/article_attachments/49614761902484) button next to the Commodity type field, or **Set up > Winemaking > Commodity types.**

Note that depending on your configuration you may be able to select a Scale that is not at the Winery you are currently pointing to within vintrace. You will be able to save the record but it may be filtered out from the list page.

3. If a commodity is being **delivered into** the winery enter the gross weight.

   - If you have [integrated weigh scales](https://support.vintrace.com/hc/en-us/articles/32303328376084-Weigh-Scale-Integration) click the **Scale Icon** to capture the live weight, or manually enter the weight.
   - Enter a Time in, or click **Now** to populate the current date and time.
4. If a commodity is being **dispatched out** of the winery enter the tare weight.

   - As above, if you have [integrated weigh scales](https://support.vintrace.com/hc/en-us/articles/32303328376084-Weigh-Scale-Integration) click the **Scale Icon** to capture the live weight, or manually enter the weight.
   - Enter a Time in, or click **Now** to populate the current date and time.
5. Enter all other relevant details. You can then save the record as 'In progress'.
6. Alternatively if you know all the details you can complete the record. This will require both the Gross and Tare weights to be entered and the Net weight to be calculated.

## Printing the Weigh Certificate

- On saving the record as **Complete** a **Weight Certificate (PDF)** is automatically generated. Aka 'Weigh tag', or 'Docket'
- You can select the **Print** option for any record the Scalehouse list page to reprint a weigh tag/docket at any time.

## Voiding and correcting Weigh Records

- Weigh records that are **In progress** can be updated at any time.

Depending on your local configuration previously entered weights may be locked down. If these need to be changed you will need to delete the record and start again.

- **Completed** weigh records can be **voided** and a new record entered in its place.

  - On the main Scalehouse list page select 'Void' from the ellipse menu ![](https://support.vintrace.com/hc/article_attachments/49614761902740)

    - Voided records remain available to view and the weigh certificate may be reprinted if needed. However these records cannot be updated.

## Frequently Asked Questions

**What is the difference between Scalehouse and the Fruit Intake Console?** The Fruit Intake Console is designed for winemakers to manage crush details, additions, and vessel placements. The **Scalehouse** is a "lite" interface focused purely on rapid weight data entry and traffic flow at the weighbridge.

---
