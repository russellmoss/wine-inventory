---
title: "How to create a Fruit Lot"
url: "https://support.innovint.us/hc/en-us/articles/360005034292-how-to-create-a-fruit-lot-in-innovint"
category: "Harvest"
section: "Harvest Workflow & Fermentation Tracking"
page_type: "article"
lastmod: "2025-11-20"
gist: "Fruit lots in InnoVint are required to receive fruit during harvest and can also be used to track vineyard and maturity analytics."
tags: ["harvest", "vineyard", "fermentation", "lab", "corrections", "packaging"]
---

# How to create a Fruit Lot

Fruit lots in InnoVint are required to [receive fruit](https://support.innovint.us/hc/en-us/articles/360005125552-receive-fruit?hsLang=en) during harvest and can also be used to track vineyard and maturity analytics.

Depending on your vineyard allocations and how you sample and track your vineyard data, fruit lots can be representative of an entire block or multiple picks from the same block. A fruit lot will always need to be created when receiving fruit from a vineyard block.

To learn more about Fruit lots and how they differ from Juice/Wine lots in InnoVint, please see [this](https://support.innovint.us/hc/en-us/what-is-the-difference-between-a-fruit-lot-and-a-juice/wine-lot?hsLang=en) article.

### How to create a Fruit Lot

Creating fruit lots in InnoVint is very similar to creating juice and wine lots.

Go to the Lot Explorer in the left navigation bar. In the top right corner, click the "**+ Add Lot**" button. You are also able to add new fruit lots "in-line" within a Receive Fruit action.

![How to create a Fruit Lot-add](https://support.innovint.us/hs-fs/hubfs/How%20to%20create%20a%20Fruit%20Lot-add.webp?width=688&height=217&name=How%20to%20create%20a%20Fruit%20Lot-add.webp)

1. Select lot type: **Fruit lot**
2. Set the Fruit lot composition

   - *Percentage:* fruit lots are always 100% from a single vintage, vineyard and block.
   - *Vintage:* the vintage defaults to the current year.
   - *Vineyard:* choose your vineyard from the drop-down menu.
   - *Block/Varietal:* choose your block to set the varietal for your fruit lot.

**WARNING**: Be sure to double check the composition attributes before creating a new fruit lot. Once you begin to record analysis and activities on a lot, it is not possible to change the vintage, vineyard, or block/varietal. These compositional pieces will follow your wines from the fruit lot through to bottling. If you find that you have made a mistake after clicking on ![](https://support.innovint.us/hs-fs/hubfs/Knowledge%20Base%20Import/support.innovint.ushcarticle_attachments360006689611Add_new_fruit_lot_button.png?width=82&name=support.innovint.ushcarticle_attachments360006689611Add_new_fruit_lot_button.png), simply delete the lot and start over.

3. Set the Fruit Lot Attributes

When creating a new fruit lot either within an action or from the Fruit Lot Explorer, users must designate the properties of that lot.

- *Bond:* All Fruit Lots are affiliated to a bond. If your facility has more than one bond, select the bond that this fruit will fall under once received and processed. Wineries outside of the US will not see this field.

  Fruit Lots cannot be transferred via bond to bond movements. Lots can only be transferred across bonds once they are in a juice or declared wine tax class. Learn more about Bond to Bond transactions [here](https://support.innovint.us/hc/en-us/articles/360018542692-bond-to-bond-transfers?hsLang=en).
- *Lot Code:* Fruit lot codes are preceded with **FL**- to delineate fruit lots from juice/wine lots. InnoVint automatically generates a alpha-numerical code which you can choose to keep, or you can create a new code that is representative of the vineyard and block (the field is editable once a Vineyard and Block are selected):
  > ***Example**: FL-18ZN-PTV-A would be a fruit lot for the 2018 harvest, the varietal is Zinfandel from Primitivo Vineyard, Block A.* After the fruit is received, and when it is processed into a juice/wine lot, you will have the option to keep this code or create a new one for the juice/wine lot.
- *Lot Name* (optional): you can use the Lot Name to further distinguish your fruit lots or for easier reference.
  > ***Example**: Let's say you have two planned picks for Block A in Primitivo Vineyard - an early pick and a late pick. If you are tracking these as separate fruit lots, you may want to name one fruit lot "Early Pick Zin", and the other "Late Harvest Zin" (Note: they will still each have unique lot codes - e.g. FL-18ZN-PTV-A**E** and FL-18ZN-PTV-A**L**.)*
- *Lot Color (required):* ![How to create a Fruit Lot-fl color](https://support.innovint.us/hs-fs/hubfs/How%20to%20create%20a%20Fruit%20Lot-fl%20color.webp?width=165&height=138&name=How%20to%20create%20a%20Fruit%20Lot-fl%20color.webp)Select the lot color when creating a new fruit lot. You can designate a fruit lot as red, white, rosé or orange.

  If you need to update the Lot Color after lot creation,  you can go to the Lot Details page > More menu (top right) > Change lot properties in order to edit an existing lot.
- *Expected yield:* This rate determines the amount of volume you expect to end up with after the lot is processed to volume or drained and pressed (the lot's expected volume). For lots fermented and tracked in weight, this number is utilized in the additive calculator until the lot is drained and pressed.

InnoVint assumes a rate of 150 gal/ton (see metric default rates [here](https://support.innovint.us/hc/en-us/articles/115001094151-harvest-settings-receive-fruit-options-and-expected-yield-?hs_preview=uBXlWsio-42108947813&hsLang=en#metric)), unless you set variety specific yields in your [Harvest Settings.](https://support.innovint.us/hc/en-us/articles/115001094151-harvest-settings-receive-fruit-options-and-expected-yield-?hsLang=en) Or, you can enter a different desired yield here on the individual Fruit Lot. This expected yield will carry over into your juice/wine lot.

- *Tags (optional):*as with all other inventory items in InnoVint, you can use tags to track and filter for proprietary attributes as needed. Assign one or more tags to any Fruit Lot.
  [Tags](https://support.innovint.us/hc/en-us/articles/204503449-adding-editing-or-removing-tags?hsLang=en) are a great way to group your Fruit Lots and can be added or removed at any time after lot creation.
- *Owner:* If you have the [**Owner-based permissions system**](https://support.innovint.us/hc/en-us/articles/218236223-owner-based-permissions-and-member-capabilities-overview-article-?hsLang=en) activated in InnoVint, you can choose one or more owners for each fruit lot, set it to global, or leave no owners (admin only access).
  Wineries with Owner-based Permissions enabled *should* add owner tags to Fruit Lots and ensure that the correct owner tag is selected for the Fruit lot to ensure it is visible for the appropriate users.
