import Link from "next/link";
import {
  ArrowRight, Bot, Crosshair, Fingerprint, Gauge, GitBranch, Layers, Library,
  Lock, Radar, Scale, ScanSearch, ShieldCheck, Sigma, Siren, Sparkles, Wrench,
} from "lucide-react";
import { getLandingStats } from "@/lib/queries/landing";
import { Logo, Wordmark } from "@/components/layout/logo";
import { PipelineAnimation } from "@/components/landing/pipeline-animation";
import { Counter } from "@/components/landing/counter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "DefenSight — AI Security Defense & Monitoring",
  description:
    "A centralised defensive layer for enterprise AI. Detect prompt injection and RAG poisoning, authorise every tool call, and investigate the full attack chain.",
};

const DEFENCE_LAYERS = [
  { icon: Fingerprint, name: "Pattern", detail: "Ten weighted behaviour families. Confidence is capped until independent behaviours corroborate." },
  { icon: Layers, name: "Structural", detail: "Reads the shape of the text, not its vocabulary — so novel phrasings still fire." },
  { icon: Radar, name: "Semantic", detail: "Similarity to known attacks, scored against a benign baseline. Runs locally." },
  { icon: Sigma, name: "Behavioural", detail: "Deviation measured against each subject's own rolling baseline, not a global threshold." },
  { icon: ShieldCheck, name: "Authorization", detail: "Grants and clearances. A permission fact, not an inference." },
];

const CAPABILITIES = [
  { icon: ScanSearch, title: "Prompt injection detection", body: "Direct, indirect, jailbreak, role manipulation, system-prompt extraction and encoded payloads. Base64, hex, ROT13, homoglyphs and zero-width concealment are decoded recursively and re-scanned." },
  { icon: Library, title: "RAG security", body: "Every document scored for trust from its provenance. Trust can only fall, never rise — so hostile content cannot be laundered by looking official. Malicious documents are quarantined before indexing." },
  { icon: Bot, title: "Agent behaviour", body: "Agent actions compared against the user's original intent. When an agent starts doing what the user never asked for, that is the observable signature of a successful injection." },
  { icon: Wrench, title: "Tool authorization", body: "A default-closed gateway. Thirteen checks per call: grants, operations, parameter schemas, destructive-SQL detection, egress allowlists, rate limits and human approval for high-impact actions." },
  { icon: Lock, title: "Sensitive data protection", body: "PII, credentials and financial data detected across every monitored channel — with validators, not just patterns. Luhn for cards, mod-97 for IBANs, entropy for secrets." },
  { icon: Gauge, title: "Explainable risk", body: "Twelve weighted factors combined with saturation. Every factor shows what it measured, how heavily it counted, and the points it contributed — and they sum to the score." },
];

export default async function LandingPage() {
  const stats = await getLandingStats();

  return (
    <div className="relative min-h-dvh overflow-hidden bg-base">
      {/* Ambient depth */}
      <div aria-hidden="true" className="ds-grid-bg pointer-events-none fixed inset-0 opacity-[0.4]" />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -top-40 left-1/2 h-[36rem] w-[56rem] -translate-x-1/2 opacity-25 blur-[100px]"
        style={{ background: "radial-gradient(ellipse, var(--color-brand) 0%, transparent 65%)" }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -right-32 top-1/3 size-96 opacity-[0.12] blur-[90px]"
        style={{ background: "radial-gradient(circle, var(--color-critical) 0%, transparent 70%)" }}
      />

      {/* ------------------------------------------------------------- nav */}
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2.5">
          <Logo size={24} />
          <Wordmark className="text-base" />
        </div>
        <nav className="flex items-center gap-2">
          <Link
            href="#how"
            className="hidden rounded-md px-3 py-1.5 text-xs text-ink-3 transition-colors hover:text-ink sm:block"
          >
            How it works
          </Link>
          <Link
            href="#capabilities"
            className="hidden rounded-md px-3 py-1.5 text-xs text-ink-3 transition-colors hover:text-ink sm:block"
          >
            Capabilities
          </Link>
          <Button size="sm" asChild>
            <Link href="/dashboard">
              Open console
              <ArrowRight />
            </Link>
          </Button>
        </nav>
      </header>

      {/* ------------------------------------------------------------ hero */}
      <section className="relative z-10 mx-auto max-w-6xl px-5 pb-16 pt-10 lg:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <div className="min-w-0">
            <Badge tone="brand" size="md" className="mb-5">
              <ShieldCheck />
              Defensive layer for enterprise AI
            </Badge>

            <h1 className="text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-ink sm:text-5xl lg:text-[3.4rem]">
              Your AI can be talked into things.
              <span className="block text-ink-3">DefenSight is what stops it.</span>
            </h1>

            <p className="mt-5 max-w-xl text-pretty text-sm leading-relaxed text-ink-2 sm:text-base">
              An attacker doesn&apos;t need your credentials any more — they need a paragraph
              in a document your assistant will read. DefenSight sits between your AI estate
              and everything it touches: monitoring every request, detecting manipulation,
              authorising every tool call, and showing your analysts exactly how the attack
              was stopped.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button size="lg" asChild>
                <Link href="/dashboard">
                  Open the console
                  <ArrowRight />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/simulator">
                  <Crosshair />
                  Run an attack simulation
                </Link>
              </Button>
            </div>

            {/* Live figures from the running engine */}
            <dl className="mt-9 grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4">
              <HeroStat label="Requests analysed" value={stats.events} />
              <HeroStat label="Threats detected" value={stats.detections} />
              <HeroStat label="Attacks blocked" value={stats.blocked} tone="critical" />
              <HeroStat label="Median analysis" value={stats.medianLatency} suffix="ms" tone="brand" />
            </dl>
            <p className="mt-3 text-[11px] text-ink-4">
              Live figures from this deployment — not illustrative numbers.
            </p>
          </div>

          <PipelineAnimation className="min-w-0" />
        </div>
      </section>

      {/* ------------------------------------------------------- the problem */}
      <section className="relative z-10 border-y border-line bg-surface/40 backdrop-blur">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-brand">
                The gap
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                Traditional security cannot see inside an AI request.
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-ink-2">
                A firewall sees an HTTPS call. A DLP tool sees a text blob. Neither can tell
                you what the model was <em className="not-italic text-ink">instructed</em> to
                do, which document did the instructing, what the agent decided as a result, or
                whether the tool it just invoked was one it was ever allowed to touch.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink-2">
                That visibility gap is the entire attack surface.
              </p>
            </div>

            <div className="space-y-2.5">
              {stats.topThreats.map((threat) => (
                <div
                  key={threat.type}
                  className="flex items-center gap-3 rounded-panel border border-line bg-surface px-4 py-3"
                >
                  <Crosshair className="size-4 shrink-0 text-critical" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink">{threat.label}</span>
                    {threat.owasp && (
                      <span className="font-mono text-[10px] text-ink-4">
                        OWASP {threat.owasp}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-mono text-lg font-semibold tabular text-critical">
                      <Counter value={threat.count} />
                    </span>
                    <span className="text-[10px] text-ink-4">detected</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- how it works */}
      <section id="how" className="relative z-10 mx-auto max-w-6xl px-5 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-brand">
            How it works
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Five independent methods. One verdict.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-ink-2">
            A single detector is a lead, not a verdict. DefenSight runs five independent
            analysis layers and fuses them — confidence rises sharply only when methods that
            work differently reach the same conclusion. That is what keeps false positives at
            zero across ordinary business traffic while still catching paraphrased attacks no
            pattern list contains.
          </p>
        </div>

        <div className="mt-10 grid gap-3 md:grid-cols-3 lg:grid-cols-5">
          {DEFENCE_LAYERS.map((layer, i) => (
            <div
              key={layer.name}
              className="group relative overflow-hidden rounded-panel border border-line bg-surface p-4 transition-colors hover:border-brand/40"
            >
              <span
                aria-hidden="true"
                className="absolute right-3 top-3 font-mono text-[10px] text-ink-4/60"
              >
                0{i + 1}
              </span>
              <layer.icon className="size-5 text-brand" />
              <h3 className="mt-3 text-sm font-medium text-ink">{layer.name}</h3>
              <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">{layer.detail}</p>
            </div>
          ))}
        </div>

        {/* Fusion explainer */}
        <div className="mt-6 overflow-hidden rounded-panel border border-line bg-surface">
          <div className="grid divide-y divide-line lg:grid-cols-3 lg:divide-x lg:divide-y-0">
            <FusionCell
              title="One layer agrees"
              value="Capped below block"
              detail="Recorded as a lead. Surfaced to analysts, never actioned alone."
              tone="low"
            />
            <FusionCell
              title="Two layers agree"
              value="Elevated"
              detail="Independent corroboration raises the ceiling sharply."
              tone="medium"
            />
            <FusionCell
              title="Three or more agree"
              value="Near-certain"
              detail="Different techniques converging is the strongest evidence short of a confirmed exploit."
              tone="critical"
            />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- capabilities */}
      <section
        id="capabilities"
        className="relative z-10 border-y border-line bg-surface/40 backdrop-blur"
      >
        <div className="mx-auto max-w-6xl px-5 py-16">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-brand">
              Capabilities
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              The whole defensive lifecycle.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-ink-2">
              Monitor, detect, analyse, score, decide, block, alert, investigate, respond — in
              one integrated console, over one shared pipeline.
            </p>
          </div>

          <div className="mt-10 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((c) => (
              <div
                key={c.title}
                className="rounded-panel border border-line bg-surface p-5 transition-colors hover:border-line-strong"
              >
                <div className="flex size-9 items-center justify-center rounded-md border border-brand/25 bg-brand-dim/40">
                  <c.icon className="size-4 text-brand" />
                </div>
                <h3 className="mt-3.5 text-sm font-semibold text-ink">{c.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-3">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- estate */}
      <section className="relative z-10 mx-auto max-w-6xl px-5 py-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-brand">
              Under management
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Everything your AI touches, in one inventory.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-ink-2">
              Applications, agents, models, vector stores, data sources, documents and tools —
              each with its own posture score, permission set and activity history. You cannot
              defend an estate you have not enumerated.
            </p>
            <Button variant="outline" size="sm" className="mt-6" asChild>
              <Link href="/applications">
                Browse the estate
                <ArrowRight />
              </Link>
            </Button>
          </div>

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <EstateStat icon={Bot} label="AI agents" value={stats.agents} />
            <EstateStat icon={Wrench} label="Registered tools" value={stats.tools} />
            <EstateStat icon={Library} label="Documents indexed" value={stats.documents} />
            <EstateStat icon={Siren} label="Incidents opened" value={stats.incidents} tone="critical" />
            <EstateStat icon={Lock} label="Quarantined" value={stats.quarantined} tone="critical" />
            <EstateStat icon={Scale} label="Policies enforced" value={18} />
          </dl>
        </div>
      </section>

      {/* -------------------------------------------------------------- cta */}
      <section className="relative z-10 border-t border-line">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <div className="relative overflow-hidden rounded-panel border border-brand/25 bg-surface p-8 text-center sm:p-12">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-20"
              style={{
                background:
                  "radial-gradient(ellipse at 50% 0%, var(--color-brand) 0%, transparent 60%)",
              }}
            />
            <div className="relative">
              <GitBranch className="mx-auto size-6 text-brand" />
              <h2 className="mt-4 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                See an attack stopped end to end.
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-ink-2">
                A poisoned vendor document reaches the assistant through RAG. Watch DefenSight
                detect the hidden instruction, refuse the tool calls it triggers, block the
                exfiltration attempt, and reconstruct the full attack chain for the analyst.
              </p>
              <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                <Button size="lg" asChild>
                  <Link href="/simulator">
                    <Sparkles />
                    Run the demonstration
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/dashboard">Open the console</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- footer */}
      <footer className="relative z-10 border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-6">
          <div className="flex items-center gap-2.5">
            <Logo size={18} />
            <span className="text-[11px] text-ink-4">
              DefenSight — AI Security Defense &amp; Monitoring
            </span>
          </div>
          <p className="text-[11px] text-ink-4">
            Detection maps to OWASP Top 10 for LLM Applications and MITRE ATLAS.
          </p>
        </div>
      </footer>
    </div>
  );
}

function HeroStat({
  label,
  value,
  suffix,
  tone = "ink",
}: {
  label: string;
  value: number;
  suffix?: string;
  tone?: "ink" | "critical" | "brand";
}) {
  return (
    <div>
      <dd
        className={
          tone === "critical"
            ? "font-mono text-2xl font-semibold text-critical"
            : tone === "brand"
              ? "font-mono text-2xl font-semibold text-brand"
              : "font-mono text-2xl font-semibold text-ink"
        }
      >
        <Counter value={value} suffix={suffix} />
      </dd>
      <dt className="mt-1 text-[11px] text-ink-4">{label}</dt>
    </div>
  );
}

function EstateStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone?: "critical";
}) {
  return (
    <div className="rounded-panel border border-line bg-surface p-4">
      <Icon className={tone === "critical" ? "size-4 text-critical" : "size-4 text-ink-4"} />
      <dd
        className={
          tone === "critical"
            ? "mt-2.5 font-mono text-xl font-semibold text-critical"
            : "mt-2.5 font-mono text-xl font-semibold text-ink"
        }
      >
        <Counter value={value} />
      </dd>
      <dt className="mt-0.5 text-[11px] text-ink-4">{label}</dt>
    </div>
  );
}

function FusionCell({
  title,
  value,
  detail,
  tone,
}: {
  title: string;
  value: string;
  detail: string;
  tone: "low" | "medium" | "critical";
}) {
  const toneClass =
    tone === "critical" ? "text-critical" : tone === "medium" ? "text-medium" : "text-low";
  return (
    <div className="p-5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-4">{title}</p>
      <p className={`mt-1.5 text-lg font-semibold tracking-tight ${toneClass}`}>{value}</p>
      <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">{detail}</p>
    </div>
  );
}
