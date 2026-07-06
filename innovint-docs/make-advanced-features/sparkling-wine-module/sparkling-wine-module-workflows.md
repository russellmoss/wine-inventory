---
title: "Sparkling Wine Module Workflows"
url: "https://support.innovint.us/hc/en-us/articles/360050744032-sparkling-wine-production-feature-overview"
category: "MAKE: Advanced Features"
section: "Sparkling Wine Module"
page_type: "article"
lastmod: "2026-01-27"
gist: "This feature requires activation."
tags: ["barrels", "packaging", "getting-started", "additives", "fermentation", "lot-identity"]
---

# Sparkling Wine Module Workflows

This feature requires activation. If you wish to activate it please contact our Customer Success Team at [support@innovint.us](//innovint-6865708.hs-sites.com/hc/en-us/kb-tickets/new?hsLang=en).

Find our basic feature overview [here](https://support.innovint.us/hc/en-us/sparkling-wine-production-feature-overview?hsLang=en).

This article covers:

- [What is the Sparkling wine module?](#howdoesitwork)
- [How to get started](#start)
  - [Step 1: Create your tirage vessels](#vessels)
  - [Step 2: Perform a Bottling en Tirage action](#bottle-en-tirage)
  - [Step 3: Update lot style](#properties)
  - [Step 4: Update tax class](#Step_4-Tax_class)
  - [Step 5: Set the sparkling lot stage](#Step5_Stage)
  - [Step 6: Disgorge and package your sparkling wine](#disgorge)
- [InnoVint Traditional Method Sparkling Workflow Diagram](#workflow)

- [Frequently Asked Questions](#faqs)
  - [Charmat](#charmat)
  - [Pét-Nat](#petnat)
  - [Forced Carbonation](#carbonation)

#### What is the Sparkling Wine Module?

The **Sparkling Wine Module** in InnoVint allows you to track the full **Traditional Method** sparkling wine production process, including:

- Bottling en tirage
- Aging and riddling
- Disgorge, dosage, and final packaging

The module can also support **Charmat (Tank Method)**, **Pét-Nat**, and **Forced Carbonation** workflows. Recommended steps for these methods are outlined in the [**FAQ** section](#faqs).

#### Getting Started (Traditional Method)

#### Prerequisite

Create your **sparkling base wine** as you normally would. Once you’re ready to  [bottle en tirage,](/hc/en-us/articles/360051230671-bottling-en-tirage-?hsLang=en) begin using the Sparkling Wine Module.

#### Step 1: Create your tirage vessels

Tirage vessels represent your bins of bottles used for secondary fermentation.

**Navigation**

- Go to **Vessels** → **+ Add Vessels**
- Select the **Tirage** vessel type

**Required fields**

- **Vessel Codes**

  - Enter one or more codes (comma- or space-separated)
  - Allowed characters: A–Z, 0–9, dash (-), underscore (\_)
- **Bottle Type**
- **Capacity** (number of bottles per vessel group)

  - InnoVint calculates the total volume of your Tirage Bin automatically.

**Optional fields**

- Owners (if Owner-based permissions are enabled)
- Tags

![Sparkling Wine Module Workflows-tirage1](https://support.innovint.us/hs-fs/hubfs/Sparkling%20Wine%20Module%20Workflows-tirage1.webp?width=670&height=428&name=Sparkling%20Wine%20Module%20Workflows-tirage1.webp)

**📌 TIP**: If you have your vessels in a spreadsheet, you can also copy and paste the vessel codes into the text field (limit 100 at a time.)

#### Step 2: Perform a Bottling en Tirage action

Use the [**Bottling en Tirage** action](/hc/en-us/articles/360051230671-bottling-en-tirage-?hsLang=en) to move base wine into tirage bins and bottles.

**Best practices**

- If bottling occurs over multiple runs, consider using **unique lot codes** per run.
- If you track packaging in InnoVint, this action can also:

  - Deplete packaging
  - Track packaging costs during tirage aging

**TTB considerations**

- Declare the base wine (e.g., **<16%**) *before* bottling en tirage.
- To map gains/losses correctly:

  - Bottle into the **same tax class** as the base wine.

#### Step 3: update your lot properties - Lot Style!

**Set Lot Style = Sparkling**

- If a **new lot** is created during Bottling en Tirage:

  - Select **Sparkling Wine** as the Lot Style during creation.

    ![Sparkling Wine Module Workflows-attr](https://support.innovint.us/hs-fs/hubfs/Sparkling%20Wine%20Module%20Workflows-attr.webp?width=290&height=434&name=Sparkling%20Wine%20Module%20Workflows-attr.webp)
- If retaining an existing lot code:

  - Update the Lot Style via [Lot Properties](/hc/en-us/articles/207711473-changing-lot-code-and-lot-name?hsLang=en) from the **Lot Details → More** menu.

    ![Sparkling Wine Module Workflows-change prop](https://support.innovint.us/hs-fs/hubfs/Sparkling%20Wine%20Module%20Workflows-change%20prop.webp?width=384&height=291&name=Sparkling%20Wine%20Module%20Workflows-change%20prop.webp)

**Result**

- The lot icon updates to show bubbles, and the lot style will update on relevant filters and exports

#### **Step 4: Update the tax class to sparkling**

After Bottling en Tirage, update the lot’s tax class.

**Supported Sparkling tax classes**

- Sparkling – Bottle Fermented (maps to Column (e), "BF")
- Sparkling – Bulk Processed (maps to Column (e), "BP")

**Compliance notes**

- After a Bottle en Tirage action, both flow to **TTB 5120.17**, Section A, Column (e), Line 2.
- Declare the wine **before** changing the tax class.

To edit the tax class, reference our article [here](//innovint-6865708.hs-sites.com/hc/en-us/articles/207936576-declare-or-edit-tax-class?hsLang=en).

![Sparkling Wine Module Workflows-tax class](https://support.innovint.us/hs-fs/hubfs/Sparkling%20Wine%20Module%20Workflows-tax%20class.webp?width=468&height=366&name=Sparkling%20Wine%20Module%20Workflows-tax%20class.webp)

🚨 Please be sure to declare your wine before recording a tax class change to either Sparkling - Bottle Fermented or Sparkling - Bulk Processed.

#### **Step 5: Set the sparkling lot stage**

These properties can be seen in the Lot Attributes on the Lot Details Page, and display in filters and exports throughout InnoVint. Available sparkling stages include:

- **En Tirage**
- **Riddling**

**How to update**

- From the **Lot Details** page
- Or automatically via the Bottling en Tirage action

  ![Sparkling Wine Module Workflows-riddling](https://support.innovint.us/hs-fs/hubfs/Sparkling%20Wine%20Module%20Workflows-riddling.webp?width=293&height=455&name=Sparkling%20Wine%20Module%20Workflows-riddling.webp)  ![Sparkling Wine Module Workflows-lot details pg](https://support.innovint.us/hs-fs/hubfs/Sparkling%20Wine%20Module%20Workflows-lot%20details%20pg.webp?width=316&height=455&name=Sparkling%20Wine%20Module%20Workflows-lot%20details%20pg.webp)

#### Step 6: Disgorge and package your sparkling wine

After aging and [riddling](/hc/en-us/articles/360051383611-riddling-?hsLang=en), it is time to disgorge, record dosage (if applicable) and then complete your final packaging step.

Follow the recommendations in our [Disgorge, Dosage and Package](https://support.innovint.us/hc/en-us/articles/360051230691-disgorge-dosage-packaging-?hsLang=en)  article.

#### InnoVint Traditional Method Sparkling Workflow Diagram

### Sparkling Wine Module Workflows-key

### Sparkling Wine Module Workflows-diagram

#### Frequently Asked Questions

##### **Q. Can I create Work Orders for sparkling actions?**

*A. Currently, only Bottle en Tirage and Riddling tasks are supported as standalone tasks.  Review the Disgorge, Dosage and Package article to find out about creating templates for this process.*

#### **Q. Can I use these actions to record the Charmat process?**

*A. The Sparkling actions are intended for the Traditional Method workflow. To record the Charmat process we recommend the following steps:*

***Charmat Workflow***

1. *Set **Lot Style = Sparkling***
2. *Record a **Blend or Transfer** to add liqueur de tirage to tank*
3. *Change tax class to **Sparkling – Bulk Processed***
4. *Record a **Filter** action*
5. *Record a **Blend or Transfer** to add dosage*
6. *Record a **Bottle** action to add packaging and create finished wine*

***Additional compliance notes***

- *Set the tax class at any point that supports your reporting, but **before** the Bottle action.*
- *When changing tax class to **Sparkling - Bulk Processed** (**if** the lot is reported in Part 1, Line 1, Column A (On hand beginning of period, <16%):*

  - *Volume moves from Part 1, Line 1, Column a*
  - *To Part 1, Line 22, Column a (Used for effervescent wine) and*
  - *To Part 1, Line 2, Column e (BP) (Produced by fermentation)*
  - *Appears in the next period as Part 1, Line 1, Column e*

***Tips***

- *Add extra actions as needed for your process.*
- *Use **Tags** and **Notes** to document tank-specific steps.*

### Sparkling Wine Module Workflows-key2

![Sparkling Wine Module Workflows-diagram2](https://support.innovint.us/hs-fs/hubfs/Sparkling%20Wine%20Module%20Workflows-diagram2.webp?width=670&height=236&name=Sparkling%20Wine%20Module%20Workflows-diagram2.webp)

#### **Q. How do I record the Pét-Nat method?**

*A. We recommend using a simplified Traditional Method-style workflow with fewer steps for your Pét-Nat wines:*

1. *Mark the lot as "Sparkling" using the check box in the Lot details page.*
2. *Record a [**Bottle en Tirage**](https://support.innovint.us/hc/en-us/articles/360051230671-bottling-en-tirage-?hsLang=en) action into tirage bins.*
3. *Set the tax class to <16% and the stage to "En Tirage."*
4. *Update the tax class to Sparkling-Bottle Fermented*
5. *Depending on if you disgorge or not, decide to either record a **Bottle** action or [**Riddling**](https://support.innovint.us/hc/en-us/articles/360051383611-riddling-?hsLang=en) and [**Disgorge, Dosage & Package**](https://support.innovint.us/hc/en-us/articles/360051230691-disgorge-dosage-packaging-?hsLang=en) actions.*
6. *Utilize [Tags](//innovint-6865708.hs-sites.com/hc/en-us/articles/204503449-adding-editing-or-removing-tags?hsLang=en) or Notes to mark the lot using this method*

*ADDITIONAL NOTES:*

- *Set your tax class at any time that makes sense for your compliance reporting, but before recording the bottling/disgorge, dosage & packaging action. If the volume is reported in Part 1, Line 1, Column A (On hand beginning of period, <16%), when you change the tax class it will move to Part 1, Line 22, Column A (Used for effervescent wine, <16%) and Part I, Line 2, Column E - BF (Produced by fermentation). Once bottled, it will move to Part 1, Line 13, Column E.*
- *Be sure to add any additional actions or steps that you use in your Pét-Nat workflow and remember that you can utilize [Tags](//innovint-6865708.hs-sites.com/hc/en-us/articles/204503449-adding-editing-or-removing-tags?hsLang=en) and Notes to mark either the lot using this method.*

***Pétillant Naturalle (Pét-Nat) Sparkling Workflow Diagram***

### Sparkling Wine Module Workflows-pet nat key

![Sparkling Wine Module Workflows-pet nat diagram](https://support.innovint.us/hs-fs/hubfs/Sparkling%20Wine%20Module%20Workflows-pet%20nat%20diagram.webp?width=670&height=280&name=Sparkling%20Wine%20Module%20Workflows-pet%20nat%20diagram.webp)

#### **Q. How do I record forced carbonation?**

*A. We recommend the following workflow for your forced carbonation wines:*

1. 1. *Mark the lot as "Sparkling" using the check box in the Lot details page.*
   2. *Record a **Custom Action** and edit the title using the blue pencil to record the addition of CO2. Add any additional information to the note.*
      1. *Note - if you track compressed gases as additives, you could instead record an additive action to add your CO2.*
   3. *Record any relevant **Analysis***
   4. *Update the tax class to Artificially carbonated when you want to move the gallons from Part I, Section A column a (<16%) to column d (artificially carbonated wine) of the TTB report (be sure to do this before you record a **Bottle** action)*
   5. *Record a **Bottle** action when you are ready to move the gallons from Bulk wines in Part I, Section A to Bottled Wines in Part I, Section B of the TTB report*
   6. *Utilize [Tags](//innovint-6865708.hs-sites.com/hc/en-us/articles/204503449-adding-editing-or-removing-tags?hsLang=en) or Notes to mark the lot or using this method*
   7. *Additionally, record any other actions relevant to your workflow!*
