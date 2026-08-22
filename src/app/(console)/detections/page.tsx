import Link from "next/link";
import { Binary, Braces, Fingerprint, Radar, ShieldCheck, Sigma } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Meter } from "@/components/ui/progress";
import { MetricStrip } from "@/components/security/metric-strip";
import { BarList } from "@/components/charts/bar-charts";
import { ThreatBadge } from "@/components/security/indicators";
import { formatRelative } from "@/lib/utils/format";
import { PATTERN_FAMILIES, MITIGATIONS } from "@/lib/engine/detectors";
import { ATTACK_CORPUS, BENIGN_CORPUS } from "@/lib/engine/detectors/corpus";
import { DETECTORS } from "@/lib/engine/detectors";
import type { ThreatType } from "@/lib/engine/taxonomy";
import { trailingWindow } from "@/lib/queries/window";

export const dynamic = "force-dynamic";
export const metadata = { title: "Detection Engine" };

const LAYER_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; note: string; ceiling: string }> = {
  LEXICAL: { label: "Pattern", icon: Fingerprint, note: "Weighted behaviour families with context mitigations. Confidence is capped by the number of independent behaviours observed.", ceiling: "0.97" },
  STRUCTURAL: { label: "Structural", icon: Braces, note: "Imperative density, isolated command blocks, addressee shift. Vocabulary-independent, so novel phrasings still fire.", ceiling: "0.72" },
  SEMANTIC: { label: "Semantic", icon: Radar, note: "Character n-gram similarity to an attack corpus, scored on the margin over a benign baseline. Runs locally — no embedding service.", ceiling: "0.78" },
  BEHAVIORAL: { label: "Behavioural", icon: Sigma, note: "Welford baselines per subject; deviation measured in standard deviations against that subject's own history.", ceiling: "0.68" },
  AUTHORIZATION: { label: "Authorization", icon: ShieldCheck, note: "Grants, clearances and quarantine state. A permission fact rather than an inference.", ceiling: "1.00" },
  NORMALIZATION: { label: "Obfuscation", icon: Binary, note: "Recursive decoding of Base64, hex, ROT13, URL and HTML entities, plus homoglyph folding and zero-width stripping.", ceiling: "0.85" },
};

export default async function DetectionsPage() {
  const since = trailingWindow(7);

  const [byLayer, byDetector, byThreat, recent, total] = await Promise.all([
    prisma.detection.groupBy({
      by: ["layer"],
      where: { createdAt: { gte: since } },
      _count: true,
      _avg: { confidence: true },
    }),
    prisma.detection.groupBy({
      by: ["detectorId"],
      where: { createdAt: { gte: since } },
      _count: true,
      _avg: { confidence: true },
    }),
    prisma.detection.groupBy({
      by: ["threatType"],
      where: { createdAt: { gte: since } },
      _count: true,
    }),
    prisma.detection.findMany({
      where: { createdAt: { gte: since } },
      orderBy: [{ confidence: "desc" }, { createdAt: "desc" }],
      take: 25,
      include: {
        event: {
          select: {
            id: true, ref: true, severity: true, decision: true,
            application: { select: { name: true } },
            user: { select: { name: true } },
          },
        },
      },
    }),
    prisma.detection.count({ where: { createdAt: { gte: since } } }),
  ]);

  const layerCounts = Object.fromEntries(byLayer.map((l) => [l.layer, l._count]));
  const multiLayerEvents = await prisma.securityEvent.count({
    where: { createdAt: { gte: since }, detectionCount: { gte: 2 } },
  });

  return (
    <>
      <PageHeader
        title="Detection Engine"
        description="How threats are actually found. Five independent analysis layers, fused rather than stacked — a single detector is a lead, and confidence rises sharply only when methods that could not share a blind spot agree."
      />

      <MetricStrip
        className="mb-4"
        metrics={[
          { label: "Detections (7d)", value: total },
          {
            label: "Detectors Registered",
            value: DETECTORS.length + 3,
            hint: "Content detectors plus behavioural, authorisation and obfuscation analysis.",
          },
          {
            label: "Pattern Families",
            value: PATTERN_FAMILIES.length,
            hint: "Weighted behaviour families in the lexical layer.",
          },
          {
            label: "Multi-Layer Events",
            value: multiLayerEvents,
            hint: "Events where more than one method agreed.",
          },
        ]}
      />

      <div className="mb-4 grid gap-3 lg:grid-cols-3">
        {Object.entries(LAYER_META).map(([layer, meta]) => {
          const count = layerCounts[layer] ?? 0;
          const avg = byLayer.find((l) => l.layer === layer)?._avg.confidence ?? 0;
          const Icon = meta.icon;
          return (
            <Card key={layer} className="flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 items-center justify-center rounded-md border border-brand/25 bg-brand-dim/40">
                    <Icon className="size-4 text-brand" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-ink">{meta.label}</h3>
                    <p className="font-mono text-[10px] text-ink-4">ceiling {meta.ceiling}</p>
                  </div>
                </div>
                <span className="font-mono text-lg font-semibold tabular text-ink">{count}</span>
              </div>
              <p className="mt-2.5 text-[11px] leading-relaxed text-ink-3">{meta.note}</p>

              {/* Keep the footer slot occupied so cards in a row stay level —
                  a layer that found nothing is information, not a gap. */}
              <div className="mt-auto pt-3">
                {count > 0 ? (
                  <>
                    <div className="mb-1 flex items-baseline justify-between">
                      <span className="text-[10px] text-ink-4">Average confidence</span>
                      <span className="font-mono text-[10px] text-ink-2">{(avg * 100).toFixed(0)}%</span>
                    </div>
                    <Meter value={avg * 100} tone="brand" aria-label="Average confidence" />
                  </>
                ) : (
                  <p className="text-[10px] text-ink-4">
                    No detections from this layer in the last 7 days.
                  </p>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-3">
        <Card className="p-4">
          <BarList
            title="Most active detectors"
            subtitle="Detections raised in the last 7 days."
            data={byDetector
              .sort((a, b) => b._count - a._count)
              .slice(0, 8)
              .map((d) => ({
                label: d.detectorId.replace(/^[a-z]+\./, ""),
                value: d._count,
                meta: `${((d._avg.confidence ?? 0) * 100).toFixed(0)}% avg`,
                color: "var(--color-viz-1)",
              }))}
            maxRows={8}
          />
        </Card>

        <Card className="p-4">
          <BarList
            title="Threat types identified"
            subtitle="Across all detection layers."
            data={byThreat
              .sort((a, b) => b._count - a._count)
              .slice(0, 8)
              .map((t) => ({
                label: t.threatType.replace(/_/g, " ").toLowerCase(),
                value: t._count,
                color: "var(--color-viz-2)",
              }))}
            maxRows={8}
          />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>False-positive controls</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-[11px] leading-relaxed text-ink-3">
              Context mitigations reduce confidence when a match sits in framing that makes it
              benign. A detector that flags the security policy for describing prompt injection is
              not fit for production.
            </p>
            <ul className="space-y-1.5">
              {MITIGATIONS.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 rounded border border-line bg-surface-2/40 px-2.5 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-[11px] text-ink-2">{m.label}</span>
                  <span className="shrink-0 font-mono text-[10px] text-ink-4">×{m.factor}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-2.5">
              <div>
                <p className="font-mono text-sm font-semibold text-ink">{ATTACK_CORPUS.length}</p>
                <p className="text-[10px] text-ink-4">attack corpus entries</p>
              </div>
              <div>
                <p className="font-mono text-sm font-semibold text-ink">{BENIGN_CORPUS.length}</p>
                <p className="text-[10px] text-ink-4">benign baseline entries</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Highest-confidence detections</CardTitle>
            <p className="mt-0.5 text-xs text-ink-3">
              The strongest findings from the last 7 days.
            </p>
          </div>
          <Link href="/monitor" className="text-[11px] text-brand-text hover:underline">
            Open monitor
          </Link>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-line">
            {recent.map((d) => (
              <li key={d.id}>
                <Link href={`/monitor/${d.event.id}`} className="flex items-start gap-3 py-2.5 transition-colors hover:bg-surface-2/50">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <ThreatBadge threat={d.threatType as ThreatType} size="xs" severity={d.severity} withTooltip={false} />
                      <Badge tone="outline" size="xs">
                        {LAYER_META[d.layer]?.label ?? d.layer}
                      </Badge>
                      <span className="font-mono text-[10px] text-ink-4">
                        {(d.confidence * 100).toFixed(0)}%
                      </span>
                      <span className="text-[10px] text-ink-4">{d.event.application?.name}</span>
                      <span className="text-[10px] text-ink-4">{formatRelative(d.createdAt)}</span>
                    </span>
                    <span className="mt-1 block line-clamp-2 text-[11px] leading-relaxed text-ink-3">
                      {d.explanation}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-ink-4">{d.event.ref}</span>
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
