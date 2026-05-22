-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GroupConfig" (
    "groupId" TEXT NOT NULL PRIMARY KEY,
    "antiLink" BOOLEAN NOT NULL DEFAULT false,
    "welcomeMsg" TEXT,
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "mutedUntil" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GroupConfig_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "dueAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Reminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WAAuthState" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "encryptedBlob" BLOB NOT NULL,
    "iv" BLOB NOT NULL,
    "authTag" BLOB NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "User_platform_idx" ON "User"("platform");

-- CreateIndex
CREATE UNIQUE INDEX "User_platform_externalId_key" ON "User"("platform", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Group_platform_externalId_key" ON "Group"("platform", "externalId");

-- CreateIndex
CREATE INDEX "Reminder_dueAt_status_idx" ON "Reminder"("dueAt", "status");

-- CreateIndex
CREATE INDEX "Reminder_userId_status_idx" ON "Reminder"("userId", "status");
