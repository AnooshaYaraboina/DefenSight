import Link from "next/link";
import { Lock, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { getDataProtection } from "@/lib/queries/defense";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { StatTile } from "@/components/security/stat-tile";
import { BarList } from "@/components/charts/bar-charts";
import { DecisionBadge, SeverityBadge } from "@/components/security/indicators";
import { formatRelative } from "@/lib/utils/format";
import { CHANNEL_META, type Channel } from "@/lib/engine/taxonomy";
import { SENSITIVE_PATTERNS } from "@/lib/engine/sensitive/patterns";

export const dynamic = "force-dynamic";
export const metadata = { title: "Data Protection" };

const CATEGORY_COLOR: Record<string, string> = {
  CREDENTIAL: "var(--color-viz-block)",
  PII: "var(--color-viz-2)",
  FINANCIAL: "var(--color-viz-4)",
  CUSTOMER: "var(--color-viz-1)",
  EMPLOYEE: "var(--color-viz-6)",
  BUSINESS: "var(--color-viz-3)",
  TECHNICAL: "var(--color-viz-5)",
};

export default async function DataProtectionPage() {
  const data = await getDataProtection();

  const credentials = data.byType.filter((t) => t.category === "CREDENTIAL");
  const credentialValues = credentials.reduce((s, t) => s + t.values, 0);

  return (
    <>
      <PageHeader
        title="Sensitive Data Protection"
        description="Detection across every monitored channel — user input, retrieved context, tool arguments and model output. Each pattern pairs with a validator, because regex alone produces unusable precision on this problem."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Values Detected (7d)" value={data.totalValues} polarity="higher-is-worse" />
        <StatTile label="Credential Exposures" value={credentialValues} polarity="higher-is-worse" hint="Zero tolerance — this control has no allow path." />
        <StatTile label="Distinct Types" value={data.byType.length} />
        <StatTile label="Detectors Configured" value={SENSITIVE_PATTERNS.length} hint="Each with its own validator and masking strategy." />
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-3">
        <Card className="p-4">
          <BarList
            title="By data type"
            subtitle="Values found across all channels."
            data={data.byType.slice(0, 8).map((t) => ({
              label: t.type.replace(/_/g, " ").toLowerCase(),
              value: t.values,
              color: CATEGORY_COLOR[t.category] ?? "var(--color-viz-1)",
              meta: t.category.toLowerCase(),
            }))}
            maxRows={8}
          />
        </Card>

        <Card className="p-4">
          <BarList
            title="By channel"
            subtitle="Where sensitive data is turning up."
            data={data.byChannel.map((c) => ({
              label: CHANNEL_META[c.channel as Channel]?.label ?? c.channel,
              value: c.values,
              color: "var(--color-viz-1)",
              meta: `${c.events} events`,
            }))}
            maxRows={7}
          />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-3.5 text-brand" />
              Validators
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-[11px] leading-relaxed text-ink-3">
              Every 16-digit number is not a card and every base64 blob is not a secret. Each
              detector validates before it reports.
            </p>
            <ul className="space-y-1.5">
              {[
                { type: "Payment card", check: "Luhn checksum" },
                { type: "IBAN", check: "ISO 13616 mod-97" },
                { type: "US SSN", check: "Area, group and serial rules" },
                { type: "API key / token", check: "Shannon entropy > 3.2" },
                { type: "Password", check: "Placeholder detection" },
                { type: "Phone", check: "Length bounds and label proximity" },
              ].map((v) => (
                <li key={v.type} className="flex items-center justify-between gap-2 rounded border border-line bg-surface-2/40 px-2.5 py-1.5">
                  <span className="text-[11px] text-ink-2">{v.type}</span>
                  <span className="font-mono text-[9px] text-ink-4">{v.check}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Recent detections</CardTitle>
            <p className="mt-0.5 text-xs text-ink-3">
              Values are shown masked. The raw value never leaves the scanner.
            </p>
          </div>
          <Link href="/monitor" className="text-[11px] text-brand hover:underline">
            Open monitor
          </Link>
        </CardHeader>
        <CardContent>
          {data.hits.length === 0 ? (
            <EmptyState icon={Lock} title="No sensitive data detected in this window" />
          ) : (
            <ul className="divide-y divide-line">
              {data.hits.map((h) => (
                <li key={h.id}>
                  <Link
                    href={`/monitor/${h.event.id}`}
                    className="flex flex-wrap items-center gap-3 py-2.5 transition-colors hover:bg-surface-2/50"
                  >
                    <Lock
                      className={
                        h.category === "CREDENTIAL"
                          ? "size-3.5 shrink-0 text-critical"
                          : "size-3.5 shrink-0 text-medium"
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-medium text-ink-2">
                          {h.type.replace(/_/g, " ").toLowerCase()}
                        </span>
                        <Badge tone={h.category === "CREDENTIAL" ? "critical" : "neutral"} size="xs">
                          {h.category.toLowerCase()}
                        </Badge>
                        <span className="font-mono text-[10px] text-ink-4">×{h.count}</span>
                        <code className="rounded bg-inset px-1.5 py-0.5 font-mono text-[10px] text-ink-3">
                          {h.maskedSample}
                        </code>
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-ink-4">
                        <span>{CHANNEL_META[h.channel as Channel]?.label ?? h.channel}</span>
                        <span>{h.event.application?.name}</span>
                        <span>{h.event.user?.name}</span>
                        <span>{formatRelative(h.createdAt)}</span>
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <SeverityBadge severity={h.event.severity} size="xs" showIcon={false} withTooltip={false} />
                      <DecisionBadge decision={h.action} size="xs" withTooltip={false} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
