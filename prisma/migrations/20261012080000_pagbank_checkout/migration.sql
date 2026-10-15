ALTER TABLE "AdOrder" ADD COLUMN "checkoutId" TEXT,
ADD COLUMN "checkoutUrl" TEXT,
ADD COLUMN "checkoutExpiresAt" TIMESTAMP(3),
ADD COLUMN "checkoutPayload" JSONB,
ADD COLUMN "providerOrderId" TEXT,
ADD COLUMN "paymentEnvironment" TEXT;
CREATE UNIQUE INDEX "AdOrder_checkoutId_key" ON "AdOrder"("checkoutId");
