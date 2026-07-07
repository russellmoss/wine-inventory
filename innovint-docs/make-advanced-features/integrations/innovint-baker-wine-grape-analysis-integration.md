---
title: "InnoVint + Baker Wine & Grape Analysis Integration"
url: "https://support.innovint.us/hc/en-us/innovint-baker-labs-integration"
category: "MAKE: Advanced Features"
section: "Integrations"
page_type: "page"
lastmod: "2025-11-20"
gist: "Baker Wine & Grape Analysis has coordinated with InnoVint to build an integration that allows for your analysis results to be posted directly into InnoVint."
tags: ["integrations", "harvest", "lab", "api", "permissions", "ux-friction"]
---

# InnoVint + Baker Wine & Grape Analysis Integration

Baker Wine & Grape Analysis has coordinated with InnoVint to build an integration that allows for your analysis results to be posted directly into InnoVint. Any users who utilize both BWGA and InnoVint can use this capability.

This integration is controlled by Baker Wine & Grape Analysis.  To activate this service, please reach out to [results@bwga.net](mailto:%20results@bwga.net)

#### Requirements

1. Contact Baker Wine & Grape Analysis at [results@bwga.net](mailto:%20results@bwga.net) to verify your account and integration capabilities.
2. A designated user in the winery to provide BWGA with a Personal Access Token (PAT) for InnoVint. This is the user name that will "record" the linked analysis submission. BWGA will provide information on how to access the PAT for InnoVint.

#### How it works

BWGA will require a Personal Access Token (PAT) for InnoVint's API access from a user with access to the InnoVint account in order to connect and post results into InnoVint.  Using the PAT, Baker will be able to connect your Client Portal results to InnoVint.

For security reasons, we recommend creating a specific "bot" user (with an accessible email address), with Team Member Cannot Submit Access, in order to generate this PAT.

#### Step by step overview

1. Pull wine sample(s) and label it
   1. Labels may be handwritten, but we recommend labels generated via the BWGA Client Portal.  Labels generated via the Client Portal template will allow to you select from lot codes currently in InnoVint. Labels cannot currently be generated within InnoVint.
   2. All Baker analysis types are supported and will map to appropriate analyses/units in InnoVint.
   3. Only InnoVint's Lot Composite type analysis is supported via the integration (no Individual Vessel analysis).
2. Courier, ship or drop off your sample(s) at Baker Wine & Grape Analysis.
3. BWGA processes the sample(s) and records the results in their internal lab system.
   1. If you have opted to "post results to InnoVint" when creating the sample in your portal, then results will also be recorded in InnoVint.
   2. You should expect to see your BWGA results in InnoVint at approximately the same time you can see them in your BWGA Client Portal.

#### Having trouble?

Please contact [results@bwga.net](mailto:results@bwga.net) in order to troubleshoot this integration.
