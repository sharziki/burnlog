ALTER TABLE "ApiKey" ADD COLUMN "clubId" TEXT;
ALTER TABLE "BurnEvent" ADD COLUMN "clubId" TEXT;

CREATE INDEX "ApiKey_clubId_idx" ON "ApiKey"("clubId");
CREATE INDEX "BurnEvent_clubId_timestamp_idx" ON "BurnEvent"("clubId", "timestamp");

ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_clubId_fkey"
  FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BurnEvent" ADD CONSTRAINT "BurnEvent_clubId_fkey"
  FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
