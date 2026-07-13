-- CreateTable
CREATE TABLE "Competition" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "season" INTEGER,
    "hasHomeAway" BOOLEAN NOT NULL DEFAULT true,
    "fetchedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Team" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "crestUrl" TEXT,
    "competitionCode" TEXT NOT NULL,
    CONSTRAINT "Team_competitionCode_fkey" FOREIGN KEY ("competitionCode") REFERENCES "Competition" ("code") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TeamStanding" (
    "teamId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
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
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeamStanding_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Team_competitionCode_idx" ON "Team"("competitionCode");
