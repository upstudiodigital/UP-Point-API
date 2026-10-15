CREATE TABLE "SupportRequest" (
 "id" TEXT NOT NULL,"email" TEXT NOT NULL,"category" TEXT NOT NULL,"description" TEXT NOT NULL,"eventId" TEXT,
 "status" TEXT NOT NULL DEFAULT 'open',"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "SupportRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SupportRequest_status_createdAt_idx" ON "SupportRequest"("status","createdAt");
