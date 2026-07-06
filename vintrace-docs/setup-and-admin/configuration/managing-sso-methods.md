---
id: "32303266949396"
title: "Managing SSO Methods"
url: "https://support.vintrace.com/hc/en-us/articles/32303266949396-Managing-SSO-Methods"
category: "Setup and Admin"
section: "Configuration"
created_at: "2024-11-20T15:50:48Z"
updated_at: "2024-11-21T10:28:09Z"
labels: []
gist: "You can configure vintrace to enable the following sign-on methods:."
tags: ["configuration", "permissions"]
---

# Managing SSO Methods

You can configure vintrace to enable the following sign-on methods:

- vintrace
- Apple
- Google
- Microsoft
- Okta

You'll need the [Local vintrace Administrator permission](https://support.vintrace.com/hc/en-us/articles/360000813755-Roles-and-Permissions#LocalvintraceAdministrators) to enable and disable different sign-on methods.

To manage your SSO methods:

1. Click ![More_Options_20200323.png](https://support.vintrace.com/hc/article_attachments/32329243583636) More Options in the sidebar.
2. From the Address Book tile, click Manage User Accounts.
3. Select the Settings tab.
4. Click on the toggle button on the authentication method you wish to enable. Vintrace, Apple, Google, and Microsoft are enabled by default.

![Enabling vintrace Sign On 20240702.png](https://support.vintrace.com/hc/article_attachments/32329243619220)

Refer to [Enabling Okta](#enabling_okta) for details on enabling Okta.

After you enable an authentication method, it should appear in the vintrace login screen.
![Enable_5.jpg](https://support.vintrace.com/hc/article_attachments/32329276838548)

## Enabling Okta

Be sure to [complete the Okta setup](https://support.vintrace.com/hc/en-us/articles/32303289782676) before you enable Okta.

To enable Okta:

1. From the Authentication page, click the arrow beside Okta.
2. Enter the following information:

|  |  |
| --- | --- |
| Issuer | https://{yourOktaOrg}/oauth2/default |
| Client ID | The vintrace Client ID from your Okta organisation |

![vintrace Authentication Settings - Okta Enabled 20240620B.png](https://support.vintrace.com/hc/article_attachments/32329231075092)

3. Click Enable.
