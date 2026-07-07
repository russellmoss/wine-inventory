---
id: "32301264350100"
title: "Changing Operating System Date and Time Formats for Imports"
url: "https://support.vintrace.com/hc/en-us/articles/32301264350100-Changing-Operating-System-Date-and-Time-Formats-for-Imports"
category: "Setup and Admin"
section: "Getting Started"
created_at: "2024-11-20T14:45:52Z"
updated_at: "2025-09-11T07:46:19Z"
labels: ["date", "date and time", "excel", "lab import", "error", "time", "csv upload"]
gist: "In order to import and export data that contains dates and/or times into vintrace, you’ll need to ensure that the date and time formats in your operating system have leading zeros."
tags: ["configuration", "migration", "getting-started", "exports"]
---

# Changing Operating System Date and Time Formats for Imports

In order to import and export data that contains dates and/or times into vintrace, you’ll need to ensure that the date and time formats in your operating system have leading zeros.

- [Mac OS: Ventura and Newer](#mac_ventura_newer)
- [Mac OS: Prior to Ventura](#mac_before_ventura)
- [Windows 11](#windows_11)
- [Windows 10](#windows_10)

## Mac OS: Ventura and Newer

These steps apply to Ventura and onward. If you are using a Mac OS prior to Ventura, refer to [Mac OS: Prior to Ventura](#mac_before_ventura). You can also refer to [Apple’s site](https://support.apple.com/guide/mac-help/change-how-dates-times-and-more-appear-on-mac-mh27073/mac) for information.

To change the date and time format on Mac operating systems Ventura or newer:

1. 1. Click the Apple icon that’s located in the upper left.
   2. Click System Settings.
   3. From the menu on the left, click General.
   4. Change the date format by doing the following:

- - Click Language & Region.

![Mac Newer OS - General - Language Region 20241024.png](https://support.vintrace.com/hc/article_attachments/32328581372948)

- - Change the Date Format to include leading zeros.

![Mac Newer OS - Date Format 20241024.png](https://support.vintrace.com/hc/article_attachments/32328540318996)

5. Ensure the time format is using 24-hour time by doing the following:

- - From the General list of the system settings, click Date & Time.
  - Ensure that 24-Hour Time is enabled.

![Mac Newer OS - 24 Hour Time 20241024.png](https://support.vintrace.com/hc/article_attachments/32328540422548)

6. Close the system settings window.

The date and time format changes are not applied to previously exported CSV files.

## Mac OS: Prior to Ventura

These steps apply to Mac OS prior to Ventura. If you are using Mac OS Ventura or newer, refer to [Mac OS: Ventura and Newer](#mac_ventura_newer). You can also refer to [Apple’s site](https://support.apple.com/guide/mac-help/change-how-dates-times-and-more-appear-on-mac-mh27073/mac) for information.

To change the date and time format on Mac operating systems prior to Ventura:

1. Click the Apple icon that’s located in the upper left.
2. Click System Settings.
3. Click Language & Region.
4. Click Advanced.

![Mac Older OS - Language Region - Advanced Button 20241024.png](https://support.vintrace.com/hc/article_attachments/32328551077908)

5. Change the date format by doing the following:

- Click Dates.
- Set the Short Date to your local format including leading zeros.

![Mac Older OS - Dates Short 20241024.png](https://support.vintrace.com/hc/article_attachments/32328540359828)

6. Ensure the time format includes leading zeros by doing the following:

- Click Times.
- Set the Short Time format to include leading zeros.

![Mac Older OS - Times Short 20241024.png](https://support.vintrace.com/hc/article_attachments/32328556659732)

7. Click OK.

The date and time format changes are not applied to previously exported CSV files.

## Windows 11

These steps apply to Windows 11. If you are using Windows 10, refer to [Windows 10](#windows_10). You can also refer to [Microsoft's site](https://support.microsoft.com/en-us/office/change-the-windows-regional-settings-to-modify-the-appearance-of-some-data-types-in-access-databases-edf41006-f6e2-4360-bc1b-30e9e8a54989#ID0EFBD=Windows_11) for information.

To change the date and time format in Windows 11:

1. Click the Windows Start button.
2. Click Settings, or search for Settings if it’s not visible.
3. Click Time & Language.
4. Click Regional Format.
5. Click Change Formats.

![Windows 11 - Change Format Button 20241024.png](https://support.vintrace.com/hc/article_attachments/32328556809876)

6. Change the Short Date and Short Time to include leading zeros.
7. Close the Settings window.

The date and time format changes are not applied to previously exported CSV files.

## Windows 10

These steps apply to Windows 10. If you are using Windows 11, refer to [Windows 11](#windows_11). You can also refer to [Microsoft's site](https://support.microsoft.com/en-us/office/change-the-windows-regional-settings-to-modify-the-appearance-of-some-data-types-in-access-databases-edf41006-f6e2-4360-bc1b-30e9e8a54989#ID0EFBD=Windows_10) for information.

To change the date and time format in Windows 10:

1. Click the Windows Start button.
2. Click Settings, or search for Settings if it’s not visible.
3. Click Time & Language.

![Windows 10 - Settings - Time and Language 20241024.png](https://support.vintrace.com/hc/article_attachments/32328556760084)

4. Click Region.
5. Click Change Data Formats.

![Windows 10 - Change Data Formats 20241024.png](https://support.vintrace.com/hc/article_attachments/32328537354516)

6. Change the Short Date and Short Time to include leading zeros.
7. Close the Settings window.

The date and time format changes are not applied to previously exported CSV files.
