-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "paypalEmail" TEXT,
    "isDemoAccount" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "totalBudgetMinor" INTEGER NOT NULL,
    "legacyTotalBudget" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "deadline" TIMESTAMP(3),
    "clientId" TEXT NOT NULL,
    "freelancerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "legacyAmount" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "deadline" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "acceptanceCriteria" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliverableSubmission" (
    "id" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "deliverableUrl" TEXT NOT NULL,
    "notes" TEXT,
    "uploadedEvidenceText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliverableSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIReview" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "overallStatus" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL DEFAULT 0,
    "legacyConfidenceScore" DOUBLE PRECISION,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRecord" (
    "id" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "authorizationId" TEXT,
    "captureId" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "legacyAmount" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "expiresAt" TIMESTAMP(3),
    "rawProviderMetadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Project_clientId_idx" ON "Project"("clientId");

-- CreateIndex
CREATE INDEX "Project_freelancerId_idx" ON "Project"("freelancerId");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "Milestone_projectId_status_idx" ON "Milestone"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Milestone_projectId_orderIndex_key" ON "Milestone"("projectId", "orderIndex");

-- CreateIndex
CREATE INDEX "DeliverableSubmission_authorId_idx" ON "DeliverableSubmission"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliverableSubmission_milestoneId_revision_key" ON "DeliverableSubmission"("milestoneId", "revision");

-- CreateIndex
CREATE INDEX "AIReview_submissionId_createdAt_idx" ON "AIReview"("submissionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AIReview_submissionId_sequence_key" ON "AIReview"("submissionId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRecord_orderId_key" ON "PaymentRecord"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRecord_authorizationId_key" ON "PaymentRecord"("authorizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRecord_captureId_key" ON "PaymentRecord"("captureId");

-- CreateIndex
CREATE INDEX "PaymentRecord_milestoneId_createdAt_idx" ON "PaymentRecord"("milestoneId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentRecord_status_idx" ON "PaymentRecord"("status");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_freelancerId_fkey" FOREIGN KEY ("freelancerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliverableSubmission" ADD CONSTRAINT "DeliverableSubmission_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliverableSubmission" ADD CONSTRAINT "DeliverableSubmission_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIReview" ADD CONSTRAINT "AIReview_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "DeliverableSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Custom integrity constraints preserved from the SQLite Phase 1 migration

ALTER TABLE "User"
ADD CONSTRAINT "User_role_check"
CHECK ("role" IN ('CLIENT', 'FREELANCER'));

ALTER TABLE "Project"
ADD CONSTRAINT "Project_currency_check"
CHECK ("currency" IN ('USD','EUR','GBP','CAD','AUD','SGD','INR','JPY'));

ALTER TABLE "Project"
ADD CONSTRAINT "Project_status_check"
CHECK ("status" IN ('DRAFT','ACTIVE','COMPLETED','CANCELLED'));

ALTER TABLE "Project"
ADD CONSTRAINT "Project_totalBudgetMinor_check"
CHECK ("totalBudgetMinor" > 0);

ALTER TABLE "Project"
ADD CONSTRAINT "Project_legacy_exact_check"
CHECK (
  "legacyTotalBudget" IS NULL OR
  ABS("legacyTotalBudget" *
    (CASE "currency" WHEN 'JPY' THEN 1 ELSE 100 END)
    - "totalBudgetMinor") < 0.001
);

ALTER TABLE "Milestone"
ADD CONSTRAINT "Milestone_currency_check"
CHECK ("currency" IN ('USD','EUR','GBP','CAD','AUD','SGD','INR','JPY'));

ALTER TABLE "Milestone"
ADD CONSTRAINT "Milestone_status_check"
CHECK ("status" IN (
  'DRAFT','AWAITING_PAYMENT_AUTH','IN_PROGRESS','SUBMITTED',
  'AI_REVIEWED','PAYMENT_APPROVED','COMPLETED','REVISION_REQUESTED'
));

ALTER TABLE "Milestone"
ADD CONSTRAINT "Milestone_amountMinor_check"
CHECK ("amountMinor" > 0);

ALTER TABLE "Milestone"
ADD CONSTRAINT "Milestone_orderIndex_check"
CHECK ("orderIndex" >= 1);

ALTER TABLE "Milestone"
ADD CONSTRAINT "Milestone_legacy_exact_check"
CHECK (
  "legacyAmount" IS NULL OR
  ABS("legacyAmount" *
    (CASE "currency" WHEN 'JPY' THEN 1 ELSE 100 END)
    - "amountMinor") < 0.001
);

ALTER TABLE "DeliverableSubmission"
ADD CONSTRAINT "DeliverableSubmission_revision_check"
CHECK ("revision" >= 1);

ALTER TABLE "AIReview"
ADD CONSTRAINT "AIReview_sequence_check"
CHECK ("sequence" >= 1);

ALTER TABLE "AIReview"
ADD CONSTRAINT "AIReview_overallStatus_check"
CHECK ("overallStatus" IN ('COMPLIANT','PARTIAL','NON_COMPLIANT'));

ALTER TABLE "AIReview"
ADD CONSTRAINT "AIReview_overallScore_check"
CHECK ("overallScore" BETWEEN 0 AND 100);

ALTER TABLE "AIReview"
ADD CONSTRAINT "AIReview_recommendation_check"
CHECK ("recommendation" IN (
  'APPROVE_RECOMMENDED','REQUEST_REVISION','MANUAL_REVIEW'
));

ALTER TABLE "PaymentRecord"
ADD CONSTRAINT "PaymentRecord_provider_check"
CHECK ("provider" IN ('LOCAL_DEV','PAYPAL'));

ALTER TABLE "PaymentRecord"
ADD CONSTRAINT "PaymentRecord_status_check"
CHECK ("status" IN (
  'CREATED','AUTHORIZED','CAPTURED','VOIDED','EXPIRED','DENIED','FAILED'
));

ALTER TABLE "PaymentRecord"
ADD CONSTRAINT "PaymentRecord_currency_check"
CHECK ("currency" IN ('USD','EUR','GBP','CAD','AUD','SGD','INR','JPY'));

ALTER TABLE "PaymentRecord"
ADD CONSTRAINT "PaymentRecord_amountMinor_check"
CHECK ("amountMinor" > 0);

ALTER TABLE "PaymentRecord"
ADD CONSTRAINT "PaymentRecord_local_dev_check"
CHECK (
  ("provider" = 'LOCAL_DEV') = ("orderId" LIKE 'LOCAL-DEV-%')
);

ALTER TABLE "PaymentRecord"
ADD CONSTRAINT "PaymentRecord_legacy_exact_check"
CHECK (
  "legacyAmount" IS NULL OR
  ABS("legacyAmount" *
    (CASE "currency" WHEN 'JPY' THEN 1 ELSE 100 END)
    - "amountMinor") < 0.001
);
