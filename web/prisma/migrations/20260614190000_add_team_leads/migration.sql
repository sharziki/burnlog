CREATE TABLE "TeamLead" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "company" TEXT,
    "teamSize" TEXT,
    "useCase" TEXT,
    "source" TEXT NOT NULL DEFAULT 'teams_page',
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamLead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TeamLead_email_key" ON "TeamLead"("email");
