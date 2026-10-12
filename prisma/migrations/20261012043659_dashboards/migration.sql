-- DropForeignKey
ALTER TABLE "events" DROP CONSTRAINT "events_idProduct_fkey";

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "artists" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "moderationReason" TEXT,
ADD COLUMN     "moderationStatus" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "placement" TEXT NOT NULL DEFAULT 'cards',
ADD COLUMN     "streetAddress" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "ticketUrl" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "freeAdUsed" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AdOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "placement" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'awaiting_configuration',
    "paymentMethod" TEXT NOT NULL DEFAULT 'PIX',
    "providerPaymentId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAudit" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyTraffic" (
    "day" TEXT NOT NULL,
    "pageViews" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyTraffic_pkey" PRIMARY KEY ("day")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdOrder_eventId_key" ON "AdOrder"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "AdOrder_providerPaymentId_key" ON "AdOrder"("providerPaymentId");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_idProduct_fkey" FOREIGN KEY ("idProduct") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdOrder" ADD CONSTRAINT "AdOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdOrder" ADD CONSTRAINT "AdOrder_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep existing catalog visible; only new submissions require moderation.
UPDATE "events" SET "moderationStatus" = 'approved';
-- Existing publishers have already used their introductory publication.
UPDATE "users" SET "freeAdUsed" = true WHERE "id" IN (SELECT DISTINCT "idUserOwner" FROM "events");
ALTER TABLE "AdOrder" ADD CONSTRAINT "ad_amount_nonnegative" CHECK ("amountCents" >= 0);
ALTER TABLE "AdOrder" ADD CONSTRAINT "ad_paid_timestamp" CHECK (("status" = 'paid') = ("paidAt" IS NOT NULL));
CREATE INDEX "events_moderation_idx" ON "events" ("moderationStatus", "status");
CREATE INDEX "ad_user_created_idx" ON "AdOrder" ("userId", "createdAt");
