-- AlterTable
ALTER TABLE "Competition" ADD COLUMN "fixturesFetchedAt" DATETIME;

-- CreateTable
CREATE TABLE "Match" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "competitionCode" TEXT NOT NULL,
    "utcDate" DATETIME NOT NULL,
    "homeTeamId" INTEGER NOT NULL,
    "awayTeamId" INTEGER NOT NULL,
    "homeGoals" INTEGER NOT NULL,
    "awayGoals" INTEGER NOT NULL,
    "winner" TEXT,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Match_competitionCode_fkey" FOREIGN KEY ("competitionCode") REFERENCES "Competition" ("code") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Fixture" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "competitionCode" TEXT NOT NULL,
    "utcDate" DATETIME NOT NULL,
    "matchday" INTEGER,
    "homeTeamId" INTEGER NOT NULL,
    "homeTeamName" TEXT NOT NULL,
    "homeTeamCrest" TEXT,
    "awayTeamId" INTEGER NOT NULL,
    "awayTeamName" TEXT NOT NULL,
    "awayTeamCrest" TEXT,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Fixture_competitionCode_fkey" FOREIGN KEY ("competitionCode") REFERENCES "Competition" ("code") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Match_competitionCode_idx" ON "Match"("competitionCode");

-- CreateIndex
CREATE INDEX "Match_competitionCode_utcDate_idx" ON "Match"("competitionCode", "utcDate");

-- CreateIndex
CREATE INDEX "Fixture_competitionCode_utcDate_idx" ON "Fixture"("competitionCode", "utcDate");
