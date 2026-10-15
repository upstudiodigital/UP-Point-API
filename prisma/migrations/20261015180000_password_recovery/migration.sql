ALTER TABLE "users" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "PasswordReset" (
 "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "tokenHash" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "expiresAt" TIMESTAMP(3) NOT NULL, "usedAt" TIMESTAMP(3),
 CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PasswordReset_tokenHash_key" ON "PasswordReset"("tokenHash");
CREATE INDEX "PasswordReset_userId_createdAt_idx" ON "PasswordReset"("userId","createdAt");
CREATE INDEX "PasswordReset_expiresAt_idx" ON "PasswordReset"("expiresAt");

