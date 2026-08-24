-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Bet" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "source" TEXT NOT NULL DEFAULT 'modelo',
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "competitionCode" TEXT,
    "homeTeamId" INTEGER,
    "awayTeamId" INTEGER,
    "modelProbability" REAL,
    "suggestedStake" REAL,
    "homeTeamName" TEXT NOT NULL,
    "awayTeamName" TEXT NOT NULL,
    "matchUtcDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "market" TEXT NOT NULL,
    "marketLabel" TEXT NOT NULL,
    "odds" REAL NOT NULL,
    "stake" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "settledAt" DATETIME,
    "actualHomeGoals" INTEGER,
    "actualAwayGoals" INTEGER,
    "profit" REAL,
    CONSTRAINT "Bet_competitionCode_fkey" FOREIGN KEY ("competitionCode") REFERENCES "Competition" ("code") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Bet" ("actualAwayGoals", "actualHomeGoals", "awayTeamId", "awayTeamName", "competitionCode", "createdAt", "homeTeamId", "homeTeamName", "id", "market", "marketLabel", "matchUtcDate", "modelProbability", "odds", "profit", "settledAt", "stake", "status", "suggestedStake") SELECT "actualAwayGoals", "actualHomeGoals", "awayTeamId", "awayTeamName", "competitionCode", "createdAt", "homeTeamId", "homeTeamName", "id", "market", "marketLabel", "matchUtcDate", "modelProbability", "odds", "profit", "settledAt", "stake", "status", "suggestedStake" FROM "Bet";
DROP TABLE "Bet";
ALTER TABLE "new_Bet" RENAME TO "Bet";
CREATE INDEX "Bet_competitionCode_idx" ON "Bet"("competitionCode");
CREATE INDEX "Bet_status_idx" ON "Bet"("status");
CREATE INDEX "Bet_createdAt_idx" ON "Bet"("createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
