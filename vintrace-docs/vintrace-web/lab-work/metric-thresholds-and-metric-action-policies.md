---
id: "32301340717972"
title: "Metric Thresholds and Metric Action Policies"
url: "https://support.vintrace.com/hc/en-us/articles/32301340717972-Metric-Thresholds-and-Metric-Action-Policies"
category: "vintrace Web"
section: "Lab work"
created_at: "2024-11-20T14:48:12Z"
updated_at: "2024-11-21T10:19:16Z"
labels: ["estate", "essentials", "metric", "lab", "wp-faq-999"]
gist: "Metric threshold policies are conditions that you might want to monitor."
tags: ["lab", "configuration", "blending"]
---

# Metric Thresholds and Metric Action Policies

Metric threshold policies are conditions that you might want to monitor. For example, you might set up different metric thresholds to monitor alcohol content.

![Metric_Threshold_Policies_for_Alcohol_20200722.png](https://support.vintrace.com/hc/article_attachments/32329112710036)

A metric action policy lets you change the product’s state and grading when a threshold is met.

## Creating a Metric Threshold

You can create a metric threshold from the Winery Setup window (Setup Options > Policy > Metric Threshold):

1. Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32329125573012) Set Up in the sidebar.
2. Click Lab.
3. From the Metric Thresholds tile, click Configure.
4. Click New Metric Threshold. Specify the details for the metric threshold policy.

- Name — An identifier for the metric threshold policy.
- Any Threshold — If selected, a metric action that includes the policy will be taken if any condition in the policy is met. If not selected, all of the conditions in the policy must be met before a metric action occurs.
- Allow Calculated Values to Be Used — Select this checkbox if you’re blending and want vintrace to automatically calculate metrics based on the blend.

5. For each condition you want to add to the policy, select the metric you want to monitor, select the operator, enter the value, then click Add. The conditions that have been added to the policy will be listed on the right.

![Metric_Threshold_Policy_Update_-_Conditions_Added_20200722.png](https://support.vintrace.com/hc/article_attachments/32329124150292)

6. Click Save.

## Creating a Metric Action Policy

You can create a metric threshold from the Winery Setup window (Setup Options > Policy > Metric Action Policy):

1. Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32329125573012) Set Up in the sidebar.
2. Click Lab.
3. From the Metric Action Policies tile, click Configure.
4. Click New Metric Action Policy.
5. Specify the details for the metric action policy. If the User Confirmation checkbox is selected, the user will be prompted if they click Cancel without saving.

![Metric_Action_Policy_Create_20200722.png](https://support.vintrace.com/hc/article_attachments/32329124181908)

6. Click Save.
