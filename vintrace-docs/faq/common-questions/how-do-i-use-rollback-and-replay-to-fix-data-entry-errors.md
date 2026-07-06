---
id: "32303277767188"
title: "How do I use rollback and replay to fix data entry errors?"
url: "https://support.vintrace.com/hc/en-us/articles/32303277767188-How-do-I-use-rollback-and-replay-to-fix-data-entry-errors"
category: "FAQ"
section: "Common Questions"
created_at: "2024-11-20T15:50:56Z"
updated_at: "2024-11-21T10:17:05Z"
labels: ["estate", "oldui", "rollback and replay", "rollback"]
gist: "The rollback and rollback & replay functions in vintrace enable you to fix data entry errors."
tags: ["ux-friction", "work-orders", "corrections"]
---

# How do I use rollback and replay to fix data entry errors?

The rollback and rollback & replay functions in vintrace enable you to fix data entry errors. Rollback and rollback & replay are useful when:

- You have errors on operations that can’t be corrected (e.g., volumes)
- You discover a vital operation was never entered
- An operation was entered in error and subsequent operations prevent you from repairing the product’s history

A rollback restores a wine to how it was prior to the selected operation. If subsequent operations affected the wine, those operations and any other affected wines will be reversed. In summary, rollback restores the initial wine and any further affected wines back to how it was prior to the selected operation; it’s as if the selected operation never happened. When you perform a rollback, you'll need to re-enter each subsequent job to restore the operational timeline.

Like a rollback, a rollback & replay also restores a wine to how it was prior to the selected operation. However, any subsequent operations are moved to a special Replay work order.

![Replay_Work_Order_20210218.png](https://support.vintrace.com/hc/article_attachments/32328954947604)

The jobs in the Replay work order will have a Replay status and will be ordered oldest to newest. This enables you to make corrections, insert missing operations, and delete erroneous operations while maintaining the operational timeline. With a rollback & replay, you can fix the jobs with errors and re-save the other jobs.

The diagram below illustrates the difference between a rollback and a rollback & replay.

![Rollback_vs_Rollback_Replay_20210217.png](https://support.vintrace.com/hc/article_attachments/32328929430420)

Both rollback and rollback & replay display the subsequent operations that are affected by your selected operation so that you can decide whether you want to reverse each one.

![Rollback_-_Operations_List_20210218.png](https://support.vintrace.com/hc/article_attachments/32328935634836)

## Example

Suppose a tank originally had 310 gallons, but a transfer was entered by mistake. The transfer operation transferred 60 gallons out of the tank. You could rollback the transfer operation to correct the mistake.

If the transfer actually occurred, but the number of gallons transferred was entered incorrectly, you would do a rollback & replay. This would allow you to correct the transfer operation, and re-save any subsequent operations. The transfer operation and subsequent operations are saved to a Replay work order. When you correct the gallons transferred out and in, and save the transfer operation, the original date and time will be retained.

## Performing a Rollback

NOTE: The rollback & replay option is also available by following the steps below. You’ll have the option to choose between rollback, or rollback & replay after you view and confirm the affected operations.

To rollback an operation:

1. View the operation that you want to rollback.
2. Click Rollback.

The Rollback window displays. The operation that you selected to rollback displays at the top. The table displays the subsequent operations that will be reversed if you rollback the selected operation along with the wine(s) volume(s) that will be restored.

![Rollback_-_Operations_20210218.png](https://support.vintrace.com/hc/article_attachments/32328935664148)

From the Rollback window, you can click View to view the details of each operation that will be reversed.

3. After reviewing the operation’s details, select the Confirm checkbox to acknowledge that the operation will be reversed.
4. In the Reason for Rollback field in the lower left, enter a description for why you did the rollback.
5. Click Rollback. A warning displays notifying you that the operations will be reversed.

![Rollback_Warning_20210217.png](https://support.vintrace.com/hc/article_attachments/32328955114644)

6. Do one of the following:

- To reverse the selected operation and subsequent operations, click Rollback.
- To reverse the selected operation and move the subsequent operations to a Replay work order, click Rollback & Replay.

## Completing a Replay Work Order

When you complete a job in a Replay work order, a message displays indicating that the operation was from a reversed operation.

![Replayed_Operation_Message_20210218.png](https://support.vintrace.com/hc/article_attachments/32328935646356)

Click anywhere on the blue box to acknowledge the message.

When you complete and save a job in a Replay work order, it retains the original date and time.

## Reversing Operations

Operations that don’t impact the wine volumes can be reversed without having to do a rollback. These operations include additions, analyses, and bulk dispatches. For example, if the only job completed before a transfer was an analysis, you wouldn’t need to roll everything back to remove the analysis.

NOTE: Bulk dispatches can be reversed, but vintrace displays the following message recommending that you do a rollback so that you can correct any errors with the dispatch and correctly restore the cost: *It is recommended to use the rollback feature to fix up any errors with the dispatch, as it also restores costs correctly. If you choose to continue with this reverse you may need to manually adjust the costs for any relevant operations that occurred after or backdated before the dispatch.*

You can also reverse inventory actions (e.g., adjustment, receive, create, move, dispatch) on stock items. Doing so will update the stock levels to reflect the reversal.

Operations that change the volume cannot be reversed. These include, but are not limited to, toppings, transfers, treatments, changes in ownership, changes in batch, press cycles, extractions, and all sparkling operations.

## When to Contact Support

You may be advised to contact vintrace support when a large number of critical operations are involved in a rollback or rollback & replay. This may include complex situations or situations where there are a large number of operations. Be sure to provide us with as much information as possible so that we can know when to start the rollback or rollback & replay. This includes the batch, vessels, date, work order, and operation.

We’ll notify you when we complete the rollback. If we performed a rollback and replay, we’ll send you the Replay work order number.
