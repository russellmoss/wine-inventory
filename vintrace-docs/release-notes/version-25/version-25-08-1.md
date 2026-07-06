---
id: "39715664593044"
title: "Version 25.08.1"
url: "https://support.vintrace.com/hc/en-us/articles/39715664593044-Version-25-08-1"
category: "Release Notes"
section: "Version 25"
created_at: "2025-07-28T03:45:43Z"
updated_at: "2025-08-05T21:43:46Z"
labels: []
gist: "Version roll-out dates: Mon, 4 Aug - Wed, 13 Aug, 2025."
tags: ["release-notes", "api", "harvest", "vineyard", "reporting", "dtc-sales"]
---

# Version 25.08.1

**Version roll-out dates**: Mon, 4 Aug - Wed, 13 Aug, 2025

## General availability

*The updates in this section are generally available to all customers as long as the module in question is within the customer package / licensing scope.*

### API enhancements

We've done some enhancements to a couple of our API to further improve your data access and maintenance.

- [**Bulk wine shipment V7 API**](https://api-docs.vintrace.com/docs/vintrace-server/79f6633a6987c-get-all-shipments-in-the-system)
  - Expanded parameters to include the wine composition details to help improve automated reporting opportunities on wines to the block level.
  - Additional fields: Percentage, vintage, block, sub ava/region id, region name, micro ava/sub region id, micro ava/sub region name, variety id, variety name.
- [**Fruit intake transaction V7 API**](https://api-docs.vintrace.com/docs/vintrace-server/85f8619d302f5-record-a-new-fruit-intake-transaction)
  - Extra fields have been added to streamline the process to create fruit intakes and reduce manual corrections.
  - Additional fields:  Shipping reference/consignment note, driver name, last load, operator notes, truck no.

### Harvest module

**Fruit Intake - Third party weigh tag**

To assist with further detailed reporting on fruit intakes we are enabling the existing third party weigh tag field to be visible in the fruit intake console as a selectable column and also to be populated in the console CSV report.

![Fruit Intake Console_Third Party Weigh Tag# 2025-08-01.png](https://support.vintrace.com/hc/article_attachments/39855623228180)![Fruit Intake Console CSV Export_Third Party Weigh Tag# 2025-08-01.png](https://support.vintrace.com/hc/article_attachments/39855623229076)

### Wine operations

- **Operation performance improvements:**
  - By improving the performance of these operations we're building for a more optimised workflow to bring you a better user experience.
    - The following operations were previously in pilot and will now be released for all users to benefit:
      - Multi topping
      - Multi transfer (many-to-one)
      - Multi transfer (one-to-many)
      - Bulk dispatch (inter-winery)
      - Transfer/Rack/Blend
      - Transfer to barrel group

### Grower contracts

Performance improvements have been made for when loading grower contracts in the More options > Accounts > Grower Contracts console where there are large numbers of fruit intakes associated with one or more of those contracts.

---

## Features in pilot

*The features in this section are available to selected pilot clients only. If you are interested in joining the pilot customer group and trialling any of the features below, please contact our support team.*

### Vessel module

- **Fixed Barrel Locations** - enabling the ability to move individual barrels and barrels within a barrel group on the web and mobile app
  - More specific locations can now be tracked against individual barrels allowing them to moved when work is to be completed on them and then moved back to their initial location or another location.

    ![Move Barrels Operation_Barrels 2025-08-01.jpg](https://support.vintrace.com/hc/article_attachments/39853792991764)

    ![Move Barrels Android 2025-08-01.jpg](https://support.vintrace.com/hc/article_attachments/39853692062228)
  - Individual barrel locations are viewable when accessing the wine in a barrel group.

    ![View Barrel Locations 2025-08-01.jpg](https://support.vintrace.com/hc/article_attachments/39853692063636)

### Grower contract management module

- **Calculating levy values without payments** - Fruit levies (also known as fruit assessments) can now be calculated and displayed against grower contracts without having to be associated with grower payments. This can be turned on/off via a new 'Settings' option under the 'Configure' button at the top right of the Contract Management module.![](https://support.vintrace.com/hc/article_attachments/39855777192852)
- **New levy costs report** - a new report has been introduced that shows all levy values for fruit received for each contracted block.
- When filtering the Contract Management module you can now select a grower using their code or name - previously you could only search by name.
- When adjustments are made to the cost of a fruit intake via the More options > Accounts > Costs admin these are now correctly handled when calculating grower payments.

### Wine operations

- Further improvements have been made on the following operations and will only be available for pilot with specific clients.
  - Bulk dispatch
  - Packaging
