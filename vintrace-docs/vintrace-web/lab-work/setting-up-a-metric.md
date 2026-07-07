---
id: "32301345260948"
title: "Setting Up a Metric"
url: "https://support.vintrace.com/hc/en-us/articles/32301345260948-Setting-Up-a-Metric"
category: "vintrace Web"
section: "Lab work"
created_at: "2024-11-20T14:48:31Z"
updated_at: "2026-06-17T02:29:21Z"
labels: []
gist: "TIP: You can also click an existing metric from the list to edit it."
tags: ["lab", "configuration", "lot-identity", "ux-friction", "additives", "corrections"]
---

# Setting Up a Metric

## Creating/Editing a Metric

1. Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32329184610068) Set Up in the sidebar.
2. Click Lab.
3. From the Metrics tile, click Configure.
4. Click New Metric. The Metric window displays.

TIP: You can also click an existing metric from the list to edit it

![Metric_Create_20200803.png](https://support.vintrace.com/hc/article_attachments/32329179936660)

6. Specify the details for the metric. Be sure to enter the correct value for the PPM to g/L Factor.
7. Click Save.

## Options for defining a Metric

An asterisk \* denotes a mandatory field.

**Name\***: How you refer to the metric. This will often be the full name of the Metric, e.g. Titratable Acidity. This name can be used to search for the metric and will display on any list of Metrics throughout the system

**ppm to g/L factor**: conversion rate between parts per million and grams per Litre. Usually '0.001' for anything that can be recorded in both units such as Sulphur Dioxide, Ammonia etc.

**Qualitative Unit\***: Unit of Measurement used to record this Metric

TIP: 'Units' can be used as a flexible 'catch-all' if there isn't a suitable option available

**Does the presence of this metric indicate and allergen?**: Checking this box will flag any wine batch tested with this metric as containing the allergen noted in 'Allergen Text'

- This is a simple on/off trigger based on the wine batch being *analysed* for this Metric. It does not depend on whether there is any evidence of the Metric being *present* in the wine batch

**Allergen Text**: What vintrace will display as allergen advice should the wine batch be analysed for a Metric that indicates the presence of an allergen

**Max precision**: The maximum number of decimal places vintrace will display on screen for this metric

- This affects the on-screen display only. vintrace will capture and retain whatever is entered at the time of data entry for each analyses regardless of this setting. You can update this setting as required to show/hide more decimal precision against a metric

**Code**: A short name for the Metric. This Code will display on Analysis Tasks in the Lab Console, and on Lab Labels when printed

TIP: You can also use this short Code for data entry on an Analysis Operation and when creating an Analysis Template. e.g. if the Code for Titratable Acidity is 'TA', you can simply type 'TA' into an analysis task rather than entering or searching for 'Titratable Acidity'

**Mapped name:** The name that you want to display for the Metric in the downloadable spreadsheet for [export/import of lab analysis data](https://support.vintrace.com/hc/en-us/articles/32301343026964). This is relevant only to the generic 'VINx2 Standard' export/import format. To map Metric names to match specific analysers/laboratories, follow [this guide](https://support.vintrace.com/hc/en-us/articles/32301340432788).

**Min. Val**: The lower value you can enter against the Metric before vintrace will highlight it as out-of-range

**Max. Val**: The upper value you can enter against the Metric before vintrace will highlight it as out-of-range

- These values do not restrict your input in any way. They act as a threshold for a visual alert state on the Metric. Entering data beyond these values simply highlights the data entry field for the metric

![metric_threshold.png](https://support.vintrace.com/hc/article_attachments/49927126603156)

Minimum and Maximum value threshold set

![metric_outofrange.png](https://support.vintrace.com/hc/article_attachments/49927126603284)

Alert state on a result outside the Min/Max threshold value

**Sort Order**: Determines priority of appearance for the metric on a lab label or within the Lab Console. Metrics appear alphabetically without a defined Sort Order

**Allow blend calculation**: Checking this box allows vintrace to automatically calculate expected values following a blend of wine batches. This calculation will only occur for a metric if all blended components have relevant data prior to the blend operation

- Calculated values will always show with an \* asterisk next to them on the vessels page, and a clear 'calculated' label on the Wine Overview screen

![vessels_calculated.png](https://support.vintrace.com/hc/article_attachments/49927126605076)

Calculated metric on Vessels page denoted by \* (asterisk)

![metrics_calculated.png](https://support.vintrace.com/hc/article_attachments/49927126605204)

Calculated metrics on the Wine Overview screen with 'Calculated' label

**Allow numeric values only**: Restricts the data input against the Metric to numeric only. No symbols or letters will be accepted

**Inactive**: Make the Metric inactive. All historically recorded analyses will still be viewable against your batches, but the Metric will be unavailable for selection in an Analysis task. This is reversible

**Exclude from lab**: Prevent the Metric from displaying in the lab console. This allows a Metric to show on a label or report for reference, but does not allow anything to be recorded against it

Users with a multi-winery license can specify which metrics are available at each winery. Refer to our [Configuration for Multi-Winery Support article](https://support.vintrace.com/hc/en-us/articles/32301304791316) for details.
