import { describe, expect, it } from "vitest";
import { scanSensitive, redactSensitive, sensitivityWeight } from "@/lib/engine/sensitive";

const find = (text: string, type: string) =>
  scanSensitive(text, "MODEL_OUTPUT").find((f) => f.type === type);

describe("sensitive data scanner", () => {
  it("accepts a Luhn-valid card and rejects an invalid one", () => {
    expect(find("card 4111 1111 1111 1111 on file", "PAYMENT_CARD")).toBeDefined();
    expect(find("order reference 4111 1111 1111 1112 shipped", "PAYMENT_CARD")).toBeUndefined();
  });

  it("rejects structurally impossible SSNs", () => {
    expect(find("SSN 456-78-9012", "SSN")).toBeDefined();
    expect(find("value 000-12-3456", "SSN")).toBeUndefined();
    expect(find("value 666-12-3456", "SSN")).toBeUndefined();
    expect(find("value 123-00-4567", "SSN")).toBeUndefined();
  });

  it("raises confidence when a label sits beside the value", () => {
    const labelled = find("SSN: 456-78-9012", "SSN")!;
    const bare = find("reference 456-78-9012 attached", "SSN")!;
    expect(labelled.confidence).toBeGreaterThan(bare.confidence);
  });

  it("validates IBAN with the mod-97 check", () => {
    expect(find("account GB82WEST12345698765432", "IBAN")).toBeDefined();
    expect(find("account GB82WEST12345698765433", "IBAN")).toBeUndefined();
  });

  it("finds credentials and connection strings", () => {
    const text = `FEEDBACK_API_KEY=sk-live-8Kd93jsLPqm2vNxTr7aQwZ4bHy6EfGh1
DB_CONNECTION=postgresql://svc_feedback:Wint3r!Harvest@db-prod-03.internal:5432/feedback`;
    const findings = scanSensitive(text, "RAG_CONTEXT");
    const types = findings.map((f) => f.type);
    expect(types).toContain("API_KEY");
    expect(types).toContain("CONNECTION_STRING");
    expect(findings.some((f) => f.category === "CREDENTIAL")).toBe(true);
  });

  it("does not report overlapping matches twice", () => {
    const findings = scanSensitive(
      "postgresql://user:hunter2pass@db.internal:5432/app",
      "TOOL_ARGUMENTS",
    );
    const spans = findings.flatMap((f) => f.spans);
    for (let i = 0; i < spans.length; i++) {
      for (let j = i + 1; j < spans.length; j++) {
        const a = spans[i];
        const b = spans[j];
        expect(a.start < b.end && a.end > b.start).toBe(false);
      }
    }
  });

  it("treats organisational addresses as low sensitivity", () => {
    const internal = find("contact people-ops@northwind.example", "EMAIL")!;
    const personal = find("contact j.alvarez@gmail.com", "EMAIL")!;
    expect(internal.confidence).toBeLessThan(personal.confidence);
  });

  it("redacts without corrupting surrounding text", () => {
    const original =
      "Customer j.alvarez@example.com paid with 4111 1111 1111 1111 on 2026-08-01.";
    const { text, replaced, types } = redactSensitive(original);
    expect(replaced).toBeGreaterThanOrEqual(2);
    expect(types).toContain("PAYMENT_CARD");
    expect(text).not.toContain("4111 1111 1111 1111");
    expect(text).toContain("Customer");
    expect(text).toContain("on 2026-08-01.");
  });

  it("weighs a credential far above an email address", () => {
    const cred = sensitivityWeight(scanSensitive("key=sk-live-8Kd93jsLPqm2vNxTr7aQwZ4b", "MODEL_OUTPUT"));
    const email = sensitivityWeight(scanSensitive("mail j.alvarez@gmail.com", "MODEL_OUTPUT"));
    expect(cred).toBeGreaterThan(email * 2);
  });

  it("returns nothing for ordinary business prose", () => {
    expect(
      scanSensitive(
        "Revenue was $84.2M against a budget of $81.0M with gross margin at 61.4%.",
        "MODEL_OUTPUT",
      ).filter((f) => f.category !== "TECHNICAL"),
    ).toHaveLength(0);
  });
});
