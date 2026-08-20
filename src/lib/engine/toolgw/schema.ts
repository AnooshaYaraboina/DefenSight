/**
 * Minimal JSON Schema validator for tool parameters.
 *
 * Deliberately small and readable rather than a general-purpose implementation:
 * it covers exactly the constructs the tool catalogue uses, and every rejection
 * carries a message an analyst can act on. Validating *before* execution is the
 * point — a parameter check that runs after the call has left the building is
 * an audit record, not a control.
 */

export interface SchemaViolation {
  path: string;
  message: string;
}

interface JsonSchema {
  type?: string;
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  enum?: unknown[];
  pattern?: string;
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  additionalProperties?: boolean;
}

const FORMATS: Record<string, RegExp> = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  uri: /^[a-z][a-z0-9+.-]*:\/\/\S+$/i,
  "date-time": /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/,
};

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

function typeMatches(expected: string, value: unknown): boolean {
  const actual = typeOf(value);
  if (expected === "number") return actual === "number" || actual === "integer";
  if (expected === "integer") return actual === "integer";
  return actual === expected;
}

export function validateAgainstSchema(
  value: unknown,
  schema: JsonSchema | null | undefined,
  path = "",
): SchemaViolation[] {
  if (!schema || typeof schema !== "object") return [];
  const violations: SchemaViolation[] = [];
  const at = path || "arguments";

  if (schema.type && !typeMatches(schema.type, value)) {
    violations.push({
      path: at,
      message: `expected ${schema.type}, received ${typeOf(value)}`,
    });
    // Type is wrong, so the constraints below cannot be meaningfully checked.
    return violations;
  }

  if (schema.enum && !schema.enum.includes(value as never)) {
    violations.push({
      path: at,
      message: `value ${JSON.stringify(value)} is not one of ${schema.enum.map((v) => JSON.stringify(v)).join(", ")}`,
    });
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      violations.push({ path: at, message: `shorter than the minimum ${schema.minLength} characters` });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      violations.push({
        path: at,
        message: `exceeds the maximum ${schema.maxLength} characters (received ${value.length})`,
      });
    }
    if (schema.pattern) {
      try {
        if (!new RegExp(schema.pattern).test(value)) {
          violations.push({ path: at, message: `does not match the required pattern ${schema.pattern}` });
        }
      } catch {
        /* an invalid pattern in the catalogue is a configuration issue, not a
           reason to reject the caller */
      }
    }
    if (schema.format && FORMATS[schema.format] && !FORMATS[schema.format].test(value)) {
      violations.push({ path: at, message: `is not a valid ${schema.format}` });
    }
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      violations.push({ path: at, message: `below the minimum ${schema.minimum}` });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      violations.push({ path: at, message: `above the maximum ${schema.maximum}` });
    }
  }

  if (schema.type === "object" && value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!(key in obj) || obj[key] === undefined) {
        violations.push({ path: `${at}.${key}`, message: "is required but was not supplied" });
      }
    }
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      if (key in obj) {
        violations.push(...validateAgainstSchema(obj[key], sub, `${at}.${key}`));
      }
    }
    // Unexpected parameters are rejected: an agent supplying arguments the tool
    // never declared is either malfunctioning or being steered.
    if (schema.additionalProperties !== true && schema.properties) {
      for (const key of Object.keys(obj)) {
        if (!(key in schema.properties)) {
          violations.push({
            path: `${at}.${key}`,
            message: "is not a declared parameter of this tool",
          });
        }
      }
    }
  }

  if (schema.type === "array" && Array.isArray(value) && schema.items) {
    value.forEach((item, i) => {
      violations.push(...validateAgainstSchema(item, schema.items, `${at}[${i}]`));
    });
  }

  return violations;
}
