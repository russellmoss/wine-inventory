---
id: "32301356827540"
title: "Requesting Lab Analysis and Viewing Results"
url: "https://support.vintrace.com/hc/en-us/articles/32301356827540-Requesting-Lab-Analysis-and-Viewing-Results"
category: "vintrace Web"
section: "Lab work"
created_at: "2024-11-20T14:48:21Z"
updated_at: "2026-03-03T21:38:49Z"
labels: ["OenoFoss", "Baker", "Winescan", "Chemwell", "ets"]
gist: "For details on integrating vintrace with WineScan, Priority ERP, Konelab, OenoFoss, ETS, Baker Labs, Thermo Scientific Gallery, ChemWell, Admeo/BioSystems Y15, and Anton Paar DMA 35, refer to our Configuring Lab Integration article."
tags: ["lab", "barrels", "configuration", "exports", "integrations", "corrections"]
---

# Requesting Lab Analysis and Viewing Results

For details on integrating vintrace with WineScan, Priority ERP, Konelab, OenoFoss, ETS, Baker Labs, Thermo Scientific Gallery, ChemWell, Admeo/BioSystems Y15, and Anton Paar DMA 35, refer to our [Configuring Lab Integration article](https://support.vintrace.com/hc/en-us/articles/32301339187604).

## Requesting Lab Analysis

The steps for requesting lab analysis apply to Baker, ChemWell, ETS, OenoFoss, and Winescan.

If you tend to request the same analysis from a lab, you may want to consider [setting up an analysis template](https://support.vintrace.com/hc/en-us/articles/32301372281748) for the lab so that the panels that you’ll be requesting are pre-selected when you use the analysis template.

To request lab work:

1. Click ![Vessels_Menu_Option_20200402.png](https://support.vintrace.com/hc/article_attachments/32329128722708) Vessels in the sidebar.
2. Search for the vessel(s) for which you want to request lab work.
3. Select the checkbox beside the vessel(s). To select all vessels listed, select the checkbox beside the left-most column heading.
4. From the Actions menu in the lower left, select Lab Work.

![Actions_-_Lab_Work_20200720.png](https://support.vintrace.com/hc/article_attachments/32329128735892)

The Request a Lab Sample/Analysis window displays.

5. Specify the details for the lab request.

- Laboratory — Select the correct lab from the Laboratory list.
- Analysis Template — If you've created an analysis template, select it from the list. The metrics specified in the analysis template will be automatically selected.
- Metrics — If you didn't select an analysis template, select the metrics that you want tested.
- Print Labels — Select the Print Labels checkbox.

![Request_Lab_Sample_Analysis_20200805.png](https://support.vintrace.com/hc/article_attachments/32329128767892)

6. Click OK.

The label for the lab request displays.

![Lab_Request_Label_-_Lab_ID_20200727.png](https://support.vintrace.com/hc/article_attachments/32329152213652)

To re-print a label for a specific batch, expand the View menu beside the batch, then select Print Labels.
![Batch_-_Print_Labels_20210830.png](https://support.vintrace.com/hc/article_attachments/32329115637012)
To re-print labels for all batches on the page, select the Lab Labels menu from the bottom of the window and select the desired option. ![Lab_Console_-_Print_Label_Options_20210829.png](https://support.vintrace.com/hc/article_attachments/32329152282004)

## Viewing Lab Results

If you've integrated with Baker Lab or ETS, you can also view your lab results from vintrace.

To check the results of a lab request:

1. Click ![Lab_Menu_Option_20200403.png](https://support.vintrace.com/hc/article_attachments/32329152231060) Lab in the sidebar.
2. From the Lab list, select the name of the laboratory.
3. Click Check Results.

![Lab_Console_-_Check_Results_20200805.png](https://support.vintrace.com/hc/article_attachments/32329115630100)

The analysis metrics data displays. You can [export the lab results](https://support.vintrace.com/hc/en-us/articles/32301343026964) to a CSV file if needed.

If there aren’t any records to process, the following error displays: The data returned from [lab name] did not match any ids of current outstanding lab requests generated in vintrace.
