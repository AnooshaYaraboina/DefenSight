-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "department" TEXT NOT NULL,
    "clearance" TEXT NOT NULL DEFAULT 'INTERNAL',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "password" TEXT NOT NULL,
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LlmModel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "contextWindow" INTEGER NOT NULL DEFAULT 128000,
    "sensitivityTier" INTEGER NOT NULL DEFAULT 1
);

-- CreateTable
CREATE TABLE "AiApplication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'production',
    "owner" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "modelId" TEXT NOT NULL,
    "securityScore" INTEGER NOT NULL DEFAULT 100,
    "systemPrompt" TEXT NOT NULL DEFAULT '',
    "lastActivityAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiApplication_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "LlmModel" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "applicationId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL DEFAULT '',
    "riskLevel" TEXT NOT NULL DEFAULT 'LOW',
    "securityScore" INTEGER NOT NULL DEFAULT 100,
    "maxToolCallsPerRequest" INTEGER NOT NULL DEFAULT 5,
    "maxTokensPerRequest" INTEGER NOT NULL DEFAULT 8000,
    "dataClearance" TEXT NOT NULL DEFAULT 'INTERNAL',
    "lastActivityAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Agent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "AiApplication" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Agent_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "LlmModel" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentPermission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "actions" JSONB NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT true,
    "justification" TEXT NOT NULL DEFAULT '',
    "useCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "AgentPermission_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DataSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "owner" TEXT NOT NULL,
    "trustLevel" INTEGER NOT NULL DEFAULT 50,
    "isExternal" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT NOT NULL DEFAULT '',
    "lastSyncAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "VectorStore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "indexName" TEXT NOT NULL,
    "dimensions" INTEGER NOT NULL DEFAULT 1536,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "VectorStoreOnApp" (
    "applicationId" TEXT NOT NULL,
    "vectorStoreId" TEXT NOT NULL,

    PRIMARY KEY ("applicationId", "vectorStoreId"),
    CONSTRAINT "VectorStoreOnApp_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "AiApplication" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VectorStoreOnApp_vectorStoreId_fkey" FOREIGN KEY ("vectorStoreId") REFERENCES "VectorStore" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "vectorStoreId" TEXT,
    "owner" TEXT NOT NULL,
    "classification" TEXT NOT NULL DEFAULT 'INTERNAL',
    "trustScore" INTEGER NOT NULL DEFAULT 50,
    "riskLevel" TEXT NOT NULL DEFAULT 'LOW',
    "scanStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "scanResult" JSONB,
    "scannedAt" DATETIME,
    "quarantined" BOOLEAN NOT NULL DEFAULT false,
    "quarantineReason" TEXT,
    "quarantinedAt" DATETIME,
    "contentHash" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "chunkCount" INTEGER NOT NULL DEFAULT 1,
    "mimeType" TEXT NOT NULL DEFAULT 'text/plain',
    "uploadedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Document_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Document_vectorStoreId_fkey" FOREIGN KEY ("vectorStoreId") REFERENCES "VectorStore" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DocumentFinding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "detectorId" TEXT NOT NULL,
    "threatType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "snippet" TEXT NOT NULL,
    "offsetStart" INTEGER NOT NULL,
    "offsetEnd" INTEGER NOT NULL,
    "explanation" TEXT NOT NULL,
    "evidence" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentFinding_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RetrievalEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "similarity" REAL NOT NULL,
    "chunkIndex" INTEGER NOT NULL DEFAULT 0,
    "allowed" BOOLEAN NOT NULL DEFAULT true,
    "withheldReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RetrievalEvent_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "SecurityEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RetrievalEvent_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tool" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "operations" JSONB NOT NULL,
    "riskTier" INTEGER NOT NULL DEFAULT 1,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "approvalThreshold" INTEGER NOT NULL DEFAULT 70,
    "rateLimitPerMinute" INTEGER NOT NULL DEFAULT 60,
    "parameterSchema" JSONB,
    "allowedDomains" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ToolGrant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "operations" JSONB NOT NULL,
    "denied" BOOLEAN NOT NULL DEFAULT false,
    "maxCallsPerRequest" INTEGER NOT NULL DEFAULT 3,
    "justification" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ToolGrant_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ToolGrant_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "Tool" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ToolCall" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT,
    "agentId" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "arguments" JSONB NOT NULL,
    "decision" TEXT NOT NULL,
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "checks" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "executed" BOOLEAN NOT NULL DEFAULT false,
    "executedAt" DATETIME,
    "durationMs" INTEGER,
    "resultSummary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ToolCall_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "SecurityEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ToolCall_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ToolCall_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "Tool" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ToolApproval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "toolCallId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "riskSummary" TEXT NOT NULL DEFAULT '',
    "decidedById" TEXT,
    "decidedAt" DATETIME,
    "justification" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ToolApproval_toolCallId_fkey" FOREIGN KEY ("toolCallId") REFERENCES "ToolCall" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ToolApproval_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SecurityEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ref" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicationId" TEXT,
    "agentId" TEXT,
    "userId" TEXT,
    "modelId" TEXT,
    "requestText" TEXT NOT NULL,
    "responseText" TEXT,
    "redactedResponse" TEXT,
    "riskScore" INTEGER NOT NULL,
    "severity" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "threatTypes" JSONB NOT NULL,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "redacted" BOOLEAN NOT NULL DEFAULT false,
    "detectionCount" INTEGER NOT NULL DEFAULT 0,
    "sensitiveHitCount" INTEGER NOT NULL DEFAULT 0,
    "toolCallCount" INTEGER NOT NULL DEFAULT 0,
    "retrievalCount" INTEGER NOT NULL DEFAULT 0,
    "riskFactors" JSONB NOT NULL,
    "stageTrace" JSONB NOT NULL,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "sessionId" TEXT,
    "ipAddress" TEXT,
    "simulated" BOOLEAN NOT NULL DEFAULT false,
    "scenarioKey" TEXT,
    "incidentId" TEXT,
    CONSTRAINT "SecurityEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "AiApplication" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SecurityEvent_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SecurityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SecurityEvent_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "LlmModel" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SecurityEvent_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Detection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "detectorId" TEXT NOT NULL,
    "layer" TEXT NOT NULL,
    "threatType" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "score" INTEGER NOT NULL,
    "severity" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Detection_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "SecurityEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SensitiveHit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "action" TEXT NOT NULL,
    "maskedSample" TEXT NOT NULL,
    "offsetStart" INTEGER NOT NULL DEFAULT 0,
    "offsetEnd" INTEGER NOT NULL DEFAULT 0,
    "confidence" REAL NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SensitiveHit_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "SecurityEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Policy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "condition" JSONB NOT NULL,
    "action" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "lastHitAt" DATETIME,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Guardrail" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "controlType" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "threshold" INTEGER NOT NULL DEFAULT 60,
    "action" TEXT NOT NULL DEFAULT 'BLOCK',
    "config" JSONB,
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "lastHitAt" DATETIME,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ref" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "threatType" TEXT NOT NULL,
    "applicationId" TEXT,
    "agentId" TEXT,
    "subjectUser" TEXT,
    "assignedToId" TEXT,
    "attackChain" JSONB,
    "aiSummary" TEXT,
    "aiRecommendations" JSONB,
    "resolution" TEXT,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "containedAt" DATETIME,
    "resolvedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Incident_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "AiApplication" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Incident_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Incident_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IncidentTimelineEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "incidentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IncidentTimelineEntry_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "eventId" TEXT,
    "incidentId" TEXT,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedById" TEXT,
    "acknowledgedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Alert_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "SecurityEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Alert_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Alert_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "targetLabel" TEXT,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'SUCCESS',
    CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Baseline" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "agentId" TEXT,
    "metric" TEXT NOT NULL,
    "mean" REAL NOT NULL,
    "m2" REAL NOT NULL DEFAULT 0,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "min" REAL NOT NULL DEFAULT 0,
    "max" REAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Baseline_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MetricSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bucket" TEXT NOT NULL,
    "applicationId" TEXT,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "blocked" INTEGER NOT NULL DEFAULT 0,
    "redacted" INTEGER NOT NULL DEFAULT 0,
    "threats" INTEGER NOT NULL DEFAULT 0,
    "criticalThreats" INTEGER NOT NULL DEFAULT 0,
    "promptInjections" INTEGER NOT NULL DEFAULT 0,
    "ragThreats" INTEGER NOT NULL DEFAULT 0,
    "dataViolations" INTEGER NOT NULL DEFAULT 0,
    "toolDenials" INTEGER NOT NULL DEFAULT 0,
    "avgRiskScore" REAL NOT NULL DEFAULT 0,
    "securityScore" INTEGER NOT NULL DEFAULT 100
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_riskScore_idx" ON "User"("riskScore");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "LlmModel_name_key" ON "LlmModel"("name");

-- CreateIndex
CREATE UNIQUE INDEX "AiApplication_slug_key" ON "AiApplication"("slug");

-- CreateIndex
CREATE INDEX "AiApplication_status_idx" ON "AiApplication"("status");

-- CreateIndex
CREATE INDEX "AiApplication_securityScore_idx" ON "AiApplication"("securityScore");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_slug_key" ON "Agent"("slug");

-- CreateIndex
CREATE INDEX "Agent_applicationId_idx" ON "Agent"("applicationId");

-- CreateIndex
CREATE INDEX "Agent_riskLevel_idx" ON "Agent"("riskLevel");

-- CreateIndex
CREATE INDEX "Agent_status_idx" ON "Agent"("status");

-- CreateIndex
CREATE INDEX "AgentPermission_agentId_idx" ON "AgentPermission"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentPermission_agentId_resource_key" ON "AgentPermission"("agentId", "resource");

-- CreateIndex
CREATE INDEX "DataSource_trustLevel_idx" ON "DataSource"("trustLevel");

-- CreateIndex
CREATE INDEX "Document_scanStatus_idx" ON "Document"("scanStatus");

-- CreateIndex
CREATE INDEX "Document_quarantined_idx" ON "Document"("quarantined");

-- CreateIndex
CREATE INDEX "Document_riskLevel_idx" ON "Document"("riskLevel");

-- CreateIndex
CREATE INDEX "Document_classification_idx" ON "Document"("classification");

-- CreateIndex
CREATE INDEX "DocumentFinding_documentId_idx" ON "DocumentFinding"("documentId");

-- CreateIndex
CREATE INDEX "DocumentFinding_severity_idx" ON "DocumentFinding"("severity");

-- CreateIndex
CREATE INDEX "RetrievalEvent_eventId_idx" ON "RetrievalEvent"("eventId");

-- CreateIndex
CREATE INDEX "RetrievalEvent_documentId_idx" ON "RetrievalEvent"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "Tool_slug_key" ON "Tool"("slug");

-- CreateIndex
CREATE INDEX "Tool_category_idx" ON "Tool"("category");

-- CreateIndex
CREATE INDEX "Tool_riskTier_idx" ON "Tool"("riskTier");

-- CreateIndex
CREATE INDEX "ToolGrant_agentId_idx" ON "ToolGrant"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "ToolGrant_agentId_toolId_key" ON "ToolGrant"("agentId", "toolId");

-- CreateIndex
CREATE INDEX "ToolCall_agentId_idx" ON "ToolCall"("agentId");

-- CreateIndex
CREATE INDEX "ToolCall_toolId_idx" ON "ToolCall"("toolId");

-- CreateIndex
CREATE INDEX "ToolCall_decision_idx" ON "ToolCall"("decision");

-- CreateIndex
CREATE INDEX "ToolCall_createdAt_idx" ON "ToolCall"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ToolApproval_toolCallId_key" ON "ToolApproval"("toolCallId");

-- CreateIndex
CREATE INDEX "ToolApproval_status_idx" ON "ToolApproval"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityEvent_ref_key" ON "SecurityEvent"("ref");

-- CreateIndex
CREATE INDEX "SecurityEvent_createdAt_idx" ON "SecurityEvent"("createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_severity_idx" ON "SecurityEvent"("severity");

-- CreateIndex
CREATE INDEX "SecurityEvent_decision_idx" ON "SecurityEvent"("decision");

-- CreateIndex
CREATE INDEX "SecurityEvent_riskScore_idx" ON "SecurityEvent"("riskScore");

-- CreateIndex
CREATE INDEX "SecurityEvent_applicationId_idx" ON "SecurityEvent"("applicationId");

-- CreateIndex
CREATE INDEX "SecurityEvent_agentId_idx" ON "SecurityEvent"("agentId");

-- CreateIndex
CREATE INDEX "SecurityEvent_userId_idx" ON "SecurityEvent"("userId");

-- CreateIndex
CREATE INDEX "SecurityEvent_incidentId_idx" ON "SecurityEvent"("incidentId");

-- CreateIndex
CREATE INDEX "SecurityEvent_simulated_idx" ON "SecurityEvent"("simulated");

-- CreateIndex
CREATE INDEX "Detection_eventId_idx" ON "Detection"("eventId");

-- CreateIndex
CREATE INDEX "Detection_threatType_idx" ON "Detection"("threatType");

-- CreateIndex
CREATE INDEX "Detection_detectorId_idx" ON "Detection"("detectorId");

-- CreateIndex
CREATE INDEX "Detection_severity_idx" ON "Detection"("severity");

-- CreateIndex
CREATE INDEX "SensitiveHit_eventId_idx" ON "SensitiveHit"("eventId");

-- CreateIndex
CREATE INDEX "SensitiveHit_type_idx" ON "SensitiveHit"("type");

-- CreateIndex
CREATE INDEX "SensitiveHit_channel_idx" ON "SensitiveHit"("channel");

-- CreateIndex
CREATE UNIQUE INDEX "Policy_key_key" ON "Policy"("key");

-- CreateIndex
CREATE INDEX "Policy_enabled_priority_idx" ON "Policy"("enabled", "priority");

-- CreateIndex
CREATE INDEX "Policy_category_idx" ON "Policy"("category");

-- CreateIndex
CREATE UNIQUE INDEX "Guardrail_key_key" ON "Guardrail"("key");

-- CreateIndex
CREATE INDEX "Guardrail_direction_enabled_idx" ON "Guardrail"("direction", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "Incident_ref_key" ON "Incident"("ref");

-- CreateIndex
CREATE INDEX "Incident_status_idx" ON "Incident"("status");

-- CreateIndex
CREATE INDEX "Incident_severity_idx" ON "Incident"("severity");

-- CreateIndex
CREATE INDEX "Incident_openedAt_idx" ON "Incident"("openedAt");

-- CreateIndex
CREATE INDEX "IncidentTimelineEntry_incidentId_createdAt_idx" ON "IncidentTimelineEntry"("incidentId", "createdAt");

-- CreateIndex
CREATE INDEX "Alert_acknowledged_createdAt_idx" ON "Alert"("acknowledged", "createdAt");

-- CreateIndex
CREATE INDEX "Alert_severity_idx" ON "Alert"("severity");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_category_idx" ON "AuditLog"("category");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "Baseline_subjectId_idx" ON "Baseline"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "Baseline_subjectType_subjectId_metric_key" ON "Baseline"("subjectType", "subjectId", "metric");

-- CreateIndex
CREATE INDEX "MetricSnapshot_capturedAt_bucket_idx" ON "MetricSnapshot"("capturedAt", "bucket");
