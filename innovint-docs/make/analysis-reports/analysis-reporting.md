---
title: "Analysis Reporting"
url: "https://support.innovint.us/hc/en-us/articles/205001715-analysis-reporting"
category: "MAKE"
section: "Analysis Reports"
page_type: "article"
lastmod: "2025-11-20"
gist: "InnoVint generates various reports and provides severals ways to view and track your analysis data within the platform."
tags: ["lab", "reporting", "configuration", "barrels", "vineyard", "lot-identity"]
---

# Analysis Reporting

InnoVint generates various reports and provides severals ways to view and track your analysis data within the platform. Below you'll find details on different options.

**This article covers:**

- [View analysis per lot (from Lot Details page)](#viewanalysis)
  - [Dashboard snapshot](#dashboardsnap)
  - [Analysis tab](#analysistab)
- [Winemaking Analysis Reports](#analysisreports)
- [Analysis Reports (by Lot Composite, Individual Vessel or Vineyard Block)](#customreports)
- [How to edit or delete analyses](#editordelete)

### View analysis per lot (from Lot Details page)

#### Dashboard snapshot

Take a quick glance at the most recent analyses recorded on your lot.

![Analysis Reporting-dashboard](https://support.innovint.us/hs-fs/hubfs/Analysis%20Reporting-dashboard.webp?width=688&height=169&name=Analysis%20Reporting-dashboard.webp)

The analysis displayed on the Lot Details Dashboard is dependent on the current **stage** of the lot. The default analysis types by Lot Stage are displayed below, but you can also [customize](https://support.innovint.us/hc/en-us/how-to-set-your-lot-stage-analyses?hsLang=en) the analysis types that display for each stage.

![Analysis Reporting-customize](https://support.innovint.us/hs-fs/hubfs/Analysis%20Reporting-customize.webp?width=688&height=375&name=Analysis%20Reporting-customize.webp)

Find out how to customize this dashboard display [here](https://support.innovint.us/hc/en-us/how-to-set-your-lot-stage-analyses?hsLang=en)!

#### Analysis tab

Review your analyses with multiple different report types at the lot level:

**Grouped by date**

![Analysis Reporting-group by date](https://support.innovint.us/hs-fs/hubfs/Analysis%20Reporting-group%20by%20date.webp?width=688&height=356&name=Analysis%20Reporting-group%20by%20date.webp)

**Grouped by vessel**

![Analysis Reporting-group by vessel](https://support.innovint.us/hs-fs/hubfs/Analysis%20Reporting-group%20by%20vessel.webp?width=688&height=302&name=Analysis%20Reporting-group%20by%20vessel.webp)

**Brix/Temp**![Analysis Reporting-brix temp](https://support.innovint.us/hs-fs/hubfs/Analysis%20Reporting-brix%20temp.webp?width=688&height=384&name=Analysis%20Reporting-brix%20temp.webp)

**Graph**![Analysis Reporting-graph](https://support.innovint.us/hs-fs/hubfs/Analysis%20Reporting-graph.webp?width=688&height=390&name=Analysis%20Reporting-graph.webp)

**All analyses in a list**![Analysis Reporting-all analysis](https://support.innovint.us/hs-fs/hubfs/Analysis%20Reporting-all%20analysis.webp?width=688&height=237&name=Analysis%20Reporting-all%20analysis.webp)

### Winemaking Analysis Reports

Go to the Report Explorer to view our default analysis reports: Recent Analyses, Primary Fermentation, ML Fermentation and Stability & Aging.

![Analysis Reporting-winemaking report](https://support.innovint.us/hs-fs/hubfs/Analysis%20Reporting-winemaking%20report.webp?width=688&height=347&name=Analysis%20Reporting-winemaking%20report.webp)

#### Recent Analyses

The Recent Analyses report provides a .csv export of all analyses recorded on, or since a specific date for all lots.

![Analysis Reporting-recent report](https://support.innovint.us/hs-fs/hubfs/Analysis%20Reporting-recent%20report.webp?width=688&height=111&name=Analysis%20Reporting-recent%20report.webp)

This is in a helpful format should you need to export and re-import a specific set of analyses using the InnoVint analysis import [template](https://support.innovint.us/hubfs/Modified%20Analysis%20Import.csv?hsLang=en):

![Analysis Reporting-template](https://support.innovint.us/hs-fs/hubfs/Analysis%20Reporting-template.webp?width=372&height=159&name=Analysis%20Reporting-template.webp)

- - The report only provides results for a max of 31 days since a specified date.
  - If you have our TankNet integration, the report excludes TankNet analysis data

#### Primary Fermentation report

The [Primary Fermentation report](https://support.innovint.us/hc/en-us/articles/204547029-primary-fermentation-report?hsLang=en) is a vessel-by-vessel report of all lots in the **Processed**, **Settling**, **Cold Soak**, and **Fermentation** stages. The vessel filter also defaults to show only **tanks** and **bins**. The Stage and Vessel Type filters can be altered to include or exclude different stages or vessel types.

This report lists the vessel code, lot code, and lot name. For each vessel, InnoVint calculates the number of days since the vessel was filled and displays the current fill in weight or volume and the last recorded action. Analysis data includes the most recent sugar reading (Brix, Baumé, Glu/Fru, residual sugar, etc) and temperature.

![Analysis Reporting-primary fermentation](https://support.innovint.us/hs-fs/hubfs/Analysis%20Reporting-primary%20fermentation.webp?width=688&height=292&name=Analysis%20Reporting-primary%20fermentation.webp)

#### ML Fermentation report

The [ML Fermentation report](https://support.innovint.us/hc/en-us/articles/204546129-ml-fermentation-report?hsLang=en) is a lot-by-lot report of all lots in the **ML** and **Aging** stages. Adjust the filters at the top to narrow your search.

This reports lists the lot code and lot name, along with the current fill and lot tags. The most recent Barrel Down and Topping action dates are also displayed for each line. The analysis data includes the 3 most recent sugar (Brix, Baumé, Glu/Fru, residual sugar, etc.), malic acid, and volatile acidity readings.

![Analysis Reporting-ML fermentation](https://support.innovint.us/hs-fs/hubfs/Analysis%20Reporting-ML%20fermentation.webp?width=688&height=186&name=Analysis%20Reporting-ML%20fermentation.webp)

#### Stability & Aging report

The [Stability & Aging report](https://support.innovint.us/hc/en-us/articles/205191365-stability-aging-report?hsLang=en) allows you to see all lots that are either in the **Aging**, **Blended** or **Pre-Bottling Stabilization** stages.

The report gives the 3 latest readings for Volatile Acidity as well as Free Sulfur Dioxide whether they were run on a lot composite or a single vessel as well as the dates the readings were taken.

![Analysis Reporting-stability aging](https://support.innovint.us/hs-fs/hubfs/Analysis%20Reporting-stability%20aging.webp?width=688&height=76&name=Analysis%20Reporting-stability%20aging.webp)

The report also shows the dates of Last Racking and the Last Toppings completed on each lot in the Aging, Blended or Pre-Bottling Stabilization stages. However, the Stage filter can be altered to include or exclude different stages

Lots can sorted by clicking on any of the headers within the report.

Search for lots within the text filter, or use the Vintage or Tag filter to narrow down search results.

### Analysis Reports

For more information on how to create and save Analysis Reports by Lot Composite, Individual Vessels, or Vineyard Blocks, follow the link [HERE](https://support.innovint.us/hc/en-us/articles/360052048151-custom-analysis-reports?hsLang=en).

### Edit or Delete Analyses

#### From the Lot Details page

To edit or delete an individual analysis value, go to the **Lot Details page > Analysis tab > All analyses in a list**.![Analysis Reporting-edit delete](https://support.innovint.us/hs-fs/hubfs/Analysis%20Reporting-edit%20delete.webp?width=688&height=249&name=Analysis%20Reporting-edit%20delete.webp)

You can also edit or delete analyses from the **Brix/Temp** and **Graph** sub-tabs. The analyses on those pages are specific to the values that are displayed.

The Edit Analysis window only allows you to change the analysis value. To change any other attributes (e.g. date, source, etc.), you will need to delete and re-enter the analysis data.![Analysis Reporting-edit](https://support.innovint.us/hs-fs/hubfs/Analysis%20Reporting-edit.webp?width=606&height=295&name=Analysis%20Reporting-edit.webp)

#### From the Winery Activity Feed

To delete an Analysis or Analysis Import action, go to the **Winery Activity Feed** and click into the details of the action you would like to edit or delete.![Analysis Reporting-winery activity feed](https://support.innovint.us/hs-fs/hubfs/Analysis%20Reporting-winery%20activity%20feed.webp?width=688&height=127&name=Analysis%20Reporting-winery%20activity%20feed.webp)

From the **action details page**, you can delete the analysis action or edit the analysis value within the action details page.![Analysis Reporting-delete edit](https://support.innovint.us/hs-fs/hubfs/Analysis%20Reporting-delete%20edit.webp?width=688&height=166&name=Analysis%20Reporting-delete%20edit.webp)
