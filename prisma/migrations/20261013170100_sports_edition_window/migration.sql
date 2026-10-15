ALTER TABLE "SportCompetition" ADD COLUMN "startsOn" TEXT NOT NULL DEFAULT '', ADD COLUMN "endsOn" TEXT NOT NULL DEFAULT '';
UPDATE "SportCompetition" c SET "startsOn"=e."dateEvent", "endsOn"=SUBSTRING(e."dateEvent" FROM 1 FOR 4)||'-12-31' FROM "events" e WHERE e.id=c."eventId";
