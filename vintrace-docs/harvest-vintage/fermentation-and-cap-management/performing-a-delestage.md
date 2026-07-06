---
id: "32301369218068"
title: "Performing a Delestage"
url: "https://support.vintrace.com/hc/en-us/articles/32301369218068-Performing-a-Delestage"
category: "Harvest/Vintage"
section: "Fermentation and Cap Management"
created_at: "2024-11-20T14:47:49Z"
updated_at: "2026-05-18T20:01:33Z"
labels: ["estate", "cap management", "ferment", "delestage"]
gist: "Delestage is the process of draining off a tank until the skins remain and aerating the juice in a second tank prior to pumping it back over the skins."
tags: ["transfers", "fermentation", "harvest", "work-orders", "barrels", "configuration"]
---

# Performing a Delestage

Delestage is the process of draining off a tank until the skins remain and aerating the juice in a second tank prior to pumping it back over the skins.

You can perform this process in vintrace using the **Rack and Return** operation, in combination with a **Product treatment** to signify that a delestage was performed.

To set this up, you’ll first need to [create the delestage treatment](#h_23ca689c-9a60-4dd9-8a8f-3cf5d149985c).

## Creating the Treatment

To create the delestage treatment:

1. Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32328585787284) Set Up in the sidebar.
2. Click Treatments.
3. From the Product Treatments tile, click Configure.
4. Click New Product Treatments.

![New_Product_Treatments_Button_20200402.png](https://support.vintrace.com/hc/article_attachments/32328575391124)

5. Specify the details for the treatment. When creating the new delestage **Product treatment**, be sure to:

- Indicate the treatment applies to 'Wine/Juice' by ticking this checkbox in the *Applies to* field.
- Enter a useful description for the treatment in the *Description* field.
- Optionally, enter additional details or instructions in the *Technique/Procedure* Information field.

![Product_Treatment_Definition_-_Create_-_Delestage_20200421.png](https://support.vintrace.com/hc/article_attachments/32328585758100)

## Performing a Delestage

You can perform the delestage by starting a **Rack and Return** operation. You can do this from any of the following:

- The Operations menu on the Product page
- The Operations menu on the Job Management console.
- A work order.

In the Transfer Details, be sure to set *Treatment* to Delestage, and select your temporary vessel. In a rack and return, the destination tank is used as a temporary vessel and wine is immediately returned to the original tank.

![Racking_-_General_-_Treatment_Delestage_20200421.png](https://support.vintrace.com/hc/article_attachments/32328588675220)

During this process, the Delestage treatment will also be applied to the wine.

After the rack and return has been completed with the delestage treatment, the delestage displays in the history of the wine.

If you included any Treatment/Procedure Information when you created the delestage treatment, those details display on the printed work order along with any details you want to convey to your cellar staff.

![workorder.png](https://support.vintrace.com/hc/article_attachments/32328575368468)
