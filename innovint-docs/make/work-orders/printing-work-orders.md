---
title: "Printing Work Orders"
url: "https://support.innovint.us/hc/en-us/work-order-print"
category: "MAKE"
section: "Work Orders"
page_type: "page"
lastmod: "2026-01-13"
gist: "Learn about our available Work Order print options, how they differ, and how to optimize your print settings."
tags: ["work-orders", "exports", "barrels", "configuration", "getting-started", "ux-friction"]
---

# Printing Work Orders

Learn about our available Work Order print options, how they differ, and how to optimize your print settings.

- [Print options overview](#print_options)
- [Editable PDF](#editable)
- [Summarized View](#summarized)
  - [Summarized View with Vessel List](#vessel_list)
- [Basic Browser & Simplified Vessel Views](#basic-simplied)
- [Controlling your Print Options](#settings)
- [Optimizing Printer Settings](#optimize-print-settings)
- [FAQ](#F_A_Qs)

### **Prin**t Options Overview

In the Work Order details page, you have five print options in the upper right hand corner:

![WO Print - 5 options](https://support.innovint.us/hs-fs/hubfs/WO%20Print%20-%205%20options.png?width=670&height=131&name=WO%20Print%20-%205%20options.png)

- [**Editable PDF**](#editable)
  A landscape view that prints all tasks in the work order. Multiple barrels will be grouped by capacity. This option loads an editable pdf that should accessed using an Adobe or pdf reader browser extension.
- **[Summarized view](#summarized_view)**

  A landscape view that prints all tasks in the work order (see [Skipped Tasks](#skipped_tasks) for exceptions). Selected vessels are condensed and grouped by type and capacity.
- **[Summarized view & vessel list](#vessel_list)**

  This is a landscape view that incorporates a list of all selected vessels for each task, appended to the Summarized view.
- **[Basic browser version](#basic)**

  Prints the work order in the same format as viewed in the browser. You can print this page or Save as PDF. Use printer settings to view as either portrait or landscape view.
- **[Simplified vessel view](#simple)**

  Opens a new tab where users can print a version of the work order that consolidates the vessels into groups, similar to the summarized view, via the browser. Use printer settings to view as either portrait or landscape view.

---

### Editable PDF

This landscape layout option supports the generation of an editable PDF files. This option opens Lot Code and Volume fields for editing within the PDF (as well as task name, vessel codes and a comments field), and provides a strong workflow option for dependent/future work orders.

![WO Print - Editable](https://support.innovint.us/hs-fs/hubfs/WO%20Print%20-%20Editable.png?width=670&height=351&name=WO%20Print%20-%20Editable.png)

- **Task Limitation:** This print option does not support the Add Packaging task.
- **Vessel display**: For lots in multiple vessels, all vessel are “grouped” together by type and capacity. Each row represents a unique combination of vessel type and capacity.
  - For all tasks except Additions, no individual vessel list is available. Note that Addition tasks will print with individual vessel lists.
  - If you choose “Let cellar staff choose vessels,” the printed work order will include one blank cell.

- **Notes and Instructions**: The work order instruction field prints, but task level notes and instructions do not print. The instructions field is editable after pdf generation.
- **Header**: The first page includes the work order header containing the ID, work order assignee, due date and owners (if applicable), and a QR code (Scanned QR Codes will pull up the Work Order in the Desktop app).
  - The header prints on every page if work order breaks across multiple pages.
- **Printed volumes:** Show the requested volumes in open work orders. These volume fields are fully editable.
- **Task Summary:** The editable pdf does not include a task summary.
- **Work Order completion details** are signed off at the top right of the first page of the work order.

**This functionality requires a browser extension**

We recommend using an Adobe Acrobat extension for Chrome.  Add this [extension](https://chrome.google.com/webstore/detail/adobe-acrobat-pdf-edit-co/efaidnbmnnnibpcajpcglclefindmkaj/related) to your browser, which also allows text highlighting or converting the document to another file type.

Our Editable PDF feature really edits best using the follow setup, which is a two-step process:

**Step 1**: **Disable Chrome's built-in PDF viewer**

1. In Google Chrome, click the three-dot menu icon in the top-right corner and select Settings.
2. Click Privacy and security in the left-side menu.
3. Click Site Settings.
4. Scroll down to the "Additional content settings" dropdown and expand it.
5. Click PDF documents.
6. Select the Download PDFs radio button. This will force Chrome to download PDF files instead of automatically opening them in the browser, allowing your extension to intercept them.

**Step 2: Your extension may need permission to access local PDF files on your computer - grant the extension access to file URLs.**

1. Click the puzzle-piece icon to the right of the address bar and select Manage Extensions.
2. Find your desired PDF extension (e.g., Adobe Acrobat) and click Details.
3. On the details page, scroll down and turn on the toggle for "Allow access to file URLs."

**After setup:** Once you install and enable the Adobe extension, it will automatically prompt you to open PDFs in Acrobat when it detects it.

### Summarized View

This landscape layout option is the classic print view, and provides some strong benefits of readability.

![WO Print - Summarized](https://support.innovint.us/hs-fs/hubfs/WO%20Print%20-%20Summarized.png?width=670&height=522&name=WO%20Print%20-%20Summarized.png)

- **Task Limitations:** None. This print option supports all work order tasks.
- **Vessel display**: For lots in multiple vessels, all vessel are “grouped” together by type and capacity. Each row represents a unique combination of vessel type and capacity.
  - An individual vessel list is available by selecting an alternate print option "[Summarized View with Vessel List](#vessel_list)."
  - If you choose “Let cellar staff choose vessels,” the printed work order will include two blank vessel rows.
- **Notes and Instructions**: The work order instruction field, as well as task level notes and instructions print.
  - If notes are saved on the task, the entire note text is printed along with the name of the user that saved the note.
  - If a note is not saved on the task, "**NOTES"** will still print, leaving users the space to write in any notes.
- **Header/page breaks**: The first page includes the work order header containing the ID, work order assignee, due date and owners (if applicable), and a QR code (scanned QR codes will pull up the Work Order in the Desktop app).
  - Any following pages will only print the Work Order title in the header.
  - Each task in a multi-task work order prints on a separate page for both the summarized view and vessel list.
- **Printed volumes:** If you “Choose specific vessels,” the printed work order will summarize the selected vessels and print the total requested values
  - The printed values represent the total sum of the summarized vessels on the row. Vessel-by-vessel values are only printed using the ["Summarized View and Vessel List."](#vessel_list)
  - By default, only the requested Total Starting and Total Add/Total Remove values are printed. The Total Ending value is left blank unless you request to Add or Remove volume rather than setting the ending filled.'
  - No dip measurement is printed on the Summarized View - but can be found on the Summarized View with Vessel list (in the individual vessel rows).
  - Requested amounts to *remove* are printed as negative numbers, and amounts to *add* are printed as positive numbers.
    ![Printing Work Orders-relative function](https://support.innovint.us/hs-fs/hubfs/Printing%20Work%20Orders-relative%20function.webp?width=670&height=272&name=Printing%20Work%20Orders-relative%20function.webp)
- **Task Summary:** A task summary immediately follows each printed task. The summary condenses the task details into lot (including lees) and vessel counts (by type), and would include additives, samples, bottling formats, etc. depending on the task.
- **Work Order Completion Details:**The completion details are printed at the bottom of the last page of the summarized view. This provides space for cellar staff to sign off on the completed work.
  ![Printing Work Orders-wo completion details](https://support.innovint.us/hs-fs/hubfs/Printing%20Work%20Orders-wo%20completion%20details.webp?width=670&height=39&name=Printing%20Work%20Orders-wo%20completion%20details.webp)

---

#### Summarized View with Vessel List

The Summarized View with Vessel List will include all pages of the Summarized View, and then provides a Vessel List for each task - the vessel list is displayed on additional pages listing each individual vessel involved for each task.

![WO Print - vessel list](https://support.innovint.us/hs-fs/hubfs/WO%20Print%20-%20vessel%20list.png?width=670&height=650&name=WO%20Print%20-%20vessel%20list.png)

- **Individual Vessel Rows** are printed below the lot properties.

  - If you choose “Let cellar staff choose vessels”

    The text “*No vessels selected*” is printed below the lot properties.

    ![Printing Work Orders-no vessel selected](https://support.innovint.us/hs-fs/hubfs/Printing%20Work%20Orders-no%20vessel%20selected.webp?width=670&height=39&name=Printing%20Work%20Orders-no%20vessel%20selected.webp)
  - If you “Choose specific vessels”

    Vessels are arranged in two columns.

    ![Printing Work Orders-vessels in columns](https://support.innovint.us/hs-fs/hubfs/Printing%20Work%20Orders-vessels%20in%20columns.webp?width=670&height=97&name=Printing%20Work%20Orders-vessels%20in%20columns.webp)

### Basic Browser & Simplified Vessel views

Oldies but goodies - these are straightforward methods to print what you see and display in a portrait view.

#### Basic Browser version

This option immediately loads a print dialogue box.

**Task Limitations:** This print option supports all work order tasks.

**Vessel display**: Each vessel is displayed on its own row.

**Notes and Instructions:** The work order instruction field prints as long as it is expanded. Task level notes and instructions print as displayed.

**Header/page breaks**: The first page includes the work order header containing the ID, work order assignee, due date and owners (if applicable). There is no QR code included and page breaks occur across tasks and vessel lists without additional headers.

**Printed volumes:** This version prints the requested volume and leaves the actual ending or added volume field empty. There is no specified location for dip measurements. The print version will not update with submitted volumes.

**Task Summary:** There is no summary section.

**Work Order Completion Details:** There is no designated completion area for sign off.

![Basic Browser version](https://support.innovint.us/hs-fs/hubfs/Basic%20Browser%20version.png?width=670&height=844&name=Basic%20Browser%20version.png)

#### Simplified Vessel view

This view opens a new browser tab that looks very much like the work order details view, but you are unable to navigate into any of the fields. Use the browser controls to print this as is, or save the work order as a pdf.

**Task Limitations:** This print option supports all work order tasks.

**Vessel display**: The work order consolidates the vessels into groups, similar to the summarized view - there is no individual vessel view unless the lot is in a single vessel.

**Notes and Instructions:** The work order instruction field prints as long as it is expanded. Task level notes and instructions also display as on screen.

**Header/page breaks**: The first page header includes the work order ID, work order assignee, due date and owners (if applicable). There is no QR code includes and page breaks occur across tasks and vessel lists without additional headers.

**Printed volumes:** This version prints whatever is on the screen at the time of the printing selection for most work order stages. There is no specified location for dip measurements. The print version will not update with submitted volumes.

**Task Summary:** There is no summary section.

**Work Order Completion Details:** There is no designated completion area for sign off.

![Simplified Vessel View - in browser](https://support.innovint.us/hs-fs/hubfs/Simplified%20Vessel%20View%20-%20in%20browser.png?width=670&height=352&name=Simplified%20Vessel%20View%20-%20in%20browser.png)

In the print preview:

![Simplified Vessel View - print preview](https://support.innovint.us/hs-fs/hubfs/Simplified%20Vessel%20View%20-%20print%20preview.png?width=670&height=594&name=Simplified%20Vessel%20View%20-%20print%20preview.png)

---

### Controlling your Print Options

Admins can specify and organize the default print options that appear in the Work Order print menu.

![WO Print - defaults](https://support.innovint.us/hs-fs/hubfs/WO%20Print%20-%20defaults.png?width=670&height=93&name=WO%20Print%20-%20defaults.png)

Go to Settings/Work Order print to make your selections.

![WO Print - settings](https://support.innovint.us/hs-fs/hubfs/WO%20Print%20-%20settings.png?width=670&height=343&name=WO%20Print%20-%20settings.png)

### Optimizing Printer Settings

In some instances, you may need to adjust your printer settings for optimal experience.

In the print dialog in Chrome:

1. Click 'More Settings"
2. Set Margins to "minimum"
3. Toggle OFF "Headers and footers"
4. Toggle ON "Background graphics"

---

### Frequently Asked Questions

**Q. Why are values missing/different when I print a submitted work order?**

*A: Work order print designs are optimized for open work orders. The default behavior is to print requested values instead of actual when appropriate. Only the Starting and Add/Remove amounts are printed, leaving the Ending and Dip Measurement values empty (with some exceptions). If a user would like to print the work order after submission (or include the actual values instead of the requested), we recommend printing the basic browser version.*

**Q: What happens to skipped tasks if I skip a task before printing the work order?** *A: Skipped tasks are not included in the printed summarized view or vessel list.
However, the work order header will count all tasks, including the skipped task. For example, a work order contains 3 tasks and 1 is skipped. The work order header will count 3 total tasks.
The task number in the task properties will not include the skipped task. For example, a work order contains 3 tasks (Rack, Analysis, then Addition) and the Analysis task (2nd task) is skipped. The task number for Rack is 1, and the task number for Addition is 2.*

*Editable pdf does not display skipped tasks, and also does not provide a task count in the header.*

**Q: What do the QR codes do?**

*A: QR Codes in Work Order Headers can be scanned using a handheld scanner, or the QR Code scanner in the desktop application. This will pull up the Work Order within the same browser window of the Desktop app, allowing for faster data entry. More information about QR Code scanning functionality can be found [here](https://support.innovint.us/hc/en-us/how-to-use-qr-codes-in-innovint?hsLang=en).*
