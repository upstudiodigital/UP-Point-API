-- Existing ads were published before billing existed. Preserve their zero-charge
-- history and their ability to return to moderation after an organizer edit.
INSERT INTO "AdOrder" ("id", "userId", "eventId", "placement", "amountCents", "status", "paymentMethod", "createdAt")
SELECT 'legacy-' || e."id", e."idUserOwner", e."id", e."placement", 0, 'free', 'PIX', e."created_At"
FROM "events" e
WHERE e."moderationStatus" = 'approved'
AND NOT EXISTS (SELECT 1 FROM "AdOrder" o WHERE o."eventId" = e."id");
