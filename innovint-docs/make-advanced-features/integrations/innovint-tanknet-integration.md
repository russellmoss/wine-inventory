---
title: "InnoVint + TankNET Integration"
url: "https://support.innovint.us/hc/en-us/overview-tanknet-integration"
category: "MAKE: Advanced Features"
section: "Integrations"
page_type: "page"
lastmod: "2025-11-20"
gist: "When the TankNET integration with InnoVint is activated, InnoVint will pull data from your TankNET server(s) on a regular schedule and record as analysis in your account, saving you time and energy - especially during harvest!"
tags: ["integrations", "lab", "barrels", "ux-friction", "configuration", "cost"]
---

# InnoVint + TankNET Integration

When the TankNET integration with InnoVint is activated, InnoVint will pull data from your TankNET server(s) on a regular schedule and record as analysis in your account, saving you time and energy - especially during harvest!

#### This article covers:

- [Requirements](#requirements)
- [How it Works](#howitworks)
- [FAQ](#troubleshooting)

#### Requirements

1. Contact TankNET directly to verify that you have their ***Pro*** version enabled
2. InnoVint will need the name *and* email of an IT contact person at your winery. Our Development team will contact them directly to work out configuration with your TankNET server(s).

#### How it Works

The integration works by converting TankNET readings into InnoVint analysis on ***Individual Vessels*** when the following conditions are met:

**For Temperature:**

1. It has been >24 hours since InnoVint last recorded a reading for the tank (ensuring a minimum of one reading per day).
2. There is a 1+ degree difference from the last reading. *There is a limit on the number of readings that will be recorded: no more than one reading will be taken every 15 minutes.*

#### TankNET Integration-analysis

**For Brix:**

1. There is a new Brix reading

All analyses recorded via integration are *Performed by* Integrations InnoVint, with a *Source* of TankNET.

#### FAQ

**Q:** **I noticed that TankNET readings are no longer syncing to my account. What can I do?**

*A: We recommend the following:*

1. *Check that your server(s) is still online*
2. *Ensure that the vessel IDs of your TankNET enabled vessels still match between TankNET and InnoVint*
3. *Have your IT department contact support@innovint.us*

For pricing & information, please contact support@innovint.us
