---
id: "32301321572116"
title: "About Work Order Print Templates"
url: "https://support.vintrace.com/hc/en-us/articles/32301321572116-About-Work-Order-Print-Templates"
category: "Setup and Admin"
section: "Custom Print Templates"
created_at: "2024-11-20T14:47:23Z"
updated_at: "2025-09-08T07:12:42Z"
labels: []
gist: "Work order print templates tell vintrace how you want the printed work order to look and what data you want it to contain. vintrace creates a printed work order by putting the templates for the various job types together."
tags: ["exports", "work-orders", "configuration", "additives", "lab"]
---

# About Work Order Print Templates

Work order print templates tell vintrace how you want the printed work order to look and what data you want it to contain. vintrace creates a printed work order by putting the templates for the various job types together.

For example, if a work order includes an additive and an analysis job, the printed work order will use the additive template and the analysis template. In addition to the templates for each job type, each printed work order includes a header template and footer template.

![Printed_Work_Order_and_Templates_20201117.png](https://support.vintrace.com/hc/article_attachments/32328571894164)

vintrace combines the templates to create a work order printout that includes the details specified for each job.

![Printed_Work_Order_Components_20201113.png](https://support.vintrace.com/hc/article_attachments/32328566251412)

Each work order print template is a Microsoft Word (DOCX) file that contains the text and layout that’s used for the printed work order. The templates also contain [coded tags](https://support.vintrace.com/hc/en-us/articles/32303349626004) that tell vintrace what data you want to include in the printed work order. Below is the [header template](https://support.vintrace.com/hc/en-us/articles/32303349626004-Print-Template-Tags#h_01EQGMM3K053SKN2MM980ABBAF) that’s included at the top of each work order.

![Header_Template_-_MS_Word_20201113.png](https://support.vintrace.com/hc/article_attachments/32328571931412)

In this example, the tag {{assignedToName}} tells vintrace that you want to include the name of the person the work order is assigned to in the printed work order.

![Header_Template_and_Example_20201112.png](https://support.vintrace.com/hc/article_attachments/32328582533908)

You can [customize each job-specific template](https://support.vintrace.com/hc/en-us/articles/32303295878932) to include the details that you need using the [template’s available tags](https://support.vintrace.com/hc/en-us/articles/32303349626004). After you’ve customized the job-specific templates, you can [set up a custom work order print template](https://support.vintrace.com/hc/en-us/articles/32303308638740).
