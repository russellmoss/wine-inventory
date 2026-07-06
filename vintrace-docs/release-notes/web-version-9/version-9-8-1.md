---
id: "32303261039764"
title: "Version 9.8.1"
url: "https://support.vintrace.com/hc/en-us/articles/32303261039764-Version-9-8-1"
category: "Release Notes"
section: "Web Version 9"
created_at: "2024-11-20T15:50:38Z"
updated_at: "2024-12-10T23:38:49Z"
labels: ["release-9.8.1"]
gist: "We fixed an issue where moving a taxpaid wine into Part VI did not change the tax state to Bonded. This prevented taxpaid wines with a tax class in Part VI from being blended with a bonded wine in Part IV."
tags: ["release-notes", "tax-class", "blending", "bond"]
---

# Version 9.8.1

## Additional Fixes and Improvements

- We fixed an issue where moving a taxpaid wine into Part VI did not change the tax state to Bonded. This prevented taxpaid wines with a tax class in Part VI from being blended with a bonded wine in Part IV.
- When blending into a Sparkling tax class, we changed the available tax class change reasons to *Slurry Gain* and *Other (bulk)*.
- We fixed an issue where an entity would remain locked if the user's session, who was creating or updating it, timed out.
