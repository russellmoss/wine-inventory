---
id: "32303310362516"
title: "Reversing a Stock Action"
url: "https://support.vintrace.com/hc/en-us/articles/32303310362516-Reversing-a-Stock-Action"
category: "vintrace Web"
section: "Bottling and Inventory"
created_at: "2024-11-20T15:52:47Z"
updated_at: "2024-11-21T10:29:54Z"
labels: ["estate", "wp-page-5179"]
gist: "As with bulk wine and dispatches, you may occasionally need to reverse a stock action."
tags: ["inventory", "corrections", "packaging", "configuration", "getting-started"]
---

# Reversing a Stock Action

As with bulk wine and dispatches, you may occasionally need to reverse a stock action. This is similar to reversing a bulk wine operation.

## Reversing Action That Doesn’t Involve a Wine Product

Follow the steps below to reverse an action that does NOT involve a wine product (e.g., receive, move, dispatch, adjustment). If you need to reverse a packaging, refer to [Reversing a Packaging](#h_16c8fbbd-c032-435f-b60b-b7968302ad74).

1. [Search for the stock item](https://support.vintrace.com/hc/en-us/articles/32303350682388).
2. Click the item to view its details in the Stock Item Overview window.
3. Select the History tab. If you don’t see the action that you want to reverse, you may need to adjust the Stock Action History dates.
4. Click the down arrow beside the View button for the action.
5. Select Reverse.

![Stock_Item_Overview_-_History_-_Reversing_Stock_Action_20200513.png](https://support.vintrace.com/hc/article_attachments/32329185898644)

The Admin Reverse Inventory Action window displays.

6. Enter a reason for the reversal.
7. Select the Reverse checkbox.

![Admin_Reverse_Inventory_Action_with_Reason_and_Reverse_Checked_20200513.png](https://support.vintrace.com/hc/article_attachments/32329171567764)

8. Click Save.

After reversing the action, you can select the Show Reversed checkbox on the History tab to view actions that have been reversed. These reversed actions will have a strikethrough.

![Stock_Item_Overview_-_History_-_Reversed_Actions_20200513.png](https://support.vintrace.com/hc/article_attachments/32329157956372)

## Reversing a Packaging

Each time an operation for a wine is recorded, vintrace takes a snapshot of the wine. These snapshots are what allow you to do a rollback and replay.

Use this option judiciously. As with any rollback, all bulk wine operations subsequent to the rollback are destroyed and you will need to re-enter all.

Because packaging includes a bulk wine component, you’ll need to use a rollback to reverse a packaging.

1. [Search for the stock item](https://support.vintrace.com/hc/en-us/articles/32303350682388).
2. Click the item to view its details in the Stock Item Overview window.
3. Select the History tab. If you don’t see the action that you want to reverse, you may need to adjust the Stock Action History dates.
4. Click the down arrow beside the View button for the packaging action.
5. Select Rollback.

![Stock_Item_Overview_-_History_-_View_-_Rollback_20200526.png](https://support.vintrace.com/hc/article_attachments/32329148398996)

The Rollback window displays. Any actions that occurred after the packaging operation that’s about to be rolled back display in the table that’s in the lower half of the window.

![Rollback_20200526.png](https://support.vintrace.com/hc/article_attachments/32329181263380)

6. For each action that occurred after the packaging operation, click View to review the operation, then select the Confirm checkbox.
7. Enter a reason for the reversal.
8. Click Rollback. A Warning window displays.
9. Click one of the following based on what you’d like to do:

- Rollback & Replay — Reverses the packaging operation. If any actions occurred after the packaging operation, vintrace generates a work order with a chronological list of the actions that were reversed as part of the rollback.
- Rollback — Reverses the packaging operation.
- Cancel — Terminates the rollback of the packaging operation.

![Rollback_Warning_20200526.png](https://support.vintrace.com/hc/article_attachments/32329158014612)
