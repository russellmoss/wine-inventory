---
id: "32301322677780"
title: "Adjusting the Analysis Dates of Lab Requests"
url: "https://support.vintrace.com/hc/en-us/articles/32301322677780-Adjusting-the-Analysis-Dates-of-Lab-Requests"
category: "vintrace Web"
section: "Lab work"
created_at: "2024-11-20T14:47:39Z"
updated_at: "2024-11-21T10:28:14Z"
labels: ["estate", "wp-faq-676", "professional", "lab requests", "lab", "analysis date"]
gist: "To override the analysis date of lab requests:."
tags: ["lab", "exports", "migration"]
---

# Adjusting the Analysis Dates of Lab Requests

To override the analysis date of lab requests:

1. Export the lab requests that need to have their analysis dates adjusted to a CSV file. Refer to our [Requesting, Exporting, and Importing Lab Work article](https://support.vintrace.com/hc/en-us/articles/32301343026964#Exporting_Lab_Work) for details.
2. Use Microsoft Excel to open the CSV file.
3. Add a column to the CSV file called *OverrideDate*.
4. Select the new column and create a custom format that sets its format to *YYYY-MM-dd HH:mm:ss*.

![Excel_OverrideDate_Column_Format_20200730.png](https://support.vintrace.com/hc/article_attachments/32328776121876)

5. Enter a date in the OverrideDate column that’s in the format YYYY-MM-dd HH:mm:ss. Be sure that the dates you enter are in this format. It’s not important for the time that you enter for the HH:mm:ss to be accurate.
6. Save the file.
7. Import the CSV file into vintrace. Refer to our [Requesting, Exporting, and Importing Lab Work article](https://support.vintrace.com/hc/en-us/articles/32301343026964#Importing_Lab_Work) for details.
