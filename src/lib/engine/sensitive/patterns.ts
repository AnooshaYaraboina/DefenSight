/**
 * Sensitive data patterns (§15).
 *
 * Regex alone produces unusable precision on this problem: every 16-digit
 * number is not a payment card and every base64 blob is not a secret. Each
 * pattern therefore pairs with a validator — Luhn for cards, area-code and
 * group rules for SSNs, Shannon entropy for credentials — and confidence is
 * assigned per match rather than per pattern.
 */

export type SensitiveCategory =
  | "PII"
  | "CREDENTIAL"
  | "FINANCIAL"
  | "CUSTOMER"
  | "EMPLOYEE"
  | "BUSINESS"
  | "TECHNICAL";

export interface SensitivePattern {
  type: string;
  category: SensitiveCategory;
  label: string;
  re: RegExp;
  /** Base confidence before validation adjusts it. */
  baseConfidence: number;
  /** Returns null to reject the match, or a confidence multiplier. */
  validate?: (match: string, context: string) => number | null;
  /** How the value is masked when redacting. */
  mask: (match: string) => string;
  /** Severity weight this type carries in risk scoring, 0-1. */
  weight: number;
}

/* ------------------------------------------------------------------ helpers */

function luhn(digits: string): boolean {
  const n = digits.replace(/\D/g, "");
  if (n.length < 13 || n.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = n.length - 1; i >= 0; i--) {
    let d = Number(n[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

function shannonEntropy(s: string): number {
  const freq = new Map<string, number>();
  for (const c of s) freq.set(c, (freq.get(c) ?? 0) + 1);
  let e = 0;
  for (const count of freq.values()) {
    const p = count / s.length;
    e -= p * Math.log2(p);
  }
  return e;
}

function maskKeepEdges(s: string, keepStart = 2, keepEnd = 2): string {
  const core = s.replace(/\s|-/g, "");
  if (core.length <= keepStart + keepEnd) return "•".repeat(core.length);
  return `${core.slice(0, keepStart)}${"•".repeat(Math.max(4, core.length - keepStart - keepEnd))}${core.slice(-keepEnd)}`;
}

/* ----------------------------------------------------------------- patterns */

export const SENSITIVE_PATTERNS: SensitivePattern[] = [
  {
    type: "PAYMENT_CARD",
    category: "FINANCIAL",
    label: "Payment card number",
    re: /\b(?:\d[ -]?){12,18}\d\b/g,
    baseConfidence: 0.6,
    weight: 1,
    // Luhn is what separates a card number from an order reference.
    validate: (m) => (luhn(m) ? 1.55 : null),
    mask: (m) => maskKeepEdges(m, 4, 4),
  },
  {
    type: "SSN",
    category: "PII",
    label: "US Social Security Number",
    re: /\b(\d{3})[-\s]?(\d{2})[-\s]?(\d{4})\b/g,
    baseConfidence: 0.55,
    weight: 1,
    validate: (m, ctx) => {
      const d = m.replace(/\D/g, "");
      const area = d.slice(0, 3);
      const group = d.slice(3, 5);
      const serial = d.slice(5);
      // Structurally impossible SSNs.
      if (area === "000" || area === "666" || Number(area) >= 900) return null;
      if (group === "00" || serial === "0000") return null;
      // A nearby label makes it near-certain; a bare 9-digit run does not.
      const labelled = /\b(?:ssn|social\s+security|national\s+id|tax\s*id)\b/i.test(ctx);
      return labelled ? 1.7 : 0.95;
    },
    mask: (m) => `•••-••-${m.replace(/\D/g, "").slice(-4)}`,
  },
  {
    type: "EMAIL",
    category: "PII",
    label: "Email address",
    re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    baseConfidence: 0.9,
    weight: 0.35,
    validate: (m) => {
      // Organisational and example addresses are not personal data leaks.
      if (/@(?:example\.(?:com|org|net)|northwind\.example)$/i.test(m)) return 0.35;
      return 1;
    },
    mask: (m) => {
      const [local, domain] = m.split("@");
      return `${local.slice(0, 2)}${"•".repeat(Math.max(3, local.length - 2))}@${domain}`;
    },
  },
  {
    type: "PHONE",
    category: "PII",
    label: "Phone number",
    re: /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?|\d{2,4}[\s.-])\d{3,4}[\s.-]?\d{3,4}\b/g,
    baseConfidence: 0.55,
    weight: 0.4,
    validate: (m, ctx) => {
      const digits = m.replace(/\D/g, "");
      if (digits.length < 9 || digits.length > 15) return null;
      // Reject version strings, dates and monetary amounts.
      if (/\b(?:v|version|rev)\s*$/i.test(ctx.slice(0, ctx.indexOf(m)))) return null;
      const labelled = /\b(?:phone|tel|mobile|cell|contact|call)\b/i.test(ctx);
      return labelled ? 1.5 : 0.75;
    },
    mask: (m) => maskKeepEdges(m, 2, 3),
  },
  {
    type: "DATE_OF_BIRTH",
    category: "PII",
    label: "Date of birth",
    re: /\b(?:dob|d\.o\.b\.?|date\s+of\s+birth|born)\b\s*[:\-]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/gi,
    baseConfidence: 0.9,
    weight: 0.7,
    mask: (m) => m.replace(/\d/g, "•"),
  },
  {
    type: "IBAN",
    category: "FINANCIAL",
    label: "IBAN",
    re: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g,
    baseConfidence: 0.7,
    weight: 0.9,
    validate: (m) => {
      // ISO 13616 mod-97 check.
      const rearranged = m.slice(4) + m.slice(0, 4);
      const numeric = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
      let remainder = 0;
      for (const ch of numeric) remainder = (remainder * 10 + Number(ch)) % 97;
      return remainder === 1 ? 1.4 : null;
    },
    mask: (m) => `${m.slice(0, 4)}${"•".repeat(m.length - 8)}${m.slice(-4)}`,
  },
  {
    type: "API_KEY",
    category: "CREDENTIAL",
    label: "API key",
    re: /\b(?:sk|pk|rk|api|key|token)[-_](?:live|test|prod|dev)?[-_]?[A-Za-z0-9_-]{16,}\b|\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|\bghp_[A-Za-z0-9]{36}\b|\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
    baseConfidence: 0.85,
    weight: 1,
    validate: (m) => (shannonEntropy(m) > 3.2 ? 1.5 : 0.7),
    mask: (m) => `${m.slice(0, 6)}${"•".repeat(12)}`,
  },
  {
    type: "PASSWORD",
    category: "CREDENTIAL",
    label: "Password",
    re: /\b(?:password|passwd|pwd|secret|passphrase)\s*[:=]\s*["']?([^\s"',;]{6,})/gi,
    baseConfidence: 0.9,
    weight: 1,
    validate: (_m, ctx) => {
      // Documentation placeholders are not credentials.
      if (/\b(?:<[^>]+>|\{\{|\.\.\.|xxxx|placeholder|your[-_]password|example)\b/i.test(ctx))
        return 0.3;
      return 1.4;
    },
    mask: (m) => m.replace(/([:=]\s*["']?).*/, "$1••••••••"),
  },
  {
    type: "PRIVATE_KEY",
    category: "CREDENTIAL",
    label: "Private key",
    re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g,
    baseConfidence: 1,
    weight: 1,
    mask: () => "-----BEGIN PRIVATE KEY----- ••••••••",
  },
  {
    type: "JWT",
    category: "CREDENTIAL",
    label: "JSON Web Token",
    re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    baseConfidence: 0.95,
    weight: 1,
    mask: (m) => `${m.slice(0, 12)}${"•".repeat(16)}`,
  },
  {
    type: "CONNECTION_STRING",
    category: "CREDENTIAL",
    label: "Database connection string",
    re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp|mssql):\/\/[^\s"'<>]+:[^\s"'<>@]+@[^\s"'<>]+/gi,
    baseConfidence: 1,
    weight: 1,
    mask: (m) => m.replace(/:\/\/([^:]+):[^@]+@/, "://$1:••••••••@"),
  },
  {
    type: "ACCESS_TOKEN",
    category: "CREDENTIAL",
    label: "Bearer token",
    re: /\b(?:bearer|authorization)\s*[:=]?\s*["']?([A-Za-z0-9_.\-+/=]{24,})/gi,
    baseConfidence: 0.75,
    weight: 1,
    validate: (m) => (shannonEntropy(m) > 3.4 ? 1.3 : 0.6),
    mask: (m) => `${m.slice(0, 10)}${"•".repeat(14)}`,
  },
  {
    type: "CUSTOMER_RECORD",
    category: "CUSTOMER",
    label: "Customer account identifier",
    re: /\bACC-\d{6}\b/g,
    baseConfidence: 0.95,
    weight: 0.6,
    mask: (m) => `ACC-••${m.slice(-2)}`,
  },
  {
    type: "EMPLOYEE_RECORD",
    category: "EMPLOYEE",
    label: "Employee identifier",
    re: /\bEMP-\d{5}\b/g,
    baseConfidence: 0.95,
    weight: 0.6,
    mask: (m) => `EMP-•••${m.slice(-2)}`,
  },
  {
    type: "SALARY",
    category: "EMPLOYEE",
    label: "Compensation figure",
    re: /\b(?:salary|compensation|base\s+pay|annual\s+pay|bonus)\b[^.\n]{0,40}?[$£€]\s?\d{2,3}(?:,\d{3})+(?:\.\d{2})?/gi,
    baseConfidence: 0.85,
    weight: 0.75,
    mask: (m) => m.replace(/[$£€]\s?[\d,.]+/, (c) => `${c[0]}•••,•••`),
  },
  {
    type: "INTERNAL_ENDPOINT",
    category: "TECHNICAL",
    label: "Internal endpoint",
    re: /\b(?:[a-z0-9-]+\.)*(?:internal|intranet|corp|local|svc\.cluster\.local)(?::\d{2,5})?\b/gi,
    baseConfidence: 0.7,
    weight: 0.45,
    mask: (m) => `${m.slice(0, 3)}${"•".repeat(Math.max(4, m.length - 3))}`,
  },
  {
    type: "IP_ADDRESS",
    category: "TECHNICAL",
    label: "IP address",
    re: /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/g,
    baseConfidence: 0.8,
    weight: 0.3,
    validate: (m) => {
      // Version strings and common non-addresses.
      if (/^(?:0\.0\.0\.0|127\.0\.0\.1|255\.255\.255\.255)$/.test(m)) return 0.2;
      return 1;
    },
    mask: (m) => m.replace(/\.\d+\.\d+$/, ".•.•"),
  },
];

export { shannonEntropy, luhn };
