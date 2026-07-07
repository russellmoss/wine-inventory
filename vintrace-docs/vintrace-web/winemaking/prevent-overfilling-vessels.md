---
id: "34479319567636"
title: "Prevent Overfilling Vessels"
url: "https://support.vintrace.com/hc/en-us/articles/34479319567636-Prevent-Overfilling-Vessels"
category: "vintrace Web"
section: "Winemaking"
created_at: "2025-02-03T07:18:21Z"
updated_at: "2026-04-29T14:50:51Z"
labels: []
gist: "This setting is disabled by default."
tags: ["barrels", "configuration", "ux-friction", "inventory", "permissions"]
---

# Prevent Overfilling Vessels

This setting is disabled by default. You will need to have the [Local vintrace Administrator](https://support.vintrace.com/hc/en-us/articles/32303349421588) permission to enable this setting.

vintrace allows users to overfill vessels, enabling work to continue even if vessel capacities may not be precise or known, e.g. due to dip configurations. This flexibility ensures that winemaking processes aren't delayed by vessel capacity updates.

However, there is a system policy available that allows wineries to disable the ability to overfill vessels. When this policy is enabled, users will no longer be able to perform activities in vintrace that would result in overfilled vessels. This ensures stricter control over wine inventory and keeping accurate records.

This setting is managed in Set up > General > System Policy

To enable/disable Prevent Overfilling Vessels:

1. Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/34479319565588) Set Up in the sidebar.
2. Go to General > System Policy.
3. Click Configure.

![System Policy 2025-02-03.jpg](https://support.vintrace.com/hc/article_attachments/34479319566356)

4. Select 'Prevent overfilling vessels'.

![Prevent Overfilling Vessels 2025-02-03.jpg](https://support.vintrace.com/hc/article_attachments/34479343514516)

5. Click Apply.

Previously, there were warnings on some operations if you attempted to overfill a vessel, but you could still proceed with saving an operation.

Now, when the 'Prevent overfilling vessels' setting is ticked, you will see this new error and will not be able to save the operation.

![Error when trying to overfill vessels](https://support.vintrace.com/hc/article_attachments/34739613983892)
