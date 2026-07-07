---
id: "32303349626004"
title: "Print Template Tags"
url: "https://support.vintrace.com/hc/en-us/articles/32303349626004-Print-Template-Tags"
category: "Setup and Admin"
section: "Custom Print Templates"
created_at: "2024-11-20T15:52:35Z"
updated_at: "2024-11-21T10:29:45Z"
labels: ["oldui"]
gist: "This article details the tags that are available with the various templates and mini templates that can be included in work order print templates."
tags: ["exports", "additives", "transfers", "configuration", "blending", "work-orders"]
---

# Print Template Tags

This article details the tags that are available with the various templates and mini templates that can be included in [work order print templates](https://support.vintrace.com/hc/en-us/articles/32301321572116).

[A](#h_01EQGJFBG2WCKWW2NM078R7PMN)  [B](#h_01EQGJFKRX6V428M0872EK63G6) [C](#h_01EQGMNM86486QF2R2124A2FZX)  [D](#h_01EQGMNB77RZNXSHFP0H3NEA8X)  [E](#h_01EQGMN10Y45VN9684D6E63P6K)  [F](#h_01EQGMMQC9RMV9W86QRRZ2XP7W)  [G](#h_01EQGMMC6VPYP2289ASB5AE5ZJ)  [H](#h_01EQGMM3K053SKN2MM980ABBAF)  [I](#h_01EQGMKRFXDMCBE2X6BA2E24YD)  J  K  L  [M](#h_01EQGMKET2H30CX1N85CX2JP7G)  N  O  [P](#h_01EQGMK4RG0D7WA3CM1VN3F8G9)  Q  [R](#h_01EPZ0GVG2Q2MN4FNPRDZV3A5E)  [S](#h_01EQGMJJ4GZJV8JR56F068A9J0)  [T](#h_01EQGMJ6EEQPQQQ9J4SBJA77A9)  U  V  W  X  Y  Z

---

# A-E

## Additions

|  |  |
| --- | --- |
| **Description:** | The Additions mini template inserts a table with a listing of the wine's additions. |
| **Default filename:** | Additions\_MiniTemplate.docx |
| **Tag to include this mini template:** | {{AdditionsList}} |
| **Used by the following templates:** | - [Additive](#h_01EPZ0EBR0D0ZT45V2510S7RR4) - [Bulk wine intake](#h_01EPZ0ERDPQ7PW7ZPJK1WFGSYM) - [Extraction](#h_01EPZ0EZYTQMMJDVK9XY6KA1SC) - [Multi topping](#h_01EPZ0FJX5TC5JJSTKQ598XGGD) - [Multi transfer](#h_01EPZ0FZ27AV941NNFDHPDJJ43) - [Multi transfer (many-to-one)](#h_01EPZ0G8XYJXH5BHS7TZWHN1TV) - [Press cycle](#h_01EPZ0GHPF5KSH1CK1302C3PTM) - [Rack and return](#h_01EPZ0GVG2Q2MN4FNPRDZV3A5E) - [Transfer/rack/blend](#h_01EPZ0H73KQ74ATG783ED54P44) |

The following tags are available in the Additions mini template.

| Tag | Description |
| --- | --- |
| {{TableStart:AdditionsList}} | \*Start of the list of additions mini template |
| {{TableStart:additionsList}} | \*Start of the list of addition items  This tag should be inside the TableStart::AdditionsList and TableEnd::AdditionsList tags. |
| {{additive}} | The name of the additive |
| {{rateOfAdd}} | The rate of the additive being added |
| {{amountDescription}} | The amount of additive added |
| {{additionalNotes}} | The routing description of the additive |
| {{TableEnd:additionsList }} | \*End of the list of addition items  This tag should be inside the TableStart::AdditionsList and TableEnd::AdditionsList tags. |
| {{TableEnd:AdditionsList}} | \*End of the list of additions mini template |

[Return to top of page.](#top_of_page)

---

## Additive

The following tags are available in the Additive template.

| Tag | Description |
| --- | --- |
| {{TableStart:info}} | \*Start of the list of info items |
| {{jobNumber}} | The job number of the task |
| {{operationName}} | The name of the operation, in this case ‘Addition’ |
| {{statusText}} | Shows "Completed" for a completed task and "Reversed" for a task that has been reversed or rolled back |
| {{containerLabel}} | The type of Vessel/Container. Possible values are: Barrels - if the container type is a barrel group Barrel - if the container type is a single barrel Tank - if the container type is a tank Bin - if the container type is a bin Bins - if the container type is a bin group Tanker - if the container type is a tanker Press - if the container type is a press Vessel - for all other types of container |
| {{container}} | The Vessel/Container name/id |
| {{containerDetails}} | The number of barrels and location if the vessel is a barrel group, otherwise it will show the vessel's contents amount and capacity |
| {{batchCode}} | The contents of the Vessel/Container |
| {{batchDescription}} | The description of the batch |
| {{additiveName}} | The additive to be added to the batch |
| {{additiveRate}} | The rate of additive being added |
| {{additionalNotes}} | The routing information of the additive |
| {{amountQuantity}} | The amount of additive being added |
| {{productTreatment}} | The treatment being applied to the product |
| {{procedure}} | The procedure information of the product treatment applied |
| {{productState}} | The new state of the product |
| {{VesselDetails}} | \*Vessel details for the destination vessels. Inserts the mini template for dip measurements if the destination vessel is a tank or the mini template for barrel list if it is a barrel group.  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{taskNotes}} | Notes for the individual task |
| {{TableEnd:info}} | \*End of the list of info items |

[Return to top of page.](#top_of_page)

---

## Analysis

The following tags are available in the Analysis template.

| Tag | Description |
| --- | --- |
| {{TableStart:info}} | \*Start of the list of info items |
| {{jobNumber}} | The job number of the task |
| {{operationName}} | The name of the operation. In this case ‘Analysis Sample’ |
| {{statusText}} | Shows "Completed" for a completed task and "Reversed" for a task that has been reversed or rolled back |
| {{templateName}} | The name of the Analysis Template being used |
| {{lab}} | The name of the lab where the analysis is being done |
| {{labId}} | The Lab id |
| {{labReference}} | The contents of the Lab Reference field |
| {{sampleInstruction}} | The contents of the Sample Instruction field |
| {{containerLabel}} | The type of Vessel/Container. Possible values are: Barrels - if the container type is a barrel group Barrel - if the container type is a single barrel Tank - if the container type is a tank Bin - if the container type is a bin Bins - if the container type is a bin group Tanker - if the container type is a tanker Press - if the container type is a press Vessel - for all other types of container |
| {{container}} | The Vessel/Container name/id |
| {{containerDetails}} | The number of barrels and location if the vessel is a barrel group, otherwise it will show the vessel's contents amount and capacity |
| {{batch}} | The contents of the Vessel/Container |
| {{dipCalcTankVol}} | The volume used in the calculation of the current Dip |
| {{AnalysisDetails}} | \*Inserts the mini template for analsyis which will show the metrics and value  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{taskNotes}} | Notes for the individual task |
| {{TableEnd:info}} | \*End of the list of info items |

[Return to top of page.](#top_of_page)

---

## Analysis Details

|  |  |
| --- | --- |
| **Description:** | The Analysis Details mini template inserts a table that displays the metrics and value. |
| **Default filename:** | AnalysisDetails\_MiniTemplate.docx |
| **Tag to include this mini template:** | {{AdditionsDetails}} |
| **Used by the following templates:** | - Analysis |

The following tags are available in the Analysis Details mini template.

| Tag | Description |
| --- | --- |
| {{TableStart:AnalysisDetails}} | \*Start of the analysis details mini template |
| {{TableStart:analysisDetailsList}} | \*Start of the list of analsyis details  This tag should be inside the TableStart::AnalysisDetails and TableEnd::AnalysisDetails tags. |
| {{metric1}} {{value1}} {{metric2}} {{value2}} {{metric3}} {{value3}} {{metric4}} {{value4}} | The list of metrics and their corresponding value. |
| {{TableEnd:analysisDetailsList}} | \*End of the list of analysis details  This tag should be inside the TableStart::AnalysisDetails and TableEnd::AnalysisDetails tags. |
| {{TableEnd:VesselDetails}} | \*End of the analysis details mini template |

[Return to top of page.](#top_of_page)

---

## Barrel Treatment

The following tags are available in the Barrel Treatment template.

| Tag | Description |
| --- | --- |
| {{TableStart:info}} | \*Start of the list of info items |
| {{jobNumber}} | The job number of the task |
| {{operationName}} | The name of the operation. In this case shows the treatment name. |
| {{statusText}} | Shows "Completed" for a completed task and "Reversed" for a task that has been reversed or rolled back |
| {{treatment}} | The treatment instructions |
| {{treatmentOperation}} | The treatment operation to be performed |
| {{route}} | The route the stock is taken from |
| {{stockItem}} | The stock item being used in treatment |
| {{TableStart:barrels}} | \*Start of the list of barrels to be treated  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{barrel1}} {{volume1}} {{barrel2}} {{volume2}} {{barrel3}} {{volume3}} {{barrel4}} {{volume4}} | The list of barrels and their corresponding volume.  The volume shows the volume and [P] if the barrel is full, shows [E] if empty empty, else it shows [P] and the current volume of the barrel. |
| {{TableEnd:barrels}} | \*End of the list of barrels to be treated  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{taskNotes}} | Notes for the individual task |
| {{TableEnd:info}} | \*End of the list of info items |

[Return to top of page.](#top_of_page)

---

## Barrel Additions

|  |  |
| --- | --- |
| **Description:** | The Barrel Additions mini template inserts a table with a listing of the barrel's additions. |
| **Default filename:** | BarrelAdditions\_MiniTemplate.docx |
| **Tag to include this mini template:** | {{AdditionsList}} |
| **Used by the following templates:** | - Additive - Multi Additions |
| **Notes:** | The {{AdditionsList}} tag only displays the barrel additions list if the vessel/container type is a barrel group in an Additive operation. |

The following tags are available in the Barrel Additions mini template.

| Tag | Description |
| --- | --- |
| {{TableStart:AdditionsList}} | \*Start of the list of barrel additions mini template |
| {{TableStart:additiveList}} | \*Start of the summary of the additives which shows the total amount per additive for the job  This tag should be inside the TableStart::AdditionsList and TableEnd::AdditionsList tags. |
| {{additive}} | The name of the Additive |
| {{amountDescription}} | The total amount of additive added |
| {{rateOfAdd}} | The rate of the additions |
| {{additionalNotes}} | The routing information of the additive |
| {{TableEnd:additiveList }} | \*End of the summary of the additives  This tag should be inside the TableStart::AdditionsList and TableEnd::AdditionsList tags. |
| {{TableStart:mappedAdditionsGroupedByVol}} | \*Start of the barrels list  This tag should be inside the TableStart::AdditionsList and TableEnd::AdditionsList tags. |
| {{containerText}} | The container details |
| {{barrelVolume}} | The volume in the barrel |
| {{TableStart:additiveMapInfoWrappers}} | \*Start of the barrel additives list  This tag should be inside the TableStart:mappedAdditionsGroupedByVol and TableEnd:mappedAdditionsGroupedByVol. |
| {{amountDescription}} | The amount of additive added |
| {{additive}} | The name of the Additive |
| }}{{TableEnd:additiveMapInfoWrappers}} | \*Start of the barrel additives list  This tag should be inside the TableStart:mappedAdditionsGroupedByVol and TableEnd:mappedAdditionsGroupedByVol. |
| {{TableEnd:mappedAdditionsGroupedByVol}} | \*End of the barrels list |
| {{TableEnd:AdditionsList}} | \*End of the list of barrel additions mini template  This tag should be inside the TableStart::AdditionsList and TableEnd::AdditionsList tags. |

[Return to top of page.](#top_of_page)

---

## Barrel List

|  |  |
| --- | --- |
| **Description:** | The Barrel List mini template inserts a table with a listing of a barrel group's barrels and volume details. |
| **Default filename:** | BarrelList\_MiniTemplate.docx |
| **Tag to include this mini template:** | {{VesselDetails}} |
| **Used by the following templates:** | - Additive - Bulk wine intake - Extraction - Measurement - Multi additions - Multi topping - Multi transfer - Multi transfer (many-to-one) - New bulk dispatch - Press cycle - Rack and return - Tirage - Transfer/rack/blend |
| **Notes:** | The {{VesselDetails}} tag only displays the barrel list mini template if the vessel/container type is a barrel group. |

The following tags are available in the Barrel List mini template.

| Tag | Description |
| --- | --- |
| {{TableStart:VesselDetails}} | \*Start of the vessel details mini template |
| {{TableStart:barrelListDetails}} | \*Start of the list of barrels  This tag should be inside the TableStart::VesselDetails and TableEnd::VesselDetails tags. |
| {{barrel1}} {{volume1}} {{barrel2}} {{volume2}} {{barrel3}} {{volume3}} {{barrel4}} {{volume4}} | The list of barrels and their corresponding volume.  The volume shows the volume and [P] if the barrel is full, shows [E] if empty empty, else it shows [P] and the current volume of the barrel. |
| {{TableEnd:barrelListDetails}} | \*End of the list of barrels  This tag should be inside the TableStart::VesselDetails and TableEnd::VesselDetails tags. |
| {{TableStart:blankBarrelDetails}} | \*Start of the list of blank barrels  This tag should be inside the TableStart::VesselDetails and TableEnd::VesselDetails tags. |
| {{barrel1}} | Prints blank rows if the barrel group has no barrels |
| {{TableEnd:blankBarrelDetails}} | \*End of the list of blank barrels  This tag should be inside the TableStart::VesselDetails and TableEnd::VesselDetails tags. |
| {{barrelLocation}} | Location of the barrel group |
| {{TableEnd:VesselDetails}} | \*End of the vessel details mini template |

[Return to top of page.](#top_of_page)

---

## Bin Details

|  |  |
| --- | --- |
| **Description:** | The Bin Details mini template displays the number of bottles, and the name, location, and bay of the tirage bin for the current, new, and split bin group. |
| **Default filename:** | BinDetails\_MiniTemplate.docx |
| **Tag to include this mini template:** | The following tags are used separately in the main template where it displays:   - {{CurrentBinDetails}} - {{NewBinDetails}} - {{SplitConfigBinDetails}} |
| **Used by the following templates:** | - [Tirage Admin](#h_01EQGN0Y2JXQ93N8Z2PYSD63B6) |

The following tags are available in the Bin Details mini template.

| Tag | Description |
| --- | --- |
| {{TableStart:BinDetails}} | \*Start of the list of bin details mini template |
| {{binDetailsType}} | The type of bin details. Possible values: Current Bin Details New Bin Details Split Configuration  This tag should be inside the TableStart::BinDetails and TableEnd::BinDetails tags. |
| {{TableStart:binList}} | \*Start of the list of bins |
| {{bottleCount}} | The number of bottles |
| {{name}} | The name of the bin |
| {{location}} | The location of the bin |
| {{bay}} | The bay of the bin |
| {{TableEnd:binList}} | \*End of the list of bins  This tag should be inside the TableStart::BinDetails and TableEnd::BinDetails tags. |
| {{TableEnd:BinDetails}} | \*End of the list of bin details mini template |

[Return to top of page.](#top_of_page)

---

## Break and Top

Below is the list of tags that can be used within a Break and top custom template.

| Tag | Description |
| --- | --- |
| {{TableStart:info}} | \*Start of the list of info items |
| {{jobNumber}} | The job number of the task |
| {{operationName}} | The name of the operation. In this case ‘Break and top’ |
| {{statusText}} | Shows "Completed" for a completed task and "Reversed" for a task that has been reversed or rolled back |
| {{wpcName}} | The name of the product |
| {{wpcDescription}} | The description of the product |
| {{productState}} | The current state of the product |
| {{TableStart:barrelsToTop}} | \*Start of the list of barrel to top  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{barrel1}} {{volume1}} {{barrel2}} {{volume2}} {{barrel3}} {{volume3}} {{barrel4}} {{volume4}} | The list of barrels and their corresponding volume.  The volume shows the volume and [P] if the barrel is full, shows [E] if empty empty, else it shows [P] and the current volume of the barrel. |
| {{TableEnd:barrelsToTop}} | \*End of the list of barrels to top  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{TableStart:brokenBarrels}} | \*Start of the list of barrels to be broken out of the group  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{barrel1}} {{volume1}} {{barrel2}} {{volume2}} {{barrel3}} {{volume3}} {{barrel4}} {{volume4}} | The list of barrels and their corresponding volume.  The volume shows the volume and [P] if the barrel is full, shows [E] if empty empty, else it shows [P] and the current volume of the barrel. |
| {{TableEnd:brokenBarrels}} | \*End of the list of barrels to be broken out of the group  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{taskNotes}} | Notes for the individual task |
| {{TableEnd:info}} | \*End of the list of info items |

[Return to top of page.](#top_of_page)

---

## Bulk Dispatch

The following tags are available in the Bulk Dispatch template.

| Tag | Description |
| --- | --- |
| {{TableStart:info}} | \*Start of the list of info items |
| {{jobNumber}} | The job number of the task |
| {{operationName}} | The name of the operation. In this case ‘BULK DISPATCH’ with the Dispatch Type |
| {{statusText}} | Shows "Completed" for a completed task and "Reversed" for a task that has been reversed or rolled back |
| {{dispatchToName}} | The location the goods will be sent to |
| {{driverName}} | The Driver transporting the product |
| {{carrierName}} | The Carrier transporting the product |
| {{rego}} | The Vehicle Number/Registration Number transporting the product |
| {{connote}} | The Consignment Note for the delivery |
| {{TableStart:detailList}} | \*Start of the list of details  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{containerLabel}} | The type of Vessel/Container. Possible values are:  Barrels - if the container type is a barrel group Barrel - if the container type is a single barrel Tank - if the container type is a tank Bin - if the container type is a bin Bins - if the container type is a bin group Tanker - if the container type is a tanker Press - if the container type is a press Vessel - for all other types of container |
| {{container}} | The Vessel/Container name/id |
| {{fromBatch}} | The batch code of contents of the Vessel/Container |
| {{containerDetails}} | The number of barrels and location if the vessel is a barrel group, otherwise it will show the vessel's contents amount and capacity |
| {{transferAmount}} | The volume of amount transferred |
| {{fullTransferMark}} | Shows "Yes" when the amount transferred is the full amount, otherwise, shows "No" |
| {{useGasMark}} | Shows "Yes" when the amount transferred is to use Gas, otherwise, shows "No" |
| {{VesselDetails}} | \*Vessel details for the source vessel. Inserts the mini template for dip measurements if the vessel is a tank or the mini template for barrel list if it is a barrel group. |
| {{TankerDetails}} | \*Tanker details for the source vessel. Inserts the Simplte Tanker Detail mini template when the dispatch type selected is "Bottling", otherwise, inserts the Tanker Details mini template.  This tag should be inside the TableStart::detailList and TableEnd::detailsList tags. |
| {{TableEnd:detailList}} | \*End of the list of detail  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{taskNotes}} | Notes for the individual task |

[Return to top of page.](#top_of_page)

---

## Bulk Wine Intake

The following tags are available in the Bulk Wine Intake template.

| Tag | Description |
| --- | --- |
| {{TableStart:info}} | \*Start of the list of info items |
| {{jobNumber}} | The job number of the task |
| {{operationName}} | The name of the operation. In this case ‘BULK WINE INTAKE’ |
| {{statusText}} | Shows "Completed" for a completed task and "Reversed" for a task that has been reversed or rolled back |
| {{volume}} | The volume of product transported |
| {{driverName}} | The Driver transporting the product |
| {{carrierName}} | The Carrier transporting the product |
| {{rego}} | The Vehicle Number/Registration Number transporting the product |
| {{connote}} | The Consignment Note for the delivery |
| {{product}} | The type of product. Possible values: Wine/Juice Neutral Condensate |
| {{fraction}} | The type of fraction. Possible values: Free run Pressings Combined Must Lees  Unknown Combined Condensate Pressings (Heavy) Pressings (Light) Pressings (Overnight) Drainings Saignée |
| {{color}} | The wine colour. Possible values: Red White Rosé Blend |
| {{fermentState}} | The Alcoholic and Malolactic ferment state. |
| {{productState}} | The state of the product |
| {{treatment}} | The name of the selected Treatment |
| {{treatmentInfo}} | Details of the treatment process |
| {{instruction}} | The additional instructions on the treatment |
| {{grading}} | The grading of the product |
| {{TableStart:components}} | \*Start of the list of components  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{VALUE}} | A component of the product |
| {{TableEnd:components}} | \*End of the list of components  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{vessel}} | The Vessel/Container name/id |
| {{batch}} | The contents of the Vessel/Container |
| {{compartmentNumber}} | The compartment number where product is stored during transport |
| {{sealNumber}} | The number used to seal the trailer |
| {{cipNumber}} | The ‘Carriage and Insurance Paid To’ Number |
| {{analysis}} | Analysis details for the product |
| {{TableStart:transferList}} | \*Start of the list of transfers. This is the list that contains the information for the destination vessels.  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{productState}} | The new state of the transferred product |
| {{amount}} | The amount to be transferred |
| {{containerLabel}} | The type of Vessel/Container. Possible values are:  Barrels - if the container type is a barrel group Barrel - if the container type is a single barrel Tank - if the container type is a tank Bin - if the container type is a bin Bins - if the container type is a bin group Tanker - if the container type is a tanker Press - if the container type is a press Vessel - for all other types of container |
| {{container}} | The Vessel/Container name/id |
| {{containerDetails}} | The number of barrels and location if the vessel is a barrel group, otherwise it will show the vessel's contents amount and capacity |
| {{batch}} | The contents of the Vessel/Container |
| {{VesselDetails}} | \*Vessel details for the source vessel. Inserts the mini template for dip measurements if the vessel is a tank or the mini template for barrel list if it is a barrel group.  This tag should be inside the TableStart::transferList and TableEnd::transferList tags. |
| {{AdditionsList}} | \*Inserts the mini template for additions on the destination vessels.  This tag should be inside the TableStart::transferList and TableEnd::transferList tags. |
| {{TableEnd:transferList}} | \*End of the list of transfers  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{taskNotes}} | Notes for the individual task |
| {{TableEnd:info}} | \*End of the list of info items |

[Return to top of page.](#top_of_page)

---

## Change Batch

The following tags are available in the Change Batch template.

| Tag | Description |
| --- | --- |
| {{TableStart:info}} | \*Start of the list of info items |
| {{jobNumber}} | The job number of the task |
| {{operationName}} | The name of the operation. In this case ‘Change batch’ |
| {{statusText}} | Shows "Completed" for a completed task and "Reversed" for a task that has been reversed or rolled back |
| {{containerLabel}} | The type of Vessel/Container. Possible values are:  Barrels - if the container type is a barrel group Barrel - if the container type is a single barrel Tank - if the container type is a tank Bin - if the container type is a bin Bins - if the container type is a bin group Tanker - if the container type is a tanker Press - if the container type is a press Vessel - for all other types of container |
| {{container}} | The Vessel/Container name/id |
| {{containerContentsAmount}} | The amount of the contents within the Vessel |
| {{container.capacity}} | The vessels capacity |
| {{fromBatch}} | The contents of the from Vessel/Container |
| {{fromBatchDescription}} | The description of the from batch |
| {{toBatch}} | The contents of the to Vessel/Container |
| {{toBatchDescription}} | The description of the to batch |
| {{taskNotes}} | Notes for the individual task |
| {{TableEnd:info}} | \*End of the list of info items |

[Return to top of page.](#top_of_page)

---

## Dip Measurements

|  |  |
| --- | --- |
| **Description:** | The Dip Measurements mini template inserts a table of the tank's dip measurements. |
| **Default filename:** | DipMeasurements\_MiniTemplate.docx |
| **Tag to include this mini template:** | {{VesselDetails}}  The {{VesselDetails}} tag only displays the dip measurement mini template if the vessel/container type is a tank. |
| **Used by the following templates:** | - Additive - Bulk wine intake - Extraction - Measurement - Multi additions - Multi topping - Multi transfer - Multi transfer (multi to single) - New bulk dispatch - Press cycle - Rack and return - Tirage - Transfer/rack/blend |

The following tags are available in the Dip Measurements mini template.

| Tag | Description |
| --- | --- |
| {{TableStart:VesselDetails}} | \*Start of the vessel details |
| {{beforeDip}} | The dip value before operation |
| {{beforeVol}} | The volume before operation |
| {{afterDip}} | The dip value after operation |
| {{afterVol}} | The volume after operation |
| {{TableEnd:VesselDetails}} | \*End of the vessel details |

[Return to top of page.](#top_of_page)

---

## Disgorging

The following tags are available in the Disgorging template.

| Tag | Description |
| --- | --- |
| {{TableStart:info}} | \*Start of the list of info items |
| {{jobNumber}} | The job number of the task |
| {{operationName}} | The name of the operation. |
| {{statusText}} | Shows "Completed" for a completed task and "Reversed" for a task that has been reversed or rolled back |
| {{manufacturedItemCode}} | Code of manufactured product |
| {{lot}} | The lot named for the manufactured product |
| {{containerDetails}} | The number of barrels and location if the vessel is a barrel group, otherwise it will show the vessel's contents amount and capacity |
| {{fromItemBatchCode}} | The contents of the Vessel/Container |
| {{fromItemBatchDescription}} | The description of the Vessel/Container |
| {{volumeOut}} | The volume coming out of the source vessel |
| {{fullXfer}} | Shows "Full transfer" when the product is a full transfer, otherwise, the field is blank. |
| {{useGas}} | Shows "Use gas" when the product uses Gas, otherwise, the field is blank. |
| {{productState}} | The current state of the product on the source side |
| {{bottlingLine}} | The bottling line used in packaging |
| {{totalTarget}} | The expected total units/volume packaged |
| {{TableStart:bomItems}} | \*Start of the list of BoM items  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{pricePerUnit}} | The price per unit of the stock item |
| {{itemCode}} | The stock items code |
| {{itemDesc}} | The stock items description |
| {{lotBatch}} | The lot/batch where the item is located |
| {{storageAreaCode}} | Storage Area to source BOM item |
| {{buildingName}} | Building to source BOM item |
| {{TableEnd:bomItems}} | Close area for Bom items. |
| {{TableStart:routedItems}} | Start of route details for destination product |
| {{quantity}} | Amount routed |
| {{storageAreaCode}} | To storage area |
| {{buildingName}} | To building storage area is in |
| {{bin}} | The Bin of the routed item |
| {{TableEnd:routedItems}} | End of routing section |
| {{TableStart:binList}} | Start of bin details |
| {{bottleCount}} | The number of bottles |
| {{name}} | Name of Bin |
| {{storageAreaCode}} | To storage area |
| {{buildingName}} | To building storage area is in |
| {{bay}} | Bay Bin is located |
| {{TableEnd:binList}} | End of Bin list |
| {{TableStart:events}} | Start of QA/Breakage events |
| {{reason}} | The type of Event that occurred |
| {{time}} | The time the event occurred |
| {{note}} | Additional notes on the event |
| {{TableEnd:events}} | End of events section |
| {{taskNotes}} | Notes for the individual task |
| {{TableEnd:info}} | \*End of the list of QA  items |

[Return to top of page.](#top_of_page)

---

## Equipment Treatment

The following tags are available in the Equipment Treatment template.

| Tag | Description |
| --- | --- |
| {{TableStart:info}} | \*Start of the list of info items |
| {{jobNumber}} | The job number of the task |
| {{operationName}} | The name of the operation. In this case it will show the treatment name. |
| {{statusText}} | Shows "Completed" for a completed task and "Reversed" for a task that has been reversed or rolled back |
| {{treatment}} | The type of treatment being performed |
| {{treatmentOperation}} | The treatment operation to be performed |
| {{route}} | The route the stock is taken from |
| {{TableStart:equipments}} | \*Start of the list of equipment to be treated  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{equipment1}} {{equipment2}} {{equipment3}} {{equipment4}} {{equipment5}} {{equipment6}} {{equipment7}} {{equipment8}} | Equipment name |
| {{TableEnd:equipments}} | \*End of the list of equipment to be treated  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{taskNotes}} | Notes for the individual task |
| {{TableEnd:info}} | \*End of the list of info items |

[Return to top of page.](#top_of_page)

---

## Extraction

The following tags are available in the Extraction template.

| Tag | Description |
| --- | --- |
| {{TableStart:info}} | \*Start of the list of info items |
| {{jobNumber}} | The job number of the task |
| {{operationName}} | The name of the operation. In this case the fruit process if selected, otherwise, ‘Process fruit’ |
| {{statusText}} | Shows "Completed" for a completed task and "Reversed" for a task that has been reversed or rolled back |
| {{TableStart:parcelList}} | \*Start of the list of parcels  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{bookingNumber}} | The booking number for the parcel |
| {{formattedBookingExpectedDate}} | The arrival date of the parcel |
| {{growerName}} | The grower of the parcel |
| {{vineyardName}} | The vineyards name that grew the parcel |
| {{block}} | The area where the parcel was grown |
| {{varietalName}} | The name of the Varietal of the parcel |
| {{bookingExpectedNoLoads}} | The number of loads of the parcel |
| {{bookingExpectedWeight}} | The expected weight of the parcel |
| {{TableEnd:parcelList}} | \*End of the list of parcels  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{treatment}} | The type of treatment being performed |
| {{treatmentProcedure}} | The treatment operation to be performed |
| {{crusher}} | The crusher/roller used in extraction |
| {{press}} | The press used in extraction |
| {{isDestem}} | Marks an ‘X’ when the extracted product must be destemmed |
| {{isChill}} | Marks an ‘X’ when the extracted product must be chilled |
| {{AdditionsList}} | \*Inserts the mini template for additions |
| {{TableStart:fractionList}} | \*Start of the list of fraction  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{extractionType}} | The type of extraction performed |
| {{weight}} | The weight for must fraction type |
| {{rate}} | The rate of extraction for must fraction type |
| {{amount}} | The extracted amount |
| {{containerLabel}} | The type of Vessel/Container. Possible values are:  Barrels - if the container type is a barrel group Barrel - if the container type is a single barrel Tank - if the container type is a tank Bin - if the container type is a bin Bins - if the container type is a bin group Tanker - if the container type is a tanker Press - if the container type is a press Vessel - for all other types of container |
| {{containerName}} | The Vessel/Container name/id |
| {{batchName}} | The contents of the Vessel/Container |
| {{batch.description}} | The description of the batch |
| {{containerDetails}} | The number of barrels and location if the vessel is a barrel group, otherwise it will show the vessel's contents amount and capacity |
| {{AdditionsList}} | \*Inserts the mini template for inline additions on the destination vessels.  This tag should be inside the TableStart::fractionList and TableEnd::fractionList tags. |
| {{VesselDetails}} | \*Vessel details for the destination vessels. Inserts the mini template for dip measurements if the destination vessel is a tank or the mini template for barrel list if it is a barrel group.  This tag should be inside the TableStart::fractionList and TableEnd::fractionList tags. |
| {{TableEnd:fractionList}} | \*End of the list of fraction  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{taskNotes}} | Notes for the individual task |
| {{TableEnd:info}} | \*End of the list of info items |

[Return to top of page.](#top_of_page)

---

## Footer

There are not tags in the Footer template.

# G-Q

## General Instructions

|  |  |
| --- | --- |
| **Description:** | The General Instructions mini template inserts a table of the work order's general instructions. |
| **Default filename:** | GeneralInstruction\_MiniTemplate.docx |
| **Tag to include this mini template:** | {{GeneralInstructions}} |
| **Used by the following templates:** | - Header |

The following tags are available in the General Instructions mini template.

| Tag | Description |
| --- | --- |
| {{TableStart:instructions}} | \*Start of the list of info items |
| {{worksheetNotes}} | The general instructions for the work order. |
| {{TableEnd:instructions}} | \*End of the list of info items |

[Return to top of page.](#top_of_page)

---

## General Task

The following tags are available in the General Task template.

| Tag | Description |
| --- | --- |
| {{TableStart:info}} | \*Start of the list of info items |
| {{jobNumber}} | The job number of the task |
| {{operationName}} | The name of the operation. In this case ‘General Task’ |
| {{statusText}} | Shows "Completed" for a completed task and "Reversed" for a task that has been reversed or rolled back |
| {{summary}} | The name/summary of the task |
| {{additionalInfo}} | The description of the task and steps involved |
| {{taskNotes}} | Notes for the individual task |
| {{TableEnd:info}} | \*End of the list of info items |

[Return to top of page.](#top_of_page)

---

## Header

The contents of the Header template must be enclosed within the {{TableStart:taskGroup}} and {{TableEnd:taskGroup}} tags.

![Header_Template_and_Example_20201112.png](https://support.vintrace.com/hc/article_attachments/32329161140756)

The following tags are available in the Header template.

| Tag | Description |
| --- | --- |
| {{TableStart:taskGroup}} | \*Start of the list of taskGroup items |
| {{formattedBondName}} | Bond Number |
| {{assignedToName}} | The user the task is assigned to |
| {{formattedScheduledDate}} | The date the task is scheduled to be completed |
| {{assignedByName}} | The user the task was assigned by |
| {{formattedAssignedDateAndTime}} | The date and time the task was issued |
| {{TableStart:indicators}} | \*Start of the list of indicators  This tag should be inside the TableStart::taskGroup and TableEnd::taskGroup tags. |
| {{VALUE}} | An indicator assigned to the task |
| {{TableEnd:indicators}} | \*End of the list of indicators  This tag should be inside the TableStart::taskGroup and TableEnd::taskGroup tags. |
| {{barcodeId}} | The id of the barcode generated |
| {{completedTasksText}} | The label shown when the task is completed |
| {{GeneralInstructions}} | \*Inserts the mini template for General Instructions. This shows the general instructions (if any) on the work order (cellar note).  This tag should be inside the TableStart::taskGroup and TableEnd::taskGroup tags. |
| {{summaryText}} | The summary entered on the work order |
| {{TableStart:taskGroup}} | \*End of the list of taskGroup items |

[Return to top of page.](#top_of_page)

---

## Intake Delivery

The following tags are available in the Intake Delivery template.

| Tag | Description |
| --- | --- |
| {{TableStart:info}} | \*Start of the list of info items |
| {{jobNumber}} | The job number of the task |
| {{operationName}} | The name of the operation. In this case ‘Extraction’ |
| {{statusText}} | Shows "Completed" for a completed task and "Reversed" for a task that has been reversed or rolled back |
| {{carrierName}} | The Carrier transporting the product |
| {{rego}} | The Vehicle Number transporting the product |
| {{connote}} | The Consignment Note for the delivery |
| {{TableStart:intakeList}} | \*Start of the list of intakes  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{growerName}} | The grower of the parcel |
| {{vineyardName}} | The vineyards name that grew the parcel |
| {{blockName}} | The area where the parcel was grown |
| {{varietalName}} | The name of the Varietal of the parcel |
| {{gross}} | The weight of the laden transport |
| {{tare}} | The weight of the empty transport |
| {{weight}} | The net weight of the parcel |
| {{mog}} | The weight of Materials Other then Grape (MOG) |
| {{owner}} | The Owner of the parcel |
| {{parcelBatchName}} | The Name/Id of the parcel |
| {{parcelBatchBatchNumber}} | The booking number for the batch |
| {{grossAmount}} | The gross weight of the bin |
| {{tareAmount}} | The tare weight of the bin |
| {{analysisTemplate}} | The name of the Analysis template to be used |
| {{metrics}} | Various metric fields to be completed |
| {{AnalysisDetails}} | \*Inserts the mini template for analsyis which will show the metrics and value  This tag should be inside the TableStart::intaekList and TableEnd::intakeList tags. |
| {{TableEnd:intakeList}} | \*End of the list of intakes  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{taskNotes}} | Notes for the individual task |
| {{TableEnd:info}} | \*End of the list of info items |

[Return to top of page.](#top_of_page)

---

## Measurement

The following tags are available in the Measurement template.

| Tag | Description |
| --- | --- |
| {{TableStart:info}} | \*Start of the list of info items |
| {{jobNumber}} | The job number of the task |
| {{operationName}} | The name of the operation. In this case ‘Measurement’ |
| {{statusText}} | Shows "Completed" for a completed task and "Reversed" for a task that has been reversed or rolled back |
| {{containerLabel}} | The type of Vessel/Container. Possible values are:  Barrels - if the container type is a barrel group Barrel - if the container type is a single barrel Tank - if the container type is a tank Bin - if the container type is a bin Bins - if the container type is a bin group Tanker - if the container type is a tanker Press - if the container type is a press Vessel - for all other types of container |
| {{container}} | The Vessel/Container name/id |
| {{batch}} | The contents of the Vessel/Container |
| {{batch.description}} | The description of the batch |
| {{containerDetails}} | The number of barrels and location if the vessel is a barrel group, otherwise it will show the vessel's contents amount and capacity |
| {{amount}} | The amount measured inside the Vessel |
| {{productState}} | The current state of the product |
| {{grading}} | The current grading of the product |
| {{VesselDetails}} | \*Vessel details for the source vessel. Inserts the mini template for dip measurements if the vessel is a tank or the mini template for barrel list if it is a barrel group.  This tag should be inside the TableStart::transferList and TableEnd::transferList tags. |
| {{taskNotes}} | Notes for the individual task |
| {{TableEnd:info}} | \*End of the list of info items |

[Return to top of page.](#top_of_page)

---

## Multi Additions

The following tags are available in the Multi Additions template.

| Tag | Description |
| --- | --- |
| {{TableStart:info}} | \*Start of the list of info items |
| {{jobNumber}} | The job number of the task |
| {{operationName}} | The name of the operation. In this case ‘Additions’ |
| {{statusText}} | Shows "Completed" for a completed task and "Reversed" for a task that has been reversed or rolled back |
| {{TableStart:wineList}} | \*Start of the list of wine details.   This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{containerLabel}} | The type of Vessel/Container. Possible values are:  Barrels - if the container type is a barrel group Barrel - if the container type is a single barrel Tank - if the container type is a tank Bin - if the container type is a bin Bins - if the container type is a bin group Tanker - if the container type is a tanker Press - if the container type is a press Vessel - for all other types of container |
| {{containerName}} | The Vessel/Container name/id |
| {{batchName}} | The contents of the Vessel/Container |
| {{batch.description}} | The description of the batch |
| {{containerDetails}} | The number of barrels and location if the vessel is a barrel group, otherwise it will show the vessel's contents amount and capacity |
| {{productState}} | The new state of the transferred product |
| {{productTreatment}} | The treatment being applied to the product |
| {{procedure}} | The procedure information of the product treatment applied |
| {{AdditionsList}} | \*Inserts the BarrelList mini template when the vessel is a barrel, otherwise, it will insert the TransferAdditions mini template.  This tag should be inside the TableStart::wineList and TableEnd::wineList tags. |
| {{TableEnd:wineList}} | \*End of the list of wine details.  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{taskNotes}} | Notes for the individual task |
| {{TableEnd:info}} | \*End of the list of info items |

[Return to top of page.](#top_of_page)

---

## Multi Topping

The following tags are available in the Multi Topping template.

| Tag | Description |
| --- | --- |
| {{TableStart:info}} | \*Start of the list of info items |
| {{jobNumber}} | The job number of the task |
| {{operationName}} | The name of the operation. In this case ‘Topping’ |
| {{statusText}} | Shows "Completed" for a completed task and "Reversed" for a task that has been reversed or rolled back |
| {{treatment}} | Treatment to be performed during the transfer |
| {{instruction}} | Additional Instructions added to the transfer |
| {{containerLabel}} | The type of Vessel/Container. Possible values are:  Barrels - if the container type is a barrel group Barrel - if the container type is a single barrel Tank - if the container type is a tank Bin - if the container type is a bin Bins - if the container type is a bin group Tanker - if the container type is a tanker Press - if the container type is a press Vessel - for all other types of container |
| {{summaryContainer}} | The Vessel/Container name/id |
| {{containerDetails}} | The number of barrels and location if the vessel is a barrel group, otherwise it will show the vessel's contents amount and capacity |
| {{summaryBatch}} | The contents of the Vessel/Container |
| {{summaryBatch.description}} | The description of the batch |
| {{summaryContainerContentsAmount}} | The amount of the contents within the Vessel |
| {{VesselDetails}} | \*Vessel details for the source vessel. Inserts the mini template for dip measurements if the source vessel is a tank or the mini template for barrel list if it is a barrel group. |
| {{TableStart:transferList}} | \*Start of the list of transfers. This is the list that contains the information for the destination vessels.  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{amount}} | The amount to be transferred |
| {{container}} | The Vessel/Container name/id |
| {{containerDetails}} | The number of barrels and location if the vessel is a barrel group, otherwise it will show the vessel's contents amount and capacity |
| {{locationDetails}} | The location of the Vessel/Container |
| {{batch}} | The contents of the Vessel/Container |
| {{TableEnd:transferList}} | \*End of the list of transfers  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{taskNotes}} | Notes for the individual task |
| {{TableEnd:info}} | \*End of the list of info items |

[Return to top of page.](#top_of_page)

---

## Multi Transfer (Many to One)

The following tags are available in the Multi Transfer (Many to One) template.

| Tag | Description |
| --- | --- |
| {{TableStart:info}} | \*Start of the list of info items |
| {{jobNumber}} | The job number of the task |
| {{operationName}} | The name of the operation. In this case shows the treatment name if selected, otherwise, "Many to one transfer" |
| {{statusText}} | Shows "Completed" for a completed task and "Reversed" for a task that has been reversed or rolled back |
| {{treatment}} | Treatment to be performed during the transfer |
| {{productTreatmentInfo}} | The procedure of the treatment |
| {{productState}} | The new state of the product |
| {{instruction}} | Additional instructions added to the transfer |
| {{TableStart:transferList}} | \*Start of the list of transfers  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{treatment}} | Treatment to be performed during the transfer |
| {{productState}} | The state of the product being transferred |
| {{amount}} | The amount to be transferred |
| {{containerLabel}} | The type of Vessel/Container. Possible values are:  Barrels - if the container type is a barrel group Barrel - if the container type is a single barrel Tank - if the container type is a tank Bin - if the container type is a bin Bins - if the container type is a bin group Tanker - if the container type is a tanker Press - if the container type is a press Vessel - for all other types of container |
| {{fromContainer}} | The source Vessel/Container name/id |
| {{fromBatch}} | The contents of the Vessel/Container |
| {{fromBatchDesc}} | The description of the batch |
| {{containerDetails}} | The number of barrels and location if the vessel is a barrel group, otherwise it will show the vessel's contents amount and capacity |
| {{VesselDetails}} | \*Vessel details for the source vessel. Inserts the mini template for dip measurements if the vessel is a tank or the mini template for barrel list if it is a barrel group.  This tag should be inside the TableStart::transferList and TableEnd::transferList tags. |
| {{focalDetails.summaryContainer}} | The destination Vessel/Container name/id |
| {{focalDetails.summaryBatch}} | The contents of the destination Vessel/Container |
| {{focalDetails.summaryBatch.description}} | The description of the destination batch |
| {{focalDetails.summaryBeforeDip}} | The pre-dip of the destination Vessel/Container |
| {{focalDetails.summaryAfterDip}} | The post-dip of the destination Vessel/Container |
| {{focalDetails.summaryContainerContentsAmount}} | The number of destination barrels and location if the vessel is a barrel group, otherwise it will show the vessel's contents amount and capacity |
| {{TableEnd:transferList}} | \*End of the list of transfers  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{containerLabel}} | The type of Vessel/Container. Possible values are:  Barrels - if the container type is a barrel group Barrel - if the container type is a single barrel Tank - if the container type is a tank Bin - if the container type is a bin Bins - if the container type is a bin group Tanker - if the container type is a tanker Press - if the container type is a press Vessel - for all other types of container |
| {{summaryContainer}} | The destination Vessel/Container name/id |
| {{summaryBatch}} | The contents of the Vessel/Container |
| {{containerDetails}} | The number of barrels and location if the vessel is a barrel group, otherwise it will show the vessel's contents amount and capacity |
| {{VesselDetails}} | \*Vessel details for the destination vessel. Inserts the mini template for dip measurements if the vessel is a tank or the mini template for barrel list if it is a barrel group.   This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{AdditionsList}} | \*Inserts the mini template for additions on the destination vessel.   This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{taskNotes}} | Notes for the individual task |
| {{TableEnd:info}} | \*End of the list of info items |

[Return to top of page.](#top_of_page)

---

## Multi Transfer (One to Many)

The following tags are available in the Multi Transfer (One to Many) template.

| Tag | Description |
| --- | --- |
| {{TableStart:info}} | \*Start of the list of info items |
| {{jobNumber}} | The job number of the task |
| {{operationName}} | The name of the operation. In this case, shows the treatment name if selected, otherwise, "One to many transfer" |
| {{statusText}} | Shows "Completed" for a completed task and "Reversed" for a task that has been reversed or rolled back |
| {{treatment}} | Treatment to be performed during the transfer |
| {{productTreatmentInfo}} | The procedure of the treatment |
| {{instruction}} | Additional Instructions added to the transfer |
| {{containerLabel}} | The type of Vessel/Container for source. Possible values are:  Barrels - if the container type is a barrel group Barrel - if the container type is a single barrel Tank - if the container type is a tank Bin - if the container type is a bin Bins - if the container type is a bin group Tanker - if the container type is a tanker Press - if the container type is a press Vessel - for all other types of container |
| {{summaryContainer}} | The source Vessel/Container name/id |
| {{containerDetails}} | The source number of barrels and location if the vessel is a barrel group, otherwise it will show the vessel's contents amount and capacity |
| {{summaryBatch}} | The contents of the source Vessel/Container |
| {{summaryBatch.description}} | The description of the source batch |
| {{containerDetails}} | The number of source barrels and location if the vessel is a barrel group, otherwise it will show the vessel's contents amount and capacity |
| {{productState}} | The current state of the source product |
| {{volumeOut}} | The volume coming out of the source vessel |
| {{VesselDetails}} | \*Vessel details for the source vessel. Inserts the mini template for dip measurements if the source vessel is a tank or the mini template for barrel list if it is a barrel group. |
| {{TableStart:transferList}} | \*Start of the list of transfers. This is the list that contains the information for the destination vessels.  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{focalDetails.summaryContainer}} | The source Vessel/Container name/id |
| {{focalDetails.summaryBatch}} | The contents of the source Vessel/Container |
| {{focalDetails.summaryBatch.description}} | The description of the source batch |
| {{focalDetails.summaryBeforeDip}} | The pre-dip of the source Vessel/Container |
| {{focalDetails.summaryAfterDip}} | The post-dip of the source Vessel/Container |
| {{focalDetails.summaryContainerContentsAmount}} | The number of source barrels and location if the vessel is a barrel group, otherwise it will show the vessel's contents amount and capacity |
| {{productState}} | The new state of the transferred destination product |
| {{amount}} | The amount to be transferred |
| {{containerLabel}} | The type of destination Vessel/Container. Possible values are:  Barrels - if the container type is a barrel group Barrel - if the container type is a single barrel Tank - if the container type is a tank Bin - if the container type is a bin Bins - if the container type is a bin group Tanker - if the container type is a tanker Press - if the container type is a press Vessel - for all other types of container |
| {{container}} | The destination Vessel/Container name/id |
| {{containerDetails}} | The number of destination barrels and location if the vessel is a barrel group, otherwise it will show the vessel's contents amount and capacity |
| {{batch}} | The contents of the destination Vessel/Container |
| {{toContainerContentsAmount}} | The amount of the contents within the destination Vessel |
| {{toContainerCapacity}} | The maximum contents amount of the destination vessel |
| {{useGas}} | Shows "Use gas" when the product uses Gas, otherwise, the field is blank. |
| {{codeChange}} | Displays "Code change" if selected,, otherwise, the field is blank. |
| {{VesselDetails}} | \*Vessel details for the source vessel. Inserts the mini template for dip measurements if the vessel is a tank or the mini template for barrel list if it is a barrel group.  This tag should be inside the TableStart::transferList and TableEnd::transferList tags. |
| {{AdditionsList}} | \*Inserts the mini template for additions on the destination vessels.  This tag should be inside the TableStart::transferList and TableEnd::transferList tags. |
| {{TableEnd:transferList}} | \*End of the list of transfers  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{taskNotes}} | Notes for the individual task |
| {{TableEnd:info}} | \*End of the list of info items |

[Return to top of page.](#top_of_page)

---

## Packaging

The following tags are available in the Packaging template.

| Tag | Description |
| --- | --- |
| {{TableStart:info}} | \*Start of the list of info items |
| {{jobNumber} | The job number of the task |
| {{operationName}} | The name of the operation. In this case ‘Bottling’ |
| {{statusText}} | Shows "Completed" for a completed task and "Reversed" for a task that has been reversed or rolled back |
| {{manufacturedItemCode}} | The code of the item being manufactured |
| {{lot}} | The lot where the package item will go |
| {{containerLabel}} | The type of Vessel/Container. Possible values are:  Barrels - if the container type is a barrel group Barrel - if the container type is a single barrel Tank - if the container type is a tank Bin - if the container type is a bin Bins - if the container type is a bin group Tanker - if the container type is a tanker Press - if the container type is a press Vessel - for all other types of container |
| {{fromItemContainer}} | The Vessel/Container name/id |
| {{fromItemBatchCode}} | The contents of the Vessel/Container |
| {{fromItemBatchDescription}} | The description of the Vessel/Container |
| {{containerDetails}} | The number of barrels and location if the vessel is a barrel group, otherwise it will show the vessel's contents amount and capacity |
| {{packagedItemContainerCapacity}} | The vessels capacity |
| {{volumeOut}} | The volume coming out of the source vessel |
| {{productState}} | The current state of the product |
| {{VesselDetails}} | \*Vessel details for the source vessel. Inserts the mini template for dip measurements if the source vessel is a tank or the mini template for barrel list if it is a barrel group.  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{TableStart:bomItems}} | \*Start of the list of BoM items  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{quantity}} | The quantity of the item used in the packaging |
| {{pricePerUnit}} | The **quantity** per unit of the stock item |
| {{itemCode}} | The stock items code |
| {{itemDesc}} | The stock items description |
| {{lotBatch}} | The lot/batch where the item is located |
| {{locationName}} | The name of the items location |
| {{TableEnd:bomItems}} | \*End of the list of BoM items  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{TableStart:routedItems}} | \*Start of the list of routed items  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{quantity}} | The quantity of the routed item |
| {{locationName}} | The Location name of the routed item |
| {{bin}} | The Bin of the routed item |
| {{TableEnd:routedItems}} | \*End of the list of routed items  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{containerLabel}} | The type of Vessel/Container. Possible values are:  Barrels - if the container type is a barrel group Barrel - if the container type is a single barrel Tank - if the container type is a tank Bin - if the container type is a bin Bins - if the container type is a bin group Tanker - if the container type is a tanker Press - if the container type is a press Vessel - for all other types of container |
| {{fullXfer}} | Shows "Full transfer" when the product is a full transfer, otherwise, the field is blank. |
| {{bottlingLine}} | The bottling line used in packaging |
| {{useGas}} | Shows "Use gas" when the product uses Gas, otherwise, the field is blank. |
| {{instructions}} | Additional instructions for the packaging |
| {{TableStart:events}} | \*Start of the list of QA events |
| {{reason}} | The type of Event that occurred |
| {{time}} | The time the event occurred |
| {{note}} | Additional notes on the event |
| {{TableEnd:events}} | \*End of the list of QA events |
| {{AdditionsList}} | \*Inserts the mini template for additions on the vessel.  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{totalTarget}} | The expected total units/volume packaged |
| {{taskNotes}} | Notes for the individual task |
| {{TableEnd:info}} | \*End of the list of info items |

[Return to top of page.](#top_of_page)

---

## Press Cycle

The following tags are available in the Press Cycle template.

| Tag | Description |
| --- | --- |
| {{TableStart:info}} | \*Start of the list of info items |
| {{jobNumber}} | The job number of the task |
| {{operationName}} | The name of the operation. In this case ‘Press Cycle’ |
| {{statusText}} | Shows "Completed" for a completed task and "Reversed" for a task that has been reversed or rolled back |
| {{containerLabel}} | The type of Vessel/Container. Possible values are:  Barrels - if the container type is a barrel group Barrel - if the container type is a single barrel Tank - if the container type is a tank Bin - if the container type is a bin Bins - if the container type is a bin group Tanker - if the container type is a tanker Press - if the container type is a press Vessel - for all other types of container |
| {{containerDetails}} | The number of barrels and location if the vessel is a barrel group, otherwise it will show the vessel's contents amount and capacity |
| {{batchName}} | The contents of the Vessel/Container |
| {{contentAmounts}} | The amount of the contents within the Vessel |
| {{press}} | The name/description of the Press |
| {{treatment}} | Treatment to be performed during the transfer |
| {{treatmentProcedure}} | The procedure of the treatment |
| {{instruction}} | Additional Instructions added to the transfer |
| {{productState}} | The current state of the product on the source side |
| {{fractionType}} | The fraction type of the product on the source side |
| {{volumeOut}} | The volume being transferred out of the source vessel |
| {{VesselDetails}} | \*Vessel details for the source vessel. Inserts the mini template for dip measurements if the source vessel is a tank or the mini template for barrel list if it is a barrel group. |
| {{TableStart:pressingList}} | \*Start of the list of item  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{containerLabel}} | The type of Vessel/Container of the destination. Possible values are:  Barrels - if the container type is a barrel group Barrel - if the container type is a single barrel Tank - if the container type is a tank Bin - if the container type is a bin Bins - if the container type is a bin group Tanker - if the container type is a tanker Press - if the container type is a press Vessel - for all other types of container |
| {{containerName}} | The destinationVessel/Container name/id of item |
| {{extractionType}} | The extraction type produced |
| {{batchName}} | The contents of the destination Vessel/Container |
| {{containerDetails}} | The number of destination barrels and location if the vessel is a barrel group, otherwise it will show the vessel's contents amount and capacity |
| {{amount}} | The target volume for the vessel |
| {{productState}} | The new product state of destination Vessel/Container |
| {{focalDetails.summaryContainer}} | The source Vessel/Container name/id |
| {{focalDetails.summaryBatch}} | The contents of the source Vessel/Container |
| {{focalDetails.summaryBatch.description}} | The description of the source batch |
| {{focalDetails.summaryBeforeDip}} | The pre-dip of the source Vessel/Container |
| {{focalDetails.summaryAfterDip}} | The post-dip of the source Vessel/Container |
| {{focalDetails.summaryContainerContentsAmount}} | The number of source barrels and location if the vessel is a barrel group, otherwise it will show the vessel's contents amount and capacity |
| {{VesselDetails}} | \*Vessel details for the source vessel. Inserts the mini template for dip measurements if the vessel is a tank or the mini template for barrel list if it is a barrel group.  This tag should be inside the TableStart::pressingList and TableEnd::pressingList tags. |
| {{AdditionsList}} | \*Inserts the mini template for additions on the destination vessels.  This tag should be inside the TableStart::pressingList and TableEnd::pressingList tags. |
| {{TableEnd:pressingList}} | \*End of the list of item  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{taskNotes}} | Notes for the individual task |
| {{TableEnd:info}} | \*End of the list of info items |

[Return to top of page.](#top_of_page)

---

## Product Treatment

The following tags are available in the Product Treatment template.

| Tag | Description |
| --- | --- |
| {{TableStart:info}} | \*Start of the list of info items |
| {{jobNumber}} | The job number of the task |
| {{operationName}} | The name of the operation. In this case the treatment name. |
| {{statusText}} | Shows "Completed" for a completed task and "Reversed" for a task that has been reversed or rolled back |
| {{locationDetails}} | The location of the Product |
| {{treatment}} | The type of treatment being performed |
| {{treatmentOperation}} | The treatment operation to be performed |
| {{productState}} | The new state of the product being treated |
| {{route}} | The route the stock is taken from |
| {{stockItem}} | The stock item being used in treatment |
| {{containerLabel}} | The type of Vessel/Container. Possible values are:  Barrels - if the container type is a barrel group Barrel - if the container type is a single barrel Tank - if the container type is a tank Bin - if the container type is a bin Bins - if the container type is a bin group Tanker - if the container type is a tanker Press - if the container type is a press Vessel - for all other types of container |
| {{container}} | The Vessel/Container name/id |
| {{batch}} | The contents of the Vessel/Container |
| {{batch.description}} | The description of the batch |
| {{containerDetails}} | The number of barrels and location if the vessel is a barrel group, otherwise it will show the vessel's contents amount and capacity |
| {{taskNotes}} | Notes for the individual task |
| {{TableEnd:info}} | \*End of the list of info items |

[Return to top of page.](#top_of_page)

---

# R-Z

## Rack and Return

The following tags are available in the Rack and Return template.

| Tag | Description |
| --- | --- |
| {{jobNumber}} | The job number of the task |
| {{operationName}} | The name of the operation. In this case, the treatment name if selected, otherwise, shows "Rack and return". |
| {{statusText}} | The status of the task (Incomplete/Completed) |
| {{fromContainerLabel}} | The type of Vessel/Container. Possible values are:  Barrels - if the container type is a barrel group Tank - if the container type is a tank Bin - if the container type is a bin Bins - if the container type is a bin group Barrel - if the container type is a single barrel Tanker - if the container type is a tanker Press - if the container type is a press Vessel - for all other types of container types |
| {{fromItemContainer}} | The source Vessel/Container name/id |
| {{fromContainerDetails}} | The number of barrels and location if the vessel is a barrel group, otherwise it will show the vessel's contents amount and capacity of the source vessel |
| {{fromItemBatchInfo}} | The contents of the source Vessel/Container |
| {{fromItemProductState}} | The state of the source product |
| {{fromItemSanitiseDesc}} | Displays ‘SANITISE’ if selected |
| {{xferVol}} | The volume transferred |
| {{useGas}} | Shows "Yes" when the product uses Gas, otherwise, shows "No" |
| {{fullXfer}} | Shows "Yes" when the product is a full transfer, otherwise, shows "No" |
| {{codeChange}} | Displays ‘(CODE CHANGE)’ if selected |
| {{productTreatment}} | The name of the selected Treatment |
| {{productTreatmentInfo}} | Details of the treatment process |
| {{productState}} | The new state of the product being treated |
| {{partialRemarks}} | Additional Instructions given for the task |
| {{From:VesselDetails}} | \*Vessel details for the source vessel. Inserts the mini template for dip measurements if the source vessel is a tank or the mini template for barrel list if it is a barrel group.  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{toContainerLabel}} | The type of Vessel/Container. Possible values are:  Barrels - if the container type is a barrel group Tank - if the container type is a tank Bin - if the container type is a bin Bins - if the container type is a bin group Barrel - if the container type is a single barrel Tanker - if the container type is a tanker Press - if the container type is a press Vessel - for all other types of container types |
| {{toItemContainer}} | The Vessel/Container name/id |
| {{toContainerDetails}} | The number of barrels and location if the vessel is a barrel group, otherwise it will show the vessel's contents amount and capacity of the destination vessel |
| {{toItemBatchInfo}} | The contents of the Vessel/Container |
| {{toItemProductState}} | The state of the destination product |
| {{toItemSanitiseDesc}} | Displays ‘SANITISE’ if selected |
| {{To:VesselDetails}} | \*Vessel details for the source vessel. Inserts the mini template for dip measurements if the vessel is a tank or the mini template for barrel list if it is a barrel group.  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{AdditionsList}} | \*Inserts the mini template for additions on the destination vessels.  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{fromItemContainer}} | The Vessel/Container name/id |
| {{ fromItemBatchInformation}} | The contents of the Vessel/Container |
| {{fromItemProductState}} | The state of the source product |
| {{fromItemSanitiseDesc}} | Displays ‘SANITISE’ if selected |
| {{From:VesselDetails}} | \*Vessel details for the return vessel. Inserts the mini template for dip measurements if the source vessel is a tank or the mini template for barrel list if it is a barrel group.  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{taskNotes}} | Notes for the individual task |

[Return to top of page.](#top_of_page)

---

## Riddling

The following tags are available in the Riddling template.

| Tag | Description |
| --- | --- |
| {{TableStart:info}} | \*Start of the list of info items |
| {{jobNumber}} | The job number of the task |
| {{operationName}} | The name of the operation. In this case ‘Start Riddling’ |
| {{statusText}} | Shows "Completed" for a completed task and "Reversed" for a task that has been reversed or rolled back |
| {{containerLabel}} | The type of Vessel/Container. Possible values are:  Barrels - if the container type is a barrel group Barrel - if the container type is a single barrel Tank - if the container type is a tank Bin - if the container type is a bin Bins - if the container type is a bin group Tanker - if the container type is a tanker Press - if the container type is a press Vessel - for all other types of container |
| {{container}} | The Vessel/Container name/id |
| {{batch}} | The contents of the Vessel/Container |
| {{contentsAmount}} | The amount of the contents within the Vessel |
| {{TableStart:bottleList}} | \*Start of the list of bottle  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{bottleCount}} | The number of bottles |
| {{name}} | The Bin Name/Id |
| {{location}} | The storage location |
| {{bay}} | The bay within the location |
| {{TableEnd:bottleList}} | \*End of the list of bottle  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{operation}} | The Riddling Operation name |
| {{cageInstruction}} | Describes operation to perform to the cages |
| {{TableStart:newBottleList}} | \*Start of the list of bottles  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{bottleCount}} | The number of bottles |
| {{name}} | The Bin Name/Id |
| {{location}} | The storage location |
| {{bay}} | The bay within the location |
| {{TableEnd:newBottleList}} | \*End of the list of bottles  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{gyroInstruction}} | List of Gyros to use |
| {{gyroCycles}} | The Gyro Cycle description |
| {{taskNotes}} | Notes for the individual task |
| {{TableEnd:info}} | \*End of the list of info items |

[Return to top of page.](#top_of_page)

---

## Sampling

The following tags are available in the Sampling template.

| Tag | Description |
| --- | --- |
| {{TableStart:info}} | \*Start of the list of info items |
| {{jobNumber}} | The job number of the task |
| {{operationName}} | The name of the operation. |
| {{statusText}} | Shows "Completed" for a completed task and "Reversed" for a task that has been reversed or rolled back |
| {{name}} | code of sample |
| {{sampleType}} | Type of sample (Bunch/Berry etc) |
| {{grower}} | Grower |
| {{block}} | Block to sample |
| {{lab}} | Lab for sample to be submitted |
| {{row}} | Rows to be sampled |
| {{vine}} | Vines to be sampled |
| {{sampleArea}} | size/area |
| {{AnalysisDetails}} | Metrics to test |
| {{taskNotes}} | Notes |
| {{TableEnd:info}} | End for Sampling. |

[Return to top of page.](#top_of_page)

---

## Simple Tanker Details

|  |  |
| --- | --- |
| **Description:** | The Simple Tanker Details mini template is only available for bottling dispatches. |
| **Default filename:** | SimpleTankerDetails\_MiniTemplate.docx |
| **Tag to include this mini template:** | {{TankerDetails}}  The {{TankerDetails}} tag displays the simple tanker details when the dispatch type is *Bottling*. |
| **Used by the following templates:** | - Bulk dispatch |

The following tags are available in the Simple Tanker Details mini template.

| Tag | Description |
| --- | --- |
| {{TableStart:TankerDetails}} | \*Start of the tanker details |
| {{simpleTankerDetails}} | Displays tanker details in a simple format for bottling dispatches only |
| {{TableEnd:TankerDetails}} | \*End of the tanker details |

[Return to top of page.](#top_of_page)

---

## Tanker Details

|  |  |
| --- | --- |
| **Description:** | The Tanker Details mini template displays a table with a listing of tankers and their details for dispatch types that are not Bottling. |
| **Default filename:** | TankerDetails\_MiniTemplate.docx |
| **Tag to include this mini template:** | {{TankerDetails}}  The {{TankerDetails}} tag displays the tanker details when the dispatch type anything other than *Bottling*. |
| **Used by the following templates:** | - Bulk dispatch |

The following tags are available in the Tanker Details mini template.

| Tag | Description |
| --- | --- |
| {{TableStart:TankerDetails}} | \*Start of the tanker details mini template |
| {{TableStart:tankerFill}} | \*Start of the list of tanker fill details  This tag should be inside the TableStart::TankerDetails and TableEnd::TankerDetails tags. |
| {{tanker}} | The tanker Name/Id/Reg Code |
| {{compartments}} | The tank compartment used |
| {{seal}} | The seal code used for the tank |
| {{volume}} | The volume stored in the tanker |
| {{TableEnd:tankerFill}} | \*End of tanker fill details  This tag should be inside the TableStart::TankerDetails and TableEnd::TankerDetails tags. |
| {{TableEnd:TankerDetails}} | \*End of the tanker details mini template |

[Return to top of page.](#top_of_page)

---

## Tasting Note

The following tags are available in the Tasting Note template.

| Tag | Description |
| --- | --- |
| {{TableStart:info}} | \*Start of the list of info items |
| {{jobNumber}} | The job number of the task |
| {{operationName}} | The name of the operation. In this case ‘Tasting Note’ |
| {{statusText}} | Shows "Completed" for a completed task and "Reversed" for a task that has been reversed or rolled back |
| {{productType}} | The type of product of being tasted |
| {{productDescription}} | Description of the product being tasted |
| {{productEquipment}} | The vessel/container name of the product |
| {{productAmount}} | The contents amount of the product in the vessel |
| {{productState}} | The state of the product |
| {{gradingValue}} | The grading name of the product |
| {{scale}} | The grading value of the product |
| {{TableStart:multiMetricInfoList}} | \*Start of the list of metrics  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{metricName1}} {{measure1}} {{dateOccurred1}} {{rateOfChange1}} | This shows the list of all the metrics that is on the work order (cellar note).  metricName - The name of the metric measure - The measurement value of the metric dateOccurred - The date the measurement was recorded rateOfChange - Rate of change of the metric |
| {{metricName2}} {{measure2}} {{dateOccurred2}} {{rateOfChange2}} |  |
| {{metricName3}} {{measure3}} {{dateOccurred3}} {{rateOfChange3}} |  |
| {{metricName4}} {{measure4}} {{dateOccurred4}} {{rateOfChange4}} |  |
| {{metricName5}} {{measure5}} {{dateOccurred5}} {{rateOfChange5}} |  |
| {{metricName6}} {{measure6}} {{dateOccurred6}} {{rateOfChange6}} |  |
| {{metricName7}} |  |
| {{measure7}} |  |
| {{dateOccurred7}} |  |
| {{rateOfChange7}} |  |
| {{metricName8}} {{measure8}} {{dateOccurred8}} {{rateOfChange8}} |  |
| {{TableEnd:multiMetricInfoList}} | \*End of the list of metrics  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{TableStart:vintageList}} | \*Start of the list of vintage  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{value}} | The vintage of the product |
| {{percent}} | The composition value of the vintage |
| {{TableEnd:vintageList }} | \*End of the list of vintage  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{TableStart:varietalList}} | \*Start of the list of varietal  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{value}} | The variety of the product |
| {{percent}} | The composition value of the variety |
| {{TableEnd:varietalList }} | \*End of the list of varietal  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{TableStart:regionList}} | \*Start of the list of region (sub AVA)  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{value}} | The region (sub AVA) of the product |
| {{percent}} | The composition value of the region (sub AVA) |
| {{TableEnd:regionList }} | \*End of the list of region (AVA)  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{TableStart:giList}} | \*Start of the list of G.I. (AVA)  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{value}} | The G.I. (AVA) of the product |
| {{percent}} | The composition value of the G.I. (AVA) |
| {{TableEnd:giList }} | \*End of the list of G.I. (AVA)  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{regionCompName}} | The column label for the region (sub AVA) |
| {{GICompName}} | The column label for the G.I. (AVA) |
| {{taskNotes}} | Notes for the individual task |
| {{TableEnd:info}} | \*End of the list of info items |

[Return to top of page.](#top_of_page)

---

## Tirage Admin

The following tags are available in the Tirage Admin template.

| Tag | Description |
| --- | --- |
| {{TableStart:info}} | \*Start of the list of info items |
| {{jobNumber}} | The job number of the task |
| {{operationName}} | The name of the operation. In this case ‘Tirage Admin’ |
| {{statusText}} | Shows "Completed" for a completed task and "Reversed" for a task that has been reversed or rolled back |
| {{containerLabel}} | The type of Vessel/Container. Possible values are:  Barrels - if the container type is a barrel group Tank - if the container type is a tank Bin - if the container type is a bin Bins - if the container type is a bin group Barrel - if the container type is a single barrel Tanker - if the container type is a tanker Press - if the container type is a press Vessel - for all other types of container types |
| {{container}} | The Vessel/Container name/id |
| {{batch}} | The contents of the Vessel/Container |
| {{contentsAmount}} | The amount of the contents within the Vessel |
| {{CurrentBinDetails}} | \*Inserts the Bin Details mini template and shows the number of bottles, and name, location, and bay of the bin for the current bin group.  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{NewBinDetails}} | \*Inserts the Bin Details mini template and shows the number of bottles, and name, location, and bay of the bin for the new bin group.  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{SplitConfigBinDetails}} | \*Inserts the Bin Details mini template and shows the number of bottles, and name, location, and bay of the bin for the split bin group.  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{TransferToTank}} | \*Inserts the tank details for the tank when Transfer to tank details are entered in Split/Transfer tab of Tirage admin operation screen.  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{taskNotes}} | Notes for the individual task |
| {{TableEnd:info}} | \*End of the list of info items |

[Return to top of page.](#top_of_page)

---

## Tirage

The following tags are available in the Tirage template.

| Tag | Description |
| --- | --- |
| {{TableStart:info}} | \*Start of the list of info items |
| {{jobNumber}} | The job number of the task |
| {{operationName}} | The name of the operation. In this case ‘Tirage Admin’ |
| {{statusText}} | Shows "Completed" for a completed task and "Reversed" for a task that has been reversed or rolled back |
| {{containerLabel}} | The type of Vessel/Container. Possible values are:  Barrels - if the container type is a barrel group Tank - if the container type is a tank Bin - if the container type is a bin Bins - if the container type is a bin group Barrel - if the container type is a single barrel Tanker - if the container type is a tanker Press - if the container type is a press Vessel - for all other types of container types |
| {{container}} | The Vessel/Container name/id |
| {{batch}} | The contents of the Vessel/Container |
| {{contentsAmount}} | The amount of the contents within the Vessel |
| {{CurrentBinDetails}} | \*Inserts the Bin Details mini template and shows the number of bottles, and name, location, and bay of the bin for the current bin group.  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{NewBinDetails}} | \*Inserts the Bin Details mini template and shows the number of bottles, and name, location, and bay of the bin for the new bin group.  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{SplitConfigBinDetails}} | \*Inserts the Bin Details mini template and shows the number of bottles, and name, location, and bay of the bin for the split bin group.  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{TransferToTank}} | \*Inserts the tank details for the tank when Transfer to tank details are entered in Split/Transfer tab of Tirage admin operation screen.  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{taskNotes}} | Notes for the individual task |
| {{TableEnd:info}} | \*End of the list of info items |

[Return to top of page.](#top_of_page)

---

## Transfer Additions

|  |  |
| --- | --- |
| **Description:** | The Transfer Additions mini template displays a table with a listing of a wine's additions that includes the dip measurement. |
| **Default filename:** | TransferAdditions\_MiniTemplate.docx |
| **Tag to include this mini template:** | {{AdditionsList}}  The {{AdditionsList}} tag only displays the Transfer Additions mini template for a Multi Addition operation. |
| **Used by the following templates:** | - Multi Additions |

The following tags are available in the Transfer Additions mini template.

| Tag | Description |
| --- | --- |
| {{TableStart:AdditionsList}} | \*Start of the list of additions mini template |
| {{TableStart:additionsList}} | \*Start of the list of addition items |
| {{additive}} | The name of the Additive |
| {{rateOfAdd}} | The rate of the Additive being added |
| {{amountDescription}} | The amount of additive added |
| {{additionalNotes}} | The routing description of the Additive |
| {{dipCalc}} | The current Dip |
| {{dipCalcTankVol}} | The volume used in the calculation of the current Dip |
| {{TableEnd:additionsList }} | \*End of the list of addition items |
| {{TableEnd:AdditionsList}} | \*End of the list of additions mini template |

[Return to top of page.](#top_of_page)

---

## Transfer to Tank

|  |  |
| --- | --- |
| **Description:** | The Transfer to Tank mini template displays the tank's details when *Transfer to Tank Details* is entered in the Split/Transfer tab of the Tirage Admin window. |
| **Default filename:** | TransferToTank\_MiniTemplate.docx |
| **Tag to include this mini template:** | {{TransferToTank}} |
| **Used by the following templates:** | - Tirage Admin |

The following tags are available in the Transfer to Tank mini template.

| Tag | Description |
| --- | --- |
| {{TableStart:TransferToTank}} | \*Start of the transfer to tank mini template details |
| {{transferVessel}} | The Vessel/Container name/id of item |
| {{transferBatch}} | The contents of the Vessel/Container |
| {{dipBefore}} | The dip value before operation |
| {{dipAfter}} | The dip value after operation |
| {{TableEnd:TransferToTank}} | \*End of the transfer to tank mini template details |

[Return to top of page.](#top_of_page)

---

## Transfer Rack Blend

The following tags are available in the Transfer Rack Blend template.

| Tag | Description |
| --- | --- |
| {{jobNumber}} | The job number of the task |
| {{operationName}} | The name of the operation. In this case the treatment name if selected, otherwise, the Transfer/Racking mode. |
| {{statusText}} | Shows "Completed" for a completed task and "Reversed" for a task that has been reversed or rolled back |
| {{fromContainerLabel}} | The type of Vessel/Container. Possible values are:  Barrels - if the container type is a barrel group Barrel - if the container type is a single barrel Tank - if the container type is a tank Bin - if the container type is a bin Bins - if the container type is a bin group Tanker - if the container type is a tanker Press - if the container type is a press Vessel - for all other types of container |
| {{fromItemContainer}} | The source Vessel/Container name/id |
| {{fromItemBatchCode}} | The number of barrels and location if the vessel is a barrel group, otherwise it will show the vessel's contents amount and capacity of the source vessel |
| {{fromItemBatchInfo}} | The contents of the source Vessel/Container |
| {{fromItemProductState}} | The state of the source product |
| {{fromItemSanitiseDesc}} | Displays ‘SANITISE’ if selected |
| {{xferVol}} | The volume transferred |
| {{useGas}} | Shows "Use gas" when the product uses Gas, otherwise, the field is blank. |
| {{fullXfer}} | Shows "Full transfer" when the product is a full transfer, otherwise, the field is blank. |
| {{codeChange}} | Displays "Code change" if selected,, otherwise, the field is blank. |
| {{productTreatment}} | The name of the selected Treatment |
| {{productTreatmentInfo}} | Details of the treatment process |
| {{productState}} | The new state of the product being treated |
| {{partialRemarks}} | Additional instructions given for the task |
| {{From:VesselDetails}} | \*Vessel details for the source vessel. Inserts the mini template for dip measurements if the source vessel is a tank or the mini template for barrel list if it is a barrel group.  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{toContainerLabel}} | The type of Vessel/Container. Possible values are:  Barrels - if the container type is a barrel group Tank - if the container type is a tank Bin - if the container type is a bin Bins - if the container type is a bin group Barrel - if the container type is a single barrel Tanker - if the container type is a tanker Press - if the container type is a press Vessel - for all other types of container types |
| {{toItemContainer}} | The Vessel/Container name/id |
| {{toContainerDetails}} | The number of barrels and location if the vessel is a barrel group, otherwise it will show the vessel's contents amount and capacity of the destination vessel |
| {{toItemBatchInfo}} | The contents of the Vessel/Container |
| {{toItemProductState}} | The state of the destination product |
| {{toItemSanitiseDesc}} | Displays ‘SANITISE’ if selected |
| {{To:VesselDetails}} | \*Vessel details for the source vessel. Inserts the mini template for dip measurements if the vessel is a tank or the mini template for barrel list if it is a barrel group.  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{AdditionsList}} | \*Inserts the mini template for additions on the destination vessels.  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{fromItemContainer}} | The Vessel/Container name/id |
| {{ fromItemBatchInformation}} | The contents of the Vessel/Container |
| {{fromItemProductState}} | The state of the source product |
| {{fromItemSanitiseDesc}} | Displays ‘SANITISE’ if selected |
| {{From:VesselDetails}} | \*Vessel details for the return vessel. Inserts the mini template for dip measurements if the source vessel is a tank or the mini template for barrel list if it is a barrel group.  This tag should be inside the TableStart::info and TableEnd::info tags. |
| {{taskNotes}} | Notes for the individual task |

[Return to top of page.](#top_of_page)

---

## Trial Blend

The following tags are available in the Trial Blend template.

| Tag | Description |
| --- | --- |
| {{TableStart:info}} | \*Start of the list of info items |
| {{jobNumber}} | The job number of the task |
| {{operationName}} | The name of the operation. In this case ‘Trial Blend’ |
| {{statusText}} | The status of the task (Incomplete/Completed) |
| {{name}} | The name of the trial blend |
| {{owner}} | The owner of the trial blend |
| {{year}} | The year of the trial blend |
| {{TableStart:blendList}} | \*Start of the list of trial blends |
| {{amount}} | Amount used in blend |
| {{itemContainer}} | The Vessel/Container name/id |
| {{itemBatchInformation}} | The contents of the Vessel/Container |
| {{itemProductState}} | N/A |
| {{itemSanitiseDesc}} | Displays ‘SANITISE’ if selected |
| {{itemBarrels}} | N/A |
| {{VesselDetails}} | \*Vessel details for the vessel. Inserts the mini template for dip measurements if the vessel is a tank or the mini template for barrel list if it is a barrel group.  This tag should be inside the TableStart::blendList and TableEnd::blendList tags. |
| {{TableEnd:blendList}} | \*End of the list of trial blends |
| {{taskNotes}} | Notes for the individual task |
| {{TableEnd:info}} | \*End of the list of info items |
