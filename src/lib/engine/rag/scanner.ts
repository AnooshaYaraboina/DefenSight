/**
 * Malicious document detection (§11).
 *
 * Implements the Upload → Scan → Analyze → Risk Score → Allow / Quarantine
 * workflow. The scanner runs the same detection layers used on live traffic, so
 * a document is judged by exactly the criteria that would apply to its content
 * once retrieved — there is no separate, weaker "document" detector to bypass.
 *
 * Trust is computed rather than asserted. A document's final trust score starts
 * from its source's provenance and is reduced by what the scan finds; nothing
 * can raise trust above what the source justifies, which is what stops an
 * attacker from laundering hostile content by making it look official.
 */
import {
  CLASSIFICATION_RANK,
  severityFromRisk,
  type Classification,
  type Severity,
  THREAT_META,
} from "../taxonomy";
import type { DetectionResult } from "../types";
import { normalize } from "../normalize";
import { lexicalDetector } from "../detectors/lexical";
import { structuralDetector } from "../detectors/structural";
import { semanticDetector } from "../detectors/semantic";
import { fuseDetections, type FusionResult } from "../detectors/fusion";
import { scanSensitive, sensitivityWeight } from "../sensitive";
import type { SensitiveFinding } from "../types";
import { plural } from "../text";

export type ScanStatus = "CLEAN" | "SUSPICIOUS" | "MALICIOUS";

export interface DocumentScanInput {
  documentId?: string;
  title: string;
  content: string;
  classification: Classification;
  /** 0-100 trust of the originating source. */
  sourceTrust: number;
  sourceName: string;
  sourceIsExternal: boolean;
}

export interface DocumentScanResult {
  status: ScanStatus;
  /** 0-100. High means dangerous. */
  riskScore: number;
  /** 0-100. High means trustworthy. */
  trustScore: number;
  severity: Severity;
  riskLevel: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  quarantine: boolean;
  quarantineReason?: string;
  detections: DetectionResult[];
  fusion: FusionResult;
  sensitiveFindings: SensitiveFinding[];
  /** Obfuscation strength found during normalisation, 0-1. */
  obfuscation: number;
  /** Ordered, analyst-readable account of what the scan did and concluded. */
  reasoning: string[];
  scannedAt: Date;
  durationMs: number;
}

export function scanDocument(input: DocumentScanInput): DocumentScanResult {
  const started = Date.now();
  const reasoning: string[] = [];

  /* ------------------------------------------------------ 1. normalisation */
  const normalization = normalize(input.content);
  if (normalization.obfuscated) {
    const parts: string[] = [];
    if (normalization.unicode.invisibleRemoved > 0) {
      parts.push(`${plural(normalization.unicode.invisibleRemoved, "invisible character")} removed`);
    }
    if (normalization.mixedScriptWords.length > 0) {
      parts.push(
        `${plural(normalization.mixedScriptWords.length, "word")} mixing alphabets (${normalization.mixedScriptWords.slice(0, 3).join(", ")})`,
      );
    }
    if (normalization.decodes.length > 0) {
      parts.push(
        `${plural(normalization.decodes.length, "encoded region")} decoded (${[...new Set(normalization.decodes.map((d) => d.encoding))].join(", ")})`,
      );
    }
    reasoning.push(
      `Normalisation found deliberate concealment: ${parts.join("; ")}. Legitimate business documents have no reason to hide their text, so this alone raises the document's risk.`,
    );
  } else {
    reasoning.push("Normalisation found no encoding, invisible characters or confusable glyphs.");
  }

  /* --------------------------------------------------------- 2. detection */
  const detectorInput = {
    raw: input.content,
    normalization,
    channel: "RAG_CONTEXT" as const,
    sourceDocumentId: input.documentId,
    sourceTrust: input.sourceTrust,
  };

  const detections = [
    ...lexicalDetector.run(detectorInput),
    ...structuralDetector.run(detectorInput),
    ...semanticDetector.run(detectorInput),
  ];
  const fusion = fuseDetections(detections);

  if (fusion.primary) {
    reasoning.push(
      `Detection identified ${plural(fusion.threats.length, "threat type")}. ${fusion.primary.explanation}`,
    );
  } else {
    reasoning.push("No threat indicators were found by the pattern, structural or semantic layers.");
  }

  /* -------------------------------------------------- 3. sensitive content */
  const sensitiveFindings = scanSensitive(input.content, "RAG_CONTEXT");
  const credentials = sensitiveFindings.filter((f) => f.category === "CREDENTIAL");
  if (sensitiveFindings.length > 0) {
    const total = sensitiveFindings.reduce((s, f) => s + f.count, 0);
    reasoning.push(
      `Content scan found ${plural(total, "sensitive value")}: ${sensitiveFindings.slice(0, 4).map((f) => `${f.count}× ${f.type.toLowerCase().replace(/_/g, " ")}`).join(", ")}.` +
        (credentials.length
          ? " Credentials embedded in an indexed document are treated as an exposure regardless of intent — anything retrievable is disclosable."
          : ""),
    );
  }

  /* ------------------------------------------------------- 4. risk scoring */
  const threatComponent = fusion.maxConfidence * 55;
  const severityComponent =
    fusion.primary
      ? { CRITICAL: 20, HIGH: 14, MEDIUM: 7, LOW: 3, INFO: 0 }[fusion.primary.severity]
      : 0;
  const obfuscationComponent = normalization.obfuscationScore * 18;
  const credentialComponent = credentials.length > 0 ? 16 : sensitivityWeight(sensitiveFindings) * 8;
  // Provenance: content from an untrusted source is more dangerous at equal
  // content risk, because nobody vouched for it.
  const provenanceComponent = ((100 - input.sourceTrust) / 100) * 14;
  // Classification amplifies impact rather than likelihood.
  const classificationMultiplier = 1 + CLASSIFICATION_RANK[input.classification] * 0.05;

  const riskScore = Math.round(
    Math.min(
      100,
      (threatComponent +
        severityComponent +
        obfuscationComponent +
        credentialComponent +
        provenanceComponent) *
        classificationMultiplier,
    ),
  );

  /* ------------------------------------------------------ 5. trust scoring */
  // Trust can only fall from its provenance ceiling. Content never earns trust
  // it was not granted at the source.
  const trustPenalty = Math.round(
    fusion.maxConfidence * 55 + normalization.obfuscationScore * 25 + (credentials.length ? 10 : 0),
  );
  const trustScore = Math.max(0, Math.min(input.sourceTrust, input.sourceTrust - trustPenalty));

  /* --------------------------------------------------------- 6. verdict */
  let status: ScanStatus;
  let quarantine = false;
  let quarantineReason: string | undefined;

  if (fusion.maxConfidence >= 0.5 || riskScore >= 70) {
    status = "MALICIOUS";
    quarantine = true;
    quarantineReason = fusion.primary
      ? `${THREAT_META[fusion.primary.threatType].label} detected at ${(fusion.maxConfidence * 100).toFixed(0)}% confidence across ${plural(fusion.primary.agreement, "independent layer")}. Document withheld from all retrieval.`
      : `Composite risk score ${riskScore}/100 exceeds the quarantine threshold.`;
  } else if (fusion.maxConfidence >= 0.25 || riskScore >= 40 || normalization.obfuscated) {
    status = "SUSPICIOUS";
    // Untrusted provenance plus suspicion is enough to withhold. Trusted
    // sources get analyst review instead of automatic quarantine.
    if (input.sourceIsExternal && riskScore >= 45) {
      quarantine = true;
      quarantineReason = `Suspicious content (risk ${riskScore}/100) from an external, unreviewed source (${input.sourceName}, trust ${input.sourceTrust}/100). Withheld pending analyst review.`;
    }
  } else {
    status = "CLEAN";
  }

  reasoning.push(
    quarantine
      ? `Verdict: ${status}. ${quarantineReason}`
      : `Verdict: ${status}. Risk ${riskScore}/100, trust ${trustScore}/100 (source ceiling ${input.sourceTrust}). Document remains available for retrieval${status === "SUSPICIOUS" ? ", flagged for analyst review" : ""}.`,
  );

  const severity = severityFromRisk(riskScore);

  return {
    status,
    riskScore,
    trustScore,
    severity,
    riskLevel:
      severity === "INFO" ? "LOW" : (severity as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"),
    quarantine,
    quarantineReason,
    detections,
    fusion,
    sensitiveFindings,
    obfuscation: normalization.obfuscationScore,
    reasoning,
    scannedAt: new Date(),
    durationMs: Date.now() - started,
  };
}
