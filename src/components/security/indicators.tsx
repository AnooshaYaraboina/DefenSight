"use client";

import * as React from "react";
import {
  AlertOctagon,
  AlertTriangle,
  Ban,
  Check,
  CircleAlert,
  EyeOff,
  Info,
  ShieldAlert,
  UserCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  CLASSIFICATION_META,
  DECISION_META,
  INCIDENT_STATUS_META,
  SEVERITY_META,
  THREAT_META,
  type Classification,
  type Decision,
  type IncidentStatus,
  type Severity,
  type ThreatType,
} from "@/lib/engine/taxonomy";

/* -------------------------------------------------------------------------- */
/* Severity                                                                    */
/* -------------------------------------------------------------------------- */

const SEVERITY_ICON: Record<Severity, React.ComponentType<{ className?: string }>> = {
  CRITICAL: AlertOctagon,
  HIGH: AlertTriangle,
  MEDIUM: CircleAlert,
  LOW: Info,
  INFO: Info,
};

export function SeverityBadge({
  severity,
  size = "sm",
  showIcon = true,
  withTooltip = true,
}: {
  severity: Severity;
  size?: "xs" | "sm" | "md";
  showIcon?: boolean;
  withTooltip?: boolean;
}) {
  const meta = SEVERITY_META[severity];
  const Icon = SEVERITY_ICON[severity];
  const badge = (
    <Badge tone={meta.token as never} size={size}>
      {showIcon && <Icon />}
      {meta.label}
    </Badge>
  );
  return withTooltip ? <Tooltip content={meta.description}>{badge}</Tooltip> : badge;
}

/**
 * Four-segment severity bar. Reads faster than a word at the left edge of a
 * dense table row, and stays legible for colour-blind users because the number
 * of lit segments encodes severity as well as the hue.
 */
export function SeverityBar({ severity, className }: { severity: Severity; className?: string }) {
  const lit = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, INFO: 0 }[severity];
  const color = {
    CRITICAL: "bg-critical",
    HIGH: "bg-high",
    MEDIUM: "bg-medium",
    LOW: "bg-low",
    INFO: "bg-info",
  }[severity];
  return (
    <Tooltip content={`${SEVERITY_META[severity].label} severity`}>
      <span className={cn("inline-flex items-end gap-px", className)} aria-label={severity}>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "w-1 rounded-[1px] transition-colors",
              i < lit ? color : "bg-line-strong",
            )}
            style={{ height: `${5 + i * 3}px` }}
          />
        ))}
      </span>
    </Tooltip>
  );
}

/* -------------------------------------------------------------------------- */
/* Decision                                                                    */
/* -------------------------------------------------------------------------- */

const DECISION_ICON: Record<Decision, React.ComponentType<{ className?: string }>> = {
  ALLOW: Check,
  WARN: AlertTriangle,
  REDACT: EyeOff,
  REQUIRE_APPROVAL: UserCheck,
  BLOCK: Ban,
};

export function DecisionBadge({
  decision,
  size = "sm",
  showIcon = true,
  withTooltip = true,
}: {
  decision: Decision;
  size?: "xs" | "sm" | "md";
  showIcon?: boolean;
  withTooltip?: boolean;
}) {
  const meta = DECISION_META[decision];
  const Icon = DECISION_ICON[decision];
  const badge = (
    <Badge tone={meta.token as never} size={size}>
      {showIcon && <Icon />}
      {meta.label}
    </Badge>
  );
  return withTooltip ? <Tooltip content={meta.description}>{badge}</Tooltip> : badge;
}

/* -------------------------------------------------------------------------- */
/* Threat type                                                                 */
/* -------------------------------------------------------------------------- */

export function ThreatBadge({
  threat,
  size = "sm",
  severity,
  withTooltip = true,
}: {
  threat: ThreatType;
  size?: "xs" | "sm" | "md";
  /** Override the badge tone with the event's actual severity. */
  severity?: Severity;
  withTooltip?: boolean;
}) {
  const meta = THREAT_META[threat];
  const tone = SEVERITY_META[severity ?? meta.baseSeverity].token;
  const badge = (
    <Badge tone={tone as never} size={size}>
      <ShieldAlert />
      {meta.label}
    </Badge>
  );
  if (!withTooltip) return badge;
  return (
    <Tooltip
      content={
        <div className="space-y-1.5">
          <p className="font-medium text-ink">{meta.label}</p>
          <p>{meta.description}</p>
          {(meta.owasp || meta.atlas) && (
            <p className="pt-0.5 font-mono text-[10px] text-ink-4">
              {[meta.owasp && `OWASP ${meta.owasp}`, meta.atlas && `MITRE ${meta.atlas}`]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
      }
    >
      {badge}
    </Tooltip>
  );
}

/* -------------------------------------------------------------------------- */
/* Classification & incident status                                            */
/* -------------------------------------------------------------------------- */

export function ClassificationBadge({
  classification,
  size = "xs",
}: {
  classification: Classification;
  size?: "xs" | "sm" | "md";
}) {
  const meta = CLASSIFICATION_META[classification];
  return (
    <Tooltip content={meta.description}>
      <Badge tone={meta.token as never} size={size}>
        {meta.label}
      </Badge>
    </Tooltip>
  );
}

export function IncidentStatusBadge({
  status,
  size = "sm",
}: {
  status: IncidentStatus;
  size?: "xs" | "sm" | "md";
}) {
  const meta = INCIDENT_STATUS_META[status];
  return (
    <Tooltip content={meta.description}>
      <Badge tone={meta.token as never} size={size}>
        {meta.label}
      </Badge>
    </Tooltip>
  );
}

/* -------------------------------------------------------------------------- */
/* Live indicator                                                              */
/* -------------------------------------------------------------------------- */

export function LiveDot({
  active = true,
  label,
  className,
}: {
  active?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        className={cn(
          "size-1.5 rounded-full",
          active ? "bg-allow text-allow/40 ds-live-dot" : "bg-ink-4",
        )}
      />
      {label && (
        <span
          className={cn(
            "text-[10px] font-medium uppercase tracking-wider",
            active ? "text-allow" : "text-ink-4",
          )}
        >
          {label}
        </span>
      )}
    </span>
  );
}
