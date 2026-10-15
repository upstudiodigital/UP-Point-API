-- DropIndex
DROP INDEX "ad_user_created_idx";

-- DropIndex
DROP INDEX "events_moderation_idx";

-- CreateTable
CREATE TABLE "SportCompetition" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "sport" TEXT NOT NULL,
    "edition" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "admissionType" TEXT NOT NULL DEFAULT 'free',
    "donation" TEXT NOT NULL DEFAULT '',
    "winPoints" INTEGER NOT NULL DEFAULT 3,
    "drawPoints" INTEGER NOT NULL DEFAULT 1,
    "lossPoints" INTEGER NOT NULL DEFAULT 0,
    "tieBreakers" TEXT[] DEFAULT ARRAY['points', 'wins', 'goalDifference', 'goalsFor']::TEXT[],
    "rulesUrl" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "SportCompetition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SportTeam" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "crestUrl" TEXT NOT NULL DEFAULT '',
    "groupName" TEXT NOT NULL DEFAULT '',
    "pointsAdjustment" INTEGER NOT NULL DEFAULT 0,
    "adjustmentReason" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "SportTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SportPlayer" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shirt" INTEGER NOT NULL,
    "position" TEXT NOT NULL,

    CONSTRAINT "SportPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SportRound" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "SportRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SportMatch" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "homeId" TEXT NOT NULL,
    "awayId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "venue" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "countsForStandings" BOOLEAN NOT NULL DEFAULT true,
    "admissionType" TEXT NOT NULL DEFAULT 'inherit',
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "donation" TEXT NOT NULL DEFAULT '',
    "homeFormation" TEXT NOT NULL DEFAULT '',
    "awayFormation" TEXT NOT NULL DEFAULT '',
    "officials" JSONB NOT NULL DEFAULT '[]',
    "officialsConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "lineupConfirmed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SportMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SportSelection" (
    "matchId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "starter" BOOLEAN NOT NULL DEFAULT true,
    "position" TEXT NOT NULL,

    CONSTRAINT "SportSelection_pkey" PRIMARY KEY ("matchId","playerId")
);

-- CreateIndex
CREATE UNIQUE INDEX "SportCompetition_eventId_key" ON "SportCompetition"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "SportTeam_competitionId_name_key" ON "SportTeam"("competitionId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "SportPlayer_teamId_shirt_key" ON "SportPlayer"("teamId", "shirt");

-- CreateIndex
CREATE UNIQUE INDEX "SportRound_competitionId_number_key" ON "SportRound"("competitionId", "number");

-- CreateIndex
CREATE INDEX "SportMatch_competitionId_date_time_idx" ON "SportMatch"("competitionId", "date", "time");

-- AddForeignKey
ALTER TABLE "SportCompetition" ADD CONSTRAINT "SportCompetition_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SportTeam" ADD CONSTRAINT "SportTeam_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "SportCompetition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SportPlayer" ADD CONSTRAINT "SportPlayer_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "SportTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SportRound" ADD CONSTRAINT "SportRound_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "SportCompetition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SportMatch" ADD CONSTRAINT "SportMatch_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "SportCompetition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SportMatch" ADD CONSTRAINT "SportMatch_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "SportRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SportMatch" ADD CONSTRAINT "SportMatch_homeId_fkey" FOREIGN KEY ("homeId") REFERENCES "SportTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SportMatch" ADD CONSTRAINT "SportMatch_awayId_fkey" FOREIGN KEY ("awayId") REFERENCES "SportTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SportSelection" ADD CONSTRAINT "SportSelection_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "SportMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SportSelection" ADD CONSTRAINT "SportSelection_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "SportPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

