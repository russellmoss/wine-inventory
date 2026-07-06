---
title: "AI Analysis Import"
url: "https://support.innovint.us/hc/en-us/ai-image-import"
category: "MAKE"
section: "Analysis"
page_type: "page"
lastmod: "2026-06-24"
gist: "AI Analysis Import lets you quickly digitize analysis data for juice and wine lots just by taking a photo of your results, reducing manual data entry during busy winery operations."
tags: ["lab", "migration", "exports", "ux-friction", "barrels", "configuration"]
---

# AI Analysis Import

AI Analysis Import lets you quickly digitize analysis data for juice and wine lots just by taking a photo of your results, reducing manual data entry during busy winery operations.

- [What is AI Analysis Import?](#what)
- [Where to find the AI Analysis Import Action](#Where)
- [How to use AI Analysis Import](#How)
- [How to enable the AI Analysis Import Action](#Settings)
- [Video Tutorial](#video-tutorial)

### What Is AI Analysis Import?

AI Analysis Import is an import action that uses artificial intelligence to read analysis data from a photo and populate the corresponding fields in InnoVint for juice and wine lots.

It is designed to:

- Save time during harvest and lab work
- Reduce manual typing and transcription errors
- Speed up data entry when working in the cellar or lab

### Where to find the AI Analysis Import Action

**AI Analysis Import** is an entirely new action you can find in your Record Action dropdown menus.

![Screenshot 2026-01-20 at 3.44.28 PM](https://support.innovint.us/hs-fs/hubfs/Screenshot%202026-01-20%20at%203.44.28%20PM.png?width=670&height=184&name=Screenshot%202026-01-20%20at%203.44.28%20PM.png)

### How to use AI Analysis Import

Follow the steps below to import analysis data from an image into InnoVint.

#### Step 1: Navigate to the **AI** **Analysis Import** action in the Record Action menu

- This is similar to the regular Analysis Import action, but instead of uploading a CSV file, you will upload an image, pdf, CSV or Excel file.

#### Step 2: Prepare your file

- The file must be saved on your computer.

  - If you take a photo using your phone, transfer it to your computer first (for example, via email or AirDrop).
- Supported images include screenshots, photos of handwritten notes or lab printouts, or photos of your computer screen!

📌 **Tip**: Try a picture of your SPICA or Y15 output, brix/temp notebook, or your lab notebook!

![AI Image IMport article_1](https://support.innovint.us/hs-fs/hubfs/AI%20Image%20IMport%20article_1.png?width=451&height=328&name=AI%20Image%20IMport%20article_1.png)

#### Step 3: Upload the image

1. Click **Choose File** and select your image.

   ![AI Image Import Article_Action](https://support.innovint.us/hs-fs/hubfs/AI%20Image%20Import%20Article_Action.png?width=670&height=322&name=AI%20Image%20Import%20Article_Action.png)
2. Once uploaded, the AI will automatically analyze the image and begin mapping the data to InnoVint.

   ![AI Image Import_Analyzing](https://support.innovint.us/hs-fs/hubfs/AI%20Image%20Import_Analyzing.png?width=317&height=61&name=AI%20Image%20Import_Analyzing.png)

#### Step 4: Review lot and vessel mapping

In the **Lot and Vessel Mapping** section, review what the AI detected.

- If the vessel and lot already exist in InnoVint, they may be matched automatically.

  - Example: If a tank code exists in InnoVint, the system will match it directly.
  - If a vessel contains only one lot, the lot code may be auto-filled even if it is not written on the image.
- If you don’t add context initially, the AI will make its best interpretation based on the image alone. If the lot/vessels do not map as anticipated, try using the **Additional Context** field in Step 5.

  ![AI Image Import_No contxt](https://support.innovint.us/hs-fs/hubfs/AI%20Image%20Import_No%20contxt.png?width=670&height=367&name=AI%20Image%20Import_No%20contxt.png)

#### Step 5 (Optional): Using the “Additional Context” Field

The **Additional Context** field lets you give the AI extra instructions about how to interpret an image before, or after, importing analysis data.  The Additional Context field gives you flexible, fine-grained control over how images are interpreted—making imports more accurate and reducing cleanup time.  This is especially useful when units, tanks, or readings (such as a control result) need special handling.

##### When to use Additional Context

Use this field if you need to:

- Specify units (for example, Celsius vs. Fahrenheit)
- Ignore certain tanks or readings
- Clarify ambiguous handwritten or formatted data
- Apply consistent rules to recurring image formats or wording

##### How to add context to an image import

1. Start an **AI Analysis Import** and upload your image as usual.
2. Review the data mapping, and then, if you want to tweak the AI's interpretation, you can type clear instructions for the AI in the **Additional Context** field.

   - Examples:

     - “Temperature values are in Celsius.”
     - “Ignore all readings from tank 40.”
     - "Ignore the control reading"
3. Click **Run AI** to reprocess the image using your instructions.  The AI will apply your context, such as:

   - Converting temperature units correctly
   - Removing analyses you asked it to ignore
   - Provide insight to the prompt about vessel coding conventions and abbreviations - such as "vessel code starts with "BIN-XXXX" where XXXX is the number of the bin".
   - "Ignore column B"

     ![AI Image Import_context](https://support.innovint.us/hs-fs/hubfs/AI%20Image%20Import_context.png?width=670&height=398&name=AI%20Image%20Import_context.png)

##### 📌 Tips for best results

- Be specific and concise when writing instructions.
- Use plain language (for example, “Ignore tank 40” instead of long explanations).
- If you frequently import similar images, save your context somewhere so you can copy/paste and reuse it for future imports.

Step 6: Review imported analysis values

- Review each analysis value.
- Units do not need to be written on the image, but you should confirm the units that the AI selects.

  - For example, a temperature value like “65” might be interpreted as Fahrenheit.
- Always confirm that all values match the original image before proceeding.![AI Image Import_Analysis Mapping](https://support.innovint.us/hs-fs/hubfs/AI%20Image%20Import_Analysis%20Mapping.png?width=670&height=454&name=AI%20Image%20Import_Analysis%20Mapping.png)

#### Step 7: Resolve missing or unmatched vessels or lots (if needed)

If the image references a vessel or lot that does **not** exist in your InnoVint account:

- Manually select the correct **lot** and **vessel** from the dropdown options.

  - Once selected, the mapping will automatically apply to all relevant rows.
- Remove the problem lot/vessel
  - Use the "remove lot" button to the right of the mapped lot/vessel
  - Use the Additional Context field to prompt the AI to update the lot or vessel entirely.

#### Step 8: Record the analysis

1. After reviewing all mappings and values, click **Record**.

   ![AI Image Import_Completed Action](https://support.innovint.us/hs-fs/hubfs/AI%20Image%20Import_Completed%20Action.png?width=670&height=371&name=AI%20Image%20Import_Completed%20Action.png)

Once recorded, your analysis data is saved and linked to the appropriate lots and vessels. The original image is attached to the completed action for reference and audit comparison

### How to enable the AI Analysis Import action

An account admin must use the InnoVint AI settings page to opt into AI features. If AI features have been activated on the Setting page, then all users with write access (Team Member, Team Member Cannot Submit and Admin) will see the AI Analysis Import action, and any other activated AI features.

![](https://support.innovint.us/hs-fs/hubfs/image-png-Jan-20-2026-11-47-18-3750-PM.png?width=670&height=325&name=image-png-Jan-20-2026-11-47-18-3750-PM.png)

#### A note on Data & Privacy

AI Image Import is powered by **Google’s Gemini AI**.

When you upload an image:

- The image is sent to Google for processing by a large language model (LLM), which is designed to understand text and images.
- **Your winery identity and internal InnoVint data are never shared** with the LLM.
- Google does **not** use your data to train its models.
- Data is stored **temporarily** by Google only to monitor for misuse.

### Video Tutorial
