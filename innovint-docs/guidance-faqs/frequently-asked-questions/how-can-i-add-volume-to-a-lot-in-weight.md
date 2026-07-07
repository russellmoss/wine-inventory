---
title: "How can I add volume to a lot in weight?"
url: "https://support.innovint.us/hc/en-us/how-can-i-combine-bleed"
category: "Guidance & FAQs"
section: "Frequently Asked Questions"
page_type: "page"
lastmod: "2026-01-15"
gist: "It is very common during harvest for our users to add volume (such as bleed or saignée juice) back into a different lot that is still in weight."
tags: ["transfers", "ux-friction", "harvest", "fermentation", "barrels", "inventory"]
---

# How can I add volume to a lot in weight?

It is very common during harvest for our users to add volume (such as bleed or saignée juice)  back into a different lot that is still in weight. Other users may use volume from an already fermenting juice lot to inoculate a lot in weight. There are many reasons that this may occur.  However, if you attempt to use a Transfer or Bleed/Saignée action to transfer volume into a lot in weight, you may see an error like this:

![How can I add volume to a lot in weight-caution](https://support.innovint.us/hs-fs/hubfs/How%20can%20I%20add%20volume%20to%20a%20lot%20in%20weight-caution.webp?width=627&height=114&name=How%20can%20I%20add%20volume%20to%20a%20lot%20in%20weight-caution.webp)

or this:

![How can I add volume to a lot in weight-error](https://support.innovint.us/hs-fs/hubfs/How%20can%20I%20add%20volume%20to%20a%20lot%20in%20weight-error.webp?width=379&height=110&name=How%20can%20I%20add%20volume%20to%20a%20lot%20in%20weight-error.webp)

You will need to use a specific action for this type of movement. Check out how to use the **Transfer Volume to Weigh**t action [here](https://support.innovint.us/hc/en-us/transfer-volume-to-weight?hsLang=en).

This action has a few requirements noted here.

- The weight on the fill lot will never change.
- Composition on the filled lot will update based on the amount of volume added compared to the expected volume in the lot prior to the action
- Expected yield (and expected volume) is calculated at the lot level and takes into account *all* vessels in a lot, even those not included in the action

In the event that the specific Transfer Volume to Weight action doesn't work for you, we have a few more workflows described below:

**1) Adjust the lot weight by an equivalent amount for the added volume**

If you are bleeding juice straight into a lot on skins, you can calculate an equivalent amount of weight for the volume, and complete a [weight transfer](https://support.innovint.us/hc/en-us/articles/360006664192-weight-transfer?hsLang=en) instead. Use a [custom action or task](https://support.innovint.us/hc/en-us/articles/204848455-using-a-custom-action-or-custom-task?hsLang=en) to record the actual date and volume of the bleed:

EX: If you are bleeding 100 gal of Lot X, with an estimated yield of 150 gal/ton, into Lot Y, complete a weight transfer for 0.67 tons of Lot X into Lot Y.

This will allow you to maintain composition, and would automatically adjust the yield of the lot on skins.

**2) Process and track both lots ahead of time in the same units (either volume or weight)**

If you are adding pressed juice or wine back to a lot in weight, consider whether you'd like both lots showing as either weight or volume in inventory and then choosing the Process Fruit action that best fits both lots. For instance, if you plan to do cap management on the blended lot, you might choose to leave everything in weight (including the pressed lot) and record a Custom Action to note the volume and date of pressing for the lot (or portion of the lot) that was pressed. Complete a weight transfer instead. You would then be able to use a "Drain and Press" action on the blended lot.

**3)  Track the added volume in a separate lot**

If you've already processed and bled lots, you can also keep the bleed in a "phantom" vessel with a similar lot code to the lot in tons (perhaps add a -VOLUME, or -BLEED suffix), and then blend them once they are both in volume.  Be sure you alter the [expected yield](https://support.innovint.us/hc/en-us/community/posts/360014610111-how-to-adjust-the-expected-yield-of-a-lot?hsLang=en) via the Lot Details page of the lot in weight so that the additions calculated by InnoVint are accurate.  You can use a Custom Action/Task to track the point in time where the bleed actually was added to the lot in tonnage, in the same way that you would complete water addition ([here is a link to those step-by-step instructions](https://support.innovint.us/hc/en-us/articles/115001418631-how-to-record-a-water-addition?hsLang=en)). Try using tags to track both lots and remind yourself to blend the lots in InnoVint.

**4) Don't track the additional volume**

If you are not concerned about tracking the added volume as an element of your lot composition, you can also consider simply completing a Custom Action or Task on involved lots to record or request the action without impacting yields, composition or volume.
