---
title: "InnoVint + VinWizard Integration"
url: "https://support.innovint.us/hc/en-us/overview-vinwizard-integration"
category: "MAKE: Advanced Features"
section: "Integrations"
page_type: "page"
lastmod: "2025-11-20"
gist: "If you have mapped all your vessels, and see the Failure Reason \"Vessel not assigned to any lot,\" that just means your tanks are empty in InnoVint."
tags: ["integrations", "configuration", "lot-identity", "work-orders", "naming", "barrels"]
---

# InnoVint + VinWizard Integration

#### This article covers:

- [Requirements](#requirements)
- [How it works](#How)
- [FAQ](#FAQ)

#### Requirements

1. Contact VinWizard to verify subscription and integration capabilities.
2. Reach out to [support@innovint.us](mailto:support@innovint.us) to get set up in InnoVint

#### How it works

1. Any admin will be able to access and adjust VinWizard configuration in InnoVint Settings.
   ![VinWizard Integration-how it works](https://support.innovint.us/hs-fs/hubfs/VinWizard%20Integration-how%20it%20works.webp?width=688&height=327&name=VinWizard%20Integration-how%20it%20works.webp)
2. Click on "Configure integration." Here, on the Configuration tab, you can "map" InnoVint vessel codes to the VinWizard tank code.
   ![VinWizard Integration-configuration](https://support.innovint.us/hs-fs/hubfs/VinWizard%20Integration-configuration.webp?width=688&height=176&name=VinWizard%20Integration-configuration.webp)
3. After selecting the InnoVint and VinWizard vessel codes, choose the type of InnoVint data to link to VinWizard data: you may choose **lot stage** or **lot tags**.
   ![VinWizard Integration-lot stage tags](https://support.innovint.us/hs-fs/hubfs/VinWizard%20Integration-lot%20stage%20tags.webp?width=688&height=339&name=VinWizard%20Integration-lot%20stage%20tags.webp)
4. Use the arrow next to the lot code to see the data being pushed into VinWizard: Wine (Innovint lot code), Batch (currently equal to the lot code), Status (either lot stage or lot tags), and Volume.
   ![VinWizard Integration-next arrow](https://support.innovint.us/hs-fs/hubfs/VinWizard%20Integration-next%20arrow.webp?width=688&height=276&name=VinWizard%20Integration-next%20arrow.webp)
5. Check out the Job Status tab to see what time the data last synced, and get alerted to any issues.
   ![VinWizard Integration-job status](https://support.innovint.us/hs-fs/hubfs/VinWizard%20Integration-job%20status.webp?width=688&height=148&name=VinWizard%20Integration-job%20status.webp)

If you have mapped all your vessels, and see the Failure Reason "Vessel not assigned to any lot," that just means your tanks are empty in InnoVint.  Once the vessels are filled in InnoVint, we will pick up the lot code and associated data to sync with VinWizard.

#### FAQ

**Q: Can I map more than one vessel in InnoVint to VinWizard?**

*A:  No, this integration provides a 1:1 mapping between vessels*

**Q: How often does VinWizard get updated data from InnoVint?**

*A: The integration is set to run every fifteen minutes.*
