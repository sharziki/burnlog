CREATE TABLE "ClubAuditEvent" (
  "id" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorType" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "meta" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ClubAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClubAuditEvent_clubId_createdAt_idx" ON "ClubAuditEvent"("clubId", "createdAt");

ALTER TABLE "ClubAuditEvent" ADD CONSTRAINT "ClubAuditEvent_clubId_fkey"
  FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClubAuditEvent" ADD CONSTRAINT "ClubAuditEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
