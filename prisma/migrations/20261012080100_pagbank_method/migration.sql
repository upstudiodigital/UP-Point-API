ALTER TABLE "AdOrder" ALTER COLUMN "paymentMethod" SET DEFAULT 'PAGBANK';
UPDATE "AdOrder" SET "paymentMethod"='PAGBANK' WHERE "status"='awaiting_configuration' AND "amountCents">0;
