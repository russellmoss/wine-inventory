---
title: "Blending Across Tax Classes"
url: "https://support.innovint.us/hc/en-us/articles/208245003-blending-across-tax-classes"
category: "Guidance & FAQs"
section: "Frequently Asked Questions"
page_type: "article"
lastmod: "2025-12-29"
gist: "InnoVint's system allows you to blend across different tax classes."
tags: ["blending", "tax-class", "barrels", "transfers", "ttb", "reporting"]
---

# Blending Across Tax Classes

InnoVint's system allows you to blend across different tax classes. Recorded properly, the system will record the change in tax classes in accordance with the TTB 5120.17 reporting requirements.

We often help clients correct unwanted use of Lines 5 (Produced by Blending) and 20 (Used for Blending) - find some help for diagnosing those common issues [here](/hc/en-us/ttb-101#FAQ).

When you **intentionally blend across tax classes**, then it is important to follow a few guidelines to ensure that these lines populate as expected. Read on for more information:

The best workflow when blending across declared tax classes is to use a Blend action - do not use a Rack or Transfer action.

When you are blending *into* an existing lot and vessel with contents, we recommend that:

- You blend all components from all tax classes into an empty "dummy/phantom" vessel without recording any gains or losses on the blend action
- You may blend into the desired existing lot code
- Put the total volume together into your destination lot/vessel
  - Gains or losses on this action will not be reported on the TTB 5120.17
- Following the blend, complete a dummy transfer back into the original vessel
  - Record any gains or losses on this action
  - You may also consider Volume Adjustments to record gains and losses on individual lots as required

**It’s important to draw from all involved lots, and not just transfer one into the other.**

For example:

If you follow this guidance and blend 59 gallons of 16-21% wine and 1165 gallons of <16% wine into a third vessel, the report populates as expected.

![](https://support.innovint.us/hs-fs/hubfs/image-png-Oct-19-2023-07-04-17-4194-PM.png?width=500&height=530&name=image-png-Oct-19-2023-07-04-17-4194-PM.png)

However,  if you transfer or blend 59 gallons of 16-21% wine *into* 1165 gallons of an existing <16% lot, then the volume "produced by blending" will only report as the additional volume blended into the existing lot.

![](https://support.innovint.us/hs-fs/hubfs/image-png-Oct-19-2023-07-10-07-7377-PM.png?width=500&height=539&name=image-png-Oct-19-2023-07-10-07-7377-PM.png)

**Gains and Losses on this action will not be reported in either case.** We always recommend taking gains/losses via a subsequent volume adjustment or transfer action (if needed) to ensure these volumes populate in your desired tax class.

If you are blending undeclared juice or material into declared wine, please see this [article](https://support.innovint.us/hc/en-us/articles/360018226292-fortification-sweetening-and-amelioration?hsLang=en) for methods of distilled spirits into declared wine, and [this article](https://support.innovint.us/hc/en-us/sweetening?hsLang=en) for sweetening processes (adding concentrate, sugar or sweetening juice).  Please note that using a Blend action for this type of addition will cause a Blend across tax class on the TTB Report (populating Lines 5 and 20) for the volume of declared wine while removing volume from Parts IV or III.
