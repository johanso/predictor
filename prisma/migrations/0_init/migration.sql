-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Account" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competition" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "season" INTEGER,
    "hasHomeAway" BOOLEAN NOT NULL DEFAULT true,
    "fetchedAt" TIMESTAMP(3),
    "fixturesFetchedAt" TIMESTAMP(3),

    CONSTRAINT "Competition_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "crestUrl" TEXT,
    "competitionCode" TEXT NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamStanding" (
    "teamId" INTEGER NOT NULL,
    "playedHome" INTEGER NOT NULL,
    "goalsForHome" INTEGER NOT NULL,
    "goalsAgainstHome" INTEGER NOT NULL,
    "playedAway" INTEGER NOT NULL,
    "goalsForAway" INTEGER NOT NULL,
    "goalsAgainstAway" INTEGER NOT NULL,
    "playedTotal" INTEGER NOT NULL,
    "wonTotal" INTEGER NOT NULL,
    "drawTotal" INTEGER NOT NULL,
    "lostTotal" INTEGER NOT NULL,
    "pointsTotal" INTEGER NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamStanding_pkey" PRIMARY KEY ("teamId")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" INTEGER NOT NULL,
    "competitionCode" TEXT NOT NULL,
    "utcDate" TIMESTAMP(3) NOT NULL,
    "homeTeamId" INTEGER NOT NULL,
    "awayTeamId" INTEGER NOT NULL,
    "homeGoals" INTEGER NOT NULL,
    "awayGoals" INTEGER NOT NULL,
    "winner" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fixture" (
    "id" INTEGER NOT NULL,
    "competitionCode" TEXT NOT NULL,
    "utcDate" TIMESTAMP(3) NOT NULL,
    "matchday" INTEGER,
    "homeTeamId" INTEGER NOT NULL,
    "homeTeamName" TEXT NOT NULL,
    "homeTeamCrest" TEXT,
    "awayTeamId" INTEGER NOT NULL,
    "awayTeamName" TEXT NOT NULL,
    "awayTeamCrest" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fixture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prediction" (
    "id" SERIAL NOT NULL,
    "competitionCode" TEXT NOT NULL,
    "homeTeamId" INTEGER NOT NULL,
    "homeTeamName" TEXT NOT NULL,
    "awayTeamId" INTEGER NOT NULL,
    "awayTeamName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lambdaHome" DOUBLE PRECISION NOT NULL,
    "lambdaAway" DOUBLE PRECISION NOT NULL,
    "favorite" TEXT NOT NULL,
    "favoriteProbability" DOUBLE PRECISION NOT NULL,
    "bttsYesProbability" DOUBLE PRECISION NOT NULL,
    "over25Probability" DOUBLE PRECISION NOT NULL,
    "predictedHomeGoals" INTEGER NOT NULL,
    "predictedAwayGoals" INTEGER NOT NULL,
    "confidenceLevel" TEXT NOT NULL,
    "evaluatedAt" TIMESTAMP(3),
    "actualHomeGoals" INTEGER,
    "actualAwayGoals" INTEGER,
    "correctOneXTwo" BOOLEAN,
    "correctBtts" BOOLEAN,
    "correctOverUnder25" BOOLEAN,
    "correctExactScore" BOOLEAN,
    "goalError" DOUBLE PRECISION,

    CONSTRAINT "Prediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bet" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'modelo',
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "competitionCode" TEXT,
    "homeTeamId" INTEGER,
    "awayTeamId" INTEGER,
    "modelProbability" DOUBLE PRECISION,
    "suggestedStake" DOUBLE PRECISION,
    "homeTeamName" TEXT NOT NULL,
    "awayTeamName" TEXT NOT NULL,
    "matchUtcDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "market" TEXT NOT NULL,
    "marketLabel" TEXT NOT NULL,
    "odds" DOUBLE PRECISION NOT NULL,
    "stake" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "settledAt" TIMESTAMP(3),
    "actualHomeGoals" INTEGER,
    "actualAwayGoals" INTEGER,
    "profit" DOUBLE PRECISION,

    CONSTRAINT "Bet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OddsSnapshot" (
    "eventId" TEXT NOT NULL,
    "bookmaker" TEXT NOT NULL,
    "competitionCode" TEXT NOT NULL,
    "homeTeamName" TEXT NOT NULL,
    "awayTeamName" TEXT NOT NULL,
    "matchUtcDate" TIMESTAMP(3) NOT NULL,
    "marketsJson" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OddsSnapshot_pkey" PRIMARY KEY ("eventId","bookmaker")
);

-- CreateTable
CREATE TABLE "OddsApiCall" (
    "id" SERIAL NOT NULL,
    "calledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endpoint" TEXT NOT NULL,

    CONSTRAINT "OddsApiCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FootballDataCall" (
    "id" SERIAL NOT NULL,
    "calledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FootballDataCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bankroll" (
    "accountId" INTEGER NOT NULL,
    "startingBalance" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bankroll_pkey" PRIMARY KEY ("accountId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_name_key" ON "Account"("name");

-- CreateIndex
CREATE INDEX "Team_competitionCode_idx" ON "Team"("competitionCode");

-- CreateIndex
CREATE INDEX "Match_competitionCode_idx" ON "Match"("competitionCode");

-- CreateIndex
CREATE INDEX "Match_competitionCode_utcDate_idx" ON "Match"("competitionCode", "utcDate");

-- CreateIndex
CREATE INDEX "Fixture_competitionCode_utcDate_idx" ON "Fixture"("competitionCode", "utcDate");

-- CreateIndex
CREATE INDEX "Prediction_competitionCode_idx" ON "Prediction"("competitionCode");

-- CreateIndex
CREATE INDEX "Prediction_evaluatedAt_idx" ON "Prediction"("evaluatedAt");

-- CreateIndex
CREATE INDEX "Bet_accountId_createdAt_idx" ON "Bet"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "Bet_accountId_status_idx" ON "Bet"("accountId", "status");

-- CreateIndex
CREATE INDEX "Bet_competitionCode_idx" ON "Bet"("competitionCode");

-- CreateIndex
CREATE INDEX "OddsSnapshot_competitionCode_matchUtcDate_idx" ON "OddsSnapshot"("competitionCode", "matchUtcDate");

-- CreateIndex
CREATE INDEX "OddsApiCall_calledAt_idx" ON "OddsApiCall"("calledAt");

-- CreateIndex
CREATE INDEX "FootballDataCall_calledAt_idx" ON "FootballDataCall"("calledAt");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_competitionCode_fkey" FOREIGN KEY ("competitionCode") REFERENCES "Competition"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamStanding" ADD CONSTRAINT "TeamStanding_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_competitionCode_fkey" FOREIGN KEY ("competitionCode") REFERENCES "Competition"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_competitionCode_fkey" FOREIGN KEY ("competitionCode") REFERENCES "Competition"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_competitionCode_fkey" FOREIGN KEY ("competitionCode") REFERENCES "Competition"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bet" ADD CONSTRAINT "Bet_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bet" ADD CONSTRAINT "Bet_competitionCode_fkey" FOREIGN KEY ("competitionCode") REFERENCES "Competition"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bankroll" ADD CONSTRAINT "Bankroll_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
