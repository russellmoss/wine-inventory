---
id: "32303293898132"
title: "Cloud printing setup for lab labels"
url: "https://support.vintrace.com/hc/en-us/articles/32303293898132-Cloud-printing-setup-for-lab-labels"
category: "Setup and Admin"
section: "Configuration"
created_at: "2024-11-20T15:51:31Z"
updated_at: "2024-11-20T15:51:31Z"
labels: ["estate", "oldui", "Lab Label printing", "wp-faq-9416", "Cloud print", "PrintNode"]
gist: "Cloud-based printing is also referred to as PrintNode; the terms are used interchangeably here."
tags: ["configuration", "exports", "lab", "migration"]
---

# Cloud printing setup for lab labels

## Account setup

Cloud-based printing is also referred to as PrintNode; the terms are used interchangeably here.

Cloud-based printing can be set up as the default for label printing for your entire company, your winery (if in a multi-winery setup) or individual user.

**Important:** Please note that you need to be a **local vintrace administrator** to be able to do an initial setup for the cloud print. After the initial sign, non-admin users may add the PrintNode utility to their System user profile.

To setup your cloud printer go to **Winery Setup > General > System Policy** and click the **Cloud Print** icon beside the *Lab label printer* field.

[![Setup1](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Setup1.jpg)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Setup1.jpg)

In the vintrace Cloud account setup screen, enter all the necessary information such as *Firstname*, *Lastname*, *Email*, and *Password*. Then click on **Save** button.

**Important:** Please note that the **email** and **password** you enter to setup the cloud print account will be the same *email* and *password* that will used to sign-in by other non-admin vintrace users in your winery to use the cloud printer.

[![Setup4](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Setup4.jpg)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Setup4.jpg)

In the next screen, click on the **Click here to download** link provided to download the Cloud print software.

[![Setup5](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Setup5.jpg)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Setup5.jpg)

## Client installation

After the cloud print software installer has been downloaded, double click on it. This will bring up the setup screen.

In the License Agreement screen, tick on **I accept the agreement button** and then click on **Next** button.

[![Setup1](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Setup11.jpg)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Setup11.jpg)

Select the folder where you want to install the software or you can use the default selected folder then click on **Next** button.

[![Setup2](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Setup2.jpg)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Setup2.jpg)

Click on **Next** button.

[![Setup3](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Setup3.jpg)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Setup3.jpg)

Tick on *Create a desktop shortcut* checkbox then click on **Next**.

[![Setup4](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Setup41.jpg)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Setup41.jpg)

Click on **Install** button.

[![Setup5](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Setup52.jpg)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Setup52.jpg)

Tick *Launch PrintNode* then click **Finish**.

[![Setup6](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Setup6.jpg)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Setup6.jpg)

This will bring up the cloud print client. Enter the email address and password that you have used to register an account in the previous steps and then click on **Sign In** button.

[![Setup7](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Setup7.jpg)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Setup7.jpg)

## Installation for Mac users

For Mac users, after you have installed the cloud print client and then run it the first time, you will get this warning message:

[![Install on mac1](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Install-on-mac1.png)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Install-on-mac1.png)

Go to **System Preferences – Security & Privacy**.

[![Setup1](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Setup12.jpg)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Setup12.jpg)

In the bottom of the **Security & Privacy** dialog, there’s a message saying that *PrintNode was blocked from opening because the identity of the developer cannot be confirmed*. Click **Open Anyway**.

[![Setup2](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Setup21.jpg)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Setup21.jpg)

Click **Open** in the dialog that comes up.

[![Setup3](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Setup31.jpg)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Setup31.jpg)

You can then proceed to complete the Cloud print client installation steps.

## Selecting a system wide printer

After you have logged in to the cloud print client software, go to **Winery Setup > General > System Policy** and click on the **Cloud print** icon beside the *Lab label printer* field to select the printer you want to use.

[![Setup1](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Setup1.jpg)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Setup1.jpg)

Click on the printer you want to use then **OK**.

[![Select1](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Select1.jpg)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Select1.jpg)

In the **Lab label printer** field, the selected printer id will be set.

[![Select2](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Select21.jpg)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Select21.jpg)

## Setting up printing at the Winery, Laboratory or User levels

**System** is the highest level – this print service can be used by other non-admin vintrace users. Follow the instructions above.

**Winery** is for those clients working in a multi-winery environment. Setting **Cloud** print up at this level restricts usage to just that winery for that printer; other wineries in the group may set their lab printer independently.

**Laboratory** is used when you want to print a specific lab’s label to a specific printer.

**System user** is used when a user wants to specify a printer for all lab requests submitted by them.

## Winery Cloud print

Head into **Winery Setup > Work Flow > Defaults > Winery tab**.

Choose the **Winery** from the drop down menu on the right.

[![Demo - pick winery for multi-winery](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Demo-pick-winery-for-multi-winery.png)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Demo-pick-winery-for-multi-winery.png)

In ***Lab Console Settings**,* click the Cloud print icon and select your lab printer:

[![Demo - change lab printer for winery in multi-winery](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Demo-change-lab-printer-for-winery-in-multi-winery.png)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Demo-change-lab-printer-for-winery-in-multi-winery.png)

## Laboratory Cloud print

Head into the **Address book**; select *Laboratory* from the **Organization** drop-down.

Pick the laboratory you want; click **Advanced**; head into the **Roles** tab and select the **Laboratory** role.

[![Demo - find and choose laboratory](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Demo-find-and-choose-laboratory.png)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Demo-find-and-choose-laboratory.png)

[![Demo - change lab printer for laboratory](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Demo-change-lab-printer-for-laboratory.png)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Demo-change-lab-printer-for-laboratory.png)

Click the **Cloud** print icon and select your lab printer.

## User Cloud Print

Head into **Winery Setup > Workflow > Defaults > User** tab. Select the desired user from the drop down list.

In **Lab Console Settings***,* click the **Cloud** print icon and select your lab printer from the list:

[![Demo - change lab printer at user level](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Demo-change-lab-printer-at-user-level1.png)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/05/Demo-change-lab-printer-at-user-level1.png)

## Add a new printer

If the label printer changes, you may need to find and choose the new one. Return to the **Winery** or **User** tab, click the **PrintNode/Cloud Print** icon, and choose the new printer. Click **OK** to complete the change over.
