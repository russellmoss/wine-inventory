---
id: "32303328376084"
title: "Weigh Scale Integration"
url: "https://support.vintrace.com/hc/en-us/articles/32303328376084-Weigh-Scale-Integration"
category: "Setup and Admin"
section: "Integrations: Vineyard"
created_at: "2024-11-20T15:52:52Z"
updated_at: "2026-05-28T23:56:00Z"
labels: []
gist: "Weigh Scale integration is now available to the US on version 9.3.4 or higher due to NTEP Certificate of Conformance certification number 23-058, received June 16, 2023."
tags: ["integrations", "configuration", "vineyard", "mobile", "release-notes"]
---

# Weigh Scale Integration

Weigh Scale integration is now available to the US on version 9.3.4 or higher due to NTEP Certificate of Conformance certification number 23-058, received June 16, 2023. The integration is still available to all other regions.

vintrace can read weight output that’s generated from network-attached scales. This allows operators to record weights in real time from the vintrace web application and vintrace mobile app.

## Supported Devices

The following devices work with vintrace with minimal configuration:

- Avery 12XX series
- Avery ZMXX series
- Cardinal Storm 2XX
- Mettler Toledo IND266
- Mettler Toledo IND5XX and IND7XX series
- PT200M
- Precia Molen i40
- Rinstrum 3XX and 4XX series
- Rice Lake 4XX, 7XX and 9XX series

vintrace might be able to support other devices that provide consistent and continuous output via a TCP socket connection. If you’re unsure whether your device will work, contact vintrace Support.

## Preparing for Integration

In order to integrate your weigh scale with vintrace, you’ll need to complete the following before contacting vintrace. Your IT department should be able to assist with this information;

- Determine your weigh scale’s make and model. We recommend having the contact information for your vendor’s technical contacts in the event that we need to reach them.
- Determine the TCP port that’s used by your scale to communicate. For example, Rinstrum units communicate on TCP port 2223. Contact your vendor if you need help determining the TCP port.
- Ask someone from your IT team to forward the port on your firewall and to provide you with a public IP address that vintrace can communicate with. To ensure security, vintrace will provide you with an IP address so that you can restrict access.

## Submitting a Request

Submit a request to vintrace Support with the following information:

- Your weigh scale’s make and model.
- The public IP address and TCP port that we should use for communication.
- Contact information for your IT team and vendor.

Once we receive your request, we’ll provide you with an IP address that your IT team can use in your firewall’s rules. We’ll then set up the integration and will contact you when it’s been completed, or if we need additional information.

## Using Weigh Scale Integration

After your weigh scale is integrated with vintrace, a ![Scale_Icon_20220726.png](https://support.vintrace.com/hc/article_attachments/32329173975060) scale icon displays in the [Intake Details window](https://support.vintrace.com/hc/en-us/articles/32303268370324-Managing-Fruit-Intakes-and-Fruit-Intake-Bookings#h_af936757-a93c-4410-b14b-d91fd573249f) when you receive fruit and/or weigh record if you have the [Scalehouse](https://support.vintrace.com/hc/en-us/articles/47362838054036) enabled.

![Intake_Details_-_Scale_Icon_20220726.png](https://support.vintrace.com/hc/article_attachments/32329173981332)

Click the ![Scale_Icon_20220726.png](https://support.vintrace.com/hc/article_attachments/32329173975060) scale icon to populate the field with the weight on the scale.

US customers ONLY - [NTEP Certificate of Conformance](https://cdn.ncwm.com/userfiles/files/Certificates/23-058A2.pdf)
