---
id: "32301350367636"
title: "vintrace Defaults"
url: "https://support.vintrace.com/hc/en-us/articles/32301350367636-vintrace-Defaults"
category: "Setup and Admin"
section: "Configuration"
created_at: "2024-11-20T14:46:48Z"
updated_at: "2025-12-18T00:28:28Z"
labels: ["user default", "system default", "winery default", "barrel location", "heart", "favourite", "default", "defaults", "area"]
gist: "Defaults can save you time by pre-filling fields with commonly used options."
tags: ["configuration", "harvest"]
---

# vintrace Defaults

Defaults can save you time by pre-filling fields with commonly used options. For example, if all your fruit is estate grown, you may default the 'grower' field to reflect this to save having to specify it every time you record actions involving growers.

Defaults only **pre-fill** the relevant field. They don't lock it/prevent changes. To edit a pre-filled field in an operation, simply look for the drop down arrow or cross symbol next to the field you wish to update. Note that this won't update the default for next time - it only alters the operation you are currently recording.

![update defaults.png](https://support.vintrace.com/hc/article_attachments/44454233800212)

## Setting up Defaults

To set up defaults for vintrace head to Set up > General > Defaults:

1. Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32329212099476) Set Up in the sidebar.
2. Click General.
3. From the Defaults tile, click Configure.
4. Specify the settings you wish to default in the [appropriate tab](#h_01K5ASNZ9C4EAQGTEPEVWPEV4F).
5. Click Apply

To reset a default, change it to 'Reset...' and the field will become blank.

## Hierarchy of Defaults

![Defaults.png](https://support.vintrace.com/hc/article_attachments/44454219006100)

IMPORTANT: In order of Priority, User defaults override Winery defaults, which in turn override System defaults.

### System defaults

If you’re a [local vintrace administrator](https://support.vintrace.com/hc/en-us/search/click?data=BAh7DjoHaWRsKwgU1qo1YR06D2FjY291bnRfaWRpAyVM%2BzoJdHlwZUkiDGFydGljbGUGOgZFVDoIdXJsSSJYaHR0cHM6Ly9zdXBwb3J0LnZpbnRyYWNlLmNvbS9oYy9lbi11cy9hcnRpY2xlcy8zMjMwMzM0OTQyMTU4OC1Sb2xlcy1hbmQtUGVybWlzc2lvbnMGOwhUOg5zZWFyY2hfaWRJIik4NTE3NDNjZi1iYjYxLTRmZjEtYjY3OC1mYzgxZDM3NmUxOTcGOwhGOglyYW5raQY6C2xvY2FsZUkiCmVuLXVzBjsIVDoKcXVlcnlJIhpyb2xlcyBhbmQgcGVybWlzc2lvbnMGOwhUOhJyZXN1bHRzX2NvdW50aRY%3D--b011d85a65a9e82264b34517612fa483bda8edbb), you can specify system-wide defaults in the **System** tab. System defaults are global and will apply everywhere in the absence of other defaults. These defaults are *lowest priority* but the widest reaching.

### Winery defaults

A [local vintrace administrator](https://support.vintrace.com/hc/en-us/search/click?data=BAh7DjoHaWRsKwgU1qo1YR06D2FjY291bnRfaWRpAyVM%2BzoJdHlwZUkiDGFydGljbGUGOgZFVDoIdXJsSSJYaHR0cHM6Ly9zdXBwb3J0LnZpbnRyYWNlLmNvbS9oYy9lbi11cy9hcnRpY2xlcy8zMjMwMzM0OTQyMTU4OC1Sb2xlcy1hbmQtUGVybWlzc2lvbnMGOwhUOg5zZWFyY2hfaWRJIik4NTE3NDNjZi1iYjYxLTRmZjEtYjY3OC1mYzgxZDM3NmUxOTcGOwhGOglyYW5raQY6C2xvY2FsZUkiCmVuLXVzBjsIVDoKcXVlcnlJIhpyb2xlcyBhbmQgcGVybWlzc2lvbnMGOwhUOhJyZXN1bHRzX2NvdW50aRY%3D--b011d85a65a9e82264b34517612fa483bda8edbb) can specify defaults for specific wineries within your vintrace database using the **Winery** tab. Anything set here overrides System defaults, allowing you to customise where needed. If nothing is set here, vintrace will revert to System defaults if present. These defaults take *middle priority.*

NOTE: There is a [permission](https://support.vintrace.com/hc/en-us/search/click?data=BAh7DjoHaWRsKwgU1qo1YR06D2FjY291bnRfaWRpAyVM%2BzoJdHlwZUkiDGFydGljbGUGOgZFVDoIdXJsSSJYaHR0cHM6Ly9zdXBwb3J0LnZpbnRyYWNlLmNvbS9oYy9lbi11cy9hcnRpY2xlcy8zMjMwMzM0OTQyMTU4OC1Sb2xlcy1hbmQtUGVybWlzc2lvbnMGOwhUOg5zZWFyY2hfaWRJIik4NTE3NDNjZi1iYjYxLTRmZjEtYjY3OC1mYzgxZDM3NmUxOTcGOwhGOglyYW5raQY6C2xvY2FsZUkiCmVuLXVzBjsIVDoKcXVlcnlJIhpyb2xlcyBhbmQgcGVybWlzc2lvbnMGOwhUOhJyZXN1bHRzX2NvdW50aRY%3D--b011d85a65a9e82264b34517612fa483bda8edbb) 'can change winery defaults' which can be assigned to system users *without* local administrator rights to allow them to manage Winery defaults for a particular site while limiting access to the wider system.

### User defaults

All [System Users](https://support.vintrace.com/hc/en-us/articles/32303348674196-Managing-System-Users) can set their own personal defaults in the **User** tab. These defaults apply only to that User's login but are the *top priority* default and will override both winery and system settings if in place. If nothing is set here, vintrace will revert to winery defaults and then system defaults in that order.

Further, a local vintrace administrator can change User level defaults for all individual system users - just select their name form the drop down menu on the User tab.

### My Default Settings

**My Default Settings** provides a summary of your defaulted settings for review.

## Updating User defaults within operations

In some instances, you can record or update a default for your individual login (User default) during the course of an operation. Look for a heart icon next to appropriate fields, and click the icon to toggle between defaulted/not defaulted. Setting a default operator is a common example and a great time saver for smaller wineries where staff are writing and completing their own Work Orders.

![operation_default2.png](https://support.vintrace.com/hc/article_attachments/44454219009940)

## Common default examples

The defaults you and your team set is up to you, but some common settings may include:

- Language - sets system-wide language of the vintrace software
- Vintage - pre-fills the vintage field on new intakes/batches
- Storage Area - defaults new barrel group location
- Printed Work Order format - Word (allows edits) or PDF (no edits)
- Crush Fruit In - determines the unit of measurement used at intake
- Roles > Laboratory - if a winery has a single onsite laboratory and rarely uses external labs
