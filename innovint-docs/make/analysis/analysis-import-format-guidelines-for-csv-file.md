---
title: "Analysis Import: Format Guidelines for csv file"
url: "https://support.innovint.us/hc/en-us/articles/115002684812-analysis-import-format-guidelines-for-csv-file"
category: "MAKE"
section: "Analysis"
page_type: "article"
lastmod: "2025-11-20"
gist: "Analysis data can be imported via a .csv upload using the \"Analysis Import\" action."
tags: ["lab", "exports", "migration", "harvest", "ux-friction"]
---

# Analysis Import: Format Guidelines for csv file

Analysis data can be imported via a .csv upload using the "Analysis Import" action. This import is available in your Record Action menus as a direct action.  Find out more about how the import action works [here](https://support.innovint.us/hc/en-us/articles/115002687291-how-to-import-analyses-via-csv?hsLang=en).

There are two different formatting styles available for import: the "original" Analysis Import template and the "modified" Analysis Import template. These templates are set up differently (rows versus columns for each type of analysis), so have a look at the two layouts, and pick the one that works for you based on the format in which you receive or record your lab results. We always recommend starting with a provided [template](#templates).

Analysis results may be exported by laboratory equipment (e.g. FOSS, WineLab, etc.) or provided by outside laboratories in .csv or excel files. We recommend copying/pasting these results into the best fit InnoVint import template. For example, the "original" Analysis Import template is the ideal fit for the FOSS export.

If you track in-house analysis on a spreadsheet,  we'd recommend formatting your spreadsheet in line with one of the templates at the [bottom](#templates) of this page to make it easy to import results.

### This article covers:

- [The original Analysis Import](#original)
  - [Accepted column headers](#originalheaders)
  - [Accepted analyses & units](#table)
- [The modified Analysis Import](#modifiedanalysisimport)
  - [Accepted column headers](#modified_header)
  - [Accepted analyses & units](#Modified_analyses)
- [Templates](#templates)
- [FAQ](#faqs)

### **"Original" Analysis Import**

#### **Guidelines for importing analysis files via the original Analysis Import template:**

- This is the template to use that most closely matches the data export from a FOSS. Download this template [here](#templates).
- Files *must* be in the format as pictured here (i.e. analysis names across the top row and lot ***or*** vessel codes in the first column "**ID**").
  This is a good template to use when you are running a series of standard panels, i.e. you would keep one template copied for Juice panels, one for finished wine, one for monthly analysis panels, etc.
  ![Analysis Import_csv ex](https://support.innovint.us/hs-fs/hubfs/Analysis%20Import_csv%20ex.webp?width=688&height=78&name=Analysis%20Import_csv%20ex.webp)
  - The ***ID*** column header must match the format above, and may contain either lot or vessel codes.  The file may contain either lot codes OR vessel codes, but not both. You will be able to choose Lot Composite or Individual Vessels analysis once the file is uploaded.

- - The analysis names in the headers must match those in the [table](#table) below. This import only supports selected analyses types.
  - A date column is not required, but must be in the following format if used: **MM/DD/YY**. If dates are not entered on the import file, then all analyses will upload as of the date the action is submitted. The template will support a timestamp if included as MM/DD/YY 00:00 (using 24 hour time format).

**Note:** The ![backdate](https://support.innovint.us/hs-fs/hubfs/backdate.webp?width=155&height=19&name=backdate.webp)check box in the Analysis Import action will override all dates/times in the file if selected.

- The analysis column headers of your .csv must match the accepted .csv analysis names  *EXACTLY* as they are listed in the table below.
  - Pay close attention to the units associated with the accepted analysis names. If multiple units are accepted for an analysis type, i.e. mg/L or ppm, please include the desired units in the analysis header (per the table below).
  - If the .csv column header does not match an accepted analysis type, the corresponding analysis in that column will be ignored. You will receive a warning pop-up if there is a matching issue.
    ![Analysis Import_Unrecognized analysis](https://support.innovint.us/hs-fs/hubfs/Analysis%20Import_Unrecognized%20analysis.webp?width=417&height=292&name=Analysis%20Import_Unrecognized%20analysis.webp)
- InnoVint does not currently accept less than (<) or greater than (>) analysis values.
- If you are utilizing "special characters", such as the letter mu for micro (i.e. µS), be sure you are saving the file as **CSV UTF-8**. This is a special csv file type that supports more international characters (some csv files can't save them properly).

  ![Analysis Import_csv-utf8](https://support.innovint.us/hs-fs/hubfs/Analysis%20Import_csv-utf8.webp?width=237&height=104&name=Analysis%20Import_csv-utf8.webp)

**Note:** You can adjust your FOSS machine to output analysis names according to the table below. You will find instructions at the [bottom of this page](#foss).

|  |  |  |
| --- | --- | --- |
| ***InnoVint Analysis Name*** | ***Unit*** | ***Accepted .csv Analysis Name*** |
| Brix | ° | Brix |
| Baume | Baume |
| Balling | Balling |
| KMW | KMW |
| Oechsle | Oechsle |
| Density | g/mL | Density |
| Temperature | ° | Temperature |
| Temperature (°F) |
| Temperature (F) |
| Temp |
| Temp (°F) |
| Temp (F) |
| Temperature (°C) |
| Temperature (C) |
| Temp (°C) |
| Temp (C) |
| Alcohol | % | Ethanol |
| Alcohol |
| Glucose/Fructose | g/L | Glucose+Fructose |
| Glucose/Fructose |
| Glu/Fru |
| G+F |
| G/F |
| Glucose+Fructose (g/L) |
| Glucose/Fructose (g/L) |
| Glu/Fru (g/L) |
| G+F (g/L) |
| G/F (g/L) |
| g/dL | Glucose+Fructose (g/dL) |
| Glucose/Fructose (g/dL) |
| Glu/Fru (g/dL) |
| G+F (g/dL) |
| G/F (g/dL) |
| Glucose | g/L | Glucose |
| Glucose (g/L) |
| g/dL | Glucose (g/dL) |
| Fructose | g/L | Fructose |
| Fructose (g/L) |
| g/dL | Fructose (g/dL) |
| Residual Sugar | g/L | Residual Sugar |
| RS |
| pH |  | pH |
| Total Acid | g/L | Total Acid |
| Total Acid (g/L) |
| g/dL | Total Acid (g/dL) |
| Titratable Acidity | g/L | Titratable Acidity |
| TA |
| g/100mL | Titratable Acidity (g/100mL) |
| TA (g/100mL) |
| Tartaric Acid | g/L | Tartaric Acid |
| Tartaric Acid (g/L) |
| g/dL | Tartaric Acid (g/dL) |
| Malic Acid | g/L | Malic Acid/MA/Malic |
|
| mg/L | Malic Acid/MA/Malic (mg/L) |
| g/100mL | Malic Acid/MA/Malic (g/100mL) |
| g/dL | Malic Acid/MA/Malic (g/dL) |
| Lactic Acid | g/L | Lactic Acid |
| Lactic Acid (g/L) |
| g/dL | Lactic Acid (g/dL) |
| mg/L | Lactic Acid (mg/L) |
| ppm | Lactic Acid (ppm) |
| Gluconic Acid | g/L | Gluconic Acid |
| Acetic Acid | g/L | Acetic Acid |
| ATA |
| Acetic Acid (g/L) |
| ATA (g/L) |
| g/dL | Acetic Acid (g/dL) |
| ATA (g/dL) |
| Volatile Acidity | g/L | Volatile Acid |
| Volatile Acidity |
| VA |
| Volatile Acid (g/L) |
| Volatile Acidity (g/L) |
| VA (g/L) |
| g/dL **or** g/100mL | Volatile Acid (g/dL) **or** (g/100mL) |
| Volatile Acidity (g/dL) **or** (g/100mL) |
| VA (g/dL) **or** (g/100mL) |
| Ammonia (NH3) | mg/L | Ammonia |
| Ammonia (mg/L) |
| ppm | Ammonia (ppm) |
| Alpha-Amino Nitrogen | g/L | Alpha Amino |
| Nitrogen (NOPA) | mg/L | Primary Amino Nitrogen |
| PAN |
| PAAN |
| NOPA |
| Primary Amino Nitrogen (mg/L) |
| PAN (mg/L) |
| PAAN (mg/L) |
| NOPA (mg/L) |
| ppm | Primary Amino Nitrogen (ppm) |
| PAN (ppm) |
| PAAN (ppm) |
| NOPA (ppm) |
| Yeast Assimilable Nitrogen | mg/L | Yeast Assimilable Nitrogen |
| YAN |
| Yeast Assimilable Nitrogen (mg/L) |
| YAN (mg/L) |
| ppm | Yeast Assimilable Nitrogen (ppm) |
| YAN (ppm) |
| Potassium | mg/L | Potassium |
| Potassium (mg/L) |
| mmol/L | Potassium (mmol/L) |
| Absorbance A280 | AU | OD 280 |
| Color Absorbance at 280 nm |
| Absorbance - 280 nm |
| Absorbance at 280 nm |
| Absorbance A280 |
| Absorbance A420 | AU | Color Absorbance at 420 nm |
| Absorbance - 420 nm |
| Absorbance at 420 nm |
| Absorbance A420 |
| Absorbance A520 | AU | Color Absorbance at 520 nm |
| Absorbance - 520 nm |
| Absorbance at 520 nm |
| Absorbance A520 |
| Absorbance A620 | AU | Color Absorbance at 620 nm |
| Absorbance - 620 nm |
| Absorbance at 620 nm |
| Absorbance A620 |
| Free SO2 | mg/L | Free SO2 |
| FSO2 |
| Free SO2 (mg/L) |
| FSO2 (mg/L) |
| ppm | Free SO2 (ppm) |
| FSO2 (ppm) |
| Molecular SO2 | mg/L | Molecular SO2 |
| MSO2 |
| Molecular SO2 (mg/L) |
| MSO2 (mg/L) |
| ppm | Molecular SO2 (ppm) |
| MSO2 (ppm) |
| Total SO2 | mg/L | Total SO2 |
| TSO2 |
| Total SO2 (mg/L) |
| TSO2 (mg/L) |
| ppm | Total SO2 (ppm) |
| TSO2 (ppm) |
| Average Berry Weight | g | Average Berry Weight |
| ABW |
| Berry Volume | mL/berry | Berry Volume |
| BVOL |
| Cluster Weight | g | Cluster Weight |
| Cluster Wt |
| Cluster Weight (g) |
| Cluster Wt (g) |
| oz | Cluster Weight (oz) |
| Cluster Wt (oz) |
| lbs | Cluster Weight (lbs) |
| Cluster Wt (lbs) |
| Average Cluster Weight | g | Average Cluster Weight |
| Avg Cluster Wt |
| Average Cluster Weight (g) |
| Avg Cluster Wt (g) |
| oz | Average Cluster Weight (oz) |
| Avg Cluster Wt (oz) |
| lbs | Average Cluster Weight (lbs) |
| Avg Cluster Wt (lbs) |
| Extract | g/L | Extract (g/L) |
| Total Polyphenols | g/L | Total Polyphenols (g/L) |
| Conductivity | µS | Conductivity (µS) |
| % | Conductivity (%) |
| Conductivity (Davis) | % | Conductivity (Davis) |
| Cold Stable | % | Cold Stable (%) |
| Heat Stability | NTU | Heat Stability Check (NTU) |
| NTU | Heat Stability Check |

**Note**: If your analysis type and/or unit do not currently exist for the Original Analysis Import template, contact [support@innovint.us](mailto:support@innovint.us) to enquire about getting them added.

### **Modified Analysis Import**

#### **Guidelines for importing analysis files via the modified Analysis Import template:**

- This file format is ideal for importing analyses exported from InnoVint via the [Recent Analysis Report](https://support.innovint.us/hc/en-us/articles/205001715-analysis-reporting?hsLang=en#analysisreports) or the Lot details [All Analysis in a List](https://support.innovint.us/hc/en-us/articles/205001715-analysis-reporting?hsLang=en#analysistab) export. It may also be useful for importing ad hoc analysis.
- Files *must* be in the format as pictured here (i.e. Date, Analysis Type, Value, Unit, and Performed On across the top header row, with a row per analysis result). If a column is not being used, leave it empty, but *do not delete it*.
  - All column headers are necessary for the upload to be successful.
  - If you are using lot codes or vessel codes, the file may contain *either* lot codes *or* vessel codes in Column E - "**Performed On,**" but not both in the same file.
    ![Analysis Import_csv-indvessel](https://support.innovint.us/hs-fs/hubfs/Analysis%20Import_csv-indvessel.webp?width=300&height=165&name=Analysis%20Import_csv-indvessel.webp) ![Analysis Import_csv-lot composite](https://support.innovint.us/hs-fs/hubfs/Analysis%20Import_csv-lot%20composite.webp?width=300&height=166&name=Analysis%20Import_csv-lot%20composite.webp)

**Note:** The column headers must match the format above. The ***Date*** column must match the header as shown above and be the format MM/DD/YY. Links to template files are included at the [bottom](#templates) of this article.

- If no date is entered, then the current date and time of the "Analysis Import" action submittal will be entered.

**Note:** The  ![backdate](https://support.innovint.us/hs-fs/hubfs/backdate.webp?width=155&height=19&name=backdate.webp) check box in the Analysis Import action will override all dates in the file if selected.

- All analyses that are available within InnoVint are accepted via this format. The analysis type and spelling must match the current format in InnoVint. Reference the list available via the Analysis action > +Add Analysis. If the analysis type exists with an alternative accepted name via the "original" Analysis Import table above, those will be permitted (i.e. Glu/Fru or G/F). You will receive a warning pop-up if there is a matching issue.
  ![Analysis Import_Map analysis](https://support.innovint.us/hs-fs/hubfs/Analysis%20Import_Map%20analysis.webp?width=298&height=218&name=Analysis%20Import_Map%20analysis.webp)
- Pay close attention to the units associated with the analysis names. Only units that are currently an option for that analysis type will be accepted. To view the units currently available per analysis, go to an Analysis action > add the desired analysis > click on the caret under units to see all available options. Be mindful that these are case sensitive (i.e. MG/L must be mg/L).
  ![Analysis Import_Map analysis2](https://support.innovint.us/hs-fs/hubfs/Analysis%20Import_Map%20analysis2.webp?width=298&height=373&name=Analysis%20Import_Map%20analysis2.webp)

- If you are utilizing "special characters", such as the letter mu for micro (i.e. µS), be sure you are saving the file as **CSV UTF-8**. This is a special csv file type that supports more international characters (some csv files can't save them properly).
  ![Analysis Import_csv-utf8](https://support.innovint.us/hs-fs/hubfs/Analysis%20Import_csv-utf8.webp?width=300&height=132&name=Analysis%20Import_csv-utf8.webp)
- InnoVint does not currently accept less than (<) or greater than (>) analysis values.

### Templates

We've pre-populated a couple basic options for the "original Analysis import" template (one row per lot, with multiple analysis types and results in columns):

- [Template - Brix and Temps.csv](https://support.innovint.us/hubfs/Template%20-%20Brix%20and%20Temps.csv?hsLang=en)
- [Template - Harvest Chemistry.csv](https://support.innovint.us/hubfs/Template%20-%20Harvest%20Chemistry.csv?hsLang=en)
- [Template - Wine Chemistry.csv](https://support.innovint.us/hubfs/Template%20-%20Wine%20Chemistry.csv?hsLang=en)

Here is the "modified Analysis import" template (one row per lot and per analysis result):

- [Template - Modified Analysis Import.csv](https://support.innovint.us/hubfs/Modified%20Analysis%20Import-1.csv?hsLang=en)

Find out how to adjust your FOSS output analysis names:

- [OenoFoss Test Name Change.pdf](https://support.innovint.us/hubfs/OenoFoss%20Test%20Name%20Change.pdf?hsLang=en)

### FAQ

**Q. I can't get my file to upload! What should I try?**

*A. Please be sure to double check the following items:*

- *All column headers match the accepted template versions*
- *All analyses are spelled correctly and accepted per the version of import*
- *All analyses have the correct and accepted units*
- *All analyses and units have the accepted capitalizations*
- *No analyses values have " < "or " > "*
- *All dates are formatted MM/DD/YY*
- *Be sure you are uploading a .csv file (both "," and ";" are accepted delimiters)*
- **Check to see if your csv file is CSV UTF-8 file type. This is a special csv type that supports international characters such as mu for for micro (i.e. µS - some csv files can't save these symbols properly)**

**Q. Can I upload a .txt or .xls file instead?**

*A. Currently, we do not accept .txt or .xls files.*

**Q. Can I export an analysis list from InnoVint and then re-import it back into another lot?**

*A. Yes! If you have to split up a lot into two or if you are moving data from one InnoVint account to another, simply follow these steps:*

1. *Export All analyses in a list (Lot details > Analysis tab > All analysis in a list).*
2. *Open this file and reformat this export to match the above Modified Analysis Import by deleting the two header rows, then clear out the Performed On cells, and enter either the new Lot code or the new Vessel code in the Performed On column for every analyses entered.*
3. *If you have additional lots to import, cut and paste them from each export, and add them below the first set.*
4. *Record an Analysis Import action.*
   *![Analysis Import_from all analysis](https://support.innovint.us/hs-fs/hubfs/Analysis%20Import_from%20all%20analysis.webp?width=688&height=342&name=Analysis%20Import_from%20all%20analysis.webp)*
