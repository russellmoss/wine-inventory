---
id: "32301350444180"
title: "Managing User Accounts (Central Authorisation/SSO enabled)"
url: "https://support.vintrace.com/hc/en-us/articles/32301350444180-Managing-User-Accounts-Central-Authorisation-SSO-enabled"
category: "Setup and Admin"
section: "Configuration"
created_at: "2024-11-20T14:46:49Z"
updated_at: "2026-05-20T20:01:36Z"
labels: []
gist: "System users are the individuals who will use vintrace to perform tasks and operations for your winery."
tags: ["configuration", "permissions"]
---

# Managing User Accounts (Central Authorisation/SSO enabled)

System users are the individuals who will use vintrace to perform tasks and operations for your winery.

Only users with the [Local vintrace Administrator permission](https://support.vintrace.com/hc/en-us/articles/32303349421588-Roles-and-Permissions) can manage vintrace system users.

The Users page displays the users that you’ve invited to the account. When the user has been assigned to more than one winery, you can click the value displayed in the Winery & Roles column to view the winery names and the roles assigned.

![Users_Page_20220225.png](https://support.vintrace.com/hc/article_attachments/32328620668564)

The Status column displays one of the following:

- Active - indicates that the user accepted the invitation.
- Disabled - indicates that the user’s account is not active.
- Pending - indicates that an invitation was sent to the user, but they have not yet accepted it.

## Viewing the Users Page

To view the Users page:

1. Click ![More_Options_20200323.png](https://support.vintrace.com/hc/article_attachments/32328613040916) More Options in the sidebar.
2. From the Address Book tile, click Manage User Accounts.

![More_Options_-_Manage_User_Accounts_20220227.png](https://support.vintrace.com/hc/article_attachments/32328628470036)

The Users page displays.

![Users_Page_20220225.png](https://support.vintrace.com/hc/article_attachments/32328620668564)

## Setting Up a System User

In order to set up a system user, you must have the [Local vintrace Administrator permission](https://Pending%20Corrections%20are%20not%20visible%20unless%20downloaded.%20We%20used%20to%20be%20able%20to%20see%20an%20overview%20and%20make%20quick%20corrections%20right%20from%20the%20pending%20screen%20and%20now%20we%20have%20to%20download,%20update,%20and%20import.).

To add a system user:

1. From the Users page, click the ![Plus_in_Green_Circle_20200319.png](https://support.vintrace.com/hc/article_attachments/32328628479508) add icon.

![Users_-_Add_Icon_20220225.png](https://support.vintrace.com/hc/article_attachments/32328628642964)

The Invite User form displays.

![Invite_User_20220411.png](https://support.vintrace.com/hc/article_attachments/32328647383188)

2. Enter the user’s first name, last name, and email address.

The user will use the email address to log into vintrace. An email address can only be invited to the database once. If there are multiple wineries associated with the database, the user can be granted access to access multiple wineries.

3. To grant the user with the [Local vintrace Administrator permission](https://support.vintrace.com/hc/en-us/articles/360000813755-Roles-and-Permissions#LocalvintraceAdministrators) for the database, select the Provide the User with Administrator Access checkbox.

If you want to grant the user with the Local vintrace Administrator permission, you'll need to select the checkbox here since the permission is not listed on the Roles and Permissions screen.

4. To grant the user access to all wineries (i.e., [All Winery mode](https://support.vintrace.com/hc/en-us/articles/360000822456-Using-vintrace-Across-Multiple-Facilities#SwitchingBetweenWineries)) associated with your account, select the Permit the User to Switch Between All Wineries and continue to step 6. The Permit the User to Switch Between All Wineries checkbox only displays if your account has a multi winery license. Otherwise, continue to the next step to select the wineries that you want to grant them access to.

![Invite_User_-_Checkboxes_20220225.png](https://support.vintrace.com/hc/article_attachments/32328620695828)

5. Click the Wineries field and select at least one winery that you want to give the user access to. If your account has a multi-winery license and you want to allow the user to switch between wineries, select the wineries from the list.

If you’ve exceeded your account’s user limit, a message informing you of an additional charge displays. If you’d like to accept the additional charge to create the user, select the I Agree to This Additional Charge checkbox.

![Invite_User_-_Exceeding_User_Limit_20220303.png](https://support.vintrace.com/hc/article_attachments/32328613088020)

6. Click Next. The roles and permissions that you can assign to the user display. The winery’s name displays at the top.

![Invite_User_-_Roles_and_Permissions_-_Winery_Name_20220411.png](https://support.vintrace.com/hc/article_attachments/32328635181972)

7. Select the role(s) you want to assign to the user. Selecting a role automatically selects certain permissions. Please ensure the appropriate roles are assigned prior to setting the permissions.

![Invite_User_-_Reporting_Role_and_Permissions_20220411.png](https://support.vintrace.com/hc/article_attachments/32328628560020)

You can edit the permissions assigned to the user in the next step. The permissions included with each role are listed below.

|  |  |
| --- | --- |
| **Role** | **Included Permissions** |
| Administrator | Can add/edit trial blends Can change ownership of wines Can create product allocations Can manage product allocations Can manage vintrace subscription Cellarhand - Selects the following permissions: Can add product notes Can change ownership of wines Can edit existing product notes Can reassign jobs on the vintrace app Can submit inventory actions Can view product notes Perform bulk wine reversals |
| Cellarhand | Can add product notes Can change ownership of wines Can edit existing product notes Can reassign jobs on the vintrace app Can submit inventory actions Can view product notes Perform bulk wine reversals Submit operations |
| Reporting | Can add product notes Can adjust costs Can edit existing product notes Can manage client billing Can manage grower contract Can manage product allocations Can manage purchase orders Can manage sales orders Can view costs Can view product notes |
| Winemaker | Can add product notes Can add/edit trial blends Can adjust costs Can change ownership of wines Can change winery defaults Can edit existing product notes Can force lock removal Can manage client billing Can manage grower contract Can manage product allocations Can manage purchase orders Can manage sales orders Can move wine between bonds Can move wine between wineries Can perform rollbacks and restorations Can reassign jobs on the vintrace app Can record large losses Can submit inventory actions Can view product notes Complete operations in future Complete tasks out of sequence Perform bulk wine reversals Schedule tasks Submit operations Advanced data management Advanced lab data management Modify vessel alert state Import/export setup data |

8. If you’d like to change the permissions that are granted to the user, click the arrow beside Advanced, then select or de-select the permissions. Refer to our [Roles and Permissions](https://support.vintrace.com/hc/en-us/articles/360000813755-Roles-and-Permissions#Permissions) article for details on the available permissions.

![Invite_User_-_Advanced_20220411.png](https://support.vintrace.com/hc/article_attachments/32328635262228)

9. If you’ve selected more than one winery for the user, click Next and select the roles and permissions for each winery. Otherwise, continue to the next step.

When a user who has access to more than one winery is in All Winery mode, their available permissions will be the ones that they’ve been granted in all wineries. For example, suppose a user has been granted the Can Add Product Notes and the Can Edit Product Notes permissions in both Winery A and Winery B. The user has also been granted the Can Add/Edit Trial Blends permission in Winery A. When the user is in All Winery mode, they’ll only have the permissions that are shared across all of the wineries that they have access to. In our example, the user will have the Can Add Product Notes and the Can Edit Product Notes permissions when they’re in All Winery mode.

10. Click Save.

## Resending an Invitation

If the user accidentally deletes the email invitation, or the invitation expires, you can resend an invitation.

To resend the invitation to a pending user:

1. From the Users page, click the ![Three_Vertical_Dots_-_Carafe_20220227.png](https://support.vintrace.com/hc/article_attachments/32328635210644) beside the user.
2. Select Resend.

![Users_-_Resend_20220301.png](https://support.vintrace.com/hc/article_attachments/32328635237908)

## Deleting an Invitation

Deleting an invitation prevents the user from activating their account. To delete a pending user’s invitation:

1. From the Users page, click the ![Three_Vertical_Dots_-_Carafe_20220227.png](https://support.vintrace.com/hc/article_attachments/32328635210644) beside the user.
2. Select Delete.

![Users_-_Delete_20220301.png](https://support.vintrace.com/hc/article_attachments/32328647518996)

## Editing a User

To edit a user’s information:

1. From the Users page, click the ![Three_Vertical_Dots_-_Carafe_20220227.png](https://support.vintrace.com/hc/article_attachments/32328635210644) beside the user.
2. Select Edit.

![Users_-_Edit_20220301.png](https://support.vintrace.com/hc/article_attachments/32328635290004)

## Disabling a User

Disabling a user’s account prevents that user from logging into vintrace. To disable a user’s account:

1. From the Users page, click the ![Three_Vertical_Dots_-_Carafe_20220227.png](https://support.vintrace.com/hc/article_attachments/32328635210644) beside the user.
2. Select Disable.

![Users_-_Disable_20220301.png](https://support.vintrace.com/hc/article_attachments/32328663634580)

The Disable User window displays.

![Disable_User_20220227.png](https://support.vintrace.com/hc/article_attachments/32328628734740)

3. Click one of the following:

- Keep - Retains the user slot in your subscription.
- Delete - Disables the user and removes the user slot from your subscription.
- Cancel - The user is not disabled.

## Re-enabling a User

To re-enable a disabled user’s account:

1. From the Users page, click the ![Three_Vertical_Dots_-_Carafe_20220227.png](https://support.vintrace.com/hc/article_attachments/32328635210644) beside the user.
2. Select Re-enable.
3. If your account has reached its user limit, the Re-enable User window asks you to confirm that you agree to the additional charge.

![Re-enable_User_20220303.jpg](https://support.vintrace.com/hc/article_attachments/32328663604372)

4. To agree to the charge for the additional user, select the I Agree to This Additional Charge checkbox.
5. Click Keep.
