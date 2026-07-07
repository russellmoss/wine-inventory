---
id: "32301323421844"
title: "Configuring Email"
url: "https://support.vintrace.com/hc/en-us/articles/32301323421844-Configuring-Email"
category: "Setup and Admin"
section: "Configuration"
created_at: "2024-11-20T14:47:50Z"
updated_at: "2024-11-21T10:18:43Z"
labels: ["estate", "Email config"]
gist: "You can specify the From email address used for vintrace’s outbound emails by entering the email address in the Winery Email field."
tags: ["configuration", "reporting", "harvest", "integrations"]
---

# Configuring Email

You can specify the From email address used for vintrace’s outbound emails by entering the email address in the Winery Email field.

![Winery_Update_-_Winery_Email_20221024.png](https://support.vintrace.com/hc/article_attachments/32328824730900)

This is useful so that harvest reports that you send to growers, and reports that you send to third-party customers that you’re making wine for look like they’re coming from your mail service.

We recommend sharing this article with your IT provider who handles your web domain name.

In order for emails to work correctly from vintrace, an SPF (Sender Protection Framework) record must be configured for your domain.

## Setting Up an SPF Record

The specific steps for setting up SPF records will depend on your domain provider. We recommend that you share this article with your IT provider.

If you don’t already have an existing SPF record, we recommend the following base SPF record:

```
v=spf1 include:mail.vinx2.net ~all
```

If an SPF record is already set up for your existing email provider, you can include our SPF record contained in mail.vinx2.net. Below are some examples.

|  |  |
| --- | --- |
| Gmail | v=spf1 mx include:\_spf.google.com include:mail.vinx2.net ~all |
| Outlook 365 | v=spf1 mx include:spf.protection.outlook.com include:mail.vinx2.net ~all |

## Upcoming Changes

In the future, vintrace will use your company name with one of our domains as the email domain. For example, Acme Wines <noreply@app.vintrace.com>.

When the recipient replies to an email, they’ll see the proper email address instead of our default. This reduces the number of emails from vintrace that are flagged as spam particularly for customers that haven’t correctly configured SPF, or who are using domains where SPF can’t be configured (e.g., gmail.com or outlook.com).
