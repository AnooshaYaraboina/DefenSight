"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, ArrowUpFromLine, Info } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tooltip } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DECISIONS, DECISION_META, type Decision } from "@/lib/engine/taxonomy";

export interface GuardrailRow {
  id: string;
  key: string;
  name: string;
  description: string;
  direction: "INPUT" | "OUTPUT";
  controlType: string;
  enabled: boolean;
  threshold: number;
  action: Decision;
  hitCount: number;
  config: Record<string, unknown>;
}

/**
 * A single configurable guardrail (§13).
 *
 * Disabling a control confirms first and says plainly what stops being checked.
 * A security console should make weakening a defence feel like the deliberate
 * act it is.
 */
export function GuardrailCard({
  guardrail,
  detections,
}: {
  guardrail: GuardrailRow;
  detections: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [confirmDisable, setConfirmDisable] = React.useState(false);
  const [threshold, setThreshold] = React.useState(guardrail.threshold);

  async function patch(body: Record<string, unknown>, message: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/guardrails", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: guardrail.key, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      toast.success(message);
      router.refresh();
    } catch (error) {
      toast.error("Could not update guardrail", {
        description: error instanceof Error ? error.message : undefined,
      });
      setThreshold(guardrail.threshold);
    } finally {
      setBusy(false);
    }
  }

  const detectorList = Array.isArray(guardrail.config.detectors)
    ? (guardrail.config.detectors as string[])
    : null;
  const typeList = Array.isArray(guardrail.config.types)
    ? (guardrail.config.types as string[])
    : null;

  return (
    <>
      <div
        className={cn(
          "rounded-panel border p-4 transition-colors",
          guardrail.enabled ? "border-line bg-surface" : "border-line/60 bg-surface/50",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Tooltip content={guardrail.direction === "INPUT" ? "Screens content before it reaches the model." : "Screens the response before it reaches the user."}>
                <Badge tone={guardrail.direction === "INPUT" ? "brand" : "redact"} size="xs">
                  {guardrail.direction === "INPUT" ? <ArrowDownToLine /> : <ArrowUpFromLine />}
                  {guardrail.direction}
                </Badge>
              </Tooltip>
              <h3 className={cn("text-sm font-medium", guardrail.enabled ? "text-ink" : "text-ink-3")}>
                {guardrail.name}
              </h3>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">{guardrail.description}</p>
          </div>

          <Switch
            checked={guardrail.enabled}
            disabled={busy}
            onCheckedChange={(checked) => {
              if (!checked) setConfirmDisable(true);
              else patch({ enabled: true }, `${guardrail.name} enabled`);
            }}
            aria-label={`${guardrail.enabled ? "Disable" : "Enable"} ${guardrail.name}`}
          />
        </div>

        {!guardrail.enabled && (
          <p className="mt-3 rounded border border-critical/30 bg-critical-dim/25 px-2.5 py-1.5 text-[11px] text-critical">
            This control is disabled. Nothing it screens for is being checked.
          </p>
        )}

        <div className={cn("mt-4 grid gap-3 sm:grid-cols-2", !guardrail.enabled && "opacity-50")}>
          <div>
            <label htmlFor={`th-${guardrail.key}`} className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-4">
              Confidence threshold
              <Tooltip content="The fused detection confidence at or above which this control acts. Lower is more sensitive.">
                <Info className="size-3" />
              </Tooltip>
            </label>
            <div className="flex items-center gap-2.5">
              <input
                id={`th-${guardrail.key}`}
                type="range"
                min={0}
                max={100}
                step={5}
                value={threshold}
                disabled={busy || !guardrail.enabled}
                onChange={(e) => setThreshold(Number(e.target.value))}
                onPointerUp={() => {
                  if (threshold !== guardrail.threshold) {
                    patch({ threshold }, `${guardrail.name} threshold set to ${threshold}%`);
                  }
                }}
                className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-inset accent-[var(--color-brand)]"
              />
              <span className="w-9 shrink-0 text-right font-mono text-[11px] tabular text-ink-2">
                {threshold}%
              </span>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-ink-4">
              Action on trigger
            </label>
            <Select
              value={guardrail.action}
              disabled={busy || !guardrail.enabled}
              onValueChange={(v) => patch({ action: v }, `${guardrail.name} now ${v.toLowerCase().replace(/_/g, " ")}s`)}
            >
              <SelectTrigger size="sm">
                <SelectValue>{DECISION_META[guardrail.action].label}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {DECISIONS.filter((d) => d !== "ALLOW").map((d) => (
                  <SelectItem key={d} value={d}>{DECISION_META[d].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-2.5">
          <Badge tone="outline" size="xs">{guardrail.controlType.toLowerCase().replace(/_/g, " ")}</Badge>
          {detectorList?.slice(0, 2).map((d) => (
            <span key={d} className="rounded bg-inset px-1.5 py-0.5 font-mono text-[9px] text-ink-4">{d}</span>
          ))}
          {typeList && (
            <Tooltip content={typeList.join(", ").toLowerCase().replace(/_/g, " ")}>
              <span className="rounded bg-inset px-1.5 py-0.5 font-mono text-[9px] text-ink-4">
                {typeList.length} data types
              </span>
            </Tooltip>
          )}
          {/* Two different numbers, and the gap between them is the point: a
              control can be in scope for plenty and have acted on none of it,
              which is what a threshold set too high looks like.

              Both windows are stated because they differ. Scope is a trailing
              seven days; the fire count runs from whenever the control was last
              reset. Without the labels a control that has been busy for a
              fortnight shows more actions than scope and reads as a bug. */}
          <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] text-ink-4">
            <Tooltip content="Detections this control is responsible for, over the last 7 days.">
              <span>{detections} in scope · 7d</span>
            </Tooltip>
            <span aria-hidden="true">|</span>
            <Tooltip
              content={
                guardrail.hitCount > 0
                  ? "Requests this control has acted on, counted since it was last reset."
                  : "This control has never acted on a request."
              }
            >
              <span className={cn(guardrail.hitCount > 0 && "text-ink-3")}>
                {guardrail.hitCount} acted · all time
              </span>
            </Tooltip>
          </span>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDisable}
        onOpenChange={setConfirmDisable}
        destructive
        title={`Disable ${guardrail.name}?`}
        confirmLabel="Disable control"
        onConfirm={() => patch({ enabled: false }, `${guardrail.name} disabled`)}
        description={
          <>
            <p>{guardrail.description}</p>
            <p className="mt-2">
              While disabled, nothing this control screens for is checked on{" "}
              {guardrail.direction === "INPUT" ? "inbound content" : "responses"}. Requests that
              would have been {guardrail.action.toLowerCase().replace(/_/g, " ")}ed will pass.
            </p>
            <p className="mt-2 text-ink-3">This change is recorded in the audit log under your name.</p>
          </>
        }
      />
    </>
  );
}
