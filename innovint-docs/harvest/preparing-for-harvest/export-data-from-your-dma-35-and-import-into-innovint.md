---
title: "Export Data from your DMA 35 and Import into InnoVint"
url: "https://support.innovint.us/hc/en-us/export-data-from-your-dma-35-and-import-into-innovint"
category: "Harvest"
section: "Preparing for Harvest"
page_type: "page"
lastmod: "2025-11-20"
gist: "For DMA 35 version 4, please ensure that your computer supports Bluetooth."
tags: ["exports", "integrations", "migration", "configuration", "lab", "harvest"]
---

# Export Data from your DMA 35 and Import into InnoVint

## Speed up your daily brix and temperature data entry by configuring your Anton Paar DMA 35 version 4 to export the results directly to a csv file, then upload that csv into InnoVint!

This article covers:

- [Setting up Bluetooth Connections](#Bluetooth-Connections)
- [Setting up Sample IDs in your DMA 35](#Importing-Sample-IDs)
  - [Import Sample IDs](#Import-Sample-IDs)
  - [Input Sample IDs Manually](#Define-Sample-IDs-Manually)
- [Assign your Brix & Temperature Measurements to a Sample ID](#Assign-B-T-to-sample-ID)
- [Exporting from your DMA 35](#Export-from-DMA)
  - [Setting the Export File Format](#Setting-export-file-format)
  - [To Export Data to csv](#Export-data)
- [Configuring your csv Export for Import into InnoVint](#Configure-csv-for-import-to-InnoVint)

### Setting up Bluetooth Connections

For DMA 35 version 4, please ensure that your computer supports Bluetooth. This may require installing an external Bluetooth adapter.

- - From the Anton Paar DMA 35 v4 Instruction Manual
    - 11.1 Setting up Bluetooth Connections
      **IMPORTANT**: If you experience transfer problems after you have changed a
      Bluetooth connection, remove DMA 35 from the “Devices and Printers”
      control panel on the PC (access also via “Show Bluetooth Devices” from the
      Bluetooth icon in the notification area of the task bar). Then set up the
      Bluetooth connection anew.
      - 11.1.1 Setting up the Connection to a PC
        1. Switch on the PC, which has to be Bluetooth enabled.
        2. Make the PC discoverable/visible over Bluetooth (see Windows help).
        3. On DMA 35, tap <Menu> and select Setup > Data Transfer > Configure Export Target.
        **TIP:** The connection will be valid for export as well as import.
        4. Tap <Start> to search for available Bluetooth devices.
        5. Tap <Edit> and select the PC.
        6. Tap <Next> and then <OK> to save the connection.
        7. Tap <Back> repeatedly to return to the main screen.
        **IMPORTANT:** You can only save one PC connection. If you set up a new PC
        connection, the previous one will be overwritten.

### Importing Sample IDs into your DMA 35 or Defining Manually

DMA 35 Sample IDs serve to tag your measurement results.

Up to 250 different sample IDs can be manually defined or imported.
- Sample IDs can be up to 10 characters long.
- You may use the letters “A”–”Z”, digits “0”–”9”, special characters “.”,
“-”, “#”, and spaces for the composition of a sample ID.

#### To import Sample IDs into your DMA 35, follow the steps here:

Sample data is stored under the Sample ID. This is equivalent to either the lot code or vessel code in InnoVint. To ensure that that the Sample IDs in your DMA 35 match InnoVint, we recommend exporting either your Lot Explorer or Vessel Explorer and importing those codes as Sample IDs into your DMA 35. Here's how to do that:

1. Prepare a text file titled sampleID.txt
2. In the first column, paste in all of your Sample IDs (either the vessel or lot codes that you exported from InnoVint) as either:
   ![Export Data from your DMA 35 and Import into InnoVint-vessel code](https://support.innovint.us/hs-fs/hubfs/Export%20Data%20from%20your%20DMA%2035%20and%20Import%20into%20InnoVint-vessel%20code.webp?width=195&height=134&name=Export%20Data%20from%20your%20DMA%2035%20and%20Import%20into%20InnoVint-vessel%20code.webp)
   or
   ![Export Data from your DMA 35 and Import into InnoVint-id code](https://support.innovint.us/hs-fs/hubfs/Export%20Data%20from%20your%20DMA%2035%20and%20Import%20into%20InnoVint-id%20code.webp?width=192&height=129&name=Export%20Data%20from%20your%20DMA%2035%20and%20Import%20into%20InnoVint-id%20code.webp)
3. Follow the steps below. File transfer occurs via Bluetooth.

- - Importing Files from a PC
    - 1. Save the import file on the PC for which a Bluetooth connection has been set up.
      2. Prepare DMA 35 to receive data:
         1. Tap <Menu> and select Setup > Data Transfer > File Transfer.
         2. Then select “Import Sample IDs” as the import function.
         3. Tap <Start> to start the automatic import procedure. The instrument’s identification will be shown.
      3. On the PC, send the file to DMA 35:
         1. Right-click the import file and select Send to > Bluetooth device.
         2. Select DMA 35 from the device list and click <Next>.
         3. On a first time connection / if necessary:
            - Click on the popup notification to accept the connection.
            - Accept the connection PIN (“yes”) and click <Next>.
            - Close the notification window that the device has been added.
         4. Click <Finish> to finish the file transfer.

If you use Anton Paar RFID tags on your vessels, then please contact Anton Paar for additional instructions and best practices to configure your Sample IDs.

#### To manually input Sample IDs into your DMA 35, follow the steps here:

1. Tap <Menu> and select Sample IDs.
2. Tap <New>.
3. Tap <Edit> and enter a sample ID.
4. Tap <Back> repeatedly to return to the main screen.

### Assign your Brix & Temperature Measurements to a Sample ID

1. In the quick access area, activate (“Sample ID” function).
2. Select “Sample ID” and tap <Edit>.
3. Select the appropriate sample ID from the list.
4. Tap <Back> to return to the main screen.

All subsequent measurements will use the selected sample ID until you
assign a new one. The assigned sample ID is shown in the header.

![Export Data from your DMA 35 and Import into InnoVint-dma](https://support.innovint.us/hs-fs/hubfs/Export%20Data%20from%20your%20DMA%2035%20and%20Import%20into%20InnoVint-dma.jpg?width=244&height=239&name=Export%20Data%20from%20your%20DMA%2035%20and%20Import%20into%20InnoVint-dma.jpg)

### Exporting from your DMA 35

#### Setting the Export File Format

You can export the measurement data as a common text file (TXT) or
in CSV format.

1. Tap <Menu> and select Setup > Data Transfer > Configure Data Format.
2. Select “File Format” and tap <Edit>.
3. Select an export file format: CSV or TXT (select CSV)
4. If you have selected CSV:
   1. Select “Table Delimiter” and tap <Edit>.
   2. Select a table delimiter: “;” (semicolon) | “/” (slash) | “,” (comma) | TAB
   3. Select “Decimal Separator” and tap <Edit>.
   4. Select a decimal separator: “.” (point) | “,” (comma)
5. Tap <Back> repeatedly to return to the main screen.

#### To Export Data to csv

1. Turn the Bluetooth wireless service on for your PC.
   1. In the notification area of the task bar, click the Bluetooth icon.
   2. Select “Receive a File”.
2. On DMA 35, send the file to the PC:
   1. Tap <Menu> and select Setup > Data Transfer > File Transfer.
   2. Then select “Export Sample IDs” as the export function.
   3. Tap <Yes> to confirm the transfer.
   4. Tap <OK> to finish the file transfer.
3. On the PC, specify a location where the export file shall be saved, then
   click <Finish> to save the file.

### Configuring your csv Export for Import into InnoVint

1. The Sample IDs must match exactly with either a Lot code or Vessel code in InnoVint. Each file for import should contain only Lot codes or Vessel codes but not both.
2. Convert the file exported from your DMA 35 from comma delimited to being separated by columns
   1. To do this in *Excel*, open your file, i.e., the 'measureLog export', select **Data** > **Text to columns**
   2. In Step 1 of the **Text to Columns Wizard**, select 'Delimited', then "Next"
   3. In Step 2, select 'Semicolon' as the Delimiter, then "Next"
   4. You do not need to do additional formatting in Step 3. Simply click "Finish"
3. Copy and paste the relevant data into InnoVint's Brix/Temps format guide OR, re-title the column headers in the DMA 35 export and delete the "extra" columns
4. Now you're ready to import into InnoVint, using the [**Analysis Import**](https://support.innovint.us/hc/en-us/articles/115002687291-how-to-import-analyses-via-csv?hsLang=en) action!

For the Brix/Temps import template and additional tips, please reference:

- [Templates](https://support.innovint.us/hc/en-us/templates?hsLang=en)
- [Analysis Import: Format Guidelines](https://support.innovint.us/hc/en-us/articles/115002684812-analysis-import-format-guidelines-for-csv-file?hsLang=en)
