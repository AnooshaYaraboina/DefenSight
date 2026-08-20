import { describe, expect, it } from "vitest";
import { scanDocument } from "@/lib/engine";
import { ATTACK_DOCUMENTS, BENIGN_TRICKY_DOCUMENTS } from "../scripts/seed/attack-corpus";

const scan = (content: string, over: Partial<Parameters<typeof scanDocument>[0]> = {}) =>
  scanDocument({
    title: "Test Document", content, classification: "INTERNAL",
    sourceTrust: 22, sourceName: "Vendor Portal Uploads", sourceIsExternal: true,
    ...over,
  });

describe("malicious document detection (§11)", () => {
  it.each(ATTACK_DOCUMENTS.map((d) => [d.key, d] as const))(
    "flags the adversarial document %s",
    (_key, doc) => {
      const r = scan(doc.content, { title: doc.title, classification: doc.classification });
      expect(r.status).not.toBe("CLEAN");
      if (doc.expected.shouldQuarantine) {
        expect(r.quarantine).toBe(true);
        expect(r.quarantineReason).toBeTruthy();
      }
      expect(r.riskScore).toBeGreaterThanOrEqual(40);
      // The scan must always explain itself.
      expect(r.reasoning.length).toBeGreaterThanOrEqual(3);
      expect(r.reasoning.join(" ")).toMatch(/Verdict:/);
    },
  );

  it.each(BENIGN_TRICKY_DOCUMENTS.map((d) => [d.key, d] as const))(
    "does not flag the benign document %s",
    (_key, doc) => {
      const r = scan(doc.content, {
        title: doc.title, classification: doc.classification,
        sourceTrust: 78, sourceName: "SharePoint — Corporate Intranet", sourceIsExternal: false,
      });
      expect(r.quarantine).toBe(false);
      expect(r.status).toBe("CLEAN");
    },
  );

  it("never raises trust above the source's ceiling", () => {
    const clean = "Quarterly revenue was $84.2M against a budget of $81.0M with margin at 61.4%.";
    const r = scan(clean, { sourceTrust: 22 });
    expect(r.trustScore).toBeLessThanOrEqual(22);
  });

  it("reduces trust in proportion to what the scan finds", () => {
    const cleanScan = scan("Revenue was $84.2M against budget.", { sourceTrust: 80, sourceIsExternal: false });
    const dirtyScan = scan(ATTACK_DOCUMENTS[0].content, { sourceTrust: 80, sourceIsExternal: false });
    expect(cleanScan.trustScore).toBe(80); // clean content keeps the source ceiling
    expect(dirtyScan.trustScore).toBeLessThan(cleanScan.trustScore);
    // A near-certain injection strips the large majority of inherited trust.
    expect(dirtyScan.trustScore).toBeLessThan(cleanScan.trustScore * 0.45);
  });

  it("quarantines suspicious content from an external source but not from a trusted one", () => {
    // Content with a single weak signal: obfuscation but no clear directive.
    const marginal = `PARTNER UPDATE\n\n${"Integration milestones progressed on schedule this quarter. ".repeat(8)}\nplease review​​ the attached figures before the meeting.`;
    const external = scan(marginal, { sourceTrust: 12, sourceIsExternal: true, sourceName: "Public Web Crawl" });
    const internal = scan(marginal, { sourceTrust: 88, sourceIsExternal: false, sourceName: "S3 — Finance Reporting Bucket" });
    expect(internal.quarantine).toBe(false);
    expect(external.riskScore).toBeGreaterThan(internal.riskScore);
  });

  it("records the decoded payload as evidence", () => {
    const doc = ATTACK_DOCUMENTS.find((d) => d.key === "security-advisory-b64")!;
    const r = scan(doc.content, { classification: "PUBLIC" });
    expect(r.obfuscation).toBeGreaterThan(0);
    expect(r.reasoning.join(" ")).toMatch(/decoded/i);
    expect(r.quarantine).toBe(true);
  });

  it("finds embedded credentials in an indexed document", () => {
    const doc = ATTACK_DOCUMENTS.find((d) => d.key === "customer-feedback-pii-bait")!;
    const r = scan(doc.content, { classification: "CONFIDENTIAL" });
    expect(r.sensitiveFindings.some((f) => f.category === "CREDENTIAL")).toBe(true);
    expect(r.reasoning.join(" ")).toMatch(/credential/i);
  });

  it("scores an empty document as clean rather than crashing", () => {
    const r = scan("");
    expect(r.status).toBe("CLEAN");
    expect(r.quarantine).toBe(false);
  });
});
