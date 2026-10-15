ALTER TABLE "AdOrder" ADD COLUMN "publicationKey" TEXT;
CREATE UNIQUE INDEX "AdOrder_publicationKey_key" ON "AdOrder"("publicationKey");
