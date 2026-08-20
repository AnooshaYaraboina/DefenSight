import "server-only";
import OpenAI from "openai";

/**
 * Model provider abstraction.
 *
 * Every AI-backed feature calls through here, never the vendor SDK directly, so
 * the provider can be swapped without touching feature code.
 *
 * Crucially, the whole surface is optional. `isConfigured()` is false when no
 * key is present, and each caller has a deterministic fallback. AI automation
 * supports the defensive workflow (§21); it never performs enforcement. A
 * missing key degrades explanations and summaries — it can never degrade
 * detection, scoring, policy evaluation or blocking.
 */

let client: OpenAI | null = null;

export function isConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function getClient(): OpenAI | null {
  if (!isConfigured()) return null;
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

export const MODELS = {
  /** High-volume automation: classification, short explanations. */
  fast: process.env.OPENAI_MODEL_FAST ?? "gpt-4o-mini",
  /** Analyst-facing reasoning: assistant answers, incident summaries. */
  reasoning: process.env.OPENAI_MODEL_REASONING ?? "gpt-4o",
} as const;

export interface CompletionRequest {
  system: string;
  user: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface CompletionResult {
  text: string;
  /** False when the deterministic fallback produced this. */
  fromModel: boolean;
  model?: string;
}

/**
 * Request a completion, falling back to the caller's deterministic text.
 *
 * A model failure is never surfaced as an error to the analyst: the fallback is
 * always a usable answer built from the same security data, so the console
 * stays functional when the provider is unavailable.
 */
export async function complete(
  request: CompletionRequest,
  fallback: () => string,
): Promise<CompletionResult> {
  const openai = getClient();
  if (!openai) return { text: fallback(), fromModel: false };

  try {
    const model = request.model ?? MODELS.fast;
    const response = await openai.chat.completions.create({
      model,
      max_tokens: request.maxTokens ?? 600,
      temperature: request.temperature ?? 0.2,
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.user },
      ],
    });
    const text = response.choices[0]?.message?.content?.trim();
    if (!text) return { text: fallback(), fromModel: false };
    return { text, fromModel: true, model };
  } catch {
    // Rate limits, outages and malformed responses all land here. The analyst
    // gets the deterministic answer rather than an error page.
    return { text: fallback(), fromModel: false };
  }
}
