---
id: "34500970476052"
title: "Version 9.29.1"
url: "https://support.vintrace.com/hc/en-us/articles/34500970476052-Version-9-29-1"
category: "Release Notes"
section: "Web Version 9"
created_at: "2025-02-03T21:34:24Z"
updated_at: "2025-02-23T22:53:08Z"
labels: []
gist: "Ability to prevent overfilling vessels."
tags: ["release-notes", "harvest", "reporting", "lab", "vineyard", "api"]
---

# Version 9.29.1

# Major New Features

- Ability to [prevent overfilling vessels](https://support.vintrace.com/hc/en-us/articles/34479319567636-Prevent-Overfilling-Vessels)
- Updates to the[v6 Harvest API](https://api-docs.vintrace.com/docs/vintrace-server/branches/v6/a88f57b33ff33-fruit-intake-operation-search) for grower and intake details
  - New search parameters for Winery and Grower type
  - Additional fields in the search API for grower autocode, grower type, booking number, fruit price and metric, net weight, area, and winery

- The following features are now available for all users:
  - The ability to [reconstitute concentrate](https://support.vintrace.com/hc/en-us/articles/32301281778708-Evaporating-Juice-into-Concentrate-and-Reconstituting-Concentrate)
  - The ability to [record the 'Diseased status](https://support.vintrace.com/hc/en-us/articles/32301311622676-Recording-a-Block-s-Disease-Status)' of a block and prevent fruit bookings from diseased blocks
  - The ability to define target metrics for blocks
  - The ability to track extraction yield
  - A new [Ferment tab](https://support.vintrace.com/hc/en-us/articles/32303278530708-Managing-Ferments) on the wine batch overview page
  - For the original Grower Contracts module:
    - The ability to set instalment and payment defaults for grower contracts
    - The ability to add adjustments to grower contracts
    - Additional 'As of' and 'This Payment' dates on the [Grower Contract Remittance report](https://support.vintrace.com/hc/en-us/articles/32301315918868-Grower-Contract-Remittance-Report)
    - The ability to preview instalment costs
    - Levy details can be viewed on the instalment details report
    - The ability to intake fruit on a cost/area contract
    - [Highlight out of range metrics on the Grape Delivery report](https://support.vintrace.com/hc/en-us/articles/32301280581012-Out-of-Range-Metrics-in-the-Grape-Delivery-Report)

# Additional Fixes and Improvements

- Fixed an issue causing incorrect batches when viewing a completed operation with vessel forecasting selected
- Fixed an issue with incorrect values on the TTB report for wine that had been tiraged and packed
- Fixed an issue with the Sales Shipping report not showing all shipping data for some customers
