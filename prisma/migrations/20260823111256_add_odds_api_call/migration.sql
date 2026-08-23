-- CreateTable
CREATE TABLE "OddsApiCall" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "calledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endpoint" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "OddsApiCall_calledAt_idx" ON "OddsApiCall"("calledAt");
