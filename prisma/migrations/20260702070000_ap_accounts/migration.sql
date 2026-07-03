-- Phase 15 Unit 10 — supply-receipt A/P Bill accounts on app_settings (winery-wide): a receipt posts
-- DR inventory-asset / CR accounts-payable. Additive + nullable; both unset → AP export is withheld.

ALTER TABLE "app_settings" ADD COLUMN "apInventoryAccount" TEXT;
ALTER TABLE "app_settings" ADD COLUMN "apPayableAccount" TEXT;
