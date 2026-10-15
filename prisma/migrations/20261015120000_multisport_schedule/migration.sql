ALTER TABLE "events" ADD COLUMN "admissionType" TEXT NOT NULL DEFAULT '', ADD COLUMN "donation" TEXT NOT NULL DEFAULT '';
CREATE TABLE "SportSession" (
 "id" TEXT NOT NULL, "competitionId" TEXT NOT NULL, "title" TEXT NOT NULL, "category" TEXT NOT NULL DEFAULT '',
 "date" TEXT NOT NULL, "time" TEXT NOT NULL, "venue" TEXT NOT NULL, "city" TEXT NOT NULL, "address" TEXT NOT NULL,
 "latitude" DOUBLE PRECISION, "longitude" DOUBLE PRECISION,
 "details" JSONB NOT NULL DEFAULT '{}', "officials" JSONB NOT NULL DEFAULT '[]', "status" TEXT NOT NULL DEFAULT 'scheduled',
 CONSTRAINT "SportSession_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "SportSession_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "SportCompetition"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SportSession_competitionId_date_time_idx" ON "SportSession"("competitionId", "date", "time");
