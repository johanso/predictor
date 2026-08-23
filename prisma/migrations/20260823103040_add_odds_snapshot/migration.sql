-- CreateTable
CREATE TABLE "OddsSnapshot" (
    "eventId" TEXT NOT NULL,
    "bookmaker" TEXT NOT NULL,
    "competitionCode" TEXT NOT NULL,
    "homeTeamName" TEXT NOT NULL,
    "awayTeamName" TEXT NOT NULL,
    "matchUtcDate" DATETIME NOT NULL,
    "marketsJson" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("eventId", "bookmaker")
);

-- CreateIndex
CREATE INDEX "OddsSnapshot_competitionCode_matchUtcDate_idx" ON "OddsSnapshot"("competitionCode", "matchUtcDate");
