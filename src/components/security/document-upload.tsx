"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2, ShieldOff, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScanStatusBadge } from "./document-badges";
import { CLASSIFICATIONS, THREAT_META, type ThreatType } from "@/lib/engine/taxonomy";

interface ScanOutcome {
  documentId: string;
  status: string;
  riskScore: number;
  trustScore: number;
  quarantined: boolean;
  quarantineReason?: string;
  reasoning: string[];
  threats: Array<{ type: string; confidence: number; agreement: number }>;
}

/**
 * Upload → Scan → Analyze → Risk Score → Allow / Quarantine (§11).
 *
 * The scan result is shown inline rather than by redirecting to the document,
 * because the interesting moment is the verdict itself: what was found, why it
 * was found, and what the platform did about it.
 */
export function DocumentUpload({ sources }: { sources: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<ScanOutcome | null>(null);

  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const [sourceId, setSourceId] = React.useState(sources[0]?.id ?? "");
  const [classification, setClassification] = React.useState("INTERNAL");

  function reset() {
    setTitle(""); setContent(""); setResult(null);
    setClassification("INTERNAL"); setSourceId(sources[0]?.id ?? "");
  }

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch("/api/rag/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, sourceId, classification }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scan failed");
      setResult(data);
      router.refresh();
      if (data.quarantined) {
        toast.error("Document quarantined", { description: data.quarantineReason });
      } else {
        toast.success(`Scan complete — ${data.status.toLowerCase()}`);
      }
    } catch (error) {
      toast.error("Scan failed", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Upload />
          Upload &amp; scan
        </Button>
      </DialogTrigger>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Upload and scan a document</DialogTitle>
          <DialogDescription>
            The document runs through the same detection layers as live traffic. Nothing is indexed
            before the scan completes.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {/* Workflow indicator — the assessment's required stages, made visible. */}
          <ol className="flex flex-wrap items-center gap-1.5" aria-label="Scan workflow">
            {["Upload", "Scan", "Analyze", "Risk score", "Allow / Quarantine"].map((step, i) => {
              const reached = result ? true : i === 0;
              const active = busy && !result;
              return (
                <React.Fragment key={step}>
                  {i > 0 && <li aria-hidden="true" className="text-ink-4">→</li>}
                  <li
                    className={cn(
                      "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] transition-colors",
                      reached
                        ? "border-brand/40 bg-brand-dim/50 text-brand"
                        : active
                          ? "border-line-strong bg-surface-2 text-ink-3"
                          : "border-line bg-surface text-ink-4",
                    )}
                  >
                    {active && i > 0 && <Loader2 className="size-2.5 animate-spin" />}
                    {step}
                  </li>
                </React.Fragment>
              );
            })}
          </ol>

          {!result ? (
            <div className="space-y-3">
              <div>
                <Label htmlFor="doc-title">Title</Label>
                <Input
                  id="doc-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Q4 Vendor Integration Report"
                  className="mt-1"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="doc-source">Data source</Label>
                  <Select value={sourceId} onValueChange={setSourceId}>
                    <SelectTrigger id="doc-source" className="mt-1">
                      <SelectValue placeholder="Select a source" />
                    </SelectTrigger>
                    <SelectContent>
                      {sources.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-[10px] text-ink-4">
                    Determines the document&apos;s trust ceiling.
                  </p>
                </div>

                <div>
                  <Label htmlFor="doc-class">Classification</Label>
                  <Select value={classification} onValueChange={setClassification}>
                    <SelectTrigger id="doc-class" className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CLASSIFICATIONS.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c.charAt(0) + c.slice(1).toLowerCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="doc-content">Content</Label>
                <Textarea
                  id="doc-content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Paste the document text. Try including an instruction addressed to the model to see the indirect-injection detectors fire."
                  className="mt-1 min-h-40 font-mono text-[11px]"
                />
                <p className="mt-1 text-[10px] text-ink-4">
                  {content.length.toLocaleString()} characters
                </p>
              </div>
            </div>
          ) : (
            <ScanResult result={result} />
          )}
        </DialogBody>

        <DialogFooter>
          {result ? (
            <>
              <Button variant="ghost" size="sm" onClick={reset}>Scan another</Button>
              <Button size="sm" onClick={() => { setOpen(false); reset(); }}>Done</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                size="sm"
                loading={busy}
                disabled={!title.trim() || !content.trim() || !sourceId}
                onClick={submit}
              >
                <FileUp />
                Scan document
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScanResult({ result }: { result: ScanOutcome }) {
  return (
    <div className="space-y-3">
      <div
        className={cn(
          "rounded-md border p-3.5",
          result.quarantined
            ? "border-critical/40 bg-critical-dim/30"
            : result.status === "SUSPICIOUS"
              ? "border-medium/35 bg-medium-dim/30"
              : "border-allow/30 bg-allow-dim/30",
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          {result.quarantined && <ShieldOff className="size-4 text-critical" />}
          <ScanStatusBadge status={result.status} quarantined={result.quarantined} size="sm" />
          <span className="font-mono text-[11px] text-ink-2">
            risk {result.riskScore}/100
          </span>
          <span className="font-mono text-[11px] text-ink-2">
            trust {result.trustScore}/100
          </span>
        </div>
        {result.quarantineReason && (
          <p className="mt-2 text-[11px] leading-relaxed text-critical">{result.quarantineReason}</p>
        )}
      </div>

      {result.threats.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-4">
            Threats identified
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {result.threats.map((t) => (
              <li key={t.type}>
                <Badge tone="critical" size="sm">
                  {THREAT_META[t.type as ThreatType]?.label ?? t.type}
                  <span className="font-mono">{(t.confidence * 100).toFixed(0)}%</span>
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-4">
          Why this verdict
        </p>
        <ol className="space-y-1.5">
          {result.reasoning.map((r, i) => (
            <li key={i} className="flex gap-2 rounded border border-line bg-surface-2/40 px-2.5 py-2">
              <span className="font-mono text-[10px] text-ink-4">{i + 1}</span>
              <span className="text-[11px] leading-relaxed text-ink-2">{r}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
