---
id: "36365638161428"
title: "Version 9.33.1"
url: "https://support.vintrace.com/hc/en-us/articles/36365638161428-Version-9-33-1"
category: "Release Notes"
section: "Web Version 9"
created_at: "2025-04-07T05:59:18Z"
updated_at: "2025-04-07T05:59:30Z"
labels: []
gist: "Performance Improvements."
tags: ["release-notes", "transfers", "cost", "barrels", "reporting", "additives"]
---

# Version 9.33.1

# Additional Fixes and Improvements

- **Performance Improvements**

  - Improved the performance of the following transfer operations when a high number of additives are involved:
    - Multi topping
    - Multi transfer (many-to-one)
    - Multi transfer (one-to-many)
    - Bulk dispatch (inter-winery)
    - Transfer/Rack/Blend
    - Transfer to barrel group

  **Additional Improvements**

  - Fixed an issue with the Bulk Cost Movement by Posted Date report where some Cost Delta volumes showed as positive instead of negative
  - Fixed an issue where some Bulk Cost Summary report volume columns were incorrect for Change Batch operations
  - Fixed an issue where the bulk dip chart import wizard did not load multiple dip charts from a csv
