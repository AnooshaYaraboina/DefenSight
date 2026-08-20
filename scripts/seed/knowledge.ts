/**
 * Data sources, vector stores and the document corpus (§10).
 *
 * Trust is a property of provenance, not of content. Externally-fed sources
 * start with low trust and can never be implicitly promoted, which is the
 * structural defence against indirect prompt injection: a document from the
 * vendor portal is treated as hostile input no matter how legitimate it looks.
 */
import { createHash } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { ATTACK_DOCUMENTS, BENIGN_TRICKY_DOCUMENTS } from "./attack-corpus";

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);

/** Deterministic pseudo-random so repeated seeds produce identical databases. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CLEAN_DOCUMENTS: Array<{
  title: string;
  source: string;
  owner: string;
  classification: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";
  body: string;
}> = [
  { title: "Employee Handbook 2026", source: "sharepoint-intranet", owner: "Aisha Kamara", classification: "INTERNAL", body: "Working arrangements, leave entitlement, code of conduct and the internal escalation path. Hybrid working requires two anchor days per week agreed with the line manager. Annual leave accrues at 2.08 days per month." },
  { title: "Information Security Standard ISS-04", source: "sharepoint-intranet", owner: "Priya Raghunathan", classification: "INTERNAL", body: "Baseline control requirements for systems handling customer data: encryption at rest and in transit, MFA for all administrative access, quarterly access review, 90-day log retention minimum." },
  { title: "Incident Response Plan", source: "sharepoint-intranet", owner: "Marcus Adeyemi", classification: "CONFIDENTIAL", body: "Severity definitions, on-call rotation, communication tree and regulatory notification timelines. SEV-1 requires executive notification within 30 minutes and regulator assessment within 4 hours." },
  { title: "Q3 2026 Management Accounts", source: "s3-finance", owner: "Hannah Whitfield", classification: "CONFIDENTIAL", body: "Revenue of $84.2M against a budget of $81.0M. Gross margin 61.4%. Operating expenses $44.1M. EBITDA $7.6M. Cash position $112M with no drawn debt." },
  { title: "FY27 Budget Assumptions", source: "s3-finance", owner: "Hannah Whitfield", classification: "RESTRICTED", body: "Headcount plan, pricing assumptions and the sensitivity model underpinning the FY27 plan. Base case assumes 18% net revenue retention uplift and a 6% average price increase at renewal." },
  { title: "Revenue Recognition Policy", source: "s3-finance", owner: "Hannah Whitfield", classification: "INTERNAL", body: "Application of IFRS 15 to subscription, usage and professional services revenue streams, including the treatment of contract modifications and material rights." },
  { title: "Payments Platform Architecture", source: "confluence-eng", owner: "Tomás Lindqvist", classification: "INTERNAL", body: "Service topology, data stores, queue design and failure domains for the payments platform. The settlement path is the only synchronous dependency on the core ledger." },
  { title: "Service Level Objectives", source: "confluence-eng", owner: "Tomás Lindqvist", classification: "INTERNAL", body: "Availability, latency and error-budget targets per service. Payments API: 99.95% availability, p99 latency 400ms, monthly error budget 21.6 minutes." },
  { title: "On-Call Runbook — Payments API", source: "confluence-eng", owner: "Tomás Lindqvist", classification: "INTERNAL", body: "Alert definitions, first-response steps and escalation contacts for the payments service. Elevated 5xx on the settlement endpoint escalates to the platform lead after 10 minutes." },
  { title: "Kubernetes Cluster Standards", source: "confluence-eng", owner: "Tomás Lindqvist", classification: "INTERNAL", body: "Namespace conventions, resource quotas, admission policy and the approved base image set. All workloads must declare resource limits and run as non-root." },
  { title: "Data Retention Schedule", source: "sharepoint-intranet", owner: "Grace Nakamura", classification: "INTERNAL", body: "Retention periods by data category and the legal basis for each. Transaction records 7 years, marketing consent records 3 years, application logs 90 days." },
  { title: "Vendor Risk Assessment Framework", source: "sharepoint-intranet", owner: "Priya Raghunathan", classification: "INTERNAL", body: "Tiering criteria, due diligence depth per tier and reassessment cadence. Tier 1 vendors with production data access require annual on-site assessment." },
  { title: "Master Services Agreement — Meridian Systems", source: "contract-vault", owner: "Grace Nakamura", classification: "RESTRICTED", body: "Term, service levels, liability caps, data processing terms and termination rights for the Meridian Systems integration partnership. Liability capped at 12 months of fees." },
  { title: "Data Processing Addendum Template", source: "contract-vault", owner: "Grace Nakamura", classification: "CONFIDENTIAL", body: "Standard processor obligations, sub-processor approval mechanism, international transfer safeguards and audit rights." },
  { title: "Customer Contract — Halden Bank", source: "contract-vault", owner: "Grace Nakamura", classification: "RESTRICTED", body: "Enterprise agreement covering settlement services. Includes a most-favoured-nation pricing clause and a 24-month notice period on termination for convenience." },
  { title: "Benefits Summary — Medical Plans", source: "hr-vault", owner: "Aisha Kamara", classification: "INTERNAL", body: "Plan comparison, contribution rates and network coverage for the 2026 plan year across PPO and HDHP options." },
  { title: "Compensation Bands 2026", source: "hr-vault", owner: "Aisha Kamara", classification: "RESTRICTED", body: "Salary bands by level and geography, including the mid-point progression model and the off-cycle adjustment policy." },
  { title: "Performance Review Guidelines", source: "hr-vault", owner: "Aisha Kamara", classification: "INTERNAL", body: "Review cycle, calibration process, rating distribution guidance and the appeals mechanism." },
  { title: "Recruitment Policy", source: "hr-vault", owner: "Aisha Kamara", classification: "INTERNAL", body: "Requisition approval, interview panel composition, structured scoring and the referral programme terms." },
  { title: "Customer Support Playbook", source: "sharepoint-intranet", owner: "Omar Haddad", classification: "INTERNAL", body: "Tier definitions, response targets, escalation triggers and the approved tone-of-voice guidance for customer communications." },
  { title: "Refund and Credit Policy", source: "sharepoint-intranet", owner: "Omar Haddad", classification: "INTERNAL", body: "Circumstances in which a credit may be issued, approval thresholds by amount and the accounting treatment." },
  { title: "Product Roadmap H2 2026", source: "confluence-eng", owner: "Tomás Lindqvist", classification: "CONFIDENTIAL", body: "Committed, planned and exploratory work for the second half, with dependency mapping across platform, payments and reporting." },
  { title: "API Style Guide", source: "confluence-eng", owner: "Tomás Lindqvist", classification: "INTERNAL", body: "Resource naming, pagination, error envelope, versioning strategy and deprecation policy for public APIs." },
  { title: "Disaster Recovery Test Report — 2026-06", source: "confluence-eng", owner: "Tomás Lindqvist", classification: "CONFIDENTIAL", body: "Results of the June failover exercise. RTO achieved 41 minutes against a 60-minute target. RPO achieved 3 minutes against a 5-minute target. Two follow-up actions raised." },
  { title: "Anti-Money Laundering Procedures", source: "sharepoint-intranet", owner: "Daniel Okoro", classification: "CONFIDENTIAL", body: "Customer due diligence tiers, transaction monitoring thresholds, suspicious activity reporting workflow and record-keeping obligations." },
  { title: "Regulatory Change Log 2026", source: "sharepoint-intranet", owner: "Daniel Okoro", classification: "INTERNAL", body: "Tracked regulatory changes affecting the business, assessed impact and the remediation owner for each." },
  { title: "Board Pack — September 2026", source: "s3-finance", owner: "Hannah Whitfield", classification: "RESTRICTED", body: "Trading update, cash runway, strategic initiatives and the risk register summary presented to the board." },
  { title: "Pricing Model Documentation", source: "s3-finance", owner: "Hannah Whitfield", classification: "CONFIDENTIAL", body: "Interchange-plus construction, volume tier breakpoints and the discount approval matrix by deal size." },
  { title: "Sales Territory Plan FY27", source: "sharepoint-intranet", owner: "Victor Almeida", classification: "CONFIDENTIAL", body: "Territory definitions, quota allocation and the account assignment rules for the coming financial year." },
  { title: "Public Company Overview", source: "public-web", owner: "Automated Web Crawl", classification: "PUBLIC", body: "Publicly available description of Northwind Group's services, market position and leadership team, retrieved from the corporate website." },
  { title: "Industry Payments Report 2026", source: "public-web", owner: "Automated Web Crawl", classification: "PUBLIC", body: "Third-party market analysis of payment infrastructure trends, transaction volume growth and regulatory direction across major markets." },
];

export async function seedKnowledge(
  prisma: PrismaClient,
  users: Record<string, string>,
) {
  const rand = mulberry32(20260820);

  /* --------------------------------------------------------- data sources */
  const sourceSpecs = [
    { key: "sharepoint-intranet", name: "SharePoint — Corporate Intranet", type: "SHAREPOINT", trustLevel: 78, isExternal: false, owner: "IT Services", description: "Policies, handbooks and company-wide documentation. Content is authored internally and reviewed before publication." },
    { key: "confluence-eng", name: "Confluence — Engineering Wiki", type: "CONFLUENCE", trustLevel: 72, isExternal: false, owner: "Platform Engineering", description: "Architecture notes, runbooks and design records. Editable by any engineer, so content is trusted but not reviewed." },
    { key: "s3-finance", name: "S3 — Finance Reporting Bucket", type: "S3", trustLevel: 88, isExternal: false, owner: "Finance Operations", description: "Generated management reports and board material. Write access is restricted to the reporting pipeline." },
    { key: "hr-vault", name: "HR Document Vault", type: "SHAREPOINT", trustLevel: 90, isExternal: false, owner: "People Operations", description: "Personnel policy and compensation material. Tightly access-controlled at source." },
    { key: "contract-vault", name: "Contract Vault", type: "S3", trustLevel: 85, isExternal: false, owner: "Legal", description: "Executed agreements and templates. Documents originate from counterparties but are reviewed by Legal before filing." },
    { key: "vendor-portal", name: "Vendor Portal Uploads", type: "UPLOAD", trustLevel: 22, isExternal: true, owner: "Vendor Integration Office", description: "Documents uploaded directly by third-party vendors. Externally authored, unreviewed, and the highest-risk ingestion path in the estate." },
    { key: "public-web", name: "Public Web Crawl", type: "WEB", trustLevel: 12, isExternal: true, owner: "Automated", description: "Content fetched from the public internet. Fully untrusted by definition." },
  ];

  const sources: Record<string, string> = {};
  for (const s of sourceSpecs) {
    const created = await prisma.dataSource.create({
      data: {
        name: s.name, type: s.type, trustLevel: s.trustLevel,
        isExternal: s.isExternal, owner: s.owner, description: s.description,
      },
    });
    sources[s.key] = created.id;
  }

  /* -------------------------------------------------------- vector stores */
  const storeSpecs = [
    { key: "pgvector-corp", name: "pgvector — Corporate Knowledge", provider: "pgvector", indexName: "corp_knowledge_v3", dimensions: 1536 },
    { key: "pinecone-support", name: "Pinecone — Support Knowledge", provider: "Pinecone", indexName: "support-kb-prod", dimensions: 1536 },
    { key: "qdrant-legal", name: "Qdrant — Legal & Contracts", provider: "Qdrant", indexName: "legal_contracts", dimensions: 3072 },
  ];
  const stores: Record<string, string> = {};
  for (const s of storeSpecs) {
    const created = await prisma.vectorStore.create({
      data: { name: s.name, provider: s.provider, indexName: s.indexName, dimensions: s.dimensions },
    });
    stores[s.key] = created.id;
  }

  const storeForSource: Record<string, string> = {
    "sharepoint-intranet": "pgvector-corp",
    "confluence-eng": "pgvector-corp",
    "s3-finance": "pgvector-corp",
    "hr-vault": "pgvector-corp",
    "contract-vault": "qdrant-legal",
    "vendor-portal": "pgvector-corp",
    "public-web": "pinecone-support",
  };

  const ownerToUser: Record<string, string | undefined> = {
    "Priya Raghunathan": users["priya.r@northwind.example"],
    "Marcus Adeyemi": users["marcus.a@northwind.example"],
    "Hannah Whitfield": users["hannah.w@northwind.example"],
    "Tomás Lindqvist": users["tomas.l@northwind.example"],
    "Aisha Kamara": users["aisha.k@northwind.example"],
    "Grace Nakamura": users["grace.n@northwind.example"],
    "Omar Haddad": users["omar.h@northwind.example"],
    "Daniel Okoro": users["daniel.o@northwind.example"],
    "Victor Almeida": users["victor.a@northwind.example"],
    "Elena Petrova": users["elena.p@northwind.example"],
  };

  const documentIds: Record<string, string> = {};

  async function createDoc(opts: {
    key: string;
    title: string;
    source: string;
    owner: string;
    classification: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";
    content: string;
  }) {
    const sourceSpec = sourceSpecs.find((s) => s.key === opts.source)!;
    const doc = await prisma.document.create({
      data: {
        title: opts.title,
        content: opts.content,
        sourceId: sources[opts.source],
        vectorStoreId: stores[storeForSource[opts.source]],
        owner: opts.owner,
        classification: opts.classification,
        // Provisional trust inherited from provenance. The scanner adjusts it.
        trustScore: sourceSpec.trustLevel,
        scanStatus: "PENDING",
        contentHash: hash(opts.content),
        sizeBytes: Buffer.byteLength(opts.content, "utf8"),
        chunkCount: Math.max(1, Math.ceil(opts.content.length / 1200)),
        uploadedById: ownerToUser[opts.owner] ?? null,
        createdAt: new Date(Date.now() - Math.floor(rand() * 90) * 86_400_000),
      },
    });
    documentIds[opts.key] = doc.id;
    return doc;
  }

  for (const d of CLEAN_DOCUMENTS) {
    // Expand the seed body into a fuller document so chunking and scanning
    // operate on realistic lengths rather than one-liners.
    const content = `${d.title.toUpperCase()}\nNorthwind Group — ${d.classification}\n\n${d.body}\n\nSCOPE\n\nThis document applies to all Northwind Group entities and to third parties acting on the group's behalf. It is reviewed annually or on material change, whichever is sooner.\n\nOWNERSHIP\n\nDocument owner: ${d.owner}. Questions should be directed to the owning function in the first instance.\n\nREVISION HISTORY\n\nv3.0  Annual review, no material change\nv2.4  Updated to reflect the 2026 organisational structure\nv2.0  Reissued following the control framework refresh`;
    await createDoc({ key: `clean-${d.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, title: d.title, source: d.source, owner: d.owner, classification: d.classification, content });
  }

  for (const d of BENIGN_TRICKY_DOCUMENTS) {
    await createDoc({ key: d.key, title: d.title, source: d.source, owner: d.owner, classification: d.classification, content: d.content });
  }

  for (const d of ATTACK_DOCUMENTS) {
    await createDoc({ key: d.key, title: d.title, source: d.source, owner: d.owner, classification: d.classification, content: d.content });
  }

  return { sources, stores, documentIds };
}
