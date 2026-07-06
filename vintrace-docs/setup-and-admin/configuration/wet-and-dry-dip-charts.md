---
id: "32301297422612"
title: "Wet and Dry Dip Charts"
url: "https://support.vintrace.com/hc/en-us/articles/32301297422612-Wet-and-Dry-Dip-Charts"
category: "Setup and Admin"
section: "Configuration"
created_at: "2024-11-20T14:46:05Z"
updated_at: "2026-04-12T23:30:14Z"
labels: ["dip table", "dips", "wet dip"]
gist: "vintrace allows you to specify two dip charts for a tank."
tags: ["configuration", "lab", "transfers", "additives", "exports", "inventory"]
---

# Wet and Dry Dip Charts

vintrace allows you to specify two dip charts for a tank. This makes it possible to specify a dip chart for both dry and wet measurement types. You can set a [system default dip type](#h_01K3FS26SFEDRS730DRP4TGG8E) to use, and also [change the dip type currently in use](#h_01K3FQDSV3QB944HCJYQ4DXPF2) during an operation if required.

![Tank Dry and Wet Dip 20240430.png](https://support.vintrace.com/hc/article_attachments/32329210395412)

The measurement type when you [export, import](https://support.vintrace.com/hc/en-us/articles/32301385548308-Setting-Up-a-Tank-s-Dip-Chart), or [copy dips](https://support.vintrace.com/hc/en-us/articles/32301323575956-Copying-a-Tank-s-Dip-Chart) will be based on the button that you click in the Tank window. That is, clicking the Edit/Import button beside the Dry Dips field sets the measurement type to Dry; clicking the button beside the Wet Dips field sets the measurement type to Wet.

## Setting a default dip type

When both the Dry Dips and Wet Dips are setup, you’ll also be able to specify the tank’s default measurement type by selecting it from the Default Dip Table list. If there is only one type setup, the default will automatically be set to this type.

The default dip table will be used on all movement operations where there are dips. Specifically:

- Additive
- Bulk Dispatch
- Bulk Dispatch (inter-winery)
- Bulk Intake
- Measurement
- Multi-additions
- Packaging
- Bin transfer
- Tirage
- Tirage admin
- Multi-Topping
- Multi-transfer (many-to-one)
- Multi-transfer (one-to-many)
- Transfer/Rack/Blend
- Extraction
- Press Cycle

These operations will indicate the measurement type (wet or dry) and provide access to edit the dip chart if required. The measurement type will also be included on printed work orders.

## Changing dip types during an Operation

If required, you can alternate between the wet and dry dip of a vessel during the course of an Operation. To do this, look for the dip type indicator in the vessel info to confirm which dip type is currently in use. If you wish to change it, click the pencil icon next to the tank name in the Vessel field.

![Screenshot 2025-11-25 at 1.52.30 pm.png](https://support.vintrace.com/hc/article_attachments/48158120029076)

The Tank page appears and you can change the default dip table.

![Screenshot 2025-11-25 at 1.52.57 pm.png](https://support.vintrace.com/hc/article_attachments/48158099753620)

Confirm that the dip indicator is showing your preferred dip type before proceeding.

Note that this changes the global default for the vessel in your vintrace database.

![Screenshot 2025-11-25 at 1.53.11 pm.png](https://support.vintrace.com/hc/article_attachments/48158099756180)
