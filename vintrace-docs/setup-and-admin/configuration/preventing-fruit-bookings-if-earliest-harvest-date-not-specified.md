---
id: "32301318085524"
title: "Preventing Fruit Bookings if Earliest Harvest Date Not Specified"
url: "https://support.vintrace.com/hc/en-us/articles/32301318085524-Preventing-Fruit-Bookings-if-Earliest-Harvest-Date-Not-Specified"
category: "Setup and Admin"
section: "Configuration"
created_at: "2024-11-20T14:46:36Z"
updated_at: "2024-11-21T10:28:44Z"
labels: []
gist: "Available starting with vintrace 9.4.2."
tags: ["harvest", "configuration", "vineyard", "ux-friction"]
---

# Preventing Fruit Bookings if Earliest Harvest Date Not Specified

Available starting with [vintrace 9.4.2](https://support.vintrace.com/hc/en-us/articles/32303276924308).

This feature is not enabled by default. If you would like to use this feature, please contact our support team.

You can prevent users from [scheduling fruit bookings](https://support.vintrace.com/hc/en-us/articles/360000814175-Managing-Fruit-Intakes-and-Fruit-Intake-Bookings-) when a block’s earliest harvest was not specified during an [assessment](https://support.vintrace.com/hc/en-us/articles/360000826036-Recording-Seasonal-Block-and-Viticulture-Assessments#RecordingaNewAssessment). This affects fruit bookings that are added from the [Fruit Intake Console](https://support.vintrace.com/hc/en-us/articles/32303330881044), or with the importer.

To do this:

1. Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32328821025300) Set Up in the sidebar.
2. Click General, or search for *System Policy*.
3. From the System Policy tile, click Configure.
4. Select the Block Fruit Bookings if the Block’s Earliest Harvest Date Is Not Set checkbox.

![Winery_Setup_-_System_Policy_-_Earliest_Harvest_Date_Reqd_20230105.png](https://support.vintrace.com/hc/article_attachments/32328828935700)

5. Click Save.

If a user attempts to schedule a booking for a block without an earliest harvest date, the following error displays:

```
The block <Block_Name> does not have an earliest harvest date recorded.
```
