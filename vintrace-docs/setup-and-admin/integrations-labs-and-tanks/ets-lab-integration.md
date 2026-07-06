---
id: "32301324029076"
title: "ETS Lab Integration"
url: "https://support.vintrace.com/hc/en-us/articles/32301324029076-ETS-Lab-Integration"
category: "Setup and Admin"
section: "Integrations: Labs and Tanks"
created_at: "2024-11-20T14:47:58Z"
updated_at: "2025-09-09T03:25:19Z"
labels: ["integration", "estate", "lab", "wp-faq-10720", "ets"]
gist: "Vintrace has a direct link to ETS Labs that enables ETS lab customers to get their analysis data without having to download or upload files."
tags: ["integrations", "lab", "configuration", "permissions", "exports", "migration"]
---

# ETS Lab Integration

Vintrace has a direct link to ETS Labs that enables ETS lab customers to get their analysis data without having to download or upload files.

BEFORE YOU BEGIN: Your account holder will need to [contact ETS](mailto:setup@etslabs.com?subject=vintrace%20integration%20request) to [request authorization to link your vintrace and ETS accounts](http://help.etslabs.com/en/articles/75503-linking-accounts-to-view-ets-results-in-vintrace).

If you’re using ETS Labs, you’ll need to complete the following steps:

1. [Add ETS Labs to your address book.](#Address_Book)
2. [Set up your ETS Client ID and web service.](#Client_ID_Web_Service)
3. [Mapping ETS metric names to vintrace.](#Mapping_Metrics)

## Adding ETS Labs to Your Address Book

To add ETS Labs to your [Address Book](https://support.vintrace.com/hc/en-us/articles/32301367488788):

1. Click ![More_Options_20200323.png](https://support.vintrace.com/hc/article_attachments/32328591052308) More Options in the sidebar.
2. From the Address Book tile, click Open Address Book.
3. From the Add menu in the lower left, select Organization.

![Address_Book_-_Add_Menu_-_Organization_20200805.png](https://support.vintrace.com/hc/article_attachments/32328606118292)

4. Specify the details for the lab. Be sure to select the Laboratory role.

![Update_Basic_Organization_Widget_-_ETS_Labs_-_Laboratory_Role_20201125.png](https://support.vintrace.com/hc/article_attachments/32328606003988)

5. Click Save.

## Setting Up Your ETS Client ID and Web Service

To set up your ETS client ID and web service:

1. View ETS Labs in the vintrace address book.
2. Click Edit beside the Laboratory role.

![Update_Basic_Organization_Widget_-_ETS_Labs_-_Laboratory_Edit_Button_20201125.png](https://support.vintrace.com/hc/article_attachments/32328590980500)

3. Click Configure Client IDs.

![Configure_Laboratory_Settings_-_Configure_Client_IDs_-_ETS_20201125.png](https://support.vintrace.com/hc/article_attachments/32328614212116)

4. Enter your ETS client ID in the Client ID column.

![Configure_Client_IDs_for_Lab_-_ETS_20201125.png](https://support.vintrace.com/hc/article_attachments/32328614225940)

5. Click OK.
6. Click Configure 3rd Party Lab Interface.

![Configure_Laboratory_Settings_-_Configure_3rd_Party_Lab_-_ETS_20201125.png](https://support.vintrace.com/hc/article_attachments/32328622124180)

7. In the Web Service Connection Parameters window, specify the following:

- Web Service Type — Select *ETS Laboratories*.
- Web Service URL — The URL will be automatically entered when you select the service type.
- Web Service Username — Enter the login credentials provided by ETS.
- Web Service Password — Enter the login credentials provided by ETS.

![Web_Service_Connection_Parameters_-_ETS_20201125.png](https://support.vintrace.com/hc/article_attachments/32328614284692)

8. Click OK.
9. Click OK to close the Configure Laboratory Settings window.
10. Click Save.

## Mapping ETS Metric Names to vintrace

If you plan to import results from ETS Labs to vintrace, you'll need to [map the ETS metric names to the metric names used by vintrace](https://support.vintrace.com/hc/en-us/articles/32301340432788). For a list of the ETS metric names, refer to our [ETS Lab Metrics article](https://support.vintrace.com/hc/en-us/articles/32303318582932) or [this ETS metrics list](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2013/04/ets_metrics.txt).
