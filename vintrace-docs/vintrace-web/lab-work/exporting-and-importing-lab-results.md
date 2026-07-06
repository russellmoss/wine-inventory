---
id: "32301343026964"
title: "Exporting and Importing Lab Results"
url: "https://support.vintrace.com/hc/en-us/articles/32301343026964-Exporting-and-Importing-Lab-Results"
category: "vintrace Web"
section: "Lab work"
created_at: "2024-11-20T14:47:59Z"
updated_at: "2026-06-17T02:27:01Z"
labels: ["estate", "professional", "OenoFoss", "lab jobs", "wp-faq-556", "request labs", "import lab jobs", "export lab jobs"]
gist: "The steps detailed below apply to WineScan, Priority ERP, Konelab, OenoFoss, ETS, Thermo Scientific Gallery, ChemWell, Admeo/BioSystems Y15 and SPICA, and Anton Paar DMA 35."
tags: ["lab", "exports", "migration", "integrations"]
---

# Exporting and Importing Lab Results

## Exporting Lab Work

The steps detailed below apply to WineScan, Priority ERP, Konelab, OenoFoss, ETS, Thermo Scientific Gallery, ChemWell, Admeo/BioSystems Y15 and SPICA, and Anton Paar DMA 35.

They also apply to a generic export/import workflow that can be used to import lab results in bulk.

To export lab work from vintrace:

1. Click ![Lab_Menu_Option_20200403.png](https://support.vintrace.com/hc/article_attachments/32328591591444) Lab in the sidebar.
2. Search for the lab results that you want to export.
3. From the Export menu, select the export option. The *This Page* options export the lab requests listed on the page. The *All Matching* options export all lab requests that meet the search criteria.

![Export_Options_20200403.png](https://support.vintrace.com/hc/article_attachments/32328622808212)

Results that are exported to a CSV file can be opened in Microsoft Excel. The lab results display *R* if the results are required, and *NR* if the results are not required.

If you need to enter the lab reference, you can enter it in the Lab Ref column; be sure to save your changes.

![Lab_Results_Export_CSV_-_Lab_Ref_20200727.png](https://support.vintrace.com/hc/article_attachments/32328606601876)

## Importing Lab Work

- Be sure that the file that you're importing is a CSV file.
- The ID column must contain the AT numbers.
- Before you can import lab results from an analyser/laboratory, be sure that you've [mapped the device's metric names](https://support.vintrace.com/hc/en-us/articles/32301340432788) if the names the device uses differ from vintrace's metric names.
- If you are using the standard vintrace data importer ('VINx2 Standard' format) for generic data input rather than the importer for a specific device, you can map convenient names to the ['Mapped Name' value of a Metric](https://support.vintrace.com/hc/en-us/articles/32301345260948). This is not required, and is provided as an optional convenience only.

To import lab results:

1. Click ![Lab_Menu_Option_20200403.png](https://support.vintrace.com/hc/article_attachments/32328591591444) Lab in the sidebar
2. From the Import Format list in the lower left, select the format for the analyser/lab (e.g., ChemWell, OenoFoss, etc...) or select VINx2 Standard for generic data import
3. Click ![Upload_20200727.png](https://support.vintrace.com/hc/article_attachments/32328614898708)

![Lab_Console_-_Importing_20200805.png](https://support.vintrace.com/hc/article_attachments/32328597856148)

The Upload window displays.

4. Click Choose File
5. Select the file to upload
6. Click Send
7. After the file is uploaded, be sure to check the values to ensure that they’re correct
8. To update or confirm the results for a single lab request, select Update or Confirm from the View menu beside the request:

- Update - Saves the results without confirming them
- Confirm - Permanently saves the results

To update or confirm the results for the entire page, select *Update This Page* or *Confirm This Page* from the Actions menu.

![Lab_Console_-_Update_or_Confirm_20200727.png](https://support.vintrace.com/hc/article_attachments/32328597841556)
