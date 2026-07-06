---
title: "Lot Explorer"
url: "https://support.innovint.us/hc/en-us/lot-explorer"
category: "MAKE"
section: "Lots"
page_type: "page"
lastmod: "2026-06-25"
gist: "The Lot Explorer is your window to your juice/wine lot (bulk wine) inventory, giving you control and flexibility when viewing and managing your lots."
tags: ["exports", "inventory", "vineyard", "barrels", "configuration", "harvest"]
---

# Lot Explorer

The Lot Explorer is your window to your juice/wine lot (bulk wine) inventory, giving you control and flexibility when viewing and managing your lots. You can customize columns, apply advanced filters, save layouts, and quickly return to your preferred views.

This article covers:

- [What’s in the Lot Explorer](#what)
- [Navigating the Lot Explorer](#navigating)
- [Managing Filters & Columns](#managing)
- [Saving and using layouts](#layouts)
- [Lot Explorer exports](#export)
- [Frequently asked questions](#faq)

### What’s in the Lot Explorer

The Lot Explorer provides access to and views of all your current and historic Juice/wine lots in inventory.  It also provides:

- Customizable columns
- Advanced filtering options
- Saved layouts for personalized views
- Quick and easy exports to Excel
- Summary information (total lots, volume, weight) displayed above the top row

![](https://support.innovint.us/hs-fs/hubfs/image-png-Mar-16-2026-11-12-12-8278-PM.png?width=670&height=266&name=image-png-Mar-16-2026-11-12-12-8278-PM.png)

### Navigating the Lot Explorer

The Lot Explorer contains a row for each unique Juice/wine lot in inventory, with associated visible lot attributes.

- Click on any row to dive deeper into the [Lot details!](/hc/en-us/articles/205001375-what-can-i-see-on-a-lot-details-page-?hsLang=en)
- By default, archived lots are hidden. Use the Archived filter to show these lots.

#### Columns

The Lot Explorer displays a number of default lot attribute columns that can be customized as desired. Available columns are:

- Lot code (supports ascending/descending sorting)
- Lot name
- Color
- Contents (supports ascending/descending sorting)
- Vessels (supports ascending/descending sorting)
- Work orders (displays icon/hover details)
- Notes (displays icon/hover details)
- Vintage (supports ascending/descending sorting)
- Varietal (supports ascending/descending sorting)
- Appellation
- Vineyard
- Stage (supports ascending/descending sorting)
- Tags (supports ascending/descending sorting)
- Bond
- Tax Class
- Archived
- Owner (if enabled)
- Intended Use (if enabled)
- Custom Attributes (each attribute becomes an available column header)

#### Filters

The Lot Explorer is more than a list - it's a report, too!  Use the filters above the column headers to search, filter and review lots.

![](https://support.innovint.us/hs-fs/hubfs/image-png-Mar-16-2026-11-13-40-4296-PM.png?width=670&height=264&name=image-png-Mar-16-2026-11-13-40-4296-PM.png)

- The Lot search field searches & filters based on Lot code and Lot name. This field will always display and cannot be hidden.
- The Vessel search field searches & filters based on Vessel code. You can find and add this in the **Manage filters** drop down under *Vessel*.
- Filters help narrow your results based on lot attributes
  - Most filters include **Any, All, and Not** matching logic that allows for flexible and precise filtering.
    - Any - An item shows in the explorer if it *matches any* of the selected options (ie shows all lots that are in a selected stage)
    - Not - An item shows in the explorer if it *doesn’t match any* of the selected options (ie only shows lots that do not have the specified bond)
    - All - An item shows in the explorer if it *matches all* of the selected options (ie only shows lots including all specified owners)
- Add additional filters, or hide unwanted filters using the Manage filters menu
  - Available filterable attributes include:
    - Vessel (adds the vessel search field if selected)
    - Color
    - Vessel type

- - - Vintage (the vintage filter returns all lots that contain at least 95% of the selected vintage)
    - Vintage component (the vintage component filter returns all lots that contain lots with *any* amount of the selected component(s)
    - Varietal (the varietal filter returns all lots that contain at least 75% of the selected varietal)
    - Varietal component (the varietal component filter returns all lots that contain lots with *any* amount of the selected component(s))
    - Appellation (the appellation filter that returns all lots that contain at least 85% of the selected appellation)
    - Appellation component (the appellation component filter returns all lots that contain lots with *any* amount of the selected component(s))
    - Vineyard
    - Stage
    - Tag
    - Bond
    - Tax Class
    - Owner (if enabled)
    - Intended Use (if enabled)
    - Archived
    - Custom Attributes
      - Text (search field only)
      - Date (Date Range Filter)
      - Number (search field only)
      - Single select (filters ANY, NOT)

**BLEND** displays on for a lot on the vintage, varietal and appellation attribute when certain thresholds are not met. A lot must be 95% vintage, 85% appellation or 75% varietal in order for the specified designation to be met and displayed.

For example, if the lot is 74% Merlot, the varietal column will display BLEND.  Use the BLEND filter on the Vintage, Varietal or Appellation columns, or else try the Vintage, Varietal and Appellation *component* filters in order to find lots with any amount of the selected attribute.

### Managing Filters & Columns

Use the **Manage Filters and Manage Columns** buttonsto:

- Control which columns appear in your Lot Explorer
  ![](https://support.innovint.us/hs-fs/hubfs/image-png-Mar-16-2026-11-18-52-5491-PM.png?width=670&height=325&name=image-png-Mar-16-2026-11-18-52-5491-PM.png)
  - Reorder columns by dragging
  - Resize columns
  - Pin specific columns to the left

- Customize which filters appear on your Lot Explorer (Search is always enabled and cannot be removed)

  - Rearrange filter order by dragging
  ![](https://support.innovint.us/hs-fs/hubfs/image-png-Mar-16-2026-11-16-57-6797-PM.png?width=670&height=305&name=image-png-Mar-16-2026-11-16-57-6797-PM.png)

### Saving and Using Layouts

Layouts let you save your preferred filters and column settings. You can save up to 200 layouts

![](https://support.innovint.us/hs-fs/hubfs/image-png-Mar-16-2026-11-28-41-0679-PM.png?width=670&height=200&name=image-png-Mar-16-2026-11-28-41-0679-PM.png)

#### How to save a layout

1. Configure your filters and columns
2. Open the layout dropdown
3. Select **Save Layout**
4. Enter a unique name
5. Choose whether to include selected filter values
   ![](https://support.innovint.us/hs-fs/hubfs/image-png-Mar-16-2026-11-26-28-5623-PM.png?width=670&height=304&name=image-png-Mar-16-2026-11-26-28-5623-PM.png)
6. Save

Saved layouts include:

- Active filters and values (optional)
- Visible columns
- Column order and size
- Pinned columns
- Sorting

#### Managing Layouts

Select **Manage Layouts** to:

- Rename layouts
- Reorder layouts
- Delete layouts

At least one layout must always remain (the delete option will not be available if you only have one layout)

![CA_Manage Layout](https://support.innovint.us/hs-fs/hubfs/CA_Manage%20Layout.png?width=670&height=208&name=CA_Manage%20Layout.png)

#### Loading Layouts

- Select a saved layout from the dropdown.
- The table updates automatically.
- Filter and column menus adjust to match the layout.

#### Default Layouts

New wineries receive two default layouts - either of these layouts can be renamed or deleted:

- **Default**

  - Includes standard filters and columns, similar to the "original" Lot Explorer view.
- **Harvest View**

  - Optimized for harvest operations, with pre-selected Stage filters and relevant columns.

### Lot Explorer Export

Want to export your report? You can export and download two data sets from the Lot Explorer:

- Lots Export - see an export that includes:

  - Lot Code
  - Lot Name
  - Lot details page URL
  - Type
  - Volume
  - Weight
  - Fruit Weight
  - Tax Class
  - Bond
  - Stage
  - Tanks
  - Bins
  - Barrels
  - Kegs
  - Carboys
  - Steel Drums
  - Vintage
  - Top Vintage %
  - Varietal
  - Top Varietal %
  - Appellation
  - Top Appellation %
  - Vineyard
  - Block
  - Color
  - Archived: True or False
  - Owners (if activated)
  - Tags
  - Alc. %
  - RS
  - Free SO2
  - Total SO2
  - TA
  - VA
  - pH
- Lot Components Export - see an export of all your lot compositions, with columns for:

  - Percentage
  - Volume
  - Vintage
  - Varietal
  - Appellation
  - Vineyard
  - Block
  - Clone
  - Vineyard tags
  - Block tags

What's included on an export?

- Exports will include only the lots currently visible based on your filters.
- For the Lot export, Your saved column visibility does not affect export format. All available Lot Explorer columns will export.

### Frequently Asked Questions

**Q: Why don’t I see certain filters or columns?**
*A: Some filters and columns depend on:*

- *Your user permissions*
- *Whether specific features (Custom Lot Attributes, Owner, Intended Use) are enabled for your organization*

*If you believe something is missing, [contact Support](mailto:support@innovint.us) to check your subscription and user access.*

**Q: Why did my layout disappear?**
*A: Layouts are saved per user, within the selected winery. If you switch user or winery accounts, your layouts will not appear.*

**Q: Can I share layouts with other users?**
*A: No. Layouts are currently saved at the individual user level. Other users in the winery cannot see your layouts.*

**Q: Why are archived lots greyed out?**
*A: Archived lots are visually distinguished to help you identify inactive records quickly.*

**Q: Why does Lot Explorer export include all the extra columns I don't have in my layout?**
*A:. Layouts affect how data is displayed, but exports will always follow the standardized export format.*

**Q: What happens if I don’t save my changes?**
*A: If you make changes but don't save them as a layout and leave the Lot Explorer, it will remember this last view for when you return later. Your most recent filters and settings will be restored.  This "last view" updates automatically and may be replaced when you change layouts, columns or filters. A saved last view is different from a saved layout, which can be found again in the Layout menu.*

**Q: Can I save layouts in the Fruit Lot Explorer or my Case Good Lot Explorer?**
*A: No*

**Q: Why is BLEND showing as the lot's vintage?**
*A: **BLEND** displays on for a lot on the vintage, varietal and appellation attribute when certain thresholds are not met. A lot must be 95% vintage, 85% appellation or 75% varietal in order for the specified designation to be met and displayed.* *For example, if the lot is 94% 2025, the vintage column will display BLEND. Use the BLEND filter on the Vintage, Varietal or Appellation columns to find lots with a lower threshold, or else try the Vintage, Varietal and Appellation component filters in order to find lots with any amount of the selected attribute.*
