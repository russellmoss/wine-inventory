---
title: "How to create a Bill of Lading (BOL) in SUPPLY"
url: "https://support.innovint.us/hc/en-us/how-to-create-a-bill-of-lading-bol-in-supply"
category: "SUPPLY"
section: "Using SUPPLY"
page_type: "page"
lastmod: "2026-04-22"
gist: "Create and print a Bill of Lading document from within SUPPLY using your SKU inventory data and information tracked within the platform."
tags: ["dtc-sales", "exports", "inventory", "reporting", "packaging", "ttb"]
---

# How to create a Bill of Lading (BOL) in SUPPLY

Create and print a Bill of Lading document from within SUPPLY using your SKU inventory data and information tracked within the platform. This article includes:

- [About Bill of Lading feature in SUPPLY](#about)
- [How to generate a BOL in SUPPLY](#how)
  - [From the Reporting page](#reporting)
  - [From a submitted Move or Deplete inventory action](#submitted-action)
  - [From an open depletion](#open-depletion)
- [BOL Details & Information](#details)
- [Frequently Asked Questions](https://claude.ai/local_sessions/local_d90ccdca-dfc2-4317-bebb-02a95e1c2d40#faq)

### About BOLs in SUPPLY

In SUPPLY, Bills of Lading can be created from the following locations:

1. The **Reporting** page (generate a standalone BOL, not tied to an action)
2. A submitted **Move inventory** or **Deplete inventory** action (pre-populates the BOL with the inventory information from the action)
3. An **open depletion** (pre-populates the BOL with the inventory information from the open depletion)

Upon creation, the BOL pdf is generated and downloaded directly to your computer.

🚨 **InnoVint does NOT save a copy of the generated BOL.** It is InnoVint's recommendation that users print copies as needed, as well as save a digital version to their computer or cloud storage solution for reference later.

### How to generate a BOL in SUPPLY

#### From the Reporting page

*Use this option to create a standalone BOL that isn't tied to an existing action or depletion.*

1. Click the **Reporting** icon in the left-hand navigation.
2. Below the **5120.17 Report Download** section, locate the **Create Bill of Lading** section.
3. Click the blue **Create bill of lading** button.
4. The **Create Bill of Lading** slideover will open on top of the Reporting page. All fields will begin blank — fill them in as needed. More information on the available fields is [below](https://claude.ai/local_sessions/local_d90ccdca-dfc2-4317-bebb-02a95e1c2d40#details).
5. When all required information is entered, click **Create Bill of Lading** at the bottom of the slideover. The pdf will be generated and downloaded to your computer.

![SUPPLY-BOL slideover](https://support.innovint.us/hs-fs/hubfs/SUPPLY-BOL%20slideover.png?width=670&height=393&name=SUPPLY-BOL%20slideover.png)

#### From a submitted Move or Deplete inventory action

*Use this option to create a BOL that's pre-populated with the inventory information from a completed action.*

1. Navigate to the submitted **Move inventory** or **Deplete inventory** action (via the Lot History, Action History Feed, or directly from the action details page).
2. Click the **Create bill of lading** button located to the left of the **Edit action** button.
3. The **Create Bill of Lading** slideover will open and auto-populate with the SKU, description, volume, format, tax class, and quantity from the action.
4. Review, edit, or add any additional details as needed (shipping addresses, weights, pallets, notes, etc.).
5. Click **Create Bill of Lading** to generate and download the pdf.

![SUPPLY-BOL-movement](https://support.innovint.us/hs-fs/hubfs/SUPPLY-BOL-movement.png?width=670&height=219&name=SUPPLY-BOL-movement.png)

📌 **NOTE:** The action/open depletion may contain multiple inventory line items that share the same SKU. On the BOL, line items sharing the same SKU are combined into a single SKU entry, and the quantities are summed together. The BOL will display all SKUs involved in the action.

#### From an open depletion

*Use this option to create a BOL from an in-progress depletion before it is submitted.*

1. Navigate to the saved **open depletion**.
2. Click the **Create bill of lading** button located to the left of the **Delete open depletion** button.
3. The **Create Bill of Lading** slideover will open and auto-populate with the inventory information from the open depletion.
4. Complete any remaining details, then click **Create Bill of Lading** to generate and download the pdf.

![SUPPLY-BOL_open depletion](https://support.innovint.us/hs-fs/hubfs/SUPPLY-BOL_open%20depletion.png?width=670&height=339&name=SUPPLY-BOL_open%20depletion.png)

### BOL Details & Information

SUPPLY will auto-populate BOL details with any known information associated with the selected action or open depletion. All details within a BOL can be removed or changed as needed before generating the pdf.

#### Shipping/Freight Information

- **Shipping date** — *Required.* Defaults to the current date. Use the date picker to select any past or future date. Displays in MM/DD/YY format.
- **Freight class** — *Optional.* Free text entry. Defaults to blank.
- **BOL #** — *Optional.* Free text entry. Defaults to blank. SUPPLY does not automatically generate BOL numbers — enter your own before downloading.
- **Shipping from** — *All fields optional and blank by default.*
  - Location name, c/o, Registry number, Street address (2 lines), City, State/Territory, Zip/Postal code, Country
- **Shipped to** — *All fields optional and blank by default.*
  - Customer, c/o, Registry number, Street address (2 lines), City, State/Territory, Zip/Postal code, Country

#### Inventory Information

Each BOL can contain one or more SKU (an action with multiple inventory lines from the same SKU will roll up into one SKU entry). Each SKU has its own set of fields.

- **SKU code** — *Required.* Click **Select SKU** to open the SKU picker and choose one SKU.  Archived SKUs do not appear in the dropdown list, but if you specifically select an archived SKU from the picker, its data will populate on the BOL. Use the +Add SKU button to add and then select additional SKUs. SKUs will be populated automatically from submitted actions or open depletions.
- **Description** — *Optional.* When a SKU is selected, this populates as "SKU code - SKU name" and becomes an editable open text field.
- **Volume** — Not editable. Auto-calculates from SKU volume × quantity. Displays in gallons.
- **Format** — Not editable. Determined by the selected SKU.
- **Class/Type** — *Required.* Editable, open text field. Defaults to *Grape wine*. .
- **Contains sulfites** — Yes/No. Defaults to *Yes*.
- **Taxpaid** — Yes/No. Defaults to *Yes*.
- **Tax class** — Not editable. Determined by the selected SKU.
- **Quantity** — Editable fields. If the BOL is generated from a submitted action or open depletion, the quantity on the action will populate automatically.
- **Total inventory weight** — *Required.* Numerical entry. Defaults to 0.
- **Include pallets** — Yes/No. Defaults to *Yes*. When set to *Yes*, the following fields display:
  - **Number of pallets** — Numerical entry. Defaults to blank.
  - **Pallet weight (ea.)** — Numerical entry. Defaults to blank.
  - **Pallets total weight** — Not editable. Auto-calculates as number of pallets × pallet weight. Defaults to 0 lbs.
- **Total weight** — Not editable. Auto-calculates as the sum of total inventory weight and pallets total weight. Defaults to 0 lbs.
- **SKU note** — *Optional.* Free text entry.

#### Adding and removing SKUs

- **Add SKU** — To include multiple SKUs on a single BOL, click the **Add SKU** button to the right of the *Inventory Information* header. A new set of SKU fields will appear beneath the existing SKU(s) with the default values.
- **Remove SKU** — When more than one SKU is listed on the BOL, a **Remove** icon appears on the far right of each SKU header. Click the icon to permanently remove that SKU from the BOL.

#### BOL note

- **BOL note** — *Optional.* A free text field for any other details you'd like printed on the BOL.

![SUPPLY-BOL_inventory details](https://support.innovint.us/hs-fs/hubfs/SUPPLY-BOL_inventory%20details.png?width=670&height=516&name=SUPPLY-BOL_inventory%20details.png)

**🚨 NOTE:** If you click the **X** in the top-right corner of the slideover before generating the BOL, the slideover will close and **all data entered will be lost.** *Always* generate and save your BOL before closing.

### FAQ

**Q: Does SUPPLY save a copy of my BOL?**

*A: No. SUPPLY does not store generated BOLs. The pdf is downloaded directly to your computer when you click **Create Bill of Lading** — be sure to save and/or print the document for your records.*

**Q: Can I include multiple SKUs on a single BOL?**

*A: Yes. Use the **Add SKU** button to the right of the Inventory Information header to add additional SKU entries. Each added SKU will have its own set of fields to complete.*

**Q: Can I create a BOL for an archived SKU?**

*A: Yes. Archived SKUs do not appear in the SKU dropdown list, but you can select them directly from the SKU picker. Once selected, the archived SKU's data will populate the BOL as expected.*

**Q: What happens if my action or open depletion contains multiple inventory line items with the same SKU?**

*A: Line items sharing the same SKU are combined into a single SKU entry on the BOL, and their quantities are summed together.*

**Q: Can I edit the auto-populated fields on a BOL created from an action or depletion?**

*A: Yes. All editable fields can be updated before you generate the pdf. Non-editable fields (Volume, Format, Tax class, Pallets total weight, Total weight) are auto-calculated or determined by the selected SKU.*

---

If you have any questions, please [submit a ticket](https://support.innovint.us/hc/en-us/kb-tickets/new?hsLang=en) or email InnoVint Customer Success at [support@innovint.us](mailto:support@innovint.us). We're here to help!
