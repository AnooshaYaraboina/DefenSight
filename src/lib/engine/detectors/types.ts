import type { Channel } from "../taxonomy";
import type { DetectionResult } from "../types";
import type { NormalizationResult } from "../normalize";

/** What every detector receives. Detectors are pure functions of this input. */
export interface DetectorInput {
  /** Text as supplied. Offsets in evidence spans refer to this string. */
  raw: string;
  /** All readable forms produced by the normalisation layer. */
  normalization: NormalizationResult;
  /** Which monitored channel this text came from. */
  channel: Channel;
  /** Document this text came from, for indirect-injection attribution. */
  sourceDocumentId?: string;
  /** Trust of the originating document, 0-100. Absent for user input. */
  sourceTrust?: number;
  /** Supplementary context some detectors need. */
  context?: {
    systemPrompt?: string;
    userIntent?: string;
    principalRole?: string;
  };
}

export interface Detector {
  id: string;
  layer: DetectionResult["layer"];
  /** Channels this detector is meaningful on. */
  channels: Channel[];
  run(input: DetectorInput): DetectionResult[];
}
