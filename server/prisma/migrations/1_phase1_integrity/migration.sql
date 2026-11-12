-- Phase 1: financial precision + database integrity.
--
-- ⚠️ BACK UP YOUR DATABASE FILE BEFORE RUNNING (copy prisma/dev.db somewhere safe).
--
-- What this does (nothing is deleted from your business data):
--   * Money columns become INTEGER MINOR UNITS (totalBudgetMinor / amountMinor).
--     The old floating-point values are KEPT in legacy* columns for audit/rollback.
--   * Legacy "PayPal" demo payment rows (DEMO-PP-* / TEST-PP-*) are relabelled LOCAL_DEV / LOCAL-DEV-*.
--   * Submissions get a per-milestone `revision`, AI reviews a per-submission `sequence` (unique).
--   * AI recommendations are upper-cased (APPROVE_RECOMMENDED ...). The old misleading
--     confidenceScore is kept as legacyConfidenceScore; the model's own claims are kept as modelOverall*.
--   * CHECK constraints enforce roles, statuses, providers, currencies and positive amounts.
--   * Unique payment identifiers; indexes; Restrict (not Cascade) deletes for financial/audit history.
--
-- Safety: ALL new tables are built and filled first; the original tables are only dropped after every
-- copy succeeded. If any copy fails (e.g. an amount with sub-cent precision, an unsupported currency,
-- duplicate milestone order), the original tables are untouched. Fix the data and re-run.

PRAGMA foreign_keys=OFF;

DROP TABLE IF EXISTS "new_User";
DROP TABLE IF EXISTS "new_Project";
DROP TABLE IF EXISTS "new_Milestone";
DROP TABLE IF EXISTS "new_DeliverableSubmission";
DROP TABLE IF EXISTS "new_AIReview";
DROP TABLE IF EXISTS "new_PaymentRecord";

-- ===== Phase A: build and fill the new tables =====

CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "paypalEmail" TEXT,
    "isDemoAccount" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_role_check" CHECK ("role" IN ('CLIENT', 'FREELANCER'))
);
INSERT INTO "new_User" ("id","email","name","role","title","avatarUrl","paypalEmail","isDemoAccount","createdAt","updatedAt")
SELECT "id","email","name","role","title","avatarUrl","paypalEmail","isDemoAccount","createdAt","updatedAt" FROM "User";

CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "totalBudgetMinor" INTEGER NOT NULL,
    "legacyTotalBudget" REAL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "deadline" DATETIME,
    "clientId" TEXT NOT NULL,
    "freelancerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Project_freelancerId_fkey" FOREIGN KEY ("freelancerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Project_currency_check" CHECK ("currency" IN ('USD','EUR','GBP','CAD','AUD','SGD','INR','JPY')),
    CONSTRAINT "Project_status_check" CHECK ("status" IN ('DRAFT','ACTIVE','COMPLETED','CANCELLED')),
    CONSTRAINT "Project_totalBudgetMinor_check" CHECK ("totalBudgetMinor" > 0),
    -- guards the float->integer conversion: refuses amounts that are not exact to the currency's minor unit
    CONSTRAINT "Project_legacy_exact_check" CHECK ("legacyTotalBudget" IS NULL OR ABS("legacyTotalBudget" * (CASE "currency" WHEN 'JPY' THEN 1 ELSE 100 END) - "totalBudgetMinor") < 0.001)
);
INSERT INTO "new_Project" ("id","title","description","totalBudgetMinor","legacyTotalBudget","currency","status","deadline","clientId","freelancerId","createdAt","updatedAt")
SELECT "id","title","description",
       CASE WHEN UPPER(TRIM("currency")) = 'JPY' THEN CAST(ROUND("totalBudget") AS INTEGER) ELSE CAST(ROUND("totalBudget" * 100) AS INTEGER) END,
       "totalBudget", UPPER(TRIM("currency")), "status", NULL, "clientId", "freelancerId", "createdAt", "updatedAt"
FROM "Project";
CREATE INDEX "Project_clientId_idx" ON "new_Project"("clientId");
CREATE INDEX "Project_freelancerId_idx" ON "new_Project"("freelancerId");
CREATE INDEX "Project_status_idx" ON "new_Project"("status");

CREATE TABLE "new_Milestone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "legacyAmount" REAL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "deadline" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "acceptanceCriteria" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Milestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Milestone_currency_check" CHECK ("currency" IN ('USD','EUR','GBP','CAD','AUD','SGD','INR','JPY')),
    CONSTRAINT "Milestone_status_check" CHECK ("status" IN ('DRAFT','AWAITING_PAYMENT_AUTH','IN_PROGRESS','SUBMITTED','AI_REVIEWED','PAYMENT_APPROVED','COMPLETED','REVISION_REQUESTED')),
    CONSTRAINT "Milestone_amountMinor_check" CHECK ("amountMinor" > 0),
    CONSTRAINT "Milestone_orderIndex_check" CHECK ("orderIndex" >= 1),
    CONSTRAINT "Milestone_legacy_exact_check" CHECK ("legacyAmount" IS NULL OR ABS("legacyAmount" * (CASE "currency" WHEN 'JPY' THEN 1 ELSE 100 END) - "amountMinor") < 0.001)
);
INSERT INTO "new_Milestone" ("id","projectId","orderIndex","title","description","amountMinor","legacyAmount","currency","deadline","status","acceptanceCriteria","createdAt","updatedAt")
SELECT "id","projectId","orderIndex","title","description",
       CASE WHEN UPPER(TRIM("currency")) = 'JPY' THEN CAST(ROUND("amount") AS INTEGER) ELSE CAST(ROUND("amount" * 100) AS INTEGER) END,
       "amount", UPPER(TRIM("currency")), "deadline", "status", "acceptanceCriteria", "createdAt", "updatedAt"
FROM "Milestone";
CREATE UNIQUE INDEX "Milestone_projectId_orderIndex_key" ON "new_Milestone"("projectId", "orderIndex");
CREATE INDEX "Milestone_projectId_status_idx" ON "new_Milestone"("projectId", "status");

CREATE TABLE "new_DeliverableSubmission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "milestoneId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "deliverableUrl" TEXT NOT NULL,
    "notes" TEXT,
    "uploadedEvidenceText" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DeliverableSubmission_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DeliverableSubmission_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DeliverableSubmission_revision_check" CHECK ("revision" >= 1)
);
INSERT INTO "new_DeliverableSubmission" ("id","milestoneId","authorId","revision","summary","deliverableUrl","notes","uploadedEvidenceText","createdAt","updatedAt")
SELECT "id","milestoneId","authorId",
       ROW_NUMBER() OVER (PARTITION BY "milestoneId" ORDER BY "createdAt", "id"),
       "summary","deliverableUrl","notes","uploadedEvidenceText","createdAt","updatedAt"
FROM "DeliverableSubmission";
CREATE UNIQUE INDEX "DeliverableSubmission_milestoneId_revision_key" ON "new_DeliverableSubmission"("milestoneId", "revision");
CREATE INDEX "DeliverableSubmission_authorId_idx" ON "new_DeliverableSubmission"("authorId");

CREATE TABLE "new_AIReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "submissionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "overallStatus" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL DEFAULT 0,
    "legacyConfidenceScore" REAL,
    "evidenceCoveragePercent" INTEGER NOT NULL DEFAULT 0,
    "scoringPolicyVersion" TEXT NOT NULL DEFAULT 'legacy',
    "recommendationReasons" TEXT NOT NULL DEFAULT '[]',
    "modelOverallScore" INTEGER,
    "modelRecommendation" TEXT,
    "summary" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL DEFAULT 'MANUAL_REVIEW',
    "criteriaResults" TEXT NOT NULL DEFAULT '[]',
    "criteriaAnalysis" TEXT NOT NULL,
    "strengths" TEXT NOT NULL,
    "gapsIdentified" TEXT NOT NULL,
    "missingEvidence" TEXT NOT NULL,
    "risks" TEXT NOT NULL DEFAULT '[]',
    "evidenceLimitations" TEXT NOT NULL,
    "clientRecommendation" TEXT NOT NULL,
    "freelancerActionItems" TEXT NOT NULL,
    "advisoryNotice" TEXT NOT NULL,
    "modelId" TEXT NOT NULL DEFAULT 'unknown',
    "rawResponse" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIReview_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "DeliverableSubmission" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AIReview_sequence_check" CHECK ("sequence" >= 1),
    CONSTRAINT "AIReview_overallStatus_check" CHECK ("overallStatus" IN ('COMPLIANT','PARTIAL','NON_COMPLIANT')),
    CONSTRAINT "AIReview_overallScore_check" CHECK ("overallScore" BETWEEN 0 AND 100),
    CONSTRAINT "AIReview_recommendation_check" CHECK ("recommendation" IN ('APPROVE_RECOMMENDED','REQUEST_REVISION','MANUAL_REVIEW'))
);
INSERT INTO "new_AIReview" ("id","submissionId","sequence","overallStatus","overallScore","legacyConfidenceScore","evidenceCoveragePercent","scoringPolicyVersion","recommendationReasons","modelOverallScore","modelRecommendation","summary","recommendation","criteriaResults","criteriaAnalysis","strengths","gapsIdentified","missingEvidence","risks","evidenceLimitations","clientRecommendation","freelancerActionItems","advisoryNotice","modelId","rawResponse","createdAt")
SELECT "id","submissionId",
       ROW_NUMBER() OVER (PARTITION BY "submissionId" ORDER BY "createdAt", "id"),
       "overallStatus", MIN(100, MAX(0, "overallScore")), "confidenceScore", 0, 'legacy',
       '["Legacy review: recommendation was produced by the model before server-side scoring existed."]',
       "overallScore", "recommendation", "summary",
       CASE LOWER("recommendation") WHEN 'approve_recommended' THEN 'APPROVE_RECOMMENDED' WHEN 'request_revision' THEN 'REQUEST_REVISION' ELSE 'MANUAL_REVIEW' END,
       "criteriaResults","criteriaAnalysis","strengths","gapsIdentified","missingEvidence","risks","evidenceLimitations","clientRecommendation","freelancerActionItems","advisoryNotice","modelId","rawResponse","createdAt"
FROM "AIReview";
CREATE UNIQUE INDEX "AIReview_submissionId_sequence_key" ON "new_AIReview"("submissionId", "sequence");
CREATE INDEX "AIReview_submissionId_createdAt_idx" ON "new_AIReview"("submissionId", "createdAt");

CREATE TABLE "new_PaymentRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "milestoneId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "authorizationId" TEXT,
    "captureId" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "legacyAmount" REAL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "expiresAt" DATETIME,
    "rawProviderMetadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PaymentRecord_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PaymentRecord_provider_check" CHECK ("provider" IN ('LOCAL_DEV','PAYPAL')),
    CONSTRAINT "PaymentRecord_status_check" CHECK ("status" IN ('CREATED','AUTHORIZED','CAPTURED','VOIDED','EXPIRED','DENIED','FAILED')),
    CONSTRAINT "PaymentRecord_currency_check" CHECK ("currency" IN ('USD','EUR','GBP','CAD','AUD','SGD','INR','JPY')),
    CONSTRAINT "PaymentRecord_amountMinor_check" CHECK ("amountMinor" > 0),
    -- Simulated records must be unmistakable: LOCAL-DEV-* ids <=> provider LOCAL_DEV
    CONSTRAINT "PaymentRecord_local_dev_check" CHECK (("provider" = 'LOCAL_DEV') = ("orderId" LIKE 'LOCAL-DEV-%')),
    CONSTRAINT "PaymentRecord_legacy_exact_check" CHECK ("legacyAmount" IS NULL OR ABS("legacyAmount" * (CASE "currency" WHEN 'JPY' THEN 1 ELSE 100 END) - "amountMinor") < 0.001)
);
INSERT INTO "new_PaymentRecord" ("id","milestoneId","provider","orderId","authorizationId","captureId","amountMinor","legacyAmount","currency","status","expiresAt","rawProviderMetadata","createdAt","updatedAt")
SELECT "id","milestoneId",
       CASE WHEN "orderId" LIKE 'DEMO-PP-%' OR "orderId" LIKE 'TEST-PP-%' OR "provider" = 'LOCAL_DEV' THEN 'LOCAL_DEV' ELSE "provider" END,
       CASE WHEN "orderId" LIKE 'DEMO-PP-%' OR "orderId" LIKE 'TEST-PP-%' THEN 'LOCAL-DEV-' || SUBSTR("orderId", 9)
            WHEN "provider" = 'LOCAL_DEV' AND "orderId" NOT LIKE 'LOCAL-DEV-%' THEN 'LOCAL-DEV-' || "orderId"
            ELSE "orderId" END,
       CASE WHEN "authorizationId" LIKE 'DEMO-PP-%' OR "authorizationId" LIKE 'TEST-PP-%' THEN 'LOCAL-DEV-' || SUBSTR("authorizationId", 9)
            WHEN "provider" = 'LOCAL_DEV' AND "authorizationId" IS NOT NULL AND "authorizationId" NOT LIKE 'LOCAL-DEV-%' THEN 'LOCAL-DEV-' || "authorizationId"
            ELSE "authorizationId" END,
       CASE WHEN "captureId" LIKE 'DEMO-PP-%' OR "captureId" LIKE 'TEST-PP-%' THEN 'LOCAL-DEV-' || SUBSTR("captureId", 9)
            WHEN "provider" = 'LOCAL_DEV' AND "captureId" IS NOT NULL AND "captureId" NOT LIKE 'LOCAL-DEV-%' THEN 'LOCAL-DEV-' || "captureId"
            ELSE "captureId" END,
       CASE WHEN UPPER(TRIM("currency")) = 'JPY' THEN CAST(ROUND("amount") AS INTEGER) ELSE CAST(ROUND("amount" * 100) AS INTEGER) END,
       "amount", UPPER(TRIM("currency")), "status", "expiresAt", "rawProviderMetadata", "createdAt", "updatedAt"
FROM "PaymentRecord";
CREATE UNIQUE INDEX "PaymentRecord_orderId_key" ON "new_PaymentRecord"("orderId");
CREATE UNIQUE INDEX "PaymentRecord_authorizationId_key" ON "new_PaymentRecord"("authorizationId");
CREATE UNIQUE INDEX "PaymentRecord_captureId_key" ON "new_PaymentRecord"("captureId");
CREATE INDEX "PaymentRecord_milestoneId_createdAt_idx" ON "new_PaymentRecord"("milestoneId", "createdAt");
CREATE INDEX "PaymentRecord_status_idx" ON "new_PaymentRecord"("status");

-- ===== Phase B: swap (only reached when every copy above succeeded) =====
DROP TABLE "PaymentRecord";
DROP TABLE "AIReview";
DROP TABLE "DeliverableSubmission";
DROP TABLE "Milestone";
DROP TABLE "Project";
DROP TABLE "User";

ALTER TABLE "new_User" RENAME TO "User";
ALTER TABLE "new_Project" RENAME TO "Project";
ALTER TABLE "new_Milestone" RENAME TO "Milestone";
ALTER TABLE "new_DeliverableSubmission" RENAME TO "DeliverableSubmission";
ALTER TABLE "new_AIReview" RENAME TO "AIReview";
ALTER TABLE "new_PaymentRecord" RENAME TO "PaymentRecord";

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
