---
id: "32301306936724"
title: "Improved Tirage Group Handling"
url: "https://support.vintrace.com/hc/en-us/articles/32301306936724-Improved-Tirage-Group-Handling"
category: "vintrace Web"
section: "Sparkling Wine"
created_at: "2024-11-20T14:47:22Z"
updated_at: "2025-01-15T19:15:03Z"
labels: ["estate"]
gist: "When you perform a Riddling, Packaging, or Bulk Dispatch operation, you can select specific bins and cages from the tirage group."
tags: ["packaging", "inventory", "configuration"]
---

# Improved Tirage Group Handling

When you perform a Riddling, Packaging, or Bulk Dispatch operation, you can [select specific bins and cages from the tirage group](#h_01EVCCPTFEA5TKCB7MRJZCNRJ2). You can also [combine tirage groups that were historically split](#h_01EVCCQ2CX7T44PHEH0606FERT), or [when saving a Tirage, Tirage Admin, or Stop Riddling operation](#h_01EVCCQSGZSGX3W2MZ1Z9YX4JW). This makes it easier for you to perform sparkling operations on these wines.

## Selecting Specific Bins and Cages

To select specific bins or cages for a Riddling, [Packaging](https://support.vintrace.com/hc/en-us/articles/32303327186836), or [Bulk Dispatch](https://support.vintrace.com/hc/en-us/articles/32303327348116) operation:

1. Enter the tirage group’s name.
2. If you’re doing a Riddling operation and want to use a partial amount from a cage, de-select the Use Existing Cages checkbox.
3. Click the ![List_20210105.png](https://support.vintrace.com/hc/article_attachments/32328932069140) list icon that’s displayed beside the tirage group’s name.

![Riddling_-_Tirage_Group_List_Icon_20210106.png](https://support.vintrace.com/hc/article_attachments/32328950876564)

The Tirage Group Details window displays.

4. Select the bins/cages that you want to use. To select all the bins/cages listed, select the Select All checkbox.

![Tirage_Group_Details_20210106.png](https://support.vintrace.com/hc/article_attachments/32328913516308)

5. Click OK. The Tirage Group Details window closes.
6. If you’re using a partial number of bins/cages and/or bottles for a Riddling, enter a name for the new tirage group, or click the ![Wand_Icon_20200410.png](https://support.vintrace.com/hc/article_attachments/32328932130068) wand icon to use an [auto-code](https://support.vintrace.com/hc/en-us/articles/32303292885908).

![Riddling_-_New_Tirage_Group_Name_20210106.png](https://support.vintrace.com/hc/article_attachments/32328950653460)

7. Specify the remaining details for the operation.
8. Click Now + Save.

## Combining Tirage Groups When Saving an Operation

When you save a Tirage, Tirage Admin, or Stop Riddling operation, you’ll have the option to combine matching tirage groups. The criteria to determine if a tirage group matches another will depend on the following.

| OPERATION | MATCHING CRITERIA |
| --- | --- |
| Tirage | The destination tirage group and existing tirage groups match when:  - They have the same batch name. - Their sparkling state is *Tiraged*. - The tiraged date is within 24 hours before or 24 hours after. - The tirage groups are located in the same winery. This is based on the storage area of the first destination bin/cage. |
| Tirage Admin | The destination tirage group that’s being split to another winery and the existing tirage groups match when:  - They have the same batch name. - They have the same sparkling state. - If their sparkling state is Tiraged, the tiraged date is within 24 hours before or 24 hours after. - The tirage groups are located in the same winery. This is based on the storage area of the first destination bin/cage. |
| Stop Riddling | The destination tirage group and existing tirage groups match when:  - They have the same batch name. - Their sparkling state is *Riddled*. - The tirage groups are located in the same winery. This is based on the storage area of the first destination bin/cage. |

If there are no matching tirage groups, the operation will be saved as normal.

When you save a Tirage, Tirage Admin, or Stop Riddling operation with a matching tirage group, the Combining Tirage Group window displays. You can:

- Combine the tirage group with an existing one.
- Create a new tirage group.
- Use the tirage group provided in the operation.

![Combining_Tirage_Group_-_Combine_with_Existing_20210106.png](https://support.vintrace.com/hc/article_attachments/32328925985428)

To combine the tirage group with an existing one:

1. From the Combining Tirage Group window, select the Combine Them With One of the Existing Tirage Groups From This List option.
2. Select the tirage group you want to combine it with.

![Combining_Tirage_Group_-_Combine_with_Existing_20210106.png](https://support.vintrace.com/hc/article_attachments/32328905300756)

3. Click Yes.

To create a new tirage group:

1. From the Combining Tirage Group window, select the Create a New Tirage Group with the Following Name option.
2. Enter the name of the new tirage group.

![Combining_Tirage_Group_-_Create_New_TIrage_Group_20210106.png](https://support.vintrace.com/hc/article_attachments/32328913631636)

3. Click Yes.

To use the tirage group provided in the operation, click No.

## Combining Historically Split Tirage Groups

Winery-restricted users can only combine tirage groups within their winery. Refer to our [Using vintrace Across Multiple Winery Facilities article](https://support.vintrace.com/hc/en-us/articles/360000822456) to learn more.

To combine tirage groups:

1. Click ![More_Options_20200323.png](https://support.vintrace.com/hc/article_attachments/32328922599316) More Options in the sidebar.
2. From the Tools tile, click Combine Tirage Group.

![More_Options_-_Combine_Tirage_Group_20210106.png](https://support.vintrace.com/hc/article_attachments/32328932215188)

The Combine Tirage Group Console window displays.

![Combine_Tirage_Group_Console_20210106.png](https://support.vintrace.com/hc/article_attachments/32328905377428)

3. Click Combine beside the batch that you want to combine tirage groups.
4. Select the tirage groups that you want to combine.
5. If needed, enter a new tirage group name. By default, the name defaults to the name of the first tirage group.

![Combining_Tirage_Groups_-_Historical_20210106.png](https://support.vintrace.com/hc/article_attachments/32328932243988)

6. Click Combine Selected. You're prompted to confirm that you want to combine the tirage groups.

![Confirm_Dialog_Combine_Tirage_Groups_Console.png](https://support.vintrace.com/hc/article_attachments/32328925883028)

7. Click OK.
