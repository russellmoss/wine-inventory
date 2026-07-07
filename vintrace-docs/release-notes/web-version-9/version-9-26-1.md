---
id: "32942589009172"
title: "Version 9.26.1"
url: "https://support.vintrace.com/hc/en-us/articles/32942589009172-Version-9-26-1"
category: "Release Notes"
section: "Web Version 9"
created_at: "2024-12-10T23:21:08Z"
updated_at: "2025-02-19T22:54:16Z"
labels: []
gist: "Ability to set fractional dip levels."
tags: ["release-notes", "exports", "reporting", "work-orders", "barrels", "cost"]
---

# Version 9.26.1

# Major New Features

- Ability to set fractional [dip levels](https://support.vintrace.com/hc/en-us/articles/32301385548308-Setting-Up-a-Tank-s-Dip-Chart)
- Ability to set the *last filled* date for barrels, and filter this on the vessels page and barrel search
- A new checkbox on the [Intake Details](https://support.vintrace.com/hc/en-us/articles/32303268370324-Managing-Fruit-Intakes-and-Fruit-Intake-Bookings) console for 'Last booking for the block'
- Additional column for volume on the [Bulk Cost Summary](https://support.vintrace.com/hc/en-us/articles/32301316497940-Bulk-Cost-Summary-Report) report
- Additional columns added to the [Grape Delivery Report](https://support.vintrace.com/hc/en-us/articles/32301311525524-Grape-Delivery-Report) csv for:
  - Marshalled
  - Sampled
  - Weighed In
  - Weighed Out
  - Last Booking for Block
- Ability to enter payment terms (days) on [price lists](https://support.vintrace.com/hc/en-us/articles/32303296160916-Configuring-Price-Lists) to more than 31 days
- The following features are now available for all users:
  - New fields for priority and expected completion on [work orders](https://support.vintrace.com/hc/en-us/articles/32303315610388-Creating-a-Work-Order-Manually)
  - A new export option on the Jobs page to print out a [Work Order Job Details report](https://support.vintrace.com/hc/en-us/articles/32301280001812-Exporting-Jobs-Details)
  - Show *submitted*dips in addition to completed dips on [printed work orders](https://support.vintrace.com/hc/en-us/articles/32303287505300-How-do-I-reprint-a-work-order)
  - Additional column on the [Fruit Placement report](https://support.vintrace.com/hc/en-us/articles/32301312850196-Fruit-Placement-Report) for Costs
  - The Crusher is now visible on the [Fruit Bookings Tank report](https://support.vintrace.com/hc/en-us/articles/32301353043348-Fruit-Bookings-Tank-Report)
  - A new [Bulk Wine Placement report](https://support.vintrace.com/hc/en-us/articles/32727375376788-Bulk-Wine-Placement-Report)
  - New[Wine Spirit Additions reports](https://support.vintrace.com/hc/en-us/articles/32301281739028-Wine-Spirit-Additions-Reports)
  - Additional columns on the Transaction Summary report for tax changes
  - Additional Cancelled Work Order reporting to track Date, Time, and User
  - Ability to [filter the Blocks page](https://support.vintrace.com/hc/en-us/articles/32301313813396-Customizing-the-Vineyards-Blocks-Page) by [Seasonal Details](https://support.vintrace.com/hc/en-us/articles/32303285602836-Recording-Seasonal-Block-and-Viticulture-Assessments)
  - A new [metric unit](https://support.vintrace.com/hc/en-us/articles/32301345260948-Setting-Up-a-Metric) for square metres / square feet
  - A filter for Micro AVA / Sub Region on the vessels page
  - A filter for Designated Micro AVA / Sub Region on the Bulk Stock report
  - Ability to use feet/inches in the dip calculator

# Additional Fixes and Improvements

- Added a new warning when allocating costs to a batch with no volume, or stock items that do not exist or have no quantity
- Fixed an issue showing incorrect costs on the Wine Production Loss report
- Fixed an issue where barrel count was missing on the Physical Vessel Inventory screen
- Fixed an issue causing Xero integration connection issues
- Fixed an issue where Grower Contract instalments are showing the incorrect year
- Fixed an issue affecting some rollbacks into closed off TTB periods
