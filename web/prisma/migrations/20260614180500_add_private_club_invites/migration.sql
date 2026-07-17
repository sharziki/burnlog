ALTER TABLE "Club" ADD COLUMN "isPrivate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Club" ADD COLUMN "inviteCode" TEXT;
CREATE UNIQUE INDEX "Club_inviteCode_key" ON "Club"("inviteCode");
