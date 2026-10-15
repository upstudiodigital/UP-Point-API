ALTER TABLE "AdOrder" DROP CONSTRAINT "ad_paid_timestamp";
ALTER TABLE "AdOrder" ADD CONSTRAINT "ad_paid_timestamp" CHECK ("status" <> 'paid' OR "paidAt" IS NOT NULL);
