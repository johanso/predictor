-- CreateTable
CREATE TABLE "Prediction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "competitionCode" TEXT NOT NULL,
    "homeTeamId" INTEGER NOT NULL,
    "homeTeamName" TEXT NOT NULL,
    "awayTeamId" INTEGER NOT NULL,
    "awayTeamName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lambdaHome" REAL NOT NULL,
    "lambdaAway" REAL NOT NULL,
    "favorite" TEXT NOT NULL,
    "favoriteProbability" REAL NOT NULL,
    "bttsYesProbability" REAL NOT NULL,
    "over25Probability" REAL NOT NULL,
    "predictedHomeGoals" INTEGER NOT NULL,
    "predictedAwayGoals" INTEGER NOT NULL,
    "confidenceLevel" TEXT NOT NULL,
    "evaluatedAt" DATETIME,
    "actualHomeGoals" INTEGER,
    "actualAwayGoals" INTEGER,
    "correctOneXTwo" BOOLEAN,
    "correctBtts" BOOLEAN,
    "correctOverUnder25" BOOLEAN,
    "correctExactScore" BOOLEAN,
    "goalError" REAL,
    CONSTRAINT "Prediction_competitionCode_fkey" FOREIGN KEY ("competitionCode") REFERENCES "Competition" ("code") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Prediction_competitionCode_idx" ON "Prediction"("competitionCode");

-- CreateIndex
CREATE INDEX "Prediction_evaluatedAt_idx" ON "Prediction"("evaluatedAt");
