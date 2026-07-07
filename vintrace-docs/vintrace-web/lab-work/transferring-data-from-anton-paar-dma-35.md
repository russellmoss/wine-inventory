---
id: "32301314211476"
title: "Transferring Data from Anton Paar DMA 35"
url: "https://support.vintrace.com/hc/en-us/articles/32301314211476-Transferring-Data-from-Anton-Paar-DMA-35"
category: "vintrace Web"
section: "Lab work"
created_at: "2024-11-20T14:46:47Z"
updated_at: "2025-01-07T18:38:38Z"
labels: []
gist: "After you've completed the Anton Paar integration, you'll need to prepare your DMA 35 before you can transfer data to vintrace."
tags: ["integrations", "transfers", "lab", "configuration", "exports", "migration"]
---

# Transferring Data from Anton Paar DMA 35

After you've completed the [Anton Paar integration](https://support.vintrace.com/hc/en-us/articles/32301304300692), you'll need to [prepare your DMA 35](#preparing) before you can [transfer data](#transferring) to vintrace.

## Preparing the DMA 35

To prepare the DMA 35, you'll need to complete the following steps:

1. [Connect the DMA 35 to your computer](#connecting).
2. [Specify the export file format](#file_format).
3. [Specify the date format](#date_format).

### Connecting the DMA 35 to Your Computer

In order to complete these steps, you’ll need a bluetooth-enabled computer. Be sure that the computer is visible/discoverable via bluetooth before starting.

If you’re using the same computer to transfer data from the DMA 35 to vintrace, you’ll only need to complete these steps once. If you connect to a different computer, you’ll need to repeat the steps below. The DMA 35 only allows you to connect to one computer. If you connect to a new computer, the previous connection will be overwritten.

To connect the DMA 35 to your computer:

1. On the DMA 35, tab Menu.
2. Select Setup > Data Transfer > Configure Export Target.
3. Tap Start. The DMA 35 will search for available bluetooth devices.
4. Tap Edit, then select your computer.
5. Tap Next, then tap OK to save the connection.
6. Tap Back until the main screen displays.

### Specifying the Export File Format

The following steps tell the Anton Paar DMA 35 how to format the data so that it can be imported into vintrace. You’ll need to specify the file format prior to exporting the measurements from Anton Paar to your computer.

If you’re using the same computer to transfer data from the DMA 35 to vintrace, you’ll only need to complete these steps once. If you connect to a different computer, you’ll need to repeat the steps below.

To specify the file format on the Anton Paar:

1. Tap Menu.
2. Select Setup > Data Transfer > Configure Data Format.
3. Select File Format, then tap Edit.
4. When prompted to select an export file format, select CSV.
5. Specify the table delimiter by doing the following:

- Select Table Delimiter.
- Tap Edit.
- Select “,” (i.e., the comma).

6. Specify the decimal separator by doing the following:

- Select Decimal Separator.
- Tap Edit.
- Select “.” (i.e., the period).

7. Tap Back until the main screen displays.

### Specifying the Date Format

Before you export measurements from the DMA35, be sure that the date format that it uses matches the date format for your region or country. For example, in the US the date format would be MM/DD/YYYY or MM.DD.YYYY. In Australia or New Zealand, the date format would be DD/MM/YYYY or DD.MM.YYYY.

Refer to section 6.2 Setting Date and Time in the [Anton Paar Instruction Manual](https://www.jmesales.com/content/docs/AntonPaar/DMA%2035%20Instruction%20Manual.pdf) for details.

## Transferring Data

To transfer your measurements, you’ll need to:

1. [Export the measurements from Anton Paar to your computer](#exporting).
2. [Import the file containing the measurements into vintrace](#importing).

### Exporting Measurements from the DMA 35

After you’ve collected your measurements on the DMA 35, you can export the data to your computer.

Be sure that you’ve [connected the DMA 35 to your computer](#connecting) and [specified the file format](#hfile_format) on the DMA 35 before completing these steps.

To export your measurements from the Anton Paar DMA 35:

1. From the task bar of your computer’s notification area:

- Click the bluetooth icon.
- Select Receive a File.

2. From the DMA 35:

- Tap Menu.
- Select Measurement Data > Export Measurement Data.
- Tap Yes to confirm the transfer.

3. On your computer, navigate to the location where you want to save the export file, then click Finish.

The CSV file will be saved in the specified location. Below is a sample of a CSV file. The value in the Sample ID column will either be the RFID or the sample ID that you manually entered.

![CSV_Export_-_Sample_ID_Column_20220412.png](https://support.vintrace.com/hc/article_attachments/32328612622356)

Be sure that the value in the Sample ID column has been [added to the appropriate vessel in vintrace](https://support.vintrace.com/hc/en-us/articles/4660052366351-Anton-Paar-Integration#SpecifyingaVessel%E2%80%99sRFIDinvintrace).

4. Confirm that the CSV file contains the following columns. If any of these columns are missing, you'll need to add the column before you can import the results into vintrace.

- Date
- Time
- Sample ID
- Measured Parameter 1
- Value
- Measured Parameter 2 (the values in this column can be blank)
- Value (the values in this column can be blank)

### Importing Results into vintrace

After you’ve [exported the measurements from Anton Paar and saved the CSV file to your computer](#exporting), you can transfer the measurements to vintrace.

To import the results into vintrace:

1. Click ![Lab_Menu_Option_20200403.png](https://support.vintrace.com/hc/article_attachments/32328620111764) Lab in the sidebar.
2. From the Import Format menu in the lower left, select Anton Paar DMA 35.

![Lab_-_File_Format_20220408.png](https://support.vintrace.com/hc/article_attachments/32328620136980)

3. Click ![Upload_20200727.png](https://support.vintrace.com/hc/article_attachments/32328620183060).
4. Click Choose File.
5. Select the file to upload.
6. Click Send.
7. After the file is uploaded, be sure to check the values to ensure that they’re correct. A lab analysis is created for each entry in the CSV. The default laboratory and default operator will be set on each analysis.

![Lab_console_-_import_successful.jpg](https://support.vintrace.com/hc/article_attachments/32328628014868)
