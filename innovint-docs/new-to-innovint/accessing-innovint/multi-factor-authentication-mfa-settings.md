---
title: "Multi-factor Authentication (MFA) Settings"
url: "https://support.innovint.us/hc/en-us/multi-factor-authentication-settings"
category: "New to InnoVint"
section: "Accessing InnoVint"
page_type: "page"
lastmod: "2025-11-20"
gist: "Multi-Factor Authentication (MFA) is now an account security option that you opt into at the \"user\" level."
tags: ["configuration", "getting-started", "mobile", "ux-friction"]
---

# Multi-factor Authentication (MFA) Settings

This article covers:

- [What is Multi-Factor Authentication?](#purpose)
  - [What is an authenticator app?](#authenticator)
- [Security and privacy considerations](#security)
- [Step-by-step instructions](#instructions)
- [FAQ](#faqs)

### What is Multi-Factor Authentication?

Multi-Factor Authentication (MFA) is now an account security option that you **opt into** at the "user" level.

The purpose of Multi-Factor Authentication (MFA) is to add an extra layer of security to your account by requiring another form of user verification (alongside your password) during the login process.

**If you enable MFA, we will activate a requirement to utilize an *authenticator app* at login.**

You must scan the initial QR setup code *with your chosen authenticator app* - the authenticator setup will not work if you scan the QR code with your camera.

***What is an authenticator app?***

An authenticator app is a mobile app ***![Multi-factor Authentication Settings_What is an authenticator app](https://support.innovint.us/hs-fs/hubfs/Knowledge%20Base%20Import/Multi-factor%20Authentication%20Settings_What%20is%20an%20authenticator%20app.webp?width=300&height=509&name=Multi-factor%20Authentication%20Settings_What%20is%20an%20authenticator%20app.webp)***that generates a time-based single use password to allow access to an account. It will generate a one time, time limited password. These passwords are used to protect accounts from unauthorized access. Any authenticator app should work, but some suggestions are below:

- For organizations that use G-Suite, we suggest using the Google Authenticator app, as you are able to link the data to your work Google Account. The app works on all Android and iOS devices.
- For organizations that use Microsoft, then you might prefer the Microsoft Authenticator app. This should allow you to more easily link the data to your Microsoft work account.
- For larger organizations, you may want to check in with your IT team on how to set one up.

When activated, MFA applies to InnoApp as well as the desktop app and SUPPLY.

### Security and privacy considerations

Online security is a big deal these days.  InnoVint is working hard to ensure this security for our users and our platform. Here are some things to keep in mind after you turn on Multi-Factor Authentication for your accounts:

- **Keep your MFA devices secure**. Treat your MFA-enabled device(s) as you would treat your password and keep them in a safe and secure place.
- **Be cautious of phishing attempts**. Avoid clicking on suspicious links or providing your MFA verification codes to untrusted sources.

Thank you for taking the steps to enhance your account security through Multi-Factor Authentication! Your commitment to protecting your account is greatly appreciated.

### Step-by-step instructions

To opt in, set up and use Multi-Factor Authentication, please follow these steps:

1. Log in to your account using your username and password.
2. Go to your user Account Settings page at the top righthand corner of the screen (via the person icon).
3. In the Privacy & Security tab, click on the Set up button in Add Authenticator App.
   ![Multi-factor Authentication Settings_Step-by-Step Instructions_Step 3](https://support.innovint.us/hs-fs/hubfs/Knowledge%20Base%20Import/Multi-factor%20Authentication%20Settings_Step-by-Step%20Instructions_Step%203.webp?width=655&height=307&name=Multi-factor%20Authentication%20Settings_Step-by-Step%20Instructions_Step%203.webp)
4. You'll need to scan the on-screen QR code *with an Authenticator app* on your phone. You may need to add a new account to your Authenticator app. Follow the steps on your app.
   ![Multi-factor Authentication Settings_Step by Step Instructions_Step 4](https://support.innovint.us/hs-fs/hubfs/Knowledge%20Base%20Import/Multi-factor%20Authentication%20Settings_Step%20by%20Step%20Instructions_Step%204.webp?width=655&height=300&name=Multi-factor%20Authentication%20Settings_Step%20by%20Step%20Instructions_Step%204.webp)
5. The Authenticator app will then provide a six digit code for you to enter on screen.
6. At this point, Multi-Factor Authentication will also provide you with an eight digit recovery code, i.e. 42941651. **Store this code someplace safe; you will need it in case you lose your Authenticator device (i.e. replace your phone) in order to bypass MFA!!**
   ![Multi-factor Authentication Settings_Recovery code](https://support.innovint.us/hs-fs/hubfs/Knowledge%20Base%20Import/Multi-factor%20Authentication%20Settings_Recovery%20code.webp?width=272&height=196&name=Multi-factor%20Authentication%20Settings_Recovery%20code.webp)
7. Your MFA is now enabled!
   ![Multi-factor Authentication Settings_Step by Step Instructions_Step 7](https://support.innovint.us/hs-fs/hubfs/Knowledge%20Base%20Import/Multi-factor%20Authentication%20Settings_Step%20by%20Step%20Instructions_Step%207.webp?width=655&height=301&name=Multi-factor%20Authentication%20Settings_Step%20by%20Step%20Instructions_Step%207.webp)
8. The next time you login (find out about our 30 day session time-out limit [here](https://support.innovint.us/hc/en-us/session-timeouts?hsLang=en)), you will again be prompted to enter a **time limited** 6-digit number after your password.  Just access your Authenticator app and enter the code provided (**no QR code scanning is required!**)
   ![Multi-factor Authentication Settings_Step by Step Instructions_Step 8](https://support.innovint.us/hs-fs/hubfs/Knowledge%20Base%20Import/Multi-factor%20Authentication%20Settings_Step%20by%20Step%20Instructions_Step%208.webp?width=265&height=326&name=Multi-factor%20Authentication%20Settings_Step%20by%20Step%20Instructions_Step%208.webp)

You six digit code will refresh every 30 seconds.  If the code changes on your authenticator app prior to hitting "Verify", then your authentication will fail.

### FAQ

**Q: Can I disable MFA after enabling it?**
*A: You may want to discuss with your account admin in case this is a company policy. After confirming, then yes, you can control your own MFA setting and Authenticator app via your user profile page.  Delete a previously setup app by using the three dot menu at the top right of the Authenticator app tile.*

![Multi-factor Authentication Settings_Can I disable my MFA](https://support.innovint.us/hs-fs/hubfs/Knowledge%20Base%20Import/Multi-factor%20Authentication%20Settings_Can%20I%20disable%20my%20MFA.webp?width=688&height=324&name=Multi-factor%20Authentication%20Settings_Can%20I%20disable%20my%20MFA.webp)

**Q: I disabled MFA in my user account, but InnoVint is still asking me for MFA authentication!**
*A: Some accounts have an advanced security setting that can enforce your use of multi-factor authentication.  If your organization **domain** (i.e. innovint.us) requires MFA, then even if you disable MFA in your own user settings, you will need to re-enable and setup an authenticator app in order to login to InnoVint. Please check with an administrator on your account if you have any questions.*

**Q: Do I have to use MFA on all my devices and platforms?**
*A: If you have MFA activated, you will be required to enter a verification code each time you sign in to the web app, InnoApp or SUPPLY on an individual device (i.e. on your computer and on your phone).*

**Q: Help! I ran over my phone with the forklift and lost access to my Authenticator app!**

*A: If you lose access to your authenticator, you **should** have access to the recovery code, which was provided (only once!) when you first set up the authenticator. If you have this code,  then when you login, choose “Use backup code." Once the recovery code is input on the next screen, it will allow you to “Disable MFA”.*

*![Multi-factor Authentication Settings_Help I ran over my phone](https://support.innovint.us/hs-fs/hubfs/Knowledge%20Base%20Import/Multi-factor%20Authentication%20Settings_Help%20I%20ran%20over%20my%20phone.webp?width=688&height=303&name=Multi-factor%20Authentication%20Settings_Help%20I%20ran%20over%20my%20phone.webp)*

*If you do not have your authenticator app OR the recovery code, then our support team is capable of unenrolling a user from MFA directly. Contact us at [support@innovint.us](mailto:support@innovint.us) and we will explain next steps.*
