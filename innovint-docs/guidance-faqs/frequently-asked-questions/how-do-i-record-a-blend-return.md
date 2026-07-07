---
title: "How do I record a Blend & Return?"
url: "https://support.innovint.us/hc/en-us/how-do-i-record-a-blend-and-return"
category: "Guidance & FAQs"
section: "Frequently Asked Questions"
page_type: "page"
lastmod: "2025-11-20"
gist: "Blend and Return. We’re received a few requests to be able to blend multiple lots and then return the blend to the original vessels."
tags: ["blending", "barrels", "work-orders", "transfers", "lot-identity", "naming"]
---

# How do I record a Blend & Return?

Blend and Return. We’re received a few requests to be able to blend multiple lots and then return the blend to the original vessels. Unlike a Rack and Return, the compositional values of the new blend change which adds to the complexity of the action. Although we will look into developing a new Blend and Return action, or add the functionality to a current action in the system, for the time being we have a 3-step workaround that should help.

1. [Tag](//innovint-6865708.hs-sites.com/hc/en-us/articles/204503449-adding-editing-or-removing-tags?hsLang=en)all the vessels of your Blend lots with a unique tag (we typically use the new blend lot code).
2. Record a [Blend action](//innovint-6865708.hs-sites.com/hc/en-us/articles/204742525-how-to-record-a-blend-action?hsLang=en) or create a Blend task in a work order
3. Record a [Barrel Down action](//innovint-6865708.hs-sites.com/hc/en-us/articles/204777175-barrel-down?hsLang=en)or create another work order for the Barrel Down task.

Due to dependencies on empty vessels, the Blend task must be submitted before the Barrel Down can be submitted. This can be completed using [Individual Task Submit](https://support.innovint.us/hc/en-us/articles/360050001811-using-work-orders-in-innovint?hsLang=en#completingandsubmittingindividualtasksanadworkorde) on the same work order.

If you utilize multiple dependent work orders, we recommend using (1 of 2) and (2 of 2) notation in the work order title.

Because your vessels have already been tagged it should be easy to filter and sort for the specific tag when selecting the vessels to barrel down to. You can [remove the tags in bulk](https://support.innovint.us/hc/en-us/articles/204503449-adding-editing-or-removing-tags?hsLang=en) by going to Manage Vessels in the Vessel Explorer.
