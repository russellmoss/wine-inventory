---
title: "InnoVint + Onafis Integration"
url: "https://support.innovint.us/hc/en-us/innovint-onafis-integration"
category: "MAKE: Advanced Features"
section: "Integrations"
page_type: "page"
lastmod: "2026-05-20"
gist: "Onafis and InnoVint have partnered to enable two-way data synchronization between your InnoVint winery account and your Onafis densimeters."
tags: ["integrations", "barrels", "configuration", "permissions", "ux-friction", "corrections"]
---

# InnoVint + Onafis Integration

Onafis and InnoVint have partnered to enable two-way data synchronization between your InnoVint winery account and your Onafis densimeters. With this integration, your **Onafis Densios densimeters** can capture real-time **temperature** and **density** data during fermentation and automatically write those readings back to InnoVint as **analysis results** — mapped to the correct lots and vessels.

This article walks you through how to enable, configure, and use the integration.

- [Requirements](#requirements)
- [Getting Started](#Get-started)
- [Synchronize lots and vessels](#sync)
- [Start recording density and temperature data](#record)
- [How data synchronization works](#How)
- [Troubleshooting & FAQ](#faq)

### Requirements

- An active InnoVint account
- An active Onafis account with a cellar set up for the same InnoVint winery account
- At least one Onafis Densios densimeter assigned to the cellar in Onafis
- Admin permissions on both platforms (or a colleague who has them) to configure the connection

### Getting started

Before you connect the two systems, make sure each system is set up correctly.

#### **On the InnoVint side**

- **Winery setup:** ensure that each Onafis cellar maps to a single InnoVint winery instance
- **Lots and vessels:** Ensure that your wine lots and vessels (tanks) are set up according to how your winery operates - this ensures that you can map each device to the proper lot/vessel
- **Access management:**
  - Make sure the user account(s) that will manage the integration has Admin permissions in InnoVint
  - An Onafis Integration user will need to be added as a Team Member for your InnoVint account. The user name and email will be confirmed by Onafis and InnoVint Support.

#### **On the Onafis side**

- **Cellar setup:** Confirm a cellar exists in Onafis for the same InnoVint winery
- **Access management:** Create user accounts and assign them to the correct cellar.  The user setting up the integration must be an admin in Onafis

#### **Connecting the two platforms**

After confirming that both platforms are setup, reach out to support@innovint.us.  We will confirm your winery ID and request the connection from the Onafis team.

The Onafis team will activate the connection.

### **Sync your lots and vessels**

Once the connection is active, your wine lots and vessels need to be synchronized from InnoVint into Onafis. This is what allows incoming sensor data in the vessels to be mapped to the correct lot and vessel and record the analysis result.

You can trigger this sync yourself in Onafis, or ask the Onafis support team to do it for you.

#### How to sync

1. Log in to **Onafis** and open the InnoVint Integration workspace.
   ![Onafis_sync 1](https://support.innovint.us/hs-fs/hubfs/Onafis_sync%201.png?width=670&height=496&name=Onafis_sync%201.png)
2. In the left sidebar, go to **Cellar → Batch** (for lots) or **Tanks** (for vessels) to synch each one
   ![Onafis_Synch2-1](https://support.innovint.us/hs-fs/hubfs/Onafis_Synch2-1.png?width=670&height=475&name=Onafis_Synch2-1.png)
3. Select batches, then click **Synchronize with InnoVint** at the top of the page.
4. In the confirmation pop-up, click **Confirm** to create or update your batches (lots) in Onafis.
   ![](https://support.innovint.us/hs-fs/hubfs/image-png-May-14-2026-04-34-33-8806-PM.png?width=670&height=504&name=image-png-May-14-2026-04-34-33-8806-PM.png)
5. Review the**synchronization** results screen. You'll see counts of batches created, modified, and any errors.
   ![](https://support.innovint.us/hs-fs/hubfs/image-png-May-14-2026-04-35-06-2581-PM.png?width=670&height=502&name=image-png-May-14-2026-04-35-06-2581-PM.png)
6. Repeat steps 3-5 to synchronize tanks.

**Tip — If you see errors in the sync results**

Some batches may not sync if there's a data compatibility issue between InnoVint and Onafis. If you see batches under the **Errors** tab, contact your Onafis representative for help reconciling them.

### **Start recording density and temperature data**

With the integration active and your assets synced, you're ready to start collecting fermentation data with your Densios densimeters!

#### Link Densios densimeters for data acquisition

In Onafis, go to **Devices → Modules**. This page lists all of the densimeters currently active and available to be assigned to your vessels. Make sure the Densios you plan to use show up here before continuing.

![](https://support.innovint.us/hs-fs/hubfs/image-png-May-14-2026-04-41-39-4525-PM.png?width=670&height=483&name=image-png-May-14-2026-04-41-39-4525-PM.png)

The Devices → Modules page lists every densimeter available for assignment.

#### Create a new acquisition

An "acquisition" is what links a specific Densios probe to a specific lot and vessel during fermentation. Starting an acquisition is what turns on the data feed back to InnoVint.

1. In Onafis, go to **Acquisitions → Running** to see all active data streams.
2. Click **+ Create** in the top right to create an start a new acquisition.
   ![](https://support.innovint.us/hs-fs/hubfs/image-png-May-14-2026-04-45-26-6241-PM.png?width=660&height=491&name=image-png-May-14-2026-04-45-26-6241-PM.png)
3. Fill out the form
   **Probe to use for the acquisition:** Select the Densios densimeter you want to use.
   **Title**: A short label for this acquisition (e.g., the lot name).
   **Associated batch:** Pick the lot that was synced from InnoVint.
   **Container**: Pick the vessel (tank) that was synced from InnoVint.
   ![](https://support.innovint.us/hs-fs/hubfs/image-png-May-14-2026-04-46-53-5079-PM.png?width=652&height=486&name=image-png-May-14-2026-04-46-53-5079-PM.png)
4. Click **Create** to start the acquisition.

Only batches and tanks that were synchronized from InnoVint will appear in the dropdowns. If you don't see your lot or tank, re-run the sync first.

#### See the data flow into InnoVint

Once the Densios is running, Onafis will automatically push readings back to InnoVint.

![](https://support.innovint.us/hs-fs/hubfs/image-png-May-14-2026-04-48-29-3382-PM.png?width=636&height=480&name=image-png-May-14-2026-04-48-29-3382-PM.png)

In **InnoVint**, open the lot and click the **Analysis** tab. Onafis-generated readings appear with the recorded date, density (g/cm³), and temperature (°C or °F, depending on your settings), as Individual Vessel analysis results.

![](https://support.innovint.us/hubfs/image-png-May-14-2026-04-48-51-8976-PM.png)

#### Managing acquisition data

 it is up to you to start and stop the fermentation acquisition via your Onafis account.

**Example:**  Tank A is filled with Lot A for fermentation.

**In InnoVint**

1. You fill the vessel with the lot.

**In Onafis**

1. You start the Densios acquisition for the Vessel & Lot. If you cannot find them in the form, a manual synchronization may be required.
2. Once fermentation is finished, you must stop the acquisition.

**In InnoVint**

1. The vessel is emptied after fermentation

This cycle can then be repeated for a new lot in the same tank.

### **How data synchronization works**

Onafis doesn't push every single reading. Instead, it sends results when the one of the following conditions is met:

- There is a significant change in analysis (*there is a limit on the number of readings that will be recorded: no more than one reading will be taken every 15 minutes).*
  - Temperature: change of at least 1 °F (0.5 °C), or
  - Density: change of at least 0.5 °Brix.

- It has been >12 hours since InnoVint last recorded a reading for the tank (ensuring a minimum of two readings per day).

**Why this matters?** This filtering is what prevents your InnoVint Analysis tab from being flooded with thousands of near-identical readings. If you don't see a brand-new entry every few minutes in InnoVint, that's expected — Onafis is still receiving the data, but only writes back meaningful changes.

A note on units.  No, brix not a typo - the measurement used to calculation the result variance threshold is brix.   The densimeter (Densios) collects density in kg/m³. Onafis performs a conversion to check the result variance and then sends the density result back to InnoVint with the appropriate unit based on your account's density units.

### **Troubleshooting & FAQ**

**Q: I don't see my InnoVint lot or tank in Onafis.**

***A:** Lots and vessels only appear in Onafis after a sync. Go to Cellar → Batch (or Tanks) in Onafis and click Synchronize with InnoVint. If the asset still doesn't appear, confirm it exists in your InnoVint winery and that your InnoVint Winery ID is correctly entered in Onafis.*

**Q: Why isn't my** **integration activated in Onafis?**

*A: The connection is activated by the Onafis Technical Team after they receive your InnoVint Winery ID (format wnry\_xxx) from InnoVint's Support team. Contact Onafis at [equipe-tech@onafis.com](mailto:equipe-tech@onafis.com) or Innovint at [support@innovint.us](mailto:support@innovint.us) if you have any questions.*

**Q: I synced, but some batches show under "Errors"**

*A: This usually points to a data compatibility issue between InnoVint and Onafis (for example, a missing required field on the lot). Contact your Onafis representative with the list of failed batches and they will help reconcile them.*

**Q: Why aren't all my Densios readings showing up in InnoVint?**

*A: By design. Onafis applies limits (see "[How data synchronization works](#How)" above) so only meaningful analysis changes are written to your InnoVint lot. The raw data stream is still available in Onafis.*

**Q: Where do Onafis readings show up in InnoVint?**

*A: Open the lot details page in InnoVint and click the Analysis tab. Density and temperature entries created by Onafis will be tagged with the matching vessel.*

**Q: Can I start an acquisition before I run the sync?**

*A: No. You need to pick the lot and the vessel when you create an acquisition, and those only appear in Onafis after they've been synced from InnoVint.*

### **Where to get help**

If you run into trouble at any step, please reach out!

- **InnoVint Support:** Contact your InnoVint Customer Success Manager, or visit [support@innovint.us.](mailto:support@innovint.us)
- **Onafis General Support:** [contact@onafis.com](mailto:contact@onafis.com) · +33 2 52 88 00 07.
