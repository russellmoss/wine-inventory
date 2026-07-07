---
id: "36180293059604"
title: "Finding a Work Order After a Rollback and Replay"
url: "https://support.vintrace.com/hc/en-us/articles/36180293059604-Finding-a-Work-Order-After-a-Rollback-and-Replay"
category: "vintrace Web"
section: "Work orders"
created_at: "2025-03-31T23:38:33Z"
updated_at: "2025-04-04T14:34:41Z"
labels: []
gist: "The rollback and rollback & replay functions in vintrace enable you to fix data entry errors."
tags: ["work-orders", "reporting", "ux-friction"]
---

# Finding a Work Order After a Rollback and Replay

The rollback and rollback & replay functions in vintrace enable you to fix data entry errors. We have now enabled better visibility and tracking of work order numbers to help track jobs when they have been rolled back and replayed.

## Finding the Replay Work Order

If you are on a rolled back operation and would like to find the new replay work order, navigate to the 'Notes' tab of the original work order. The TWL number can now be searched to view the replay work order.

![Notes on a Rolled Back Job](https://support.vintrace.com/hc/article_attachments/36180257339412)

## Finding the Rolled Back Work Order

To find the original work order number on a replayed job, navigate to the 'Notes' tab on the new work order. The TWL number can now be searched to view the old work order.

![Notes on a replay job.png](https://support.vintrace.com/hc/article_attachments/36180293053844)

## Reporting on Work Orders After a Rollback and Replay

You can find reporting that includes rollback and replay information, in the Transaction Summary report:

1. Click ![Reports Menu Option 20200406.png](https://support.vintrace.com/hc/article_attachments/36180293054228) Reports in the sidebar.
2. Select Operations.
3. Click the Transaction Summary report

![Transaction Summary Report](https://support.vintrace.com/hc/article_attachments/36180293054740)

The Transaction Summary report compiles a list of all operations in a given time period. It will also display if a transaction has been reversed. The 'Notes' column will display the replay work order where relevant. A transaction may be reversed but not replayed, and therefore will not have a replay work order number.

![Transaction Summary Report.png](https://support.vintrace.com/hc/article_attachments/36180293055380)
