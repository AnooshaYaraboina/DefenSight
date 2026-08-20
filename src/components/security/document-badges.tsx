"use client";

import * as React from "react";
import { CircleCheck, CircleHelp, Loader2, ShieldOff, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const SCAN_META: Record<
  string,
  { label: string; tone: string; icon: React.ComponentType<{ className?: string }>; description: string }
> = {
  PENDING: { label: "Pending", tone: "neutral", icon: CircleHelp, description: "Not yet scanned. Retrieval is permitted but unverified." },
  SCANNING: { label: "Scanning", tone: "low", icon: Loader2, description: "Analysis in progress." },
  CLEAN: { label: "Clean", tone: "allow", icon: CircleCheck, description: "No threat indicators found by any detection layer." },
  SUSPICIOUS: { label: "Suspicious", tone: "medium", icon: TriangleAlert, description: "Weak indicators present. Flagged for analyst review." },
  MALICIOUS: { label: "Malicious", tone: "critical", icon: ShieldOff, description: "Attack content confirmed. Withheld from all retrieval." },
  FAILED: { label: "Scan failed", tone: "high", icon: TriangleAlert, description: "The scan could not complete." },
};

export function ScanStatusBadge({
  status,
  quarantined,
  size = "xs",
}: {
  status: string;
  quarantined?: boolean;
  size?: "xs" | "sm" | "md";
}) {
  const meta = SCAN_META[status] ?? SCAN_META.PENDING;
  const Icon = meta.icon;

  if (quarantined) {
    return (
      <Tooltip content="Quarantined. This document is withheld from every retrieval until an administrator releases it.">
        <Badge tone="critical" size={size}>
          <ShieldOff />
          Quarantined
        </Badge>
      </Tooltip>
    );
  }

  return (
    <Tooltip content={meta.description}>
      <Badge tone={meta.tone as never} size={size}>
        <Icon className={status === "SCANNING" ? "animate-spin" : undefined} />
        {meta.label}
      </Badge>
    </Tooltip>
  );
}

/**
 * Trust score with its provenance ceiling.
 *
 * Showing the ceiling alongside the score is the point: it makes visible that
 * trust is inherited from the source and can only fall, so a document cannot
 * earn credibility its origin does not justify.
 */
export function TrustPill({
  trust,
  ceiling,
  className,
}: {
  trust: number;
  ceiling?: number;
  className?: string;
}) {
  const tone =
    trust >= 70 ? "text-allow" : trust >= 40 ? "text-medium" : trust >= 20 ? "text-high" : "text-critical";
  const reduced = ceiling !== undefined && trust < ceiling;

  return (
    <Tooltip
      content={
        ceiling === undefined
          ? `Trust score ${trust}/100.`
          : reduced
            ? `Trust ${trust}/100, reduced from the source ceiling of ${ceiling} by what the scan found. Trust can only fall — never rise above provenance.`
            : `Trust ${trust}/100, at this source's ceiling. Nothing in the scan reduced it.`
      }
    >
      <span className={cn("inline-flex items-baseline gap-1 font-mono text-[11px] tabular", className)}>
        <span className={cn("font-semibold", tone)}>{trust}</span>
        {ceiling !== undefined && (
          <span className="text-[9px] text-ink-4">/{ceiling}</span>
        )}
      </span>
    </Tooltip>
  );
}
