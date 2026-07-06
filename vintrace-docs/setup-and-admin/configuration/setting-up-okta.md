---
id: "32303289782676"
title: "Setting up Okta"
url: "https://support.vintrace.com/hc/en-us/articles/32303289782676-Setting-up-Okta"
category: "Setup and Admin"
section: "Configuration"
created_at: "2024-11-20T15:50:48Z"
updated_at: "2024-11-21T10:28:08Z"
labels: []
gist: "Okta is an application that provides a single sign-on service to users."
tags: ["configuration", "integrations"]
---

# Setting up Okta

Okta is an application that provides a single sign-on service to users. Users are given access to an Okta account, and that account is then granted privileges to applications.

If your organization has provided your users an Okta account, you can now add vintrace as an application.

To enable Okta sign-on in vintrace, you'll need to complete the following:

1. [Add vintrace as an application in Okta](#h_01G7R6SRADP50XRT51H3SQAJ1G).
2. [Enable Okta in vintrace settings.](https://support.vintrace.com/hc/en-us/articles/32303266949396)

# Adding vintrace as an Application in Okta

You'll need to have admin access in Okta to complete the following steps.

To add vintrace as an application in Okta:

1. Login to Okta admin.
2. Click Applications.

![Okta_setup_1.jpg](https://support.vintrace.com/hc/article_attachments/32328866935188)

3. Click Create App Integration.
   ![Okta_setup_2.jpg](https://support.vintrace.com/hc/article_attachments/32328854823572)
4. From the Sign-in Method section, select the OIDC - OpenID Connect option. From the Application Type section, select the Single-Page Application option.

![Okta_setup_3.jpg](https://support.vintrace.com/hc/article_attachments/32328842116500)

5. Click Next.
6. Specify the following:

|  |  |
| --- | --- |
| App Integration Name | vintrace |
| Sign-In Redirect URIs | https://auth.vintrace.app/auth/okta |

![Okta_setup_4.jpg](https://support.vintrace.com/hc/article_attachments/32328882957844)

7. Click Save. On the Applications page, the vintrace application you created and a Client ID displays.
8. Note the Client ID as you'll need it to set up Okta in the vintrace application.

![Okta_setup_5.jpg](https://support.vintrace.com/hc/article_attachments/32328866878228)

9. Now that you've added vintrace to your Okta applications, you'll need to [enable Okta in vintrace](https://support.vintrace.com/hc/en-us/articles/32303266949396).
