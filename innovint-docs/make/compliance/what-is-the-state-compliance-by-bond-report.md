---
title: "What is the State Compliance by Bond Report?"
url: "https://support.innovint.us/hc/en-us/what-is-the-state-compliance-by-bond-report"
category: "MAKE"
section: "Compliance"
page_type: "page"
lastmod: "2026-07-01"
gist: "A wine's tax class determines how much excise tax is paid per gallon of wine as defined by the percentage of alcohol in the wine."
tags: ["compliance", "bond", "reporting", "tax-class", "ux-friction", "lab"]
---

# What is the State Compliance by Bond Report?

This article covers:

- [Who should use the State Compliance by Bond Report?](#who)
- [What does the report do?](#what)
- [How to use the report & things to note](#how)
- [FAQ](#FAQ)

### Who should use the State Compliance by Bond Report?

A wine's tax class determines how much excise tax is paid per gallon of wine as defined by the percentage of alcohol in the wine. In the United States, tax classes for still wines are set at both the federal and state levels.

Historically, federal still wine tax classes were determined as above or below 14% alcohol by volume (ABV). But in the Tax Cuts and Jobs Act of 2017, the Federal still wine tax classes were amended and now require producers to declare wine above and below 16% ABV.

In response to the change, InnoVint updated still wine tax classes to <16% and 16-21% ABV.  However, several states in the US have continued to determine their still wine tax classes as above or below 14% ABV.

For our users in those states using the 14% threshold (which include California, Nevada and Wisconsin among others), we have provided this report to help wineries more efficiently classify their wines for state reporting.

You can find the **State Compliance by Bond** report in the Compliance section of the Report Explorer.

![What is the State Compliance by Bond Report-report](https://support.innovint.us/hs-fs/hubfs/What%20is%20the%20State%20Compliance%20by%20Bond%20Report-report.webp?width=670&height=214&name=What%20is%20the%20State%20Compliance%20by%20Bond%20Report-report.webp)

### What does the report do?

This new report leverages our powerful custom reporting technology, in conjunction with two new columns:

- **Relevant Alcohol (EtOH & Alcohol) - REL ALC**
  This column evaluates the *most recently entered* analysis from the following columns and displays that most recent value for a lot:
  - Alcohol
  - Ethanol
  - Ethanol at 60F
  - Ethanol at 20C
  This may be *either* a lot composite or an Individual vessel type analysis.  Find the analysis type referenced in the REL ALC "Performed on" column.  The report will automatically display the Value, Effective At and Performed On columns by default.
- **State Alcohol Category - ALC CAT**
  This column takes the Relevant Alcohol (EtOH & Alcohol) value of the lot and assigns an alcohol category based on that value: <14%, 14-16%, >16% or No value.

The Compliance by Bond report (which is also a multi-winery report) automatically groups wines by **Bond**, and then by **State Alcohol Category**, thereby providing a quick method to report on wines by State tax class:

![What is the State Compliance by Bond Report-tax class](https://support.innovint.us/hs-fs/hubfs/What%20is%20the%20State%20Compliance%20by%20Bond%20Report-tax%20class.webp?width=670&height=323&name=What%20is%20the%20State%20Compliance%20by%20Bond%20Report-tax%20class.webp)

You can also find these new Relevant Alcohol and State Alcohol Category columns available for any other custom reports that you might create!

### How to use the report & things to note

#### Timing

- This report is NOT a point in time report, so you cannot run it as of a specific point in time (i.e. January 31).

We suggest that your team internally confirm a time for monthly/ quarterly/annual close (i.e. when you would normally would set a [lock backdate](https://support.innovint.us/hc/en-us/articles/360020396351-winery-activity-lock-backdating?hsLang=en) and stop entering actions for the period), and to set a reminder to export a report as a snapshot of that date and time.

#### Results & Analysis Types

- If a lot does not have any relevant alcohol readings, it will be grouped under the **No value** heading.  These may be undeclared wines, or they may be wines missing alcohol results.  Expand the **No value** group to review lots and assess their stage or status (*consider adding the lot stage column for a quick check*).
  - If you do update analysis on a lot, be sure to wait for the report to refresh in order to display that data.
- If your team utilizes Individual Vessel analyses frequently, especially on barrel lots, be sure to check the **Performed on** column, in order to confirm that the desired analysis type is being pulled for the report.

#### Custom Report functionality

- You may move, add, remove, filter and sort columns in the report to view the data as required. See more about all the potential functionality [here](https://support.innovint.us/hc/en-us/custom-reports?hsLang=en)! *However*, you may not re-save the State Compliance by Bond report as a new report, edit the name or description, or revert to the saved version of the report.
- This report can be exported as an .xlsx file with all groupings and customized columns intact.
- Don't forget, just like any Custom Report, you can add this report to your Favorites.

Keep an eye on the report throughout your reporting period to be sure analysis is being entered in a timely manner.

### FAQ

**Q: How are the alcohol groupings determined?**

*A: The State Alcohol Category is determined as follows:*

- *<14 % - Relevant Alcohol value is less than 14.00%*
- *14 - 16 % - Relevant Alcohol value is between 14.00% and  up to and including 16.00%*
- *> 16 % - Relevant Alcohol value is greater than 16.00%*
- *No value - No value exists for Relevant Alcohol.  This  means that no values exist for this lot in the following  analyses:*
  *Alcohol,* *Ethanol,* *Ethanol at 60F,* *Ethanol at 20C*
