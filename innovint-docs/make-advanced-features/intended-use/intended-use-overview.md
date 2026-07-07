---
title: "Intended Use Overview"
url: "https://support.innovint.us/hc/en-us/intended-use-overview"
category: "MAKE: Advanced Features"
section: "Intended Use"
page_type: "page"
lastmod: "2025-11-20"
gist: "Intended Use is currently a \"beta\" feature, available to selected subscription levels."
tags: ["getting-started", "exports", "packaging", "permissions", "transfers", "bond"]
---

# Intended Use Overview

Intended Use is currently a "beta" feature, available to selected subscription levels.  Have feedback or encounter an issue? Let us know at [support@innovint.us](mailto:support@innovint.us) !

Intended Use allows you to plan allocations for specific wine programs across all InnoVint wineries in your organization (an organization is a group of wineries - this may be one or many).

This article contains

- [Getting Started with Intended Use](#getting-started)
- [Updating Intended Use Allocations](#update_lot)
- [Updating Intended Use via actions](#update_action)

### Getting Started with Intended Use

#### Things to know

- Programs are available across a user’s organization: any program created within the organization is available to all users in that organization
- Wine lots are available to allocate per a user's individual access permissions - if a user does not normally have permissions to access a wine, they will not be able to allocate Intended Use to it.

#### Getting Started

- View the summary of programs and add new programs in Intended Use Explorer
- You can edit target volumes, the Intended Use program name, add notes, or archive  programs in the Intended Use details page:
  ![Intended Use - Program details](https://support.innovint.us/hs-fs/hubfs/Intended%20Use%20-%20Program%20details.png?width=688&height=324&name=Intended%20Use%20-%20Program%20details.png)
- More details are visible in the Intended Use details card
  - See over and under lot allocations within a program
  - Export allocated lots to csv file
  - Save notes
  - View relevant drain transactions (Bottling or B2B Transfer Out actions) that impact your targeted volume in the "Bottled" and "Transfered out of Bond" widgets.
    ![Intended Use - details over-under](https://support.innovint.us/hs-fs/hubfs/Intended%20Use%20-%20details%20over-under.png?width=688&height=309&name=Intended%20Use%20-%20details%20over-under.png)
- Check out the video version here!

### Updating Intended Use Allocations

- Add, edit or remove intended use gallons for a specific lot within the attributes panel of your Lot Details page.
  ![Intended Use - allocate](https://support.innovint.us/hs-fs/hubfs/Intended%20Use%20-%20allocate.png?width=688&height=391&name=Intended%20Use%20-%20allocate.png)

  - You can allocate an entire lot (all possible volume will be attributed towards the target program, and update as the lot volume changes over time):
    ![Intended Use - Add allocation all](https://support.innovint.us/hs-fs/hubfs/Intended%20Use%20-%20Add%20allocation%20all.png?width=450&height=288&name=Intended%20Use%20-%20Add%20allocation%20all.png)
  - You can allocate a portion of a lot to one or multiple Intended use programs
    ![Intended Use - Add allocation partial](https://support.innovint.us/hs-fs/hubfs/Intended%20Use%20-%20Add%20allocation%20partial.png?width=450&height=413&name=Intended%20Use%20-%20Add%20allocation%20partial.png)
- Intended Use tags will display in Lot Explorer and are available as filters in many reports,  including costing reports.
  ![Intended Use - Lot Explorer filter](https://support.innovint.us/hs-fs/hubfs/Intended%20Use%20-%20Lot%20Explorer%20filter.png?width=688&height=163&name=Intended%20Use%20-%20Lot%20Explorer%20filter.png)

### Updating Intended Use via actions

- "ALL" Allocation: If an entire lot is allocated to a single IU program, the allocation will automatically transfer to the fill lot(s) (as "ALL") where the filled lots are empty. The drained lot's allocation will not override an existing allocation on a lot.
- Partial or Multiple Allocations: When a lot has multiple allocations or only a portion is allocated, the user must manually specify the resulting amounts after the movement occurs.
- Allocations may be specified for lots via work order at work order creation for Transfer, Filter, Rack, Barrel Down and Top Off tasks. The "All" allocation may not be updated on a fill lot with the same lot code as the drained lot on the action.
  ![Intended Use - allocate on work order](https://support.innovint.us/hs-fs/hubfs/Intended%20Use%20-%20allocate%20on%20work%20order.png?width=688&height=343&name=Intended%20Use%20-%20allocate%20on%20work%20order.png)
