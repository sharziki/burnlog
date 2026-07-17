ALTER TABLE "BurnEvent" ADD COLUMN "apiKeyId" TEXT;

CREATE INDEX "BurnEvent_apiKeyId_idx" ON "BurnEvent"("apiKeyId");

ALTER TABLE "BurnEvent" ADD CONSTRAINT "BurnEvent_apiKeyId_fkey"
  FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;
