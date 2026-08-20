-- CreateEnum
CREATE TYPE "Marketplace" AS ENUM ('MERCADO_LIVRE', 'SHOPEE');

-- CreateEnum
CREATE TYPE "SearchStrategy" AS ENUM ('KEYWORD_SEARCH', 'RADAR_DISCOVERY');

-- CreateEnum
CREATE TYPE "SearchTermStatus" AS ENUM ('ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "CollectionSource" AS ENUM ('OFFICIAL_API', 'PUBLIC_PAGE', 'HYBRID');

-- CreateEnum
CREATE TYPE "CollectionRunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "HumanDecisionStatus" AS ENUM ('VALIDATED', 'REJECTED');

-- CreateTable
CREATE TABLE "SearchTerm" (
    "id" TEXT NOT NULL,
    "marketplace" "Marketplace" NOT NULL,
    "keyword" TEXT NOT NULL,
    "normalizedKeyword" TEXT NOT NULL,
    "strategy" "SearchStrategy" NOT NULL DEFAULT 'KEYWORD_SEARCH',
    "status" "SearchTermStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SearchTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionRun" (
    "id" TEXT NOT NULL,
    "externalRunKey" TEXT NOT NULL,
    "searchTermId" TEXT NOT NULL,
    "marketplace" "Marketplace" NOT NULL,
    "source" "CollectionSource" NOT NULL,
    "status" "CollectionRunStatus" NOT NULL,
    "scoreVersion" TEXT,
    "viabilityRuleVersion" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "summary" JSONB,
    "rawReport" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CollectionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "marketplace" "Marketplace" NOT NULL,
    "externalId" TEXT NOT NULL,
    "catalogProductId" TEXT,
    "userProductId" TEXT,
    "domainId" TEXT,
    "url" TEXT,
    "listingUrl" TEXT,
    "title" TEXT NOT NULL,
    "imageUrl" TEXT,
    "sellerName" TEXT,
    "brand" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingSnapshot" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "collectionRunId" TEXT NOT NULL,
    "searchPosition" INTEGER,
    "minimumPrice" DECIMAL(12,2),
    "price" DECIMAL(12,2),
    "maximumPrice" DECIMAL(12,2),
    "currencyId" TEXT,
    "offerCount" INTEGER,
    "uniqueSellerCount" INTEGER,
    "ratingAverage" DECIMAL(3,2),
    "reviewCount" INTEGER,
    "opportunityScore" INTEGER,
    "priorityLabel" TEXT,
    "viabilityStatus" TEXT,
    "flags" JSONB,
    "reasons" JSONB,
    "rawData" JSONB NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ListingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityScore" (
    "id" TEXT NOT NULL,
    "listingSnapshotId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "totalScore" INTEGER NOT NULL,
    "demandScore" INTEGER NOT NULL,
    "competitionScore" INTEGER NOT NULL,
    "priceScore" INTEGER NOT NULL,
    "sellerScore" INTEGER NOT NULL DEFAULT 0,
    "riskScore" INTEGER NOT NULL,
    "components" JSONB NOT NULL,
    "reasons" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OpportunityScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HumanDecision" (
    "id" TEXT NOT NULL,
    "externalDecisionKey" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "collectionRunId" TEXT,
    "status" "HumanDecisionStatus" NOT NULL,
    "notes" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'user_text',
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HumanDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SearchTerm_marketplace_normalizedKeyword_strategy_key" ON "SearchTerm"("marketplace", "normalizedKeyword", "strategy");
CREATE INDEX "SearchTerm_status_updatedAt_idx" ON "SearchTerm"("status", "updatedAt");
CREATE UNIQUE INDEX "CollectionRun_externalRunKey_key" ON "CollectionRun"("externalRunKey");
CREATE INDEX "CollectionRun_searchTermId_startedAt_idx" ON "CollectionRun"("searchTermId", "startedAt");
CREATE INDEX "CollectionRun_status_startedAt_idx" ON "CollectionRun"("status", "startedAt");
CREATE UNIQUE INDEX "Listing_marketplace_externalId_key" ON "Listing"("marketplace", "externalId");
CREATE INDEX "Listing_title_idx" ON "Listing"("title");
CREATE INDEX "Listing_domainId_idx" ON "Listing"("domainId");
CREATE UNIQUE INDEX "ListingSnapshot_listingId_collectionRunId_key" ON "ListingSnapshot"("listingId", "collectionRunId");
CREATE INDEX "ListingSnapshot_collectionRunId_opportunityScore_idx" ON "ListingSnapshot"("collectionRunId", "opportunityScore");
CREATE INDEX "ListingSnapshot_listingId_collectedAt_idx" ON "ListingSnapshot"("listingId", "collectedAt");
CREATE UNIQUE INDEX "OpportunityScore_listingSnapshotId_key" ON "OpportunityScore"("listingSnapshotId");
CREATE UNIQUE INDEX "HumanDecision_externalDecisionKey_key" ON "HumanDecision"("externalDecisionKey");
CREATE INDEX "HumanDecision_listingId_decidedAt_idx" ON "HumanDecision"("listingId", "decidedAt");
CREATE INDEX "HumanDecision_status_decidedAt_idx" ON "HumanDecision"("status", "decidedAt");

-- AddForeignKey
ALTER TABLE "CollectionRun" ADD CONSTRAINT "CollectionRun_searchTermId_fkey" FOREIGN KEY ("searchTermId") REFERENCES "SearchTerm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ListingSnapshot" ADD CONSTRAINT "ListingSnapshot_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ListingSnapshot" ADD CONSTRAINT "ListingSnapshot_collectionRunId_fkey" FOREIGN KEY ("collectionRunId") REFERENCES "CollectionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OpportunityScore" ADD CONSTRAINT "OpportunityScore_listingSnapshotId_fkey" FOREIGN KEY ("listingSnapshotId") REFERENCES "ListingSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HumanDecision" ADD CONSTRAINT "HumanDecision_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HumanDecision" ADD CONSTRAINT "HumanDecision_collectionRunId_fkey" FOREIGN KEY ("collectionRunId") REFERENCES "CollectionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
