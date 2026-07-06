---
title: "Winery Lock Backdating"
url: "https://support.innovint.us/hc/en-us/articles/360020396351-winery-activity-lock-backdating"
category: "New to InnoVint"
section: "Settings - MAKE, GROW & FINANCE"
page_type: "article"
lastmod: "2025-11-20"
gist: "The Lock Backdating capability allows Admin users to set the earliest date and time at which actions can be backdated in InnoVint."
tags: ["cost", "configuration", "ux-friction", "getting-started", "vineyard", "permissions"]
---

# Winery Lock Backdating

The Lock Backdating capability allows Admin users to set the earliest date and time at which actions can be backdated in InnoVint. This capability can be applied separately to actions and cost items.

- [What is lock backdating?](#what)
- [How to set the backdate lock](#how)
- [Removing a backdate lock](#remove)

#### What is lock backdating?

Lock backdates can be set separately for inventory actions and cost item actions (if your account has COGS Tracking turned on).  This helps in preventing actions from being recorded that may affect previously submitted TTB or compliance reports, as well as restricting cost entries after finance closes the books for the month, quarter or year.

- **Lock backdating (Winery)**
  If a user tries to backdate a winery movement action (or tax class change) to before the lock date, they will get an error message: "Oops, we can't record this action. Cannot backdate actions before DD/MM/YY". This lock  will not apply to non-movement actions, such as analysis or custom actions.
  ![Winery Lock Backdating_Action backdate error message](https://support.innovint.us/hs-fs/hubfs/Knowledge%20Base%20Import/Winery%20Lock%20Backdating_Action%20backdate%20error%20message.webp?width=400&height=117&name=Winery%20Lock%20Backdating_Action%20backdate%20error%20message.webp)
- **Cost item backdate**
  If a user tries to backdate a new cost item or remove cost prior to the lock date, they will also get an error message:
  ![Winery Lock Backdating_Cost item backdate error message](https://support.innovint.us/hs-fs/hubfs/Knowledge%20Base%20Import/Winery%20Lock%20Backdating_Cost%20item%20backdate%20error%20message.webp?width=400&height=132&name=Winery%20Lock%20Backdating_Cost%20item%20backdate%20error%20message.webp)

Lock backdating for both Winery actions and Cost Items affects the entire account and is not owner-specific.

#### How to set the backdate lock

Users with Admin permissions can find the Lock backdate feature in your Settings > Lock backdating screen:

![Winery Lock Backdating_How to Set backdate locks](https://support.innovint.us/hs-fs/hubfs/Knowledge%20Base%20Import/Winery%20Lock%20Backdating_How%20to%20Set%20backdate%20locks.webp?width=675&height=567&name=Winery%20Lock%20Backdating_How%20to%20Set%20backdate%20locks.webp)

Click on **Set a new date** and then click on the blue **Set lock date** button to save the new lock.

![Winery Lock Backdating_Set date and time](https://support.innovint.us/hs-fs/hubfs/Knowledge%20Base%20Import/Winery%20Lock%20Backdating_Set%20date%20and%20time.webp?width=400&height=95&name=Winery%20Lock%20Backdating_Set%20date%20and%20time.webp)

Only users with Admin permissions may access Lock backdating and lock the dates.

#### Removing a backdate lock

If you need to edit an action or cost prior to the backdated lock, an account Admin may reset the backdate as required to allow specific edits - just set the lock to a date and time earlier than the required edits.

After making any edits, be sure to reset the lock to the chosen date!
