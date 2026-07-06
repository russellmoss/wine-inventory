---
title: "Appellation Roll-up"
url: "https://support.innovint.us/hc/en-us/appellation-roll-up"
category: "MAKE"
section: "Lots"
page_type: "page"
lastmod: "2026-03-17"
gist: "Appellation Roll-up (or \"AVA\" Roll-up) is a helpful feature for winemakers to confirm label compliance."
tags: ["vineyard", "blending", "compliance", "exports", "harvest", "ttb"]
---

# Appellation Roll-up

Appellation Roll-up (or "AVA" Roll-up) is a helpful feature for winemakers to confirm label compliance.

This article covers:

- [About Appellation Roll-up](#about)
- [A few boundaries on this feature](#boundaries)
- [Overlapping and crossover appellations](#overlap_crossover)
- [FAQ](#other)

### About Appellation Roll-up

In the US, for a wine to be labeled by an appellation, it must contain at least 85% of that appellation. Appellation Roll-up aggregates your lot composition across a variety of smaller but overlapping geographic groupings and allows winemakers to quickly answer questions similar to the following example:

How much of this wine is from…

- Alexander Valley (which is a California AVA entirely inside North Coast)
- North Coast (which is entirely inside California)
- California (maybe you don't need to worry about putting a smaller AVA on the label)
- … or some other important AVA that you need to confirm for your label

![Appellation Rollup](https://support.innovint.us/hs-fs/hubfs/Appellation%20Rollup.png?width=670&height=288&name=Appellation%20Rollup.png)

InnoVint displays appellation roll-ups within the Lot details (Composition tab) page and in [Blend Trials](https://support.innovint.us/hc/en-us/blend-trials?hsLang=en) (in your mock blend's calculated composition) and also allows you to export these composition percentages.

### A few boundaries on this feature

- Appellation Roll-up only supports the fruit source of Grape
  - If there are appellations from other fruit sources (Apple, Pear, Agriculture, Fruit), these appellations will not roll-up.
- We are starting with California, Oregon and Washington appellations only. Please reach out to us if you would like to see this feature within other regions.
- If you are using an unofficial (or incorrect) appellation, it will not roll up as expected. For example, Shenandoah Valley is an official AVA in Virginia but it is possible that some users may accidentally label their TTB recognized "California Shenandoah Valley" vineyard with the Shenandoah Valley appellation (from Virginia). A vineyard like this would not rollup into California. If you need to edit an incorrect appellation, you can learn how [here](https://support.innovint.us/hc/en-us/articles/360027033091-step-2-add-and-edit-vineyard-sources?hsLang=en#edit) (please note that any change made on a vineyard will reflect in all historic lot compositions including this vineyard).

💡 For a full list of roll-up appellations in InnoVint, and to visualize how the mapping works - you can see a list of the mapping in alphabetical order *or* by region via [this link](https://innovint.notion.site/InnoVint-s-Appellation-Roll-up-Mapping-1de6843dd3cc80afb097e4fc6f32edc6).

### Overlapping and crossover Appellations

- Each one of California's countries is an accepted appellation by the TTB.  For Appellation Roll-up, California counties will only roll up when the *entire* county exists in the AVA
  - Currently only two roll into anything other than California
    - San Mateo (SF Bay, Central Coast)
    - Sonoma County (North Coast)

- Some appellations overlap each other all or in part.  The [TTB website](https://www.ttb.gov/ava) provides a helpful map, and is great place to review these relationships, and Appellation Roll-up fully supports this complexity. New appellations have been added in InnoVint to fully support crossover roll-ups and match accepted TTB nomenclature.  For example - let's say your vineyard is in an appellation that partially overlaps multiple other appellations.
  - Here is the example of Bennett Valley - which is entirely within North Coast, reaches into Sonoma Mountain and partially overlaps both Sonoma Coast and Sonoma Valley in different areas.
    ![Appellation Roll-up_Bennet Valley](https://support.innovint.us/hs-fs/hubfs/Appellation%20Roll-up_Bennet%20Valley.png?width=670&height=436&name=Appellation%20Roll-up_Bennet%20Valley.png) Depending on where your vineyard is located, InnoVint now offers distinct options in order to support the required appellation roll-up for your AVA.
    ![Appellation Roll-up_Appellation breakdown](https://support.innovint.us/hs-fs/hubfs/Appellation%20Roll-up_Appellation%20breakdown.png?width=404&height=235&name=Appellation%20Roll-up_Appellation%20breakdown.png)
  - Does your Bennett Valley vineyard lie within Sonoma Valley? Update the vineyard appellation to Bennett Valley (Sonoma Vally) in order for the rollup feature to work as expected:
    ![Appellation Roll-up_Bennet Valley-sonoma valley compostition](https://support.innovint.us/hs-fs/hubfs/Appellation%20Roll-up_Bennet%20Valley-sonoma%20valley%20compostition.png?width=670&height=342&name=Appellation%20Roll-up_Bennet%20Valley-sonoma%20valley%20compostition.png)
  - Does your Bennett Valley vineyard lie within Sonoma Coast? Update the vineyard appellation Bennett Valley (Sonoma Coast):
    ![Appellation Roll-up_Bennet Valley-Sonoma Coast Composition](https://support.innovint.us/hs-fs/hubfs/Appellation%20Roll-up_Bennet%20Valley-Sonoma%20Coast%20Composition.png?width=670&height=345&name=Appellation%20Roll-up_Bennet%20Valley-Sonoma%20Coast%20Composition.png)

💡 For a full list of roll-up appellations in InnoVint, and to visualize how the mapping works - you can see a list of the mapping via alphabetical order or by region via [this link](https://innovint.notion.site/InnoVint-s-Appellation-Roll-up-Mapping-1de6843dd3cc80afb097e4fc6f32edc6).

### Other FAQ

**Q: My screen says I have 84.495% of Napa Cab in my wine, but my export says I have 84.50% - Why?**

*A: The export displays only two decimals per Excel's default settings. You may need to increase the number of displayed decimals in Excel in order to have the desktop screen match Excel.*

**Q: Why are my appellations in an unexpected order?**

*A: Rolled up appellations always display the highest percentages first. However, if percentages are equal, they will show in alphabetical order.*

**Q: Why is my composition showing a component of 0.016% "Other" now?**

*A: Any composition component less than 0.0001% will be totaled up as "Other", if you have many small components <0.0001%, then they may total more.  These are smooshed up into "Other" on the user interface, but if you would like to understand what comprises "Other" you will be able see every single component in the export.*
