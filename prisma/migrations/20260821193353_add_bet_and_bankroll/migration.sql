-- CreateTable
CREATE TABLE "Bet" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "competitionCode" TEXT NOT NULL,
    "homeTeamId" INTEGER NOT NULL,
    "homeTeamName" TEXT NOT NULL,
    "awayTeamId" INTEGER NOT NULL,
    "awayTeamName" TEXT NOT NULL,
    "matchUtcDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "market" TEXT NOT NULL,
    "marketLabel" TEXT NOT NULL,
    "modelProbability" REAL NOT NULL,
    "odds" REAL NOT NULL,
    "stake" REAL NOT NULL,
    "suggestedStake" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "settledAt" DATETIME,
    "actualHomeGoals" INTEGER,
    "actualAwayGoals" INTEGER,
    "profit" REAL,
    CONSTRAINT "Bet_competitionCode_fkey" FOREIGN KEY ("competitionCode") REFERENCES "Competition" ("code") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Bankroll" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "startingBalance" REAL NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Bet_competitionCode_idx" ON "Bet"("competitionCode");

-- CreateIndex
CREATE INDEX "Bet_status_idx" ON "Bet"("status");

-- CreateIndex
CREATE INDEX "Bet_createdAt_idx" ON "Bet"("createdAt");
