---
id: "32301304300692"
title: "Anton Paar Integration"
url: "https://support.vintrace.com/hc/en-us/articles/32301304300692-Anton-Paar-Integration"
category: "Setup and Admin"
section: "Integrations: Labs and Tanks"
created_at: "2024-11-20T14:46:47Z"
updated_at: "2025-09-09T01:21:59Z"
labels: []
gist: "Measurements taken with an Anton Paar DMA 35 device can be exported from the device and imported into vintrace."
tags: ["integrations", "configuration", "barrels", "lab", "exports", "migration"]
---

# Anton Paar Integration

Measurements taken with an Anton Paar DMA 35 device can be exported from the device and imported into vintrace. In order to do this, you’ll need to complete the following setup procedures:

- [Read each vessel’s RFID tag](#h_01G0F51VJGG38VRT3MFW9BQ0FX) and [specify the information in vintrace](#h_01G0F5244PZXV4Z89X8G6MEHSA). If you're not using RFID tags, you can [use the vessel's name as its sample ID](#h_01G1V3PZDYNPNNB0EXYVDXB61X).
- [Map the Anton Paar metric names](#h_01G0F52Q4JXBSZ1J1EA47J51BS).

The steps above only need to be completed once. After these steps are completed, you can [transfer measurements from the Anton Paar DMA 35 into vintrace](https://support.vintrace.com/hc/en-us/articles/32301314211476).

## Reading a Vessel’s RFID Tag

In this part of the process, you’ll scan the vessel’s RFID tag so that you can enter the information into vintrace.

1. Tap Menu.
2. Select Setup > RFID > Read Tag.
3. Hold the DMA 35 to the RFID tag until the tag’s information displays. You’ll need to [enter the RFID information into vintrace](#h_01G0F5244PZXV4Z89X8G6MEHSA).

![DMA_35_20220411.png](https://support.vintrace.com/hc/article_attachments/32328612693908)

If you’re not using RFID tags, you can [use the sample ID as the RFID in vintrace](#h_01G1V3PZDYNPNNB0EXYVDXB61X).

Additional information about the Anton Paar DMA 35 can be found in the [Anton Paar DMA 35 Instruction Manual](https://www.jmesales.com/content/docs/AntonPaar/DMA%2035%20Instruction%20Manual.pdf).

## Specifying a Vessel’s RFID in vintrace

You have two options for specifying a vessel’s RFID in vintrace.

You can [manually enter a vessel’s RFID](#h_01G0F4ZB874976R71VGNVTB7PA) into vintrace. This option is useful when you only have a handful of RFIDs to enter into vintrace.

The second option is to [import the RFIDs](#h_01G0F4ZNDQJQ9HW2WSR9X88T09) into vintrace. This option is useful when you have a large number of RFID to enter.

### Entering an Individual Vessel’s RFID

To manually enter a vessel’s RFID into vintrace:

1. From the [Vessels page](https://support.vintrace.com/hc/en-us/articles/32301344827924), click the ![Three_Vertical_Dots_-_Carafe_20220227.png](https://support.vintrace.com/hc/article_attachments/32328612647700) beside the vessel and select Edit.

![Vessels_-_Edit_Vessel_20220408.png](https://support.vintrace.com/hc/article_attachments/32328612674452)

2. In the RFID field, enter the vessel’s RFID or sample ID.

![Tank_-_RFID_Field_20220408.png](https://support.vintrace.com/hc/article_attachments/32328602648852)

3. Click Save.

### Importing Multiple Vessels’ RFIDs

To import your the RFIDs of multiple vessels into vintrace:

1. [Export your vessels to a CSV file](https://support.vintrace.com/hc/en-us/articles/32303307646868).
2. In the CSV file, enter the RFID or sample ID of your vessels in the RFID column.

![CVS_-_RFID_Column_20220408.png](https://support.vintrace.com/hc/article_attachments/32328628234516)

3. Save the CSV file.
4. [Import the CSV file into vintrace](https://support.vintrace.com/hc/en-us/articles/32303307646868).

## Using the Vessel Name as the Sample ID

If you’re not using RFID tags, you can use the vintrace vessel name as the sample ID in your DMA 35. There are two ways to enter the vessel name’s in the DMA 35:

- [Manually enter the vessel’s name](#h_01G1V3N7SFNE6D5THPB6BTM3Q5)
- [Import the vessel names](#h_01G1V3NP3TP84G4Y9XJGS6SG9T)

### Entering an Individual Vessel’s Name in the DMA 35

To manually enter a vessel’s name as its sample ID in the DMA 35:

1. Tap Menu.
2. Select Sample IDs > New > Edit.
3. Enter the vintrace vessel name as the sample ID (e.g., T1-05).
4. Tap Back until the main screen displays.
5. You can now take samples using the vessel’s name as the sample ID.

### Importing Vessel Names to the DMA 35

This involves exporting the vessels from vintrace and copying the vessel names to a text file. The text file is then imported into the DMA 35.

To import vessel names to the DMA 35:

1. Connect the DMA 35 to your computer.
2. Create a text file with the vessel names by doing the following:

- From vintrace, [export the vessels to a CSV file](https://support.vintrace.com/hc/en-us/articles/32303307646868). You can do this from the Winery Setup window, or from the [Vessels page](https://support.vintrace.com/hc/en-us/articles/32301344827924-The-Vessels-Page#h_04e8f2f9-b4f3-43f5-98d2-dbf3a92648d6).
- Open the CSV file.
- Copy the vessel names to a new text file.
- Save the text file on your computer as *sampleID.txt*.

![sampleID_Text_File_20220429.png](https://support.vintrace.com/hc/article_attachments/32328602800276)

3. Prepare the DMA 35 for an import by doing the following:

- Tap Menu.
- Select Setup > Data Transfer > File Transfer > Import Sample IDs.
- Tap Start.

4. Import the text file to the DMA 35 by doing the following:

- From your computer, right-click the text file (i.e., sampleID.txt).
- Select Send To > Bluetooth Device.

![sampleID_Send_Bluetooth_20220429.png](https://support.vintrace.com/hc/article_attachments/32328612714260)

- Select the DMA 35.

![Bluetooth_File_Transfer_-_DMA_35_20220429.png](https://support.vintrace.com/hc/article_attachments/32328634737428)

- Click Next.
- If this is the first time you’re sending a file and the Pair Device window displays asking you to confirm the PIN, click Yes.

![Pair_Device_20220429.png](https://support.vintrace.com/hc/article_attachments/32328628202132)

- Click Finish.

![Bluetooth_File_Transfer_-_Finish_20220429.png](https://support.vintrace.com/hc/article_attachments/32328612742932)

## Mapping Anton Paar Metric Names

In this part of the process, you’ll update your [default laboratory](https://support.vintrace.com/hc/en-us/articles/32301350367636) to map the metric names used by the Anton Paar DMA device to the metric names used by vintrace.

Refer to our [Mapping a Lab's Metric Names article](https://support.vintrace.com/hc/en-us/articles/32301340432788) to learn more.
