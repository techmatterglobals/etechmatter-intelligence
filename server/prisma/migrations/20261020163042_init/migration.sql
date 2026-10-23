-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'SALES',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'Unknown',
    "website" TEXT,
    "industry" TEXT,
    "employeeCount" INTEGER,
    "city" TEXT,
    "state" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineStage" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "PipelineStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceConfidence" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "discoveredAt" TIMESTAMP(3) NOT NULL,
    "lastCheckedAt" TIMESTAMP(3) NOT NULL,
    "deadline" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordUpdatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT,
    "organizationName" TEXT,
    "organizationWebsite" TEXT,
    "organizationType" TEXT NOT NULL DEFAULT 'Unknown',
    "industry" TEXT,
    "employeeCount" INTEGER,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "country" TEXT,
    "buyerName" TEXT,
    "buyerTitle" TEXT,
    "buyerEmail" TEXT,
    "buyerPhone" TEXT,
    "buyerLinkedin" TEXT,
    "requirementSummary" TEXT NOT NULL,
    "hardwareCategory" TEXT,
    "categories" TEXT[],
    "productsRequested" TEXT[],
    "brandsRequested" TEXT[],
    "modelsRequested" TEXT[],
    "partNumbers" TEXT[],
    "quantity" INTEGER,
    "budget" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "procurementType" TEXT NOT NULL,
    "documentKind" TEXT NOT NULL,
    "intentLevel" TEXT NOT NULL,
    "intentScore" INTEGER NOT NULL,
    "urgencyScore" INTEGER NOT NULL,
    "urgencyLabel" TEXT NOT NULL,
    "matchScore" INTEGER NOT NULL,
    "matchLevel" TEXT NOT NULL,
    "overallOpportunityScore" INTEGER NOT NULL,
    "estimatedOpportunityValue" DOUBLE PRECISION,
    "estimatedValueBasis" TEXT,
    "aiSummary" TEXT NOT NULL,
    "aiReasoning" TEXT[],
    "aiProvider" TEXT NOT NULL,
    "whyItMatters" TEXT[],
    "nextAction" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "contactsJson" JSONB NOT NULL,
    "requirementDetails" JSONB NOT NULL,
    "fieldProvenance" JSONB NOT NULL,
    "scoreReasonsJson" JSONB NOT NULL,
    "productMatchesJson" JSONB NOT NULL,
    "duplicateCandidates" JSONB NOT NULL,
    "hasDuplicates" BOOLEAN NOT NULL DEFAULT false,
    "mergedIntoId" TEXT,
    "mergedSources" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "owner" TEXT,
    "saved" BOOLEAN NOT NULL DEFAULT false,
    "lastContactedAt" TIMESTAMP(3),
    "nextFollowUp" TIMESTAMP(3),
    "quoteValue" DOUBLE PRECISION,
    "expectedCloseDate" TIMESTAMP(3),

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "partNumber" TEXT,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "specifications" TEXT,
    "price" DOUBLE PRECISION,
    "availability" TEXT,
    "moq" INTEGER,
    "warranty" TEXT,
    "url" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityProduct" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "requestedItem" TEXT NOT NULL,
    "reason" TEXT NOT NULL,

    CONSTRAINT "OpportunityProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "title" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "linkedin" TEXT,
    "provenance" TEXT NOT NULL DEFAULT 'SOURCE_VERIFIED',
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityContact" (
    "opportunityId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "role" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "OpportunityContact_pkey" PRIMARY KEY ("opportunityId","contactId")
);

-- CreateTable
CREATE TABLE "OpportunityEvidence" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceName" TEXT NOT NULL,
    "snippet" TEXT NOT NULL,
    "field" TEXT,
    "publishedAt" TIMESTAMP(3),
    "retrievedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpportunityEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityScore" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "points" INTEGER NOT NULL,

    CONSTRAINT "OpportunityScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIAnalysis" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "documentKind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "reasoning" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesActivity" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "intervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "config" JSONB NOT NULL DEFAULT '{}',
    "lastRunAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastRunNew" INTEGER,
    "lastStatus" TEXT,
    "lastMessage" TEXT,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "SourceRun" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "fetched" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "irrelevant" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT NOT NULL DEFAULT '',
    "trigger" TEXT NOT NULL,

    CONSTRAINT "SourceRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categories" TEXT[],
    "states" TEXT[],
    "intentLevels" TEXT[],
    "minQuantity" INTEGER,
    "minMatchScore" INTEGER,
    "keywords" TEXT[],
    "channels" TEXT[],
    "email" TEXT,
    "webhookUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastTriggeredAt" TIMESTAMP(3),
    "triggerCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertEvent" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "ruleName" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "opportunityTitle" TEXT NOT NULL,
    "intentLevel" TEXT NOT NULL,
    "intentScore" INTEGER NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "deliveries" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricalAward" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "awardId" TEXT NOT NULL,
    "recipientName" TEXT,
    "awardingAgency" TEXT,
    "awardingSubAgency" TEXT,
    "amount" DOUBLE PRECISION,
    "description" TEXT,
    "naicsCode" TEXT,
    "state" TEXT,
    "actionDate" TEXT,
    "sourceUrl" TEXT,
    "retrievedAt" TIMESTAMP(3) NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "HistoricalAward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_key_key" ON "Organization"("key");

-- CreateIndex
CREATE INDEX "Organization_state_idx" ON "Organization"("state");

-- CreateIndex
CREATE INDEX "Organization_type_idx" ON "Organization"("type");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineStage_key_key" ON "PipelineStage"("key");

-- CreateIndex
CREATE INDEX "Opportunity_intentLevel_overallOpportunityScore_idx" ON "Opportunity"("intentLevel", "overallOpportunityScore");

-- CreateIndex
CREATE INDEX "Opportunity_discoveredAt_idx" ON "Opportunity"("discoveredAt");

-- CreateIndex
CREATE INDEX "Opportunity_publishedAt_idx" ON "Opportunity"("publishedAt");

-- CreateIndex
CREATE INDEX "Opportunity_deadline_idx" ON "Opportunity"("deadline");

-- CreateIndex
CREATE INDEX "Opportunity_state_idx" ON "Opportunity"("state");

-- CreateIndex
CREATE INDEX "Opportunity_sourceType_idx" ON "Opportunity"("sourceType");

-- CreateIndex
CREATE INDEX "Opportunity_status_idx" ON "Opportunity"("status");

-- CreateIndex
CREATE INDEX "Opportunity_matchLevel_idx" ON "Opportunity"("matchLevel");

-- CreateIndex
CREATE INDEX "Opportunity_organizationType_idx" ON "Opportunity"("organizationType");

-- CreateIndex
CREATE INDEX "Opportunity_quantity_idx" ON "Opportunity"("quantity");

-- CreateIndex
CREATE INDEX "Opportunity_isDemo_idx" ON "Opportunity"("isDemo");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_sourceKey_sourceId_key" ON "Opportunity"("sourceKey", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategory_name_key" ON "ProductCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category");

-- CreateIndex
CREATE INDEX "Product_manufacturer_idx" ON "Product"("manufacturer");

-- CreateIndex
CREATE INDEX "Product_partNumber_idx" ON "Product"("partNumber");

-- CreateIndex
CREATE INDEX "OpportunityProduct_opportunityId_idx" ON "OpportunityProduct"("opportunityId");

-- CreateIndex
CREATE INDEX "OpportunityProduct_productId_idx" ON "OpportunityProduct"("productId");

-- CreateIndex
CREATE INDEX "Contact_email_idx" ON "Contact"("email");

-- CreateIndex
CREATE INDEX "OpportunityEvidence_opportunityId_idx" ON "OpportunityEvidence"("opportunityId");

-- CreateIndex
CREATE INDEX "OpportunityScore_opportunityId_idx" ON "OpportunityScore"("opportunityId");

-- CreateIndex
CREATE INDEX "AIAnalysis_opportunityId_idx" ON "AIAnalysis"("opportunityId");

-- CreateIndex
CREATE INDEX "Note_opportunityId_idx" ON "Note"("opportunityId");

-- CreateIndex
CREATE INDEX "SalesActivity_opportunityId_createdAt_idx" ON "SalesActivity"("opportunityId", "createdAt");

-- CreateIndex
CREATE INDEX "SourceRun_sourceKey_startedAt_idx" ON "SourceRun"("sourceKey", "startedAt");

-- CreateIndex
CREATE INDEX "SourceRun_startedAt_idx" ON "SourceRun"("startedAt");

-- CreateIndex
CREATE INDEX "AlertEvent_createdAt_idx" ON "AlertEvent"("createdAt");

-- CreateIndex
CREATE INDEX "HistoricalAward_awardingAgency_idx" ON "HistoricalAward"("awardingAgency");

-- CreateIndex
CREATE INDEX "HistoricalAward_state_idx" ON "HistoricalAward"("state");

-- CreateIndex
CREATE UNIQUE INDEX "HistoricalAward_sourceKey_awardId_key" ON "HistoricalAward"("sourceKey", "awardId");

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityProduct" ADD CONSTRAINT "OpportunityProduct_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityProduct" ADD CONSTRAINT "OpportunityProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityContact" ADD CONSTRAINT "OpportunityContact_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityContact" ADD CONSTRAINT "OpportunityContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityEvidence" ADD CONSTRAINT "OpportunityEvidence_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityScore" ADD CONSTRAINT "OpportunityScore_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIAnalysis" ADD CONSTRAINT "AIAnalysis_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesActivity" ADD CONSTRAINT "SalesActivity_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceRun" ADD CONSTRAINT "SourceRun_sourceKey_fkey" FOREIGN KEY ("sourceKey") REFERENCES "Source"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;
