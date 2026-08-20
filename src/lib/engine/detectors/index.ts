/**
 * Detector registry.
 *
 * The single place that knows which detectors exist. Adding a layer means
 * adding it here — the pipeline never names detectors individually, so a new
 * detection technique reaches production without touching orchestration code.
 */
import type { Channel } from "../taxonomy";
import type { DetectionResult } from "../types";
import type { Detector, DetectorInput } from "./types";
import { lexicalDetector } from "./lexical";
import { structuralDetector } from "./structural";
import { semanticDetector } from "./semantic";

export const DETECTORS: Detector[] = [
  lexicalDetector,
  structuralDetector,
  semanticDetector,
];

/**
 * Run every detector registered for this channel.
 *
 * A detector that throws is isolated: the failure is recorded and the remaining
 * layers still run. A crash in one analysis technique must never become a gap
 * in the whole defence.
 */
export function runDetectors(input: DetectorInput): {
  detections: DetectionResult[];
  failures: Array<{ detectorId: string; error: string }>;
} {
  const detections: DetectionResult[] = [];
  const failures: Array<{ detectorId: string; error: string }> = [];

  for (const detector of DETECTORS) {
    if (!detector.channels.includes(input.channel)) continue;
    try {
      detections.push(...detector.run(input));
    } catch (error) {
      failures.push({
        detectorId: detector.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { detections, failures };
}

export function detectorsForChannel(channel: Channel): Detector[] {
  return DETECTORS.filter((d) => d.channels.includes(channel));
}

export { lexicalDetector } from "./lexical";
export { structuralDetector } from "./structural";
export { semanticDetector } from "./semantic";
export { behaviouralDetections, updateBaseline, analyseBehaviour } from "./behavioral";
export { fuseDetections } from "./fusion";
export type { FusedThreat, FusionResult } from "./fusion";
export type { Detector, DetectorInput } from "./types";
export { PATTERN_FAMILIES, MITIGATIONS } from "./patterns";
export { ATTACK_CORPUS, BENIGN_CORPUS } from "./corpus";
