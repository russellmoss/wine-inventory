---
id: "32301345556756"
title: "Tank Controller Integration"
url: "https://support.vintrace.com/hc/en-us/articles/32301345556756-Tank-Controller-Integration"
category: "Setup and Admin"
section: "Integrations: Labs and Tanks"
created_at: "2024-11-20T14:48:35Z"
updated_at: "2026-05-14T21:23:01Z"
labels: ["estate"]
gist: "vintrace can connect with your TankNET or VinWizard tank controller to sync your vessel’s information with vintrace."
tags: ["integrations", "configuration", "lab", "barrels", "work-orders"]
---

# Tank Controller Integration

vintrace can connect with your TankNET or VinWizard tank controller to sync your vessel’s information with vintrace.

When the integration is enabled, vintrace will be able to read the temperature and sugar metrics; these metrics will display as automated analyses. Tank information will be pushed back to the tank controller within 5 minutes. The tank’s pending lab work and work orders will pause automated analysis from being applied.

## Supported Tank Controllers

vintrace supports the following tank controllers.

TankNET:

- Support email: support@acrolon.com
- Default listening port: 443
- Port range to allow: 443 - 443

VinWizard:

- Support email: info@winetec.net
- Default listening port: 8008
- Port range to allow: 8000 – 8020

## Preparing for Integration

In order to integrate your tank controller with vintrace, you’ll need to complete the following:

- Inform the tank controller company that you’ll be integrating with vintrace so that they can take steps to allow for the integration.
- Ask your IT team to configure your network to allow a connection from vintrace to our tank controller. As part of this step, your IT team will configure an external IP address and port that vintrace can connect to.
- Provide the external IP address and port to vintrace Support.
- If your tank controllers names differ from the tank names in vintrace, you'll want to [specify your tank controllers' names in vintrace](#h_01EQKDYZVYHZWZ7BR57PJFSD30).

## Submitting a Request

Submit a request to vintrace Support with the following information:

- The type of tank controller (i.e., TankNET or VinWizard).
- The IP address and port your IT team has configured to allow vintrace’s connection.
- The Sugar and Temperature metric names if applicable.
- The polling interval which is how often you want vintrace to poll your tank controller for new readings.
- Once we receive your request, we’ll set up the integration and will contact you when it’s been completed, or if we need additional information.

## Specifying Tank Controller Names

If your controller’s tank names differ from the tank names in vintrace, you’ll need to specify the controller’s tank names in vintrace.

To specify the controller name in vintrace, [edit the tank](https://support.vintrace.com/hc/en-us/articles/32301359425428) and enter the controller’s tank name in the Tank Control ID field.

![Tank_Update_-_Tank_Control_ID_20201120.png](https://support.vintrace.com/hc/article_attachments/32329148689300)

You can also use vintrace’s [export and import functionality](https://support.vintrace.com/hc/en-us/articles/32303307646868) to enter this information.

## Changing TankNET's Polling Frequency Based on Product State

TankNET's integration with vintrace enables you to change how often you poll based on the [product state](https://support.vintrace.com/hc/en-us/articles/32301350848916). For example, you may more temperature readings during fermentation.

To do this, you'll need to link vintrace's product states with TankNET's lot status codes:

1. From TankNET, determine the lot status code by looking at the values in a tank's Lot Status dropdown.
2. From vintrace, edit the [product state](https://support.vintrace.com/hc/en-us/articles/32301350848916) and enter the lot status code from TankNET in the External Status Text field.

![Product State - TankNET External Status Text 20240318.png](https://support.vintrace.com/hc/article_attachments/32329148716564)
