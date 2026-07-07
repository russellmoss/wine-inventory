---
id: "32301340432788"
title: "Mapping a Lab's Metric Names"
url: "https://support.vintrace.com/hc/en-us/articles/32301340432788-Mapping-a-Lab-s-Metric-Names"
category: "vintrace Web"
section: "Lab work"
created_at: "2024-11-20T14:48:09Z"
updated_at: "2026-03-03T20:50:33Z"
labels: []
gist: "The steps detailed below apply to WineScan, Priority ERP, Konelab, OenoFoss, ETS, Baker Labs, Thermo Scientific Gallery, ChemWell, Admeo/BioSystems Y15 and SPICA, and Anton Paar DMA 35."
tags: ["lab", "configuration", "migration", "integrations", "permissions"]
---

# Mapping a Lab's Metric Names

The steps detailed below apply to WineScan, Priority ERP, Konelab, OenoFoss, ETS, Baker Labs, Thermo Scientific Gallery, ChemWell, Admeo/BioSystems Y15 and SPICA, and Anton Paar DMA 35.

If you plan to [import results from the lab to vintrace](https://support.vintrace.com/hc/en-us/articles/32301343026964), you'll need to determine if the metric names used by the lab are different from the metric names used in vintrace. You can do this by looking at the column headers in the lab's output.

If the metric names are different, you’ll need to map the names between the systems. In order to do this, be sure that you've [added the lab to the vintrace address book](https://support.vintrace.com/hc/en-us/articles/32301339187604#AddingtheLabtotheAddressBook).

To map a lab's metric names:

1. Click ![More_Options_20200323.png](https://support.vintrace.com/hc/article_attachments/32328616662548) More Options in the sidebar.
2. From the Address Book tile, click Open Address Book.
3. Select the lab.
4. From the Basic Organization Widget window, click Edit beside the Laboratory role.

![Update_Basic_Organization_Widget_-_OenoFoss_-_Lab_Role_Edit_20200727.png](https://support.vintrace.com/hc/article_attachments/32328593257236)

4. From the Configure Laboratory Settings window, click Configure metric names.

![Configure_Laboratory_Settings_-_Configure_Metric_Names_20200727.png](https://support.vintrace.com/hc/article_attachments/32328593333268)

5. From the Configure metric names window, click Add line. The name in the Metric column is the metric’s name in vintrace; the name in the Import name column is the name the lab uses for the metric.
6. Click the ![Magnifying_Glass_20200320.png](https://support.vintrace.com/hc/article_attachments/32328599444116) beside the Metric field to select the vintrace metric name that you’d like to map.
7. In the field that’s in the Import name column, enter the name that the lab uses for the metric.

![Configure_Metric_Names_-_Mapping_20200727.png](https://support.vintrace.com/hc/article_attachments/32328608773140)

For example, below are metric names used in vintrace and their corresponding name in OenoFoss.

|  |  |
| --- | --- |
| **vintrace Metric Name** | **OenoFoss Metric Name** |
| Alcohol | Ethanol |
| Brix | TSS |
| Glucose/Fructose | Gluc/Fruc |
| Malic | Malic Acid |
| Volatile Acidity | VA |

If you’d like to keep your lab's results separate from other analysis results, you can [create a new metric](https://support.vintrace.com/hc/en-us/articles/32301345260948) in vintrace (e.g., Alcohol % (OenoFoss)), then select that metric when you map the metrics.

8. Repeat steps 5-7 for each metric that you want to map.
9. Click OK.
10. From the Configure Laboratory Settings window, click OK.
11. From the Basic Organization Widget window, click Save.
