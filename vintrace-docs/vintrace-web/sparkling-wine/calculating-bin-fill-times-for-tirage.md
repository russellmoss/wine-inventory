---
id: "32303315462548"
title: "Calculating Bin Fill Times for Tirage"
url: "https://support.vintrace.com/hc/en-us/articles/32303315462548-Calculating-Bin-Fill-Times-for-Tirage"
category: "vintrace Web"
section: "Sparkling Wine"
created_at: "2024-11-20T15:51:27Z"
updated_at: "2025-01-15T19:12:07Z"
labels: ["estate", "wp-faq-6167", "Calc bin fill times", "fill times"]
gist: "If the vintrace’s Sparkling module is enabled, you can use vintrace to calculate tirage bin times for multiple bins."
tags: ["work-orders", "barrels", "packaging", "lot-identity"]
---

# Calculating Bin Fill Times for Tirage

If the vintrace’s Sparkling module is enabled, you can use vintrace to calculate tirage bin times for multiple bins. This eliminates the need to manually enter the fill time for each bin.

There are two options for calculating the bin’s fill time:

- [Calculate Total Duration](#h_01EKB6KT5SRV08AYG9AGJRXM2H) — The start fill time of each bin is calculated based on the duration between the start and end time.
- [Calculate Minutes Per Bin](#h_01EKB6M08HZPFK0W246J2Y205C) — The start fill time of each bin is calculated based on the start time and number of minutes for each bin.

## Performing a Tirage

To access the Tirage operation, you can click the Operations icon, then select Tirage from the following:

- [The Product page](https://support.vintrace.com/hc/en-us/articles/32303310460948)
- [The Vessels page](https://support.winery-software.com/hc/en-us/articles/360001550655-The-Vessels-Page)
- [The Job Management page](https://support.winery-software.com/hc/en-us/articles/360000812055-Job-Management-Console)

You can also add a Tirage job to a [work order](https://support.vintrace.com/hc/en-us/articles/32303315610388) by clicking Add Job, then selecting Tirage.

From the Tirage window’s General tab, you’ll need to specify the batch/vessel as well as the tirage/packaging details.

In the Bins/QA tab, enter each bin that will be used for the tirage operation. You can click Add Bin Detail to add additional lines for your bins. You’ll also need to enter the number of bottles per bin, and the area.

![Tirage_-_Bins_QA_-_Add_Bin_Detail_Button_20200928.png](https://support.vintrace.com/hc/article_attachments/32328993845524)

If you’re not tracking individual bin numbers, you can click Quick Fill, then enter the total number of bottles and the storage area.
![Tirage_-_Quick_Fill_20200928.png](https://support.vintrace.com/hc/article_attachments/32328993972500)

After you’ve specified the bin, click Calc Fill Time.

![Tirage_-_Calc_Fill_Time_Link_20200928.png](https://support.vintrace.com/hc/article_attachments/32329002655892)

The Bin Fill Time Calculator window displays.

![Bin_Fill_Time_Calculator_-_Calc_Total_Duration_20200928.png](https://support.vintrace.com/hc/article_attachments/32329002797716)

You can choose to have vintrace calculate the bin fill times [using the total duration](#h_01EKB6KT5SRV08AYG9AGJRXM2H), or [using the number of minutes per bin](#h_01EKB6M08HZPFK0W246J2Y205C).

## Calculating Start Fill Times Using Total Duration

If you want vintrace to calculate the start fill times based on the total duration, do the following from the From the Bin Fill Time Calculator window:

1. Be sure that the Calc Total Duration option is selected.
2. Enter the start date and time.
3. Enter the end date and time.

![Bin_FIll_Time_Calculator_-_Calc_Total_Duration_20200928.png](https://support.vintrace.com/hc/article_attachments/32328982054292)

4. Click OK.

vintrace calculates the Fill Time for each bin based on the start and end time that you entered.

![Total_Duration_Example_20200928.png](https://support.vintrace.com/hc/article_attachments/32329020368404)

## Calculating Start Fill Times Using Minutes Per Bin

If you want vintrace to calculate the start fill times based on the amount of time for each bin, do the following from the From the Bin Fill Time Calculator window:

1. Select the Calc Minutes Per Bin option.
2. Specify the start date and time.
3. Enter the number of minutes for each bin.

![Bin_FIll_Time_Calculator_-_Calc_Minutes_Per_Bin_20200928.png](https://support.vintrace.com/hc/article_attachments/32328993930772)

4. Click OK.

vintrace calculates the fill times for each bin based on the number of minute per bin that you entered.

![Minutes_Per_Bin_Example_20200928.png](https://support.vintrace.com/hc/article_attachments/32328987682964)
