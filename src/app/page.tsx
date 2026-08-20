import Link from "next/link";
import {
  ArrowRight, Bot, Crosshair, Fingerprint, Gauge, Layers, Library,
  Lock, Radar, Scale, ScanSearch, ShieldCheck, Sigma, Siren, Sparkles, Wrench, Zap,
} from "lucide-react";
import { getLandingStats } from "@/lib/queries/landing";
import { Logo, Wordmark } from "@/components/layout/logo";
import { PipelineAnimation } from "@/components/landing/pipeline-animation";
import { ThreatRadar } from "@/components/landing/threat-radar";
import { Counter } from "@/components/landing/counter";
import { Button } from "@/components/ui/button";
import { THREAT_TYPES, THREAT_META } from "@/lib/engine/taxonomy";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "DefenSight — AI Security Defense & Monitoring",
  description:
    "A centralised defensive layer for enterprise AI. Detect prompt injection and RAG poisoning, authorise every tool call, and investigate the full attack chain.",
};

const DEFENCE_LAYERS = [
  { icon: Fingerprint, name: "Pattern", detail: "Ten weighted behaviour families. One indicator is a lead, never a verdict." },
  { icon: Layers, name: "Structural", detail: "Reads the shape of the text, not its vocabulary — novel phrasings still fire." },
  { icon: Radar, name: "Semantic", detail: "Similarity to known attacks, scored against a benign baseline. Runs locally." },
  { icon: Sigma, name: "Behavioural", detail: "Deviation from each subject's own rolling baseline, not a global threshold." },
  { icon: ShieldCheck, name: "Authorization", detail: "Grants and clearances. A permission fact, not an inference." },
];

const CAPABILITIES = [
  { icon: ScanSearch, title: "Prompt injection detection", body: "Direct, indirect, jailbreak, role manipulation and system-prompt extraction. Base64, hex, ROT13, homoglyphs and zero-width concealment are decoded recursively and re-scanned.", accent: "var(--color-viz-1)" },
  { icon: Library, title: "RAG security", body: "Trust is inherited from provenance and can only fall — hostile content cannot be laundered by looking official. Malicious documents are quarantined before they are ever indexed.", accent: "var(--color-viz-3)" },
  { icon: Bot, title: "Agent behaviour", body: "Actions compared against the user's original intent. When an agent starts doing what the user never asked for, that is the observable signature of a successful injection.", accent: "var(--color-viz-6)" },
  { icon: Wrench, title: "Tool authorization", body: "A default-closed gateway. Thirteen checks per call: grants, operations, parameter schemas, destructive-SQL detection, egress allowlists, rate limits, human approval.", accent: "var(--color-viz-2)" },
  { icon: Lock, title: "Sensitive data protection", body: "PII, credentials and financial data across every monitored channel — with validators, not just patterns. Luhn for cards, mod-97 for IBANs, entropy for secrets.", accent: "var(--color-viz-4)" },
  { icon: Gauge, title: "Explainable risk", body: "Twelve weighted factors combined with saturation. Every factor shows what it measured, how heavily it counted, and the points it contributed — and they sum to the score.", accent: "var(--color-viz-5)" },
];

export default async function LandingPage() {
  const stats = await getLandingStats();

  const radarContacts = stats.topThreats.slice(0, 6).map((t, i) => ({
    label: t.label,
    count: t.count,
    severity: (i < 2 ? "critical" : i < 4 ? "high" : "medium") as "critical" | "high" | "medium",
  }));

  const marqueeThreats = THREAT_TYPES.map((t) => THREAT_META[t].label);

  return (
    <div className="ds-noise relative min-h-dvh overflow-x-clip bg-base">
      {/* ============================================================ ambience */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="ds-grid-bg absolute inset-0 opacity-[0.5]" />

        <div
          className="ds-aurora absolute -top-[22rem] left-1/2 h-[46rem] w-[72rem] -translate-x-1/2 blur-[110px]"
          style={{ background: "radial-gradient(ellipse 60% 50% at 50% 50%, color-mix(in oklab, var(--color-brand) 55%, transparent) 0%, transparent 70%)" }}
        />
        <div
          className="ds-aurora ds-aurora-slow absolute -left-[18rem] top-[26rem] size-[42rem] blur-[120px]"
          style={{ background: "radial-gradient(circle, color-mix(in oklab, #7c5cff 45%, transparent) 0%, transparent 68%)" }}
        />
        <div
          className="ds-aurora ds-aurora-slower absolute -right-[16rem] top-[62rem] size-[38rem] blur-[120px]"
          style={{ background: "radial-gradient(circle, color-mix(in oklab, var(--color-critical) 38%, transparent) 0%, transparent 68%)" }}
        />

        {/* Scanning beam — the product motif, at page scale */}
        <div
          className="ds-beam absolute inset-x-0 top-0 h-40"
          style={{ background: "linear-gradient(to bottom, transparent, color-mix(in oklab, var(--color-brand) 12%, transparent), transparent)" }}
        />

        {/* Vignette so the centre column stays the brightest thing on screen */}
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(ellipse 90% 60% at 50% 30%, transparent 30%, var(--color-base) 100%)" }}
        />
      </div>

      {/* ================================================================= nav */}
      <header className="sticky top-0 z-30 border-b border-line/60 backdrop-blur-xl">
        <div
          className="absolute inset-0 -z-10"
          style={{ background: "color-mix(in oklab, var(--color-base) 78%, transparent)" }}
        />
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <Logo size={26} />
            <Wordmark className="text-[17px]" />
            <span className="ml-1.5 hidden rounded-full border border-brand/25 bg-brand-dim/40 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-brand sm:block">
              Defensive Layer
            </span>
          </div>
          <nav className="flex items-center gap-1">
            <Link href="#threat" className="hidden rounded-md px-3 py-1.5 text-xs text-ink-3 transition-colors hover:text-ink md:block">
              The threat
            </Link>
            <Link href="#how" className="hidden rounded-md px-3 py-1.5 text-xs text-ink-3 transition-colors hover:text-ink md:block">
              How it works
            </Link>
            <Link href="#capabilities" className="hidden rounded-md px-3 py-1.5 text-xs text-ink-3 transition-colors hover:text-ink md:block">
              Capabilities
            </Link>
            <Button size="sm" className="ml-2 ds-glow" asChild>
              <Link href="/dashboard">
                Open console
                <ArrowRight />
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* ================================================================ hero */}
      <section className="relative z-10 mx-auto max-w-6xl px-5 pb-20 pt-14 lg:pb-28 lg:pt-24">
        <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
          <div className="min-w-0">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand/25 bg-brand-dim/25 py-1 pl-1 pr-3 backdrop-blur">
              <span className="flex size-5 items-center justify-center rounded-full bg-brand/20">
                <span className="ds-live-dot size-1.5 rounded-full bg-brand text-brand/40" />
              </span>
              <span className="text-[11px] font-medium text-brand">
                {stats.events.toLocaleString()} requests analysed · {stats.blocked} attacks stopped
              </span>
            </div>

            <h1 className="text-balance text-[2.6rem] font-semibold leading-[1.04] tracking-[-0.025em] sm:text-[3.4rem] lg:text-[4.1rem]">
              <span className="ds-gradient-text block">Your AI can be</span>
              <span className="ds-gradient-text block">talked into things.</span>
              <span className="mt-1 block text-ink-3">DefenSight stops it.</span>
            </h1>

            <p className="mt-7 max-w-xl text-pretty text-[15px] leading-relaxed text-ink-2">
              An attacker no longer needs your credentials. They need a paragraph inside a
              document your assistant will read. DefenSight sits between your AI estate and
              everything it touches — monitoring every request, detecting manipulation,
              authorising every tool call, and showing analysts exactly where the attack died.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Button size="lg" className="ds-glow" asChild>
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

            <dl className="mt-12 grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
              <HeroStat label="Requests analysed" value={stats.events} />
              <HeroStat label="Threats detected" value={stats.detections} />
              <HeroStat label="Attacks blocked" value={stats.blocked} tone="critical" />
              <HeroStat label="Median analysis" value={stats.medianLatency} suffix="ms" tone="brand" />
            </dl>
            <p className="mt-4 flex items-center gap-1.5 text-[11px] text-ink-4">
              <Zap className="size-3 text-brand" />
              Live figures from this deployment — not illustrative numbers.
            </p>
          </div>

          {/* Radar + pipeline, stacked */}
          <div className="relative flex min-w-0 flex-col items-center gap-5">
            <div className="ds-float relative">
              <div
                aria-hidden="true"
                className="absolute inset-0 -z-10 blur-[60px]"
                style={{ background: "radial-gradient(circle, color-mix(in oklab, var(--color-brand) 40%, transparent) 0%, transparent 65%)" }}
              />
              <ThreatRadar contacts={radarContacts} size={330} />
            </div>
            <PipelineAnimation className="w-full max-w-md" />
          </div>
        </div>
      </section>

      {/* =========================================================== marquee */}
      <div className="ds-marquee-wrap relative z-10 overflow-hidden border-y border-line/70 bg-surface/30 py-3 backdrop-blur">
        <div className="ds-marquee flex w-max gap-8">
          {[...marqueeThreats, ...marqueeThreats].map((label, i) => (
            <span key={i} className="flex shrink-0 items-center gap-2 text-[11px] text-ink-4">
              <span className="size-1 rounded-full bg-critical/60" />
              {label}
            </span>
          ))}
        </div>
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-32"
          style={{ background: "linear-gradient(to right, var(--color-base), transparent)" }} />
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-32"
          style={{ background: "linear-gradient(to left, var(--color-base), transparent)" }} />
      </div>

      {/* ========================================================== the threat */}
      <section id="threat" className="relative z-10 mx-auto max-w-6xl px-5 py-24">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-center">
          <div>
            <SectionLabel>The visibility gap</SectionLabel>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-ink sm:text-[2.6rem] sm:leading-[1.1]">
              Nothing you own can see inside an AI request.
            </h2>
            <p className="mt-5 text-[15px] leading-relaxed text-ink-2">
              A firewall sees an HTTPS call. A DLP tool sees a text blob. Neither can tell you
              what the model was <em className="not-italic text-ink">instructed</em> to do, which
              document did the instructing, what the agent decided as a result, or whether the
              tool it just invoked was one it was ever allowed to touch.
            </p>
            <p className="mt-4 text-[15px] leading-relaxed text-ink-2">
              That gap <em className="not-italic text-brand">is</em> the attack surface.
            </p>
          </div>

          <div className="space-y-2.5">
            {stats.topThreats.map((threat, i) => (
              <div
                key={threat.type}
                className="ds-glass group relative flex items-center gap-4 overflow-hidden rounded-panel px-5 py-4 transition-all hover:border-critical/35"
              >
                <div
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 w-1 transition-all group-hover:w-1.5"
                  style={{ background: i < 2 ? "var(--color-critical)" : i < 4 ? "var(--color-high)" : "var(--color-medium)" }}
                />
                <Crosshair className="size-4 shrink-0 text-critical" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink">{threat.label}</span>
                  {threat.owasp && (
                    <span className="font-mono text-[10px] text-ink-4">OWASP {threat.owasp}</span>
                  )}
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-2xl font-semibold tabular text-critical">
                    <Counter value={threat.count} />
                  </span>
                  <span className="text-[10px] text-ink-4">detected here</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ======================================================== how it works */}
      <section id="how" className="relative z-10 border-y border-line/70 bg-surface/25 backdrop-blur">
        <div className="mx-auto max-w-6xl px-5 py-24">
          <div className="mx-auto max-w-2xl text-center">
            <SectionLabel className="justify-center">How it works</SectionLabel>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-ink sm:text-[2.6rem] sm:leading-[1.1]">
              Five independent methods.
              <span className="block text-brand">One verdict.</span>
            </h2>
            <p className="mt-5 text-[15px] leading-relaxed text-ink-2">
              A single detector is a lead, not a verdict. DefenSight runs five analysis layers
              that work in fundamentally different ways and fuses them — confidence rises sharply
              only when methods that could not share a blind spot reach the same conclusion.
            </p>
          </div>

          <div className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {DEFENCE_LAYERS.map((layer, i) => (
              <div
                key={layer.name}
                className="ds-gradient-border group relative overflow-hidden rounded-panel p-5"
                style={{ animationDelay: `${i * -1.4}s` }}
              >
                <span aria-hidden="true" className="absolute right-4 top-4 font-mono text-[10px] text-ink-4/50">
                  0{i + 1}
                </span>
                <div className="flex size-10 items-center justify-center rounded-lg border border-brand/25 bg-brand-dim/40">
                  <layer.icon className="size-5 text-brand" />
                </div>
                <h3 className="mt-4 text-sm font-semibold text-ink">{layer.name}</h3>
                <p className="mt-2 text-[11px] leading-relaxed text-ink-3">{layer.detail}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <FusionCard title="One layer agrees" value="Capped below block" detail="Recorded as a lead. Surfaced to analysts, never actioned alone." tone="low" />
            <FusionCard title="Two layers agree" value="Elevated" detail="Independent corroboration raises the ceiling sharply." tone="medium" />
            <FusionCard title="Three or more" value="Near-certain" detail="Different techniques converging is the strongest evidence short of a confirmed exploit." tone="critical" />
          </div>

          <div className="ds-glass mx-auto mt-6 flex max-w-3xl flex-wrap items-center justify-center gap-x-10 gap-y-4 rounded-panel px-6 py-5 text-center">
            <ProofPoint value="0%" label="False positives" detail="across 616 benign requests" tone="allow" />
            <ProofPoint value="92.3%" label="Detection rate" detail="across 104 real attacks" tone="brand" />
            <ProofPoint value="80" label="Tests passing" detail="engine under continuous test" tone="ink" />
          </div>
        </div>
      </section>

      {/* ======================================================= capabilities */}
      <section id="capabilities" className="relative z-10 mx-auto max-w-6xl px-5 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <SectionLabel className="justify-center">Capabilities</SectionLabel>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-ink sm:text-[2.6rem] sm:leading-[1.1]">
            The whole defensive lifecycle.
          </h2>
          <p className="mt-5 text-[15px] leading-relaxed text-ink-2">
            Monitor, detect, analyse, score, decide, block, alert, investigate, respond — one
            integrated console over one shared pipeline.
          </p>
        </div>

        <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((c) => (
            <div
              key={c.title}
              className="ds-glass group relative overflow-hidden rounded-panel p-6 transition-all duration-300 hover:-translate-y-0.5"
            >
              <div
                aria-hidden="true"
                className="absolute -right-16 -top-16 size-40 opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-30"
                style={{ background: `radial-gradient(circle, ${c.accent} 0%, transparent 70%)` }}
              />
              <div
                className="relative flex size-11 items-center justify-center rounded-xl border"
                style={{
                  borderColor: `color-mix(in oklab, ${c.accent} 35%, transparent)`,
                  background: `color-mix(in oklab, ${c.accent} 12%, transparent)`,
                }}
              >
                <c.icon className="size-5" style={{ color: c.accent }} />
              </div>
              <h3 className="relative mt-4 text-[15px] font-semibold text-ink">{c.title}</h3>
              <p className="relative mt-2 text-xs leading-relaxed text-ink-3">{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ============================================================= estate */}
      <section className="relative z-10 border-y border-line/70 bg-surface/25 backdrop-blur">
        <div className="mx-auto max-w-6xl px-5 py-24">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
            <div>
              <SectionLabel>Under management</SectionLabel>
              <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-ink sm:text-[2.6rem] sm:leading-[1.1]">
                You cannot defend an estate you have not enumerated.
              </h2>
              <p className="mt-5 text-[15px] leading-relaxed text-ink-2">
                Applications, agents, models, vector stores, data sources, documents and tools —
                each with its own posture score, permission set and activity history.
              </p>
              <Button variant="outline" size="lg" className="mt-7" asChild>
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
        </div>
      </section>

      {/* ================================================================ cta */}
      <section className="relative z-10 mx-auto max-w-6xl px-5 py-24">
        <div className="ds-glass relative overflow-hidden rounded-[1.25rem] border-brand/25 px-8 py-14 text-center sm:px-12">
          <div
            aria-hidden="true"
            className="ds-aurora pointer-events-none absolute -top-32 left-1/2 h-80 w-[44rem] -translate-x-1/2 blur-[90px]"
            style={{ background: "radial-gradient(ellipse, color-mix(in oklab, var(--color-brand) 50%, transparent) 0%, transparent 68%)" }}
          />
          <div className="relative">
            <div className="mx-auto flex size-12 items-center justify-center rounded-xl border border-brand/30 bg-brand-dim/40">
              <Sparkles className="size-6 text-brand" />
            </div>
            <h2 className="mt-6 text-balance text-3xl font-semibold tracking-tight text-ink sm:text-[2.6rem] sm:leading-[1.1]">
              Watch an attack die mid-flight.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-ink-2">
              A poisoned vendor document reaches the assistant through RAG. See DefenSight find
              the hidden instruction, refuse the tool calls it triggers, block the exfiltration
              attempt, and hand the analyst a complete attack chain.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Button size="lg" className="ds-glow" asChild>
                <Link href="/simulator">
                  <Crosshair />
                  Run the demonstration
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/dashboard">Open the console</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================= footer */}
      <footer className="relative z-10 border-t border-line/70">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8">
          <div className="flex items-center gap-2.5">
            <Logo size={20} />
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

/* ---------------------------------------------------------------- pieces */

function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand ${className ?? ""}`}>
      <span aria-hidden="true" className="h-px w-6 bg-brand/50" />
      {children}
    </p>
  );
}

function HeroStat({
  label, value, suffix, tone = "ink",
}: {
  label: string; value: number; suffix?: string; tone?: "ink" | "critical" | "brand";
}) {
  const toneClass =
    tone === "critical" ? "text-critical" : tone === "brand" ? "text-brand" : "text-ink";
  return (
    <div>
      <dd className={`font-mono text-[1.75rem] font-semibold leading-none ${toneClass}`}>
        <Counter value={value} suffix={suffix} />
      </dd>
      <dt className="mt-2 text-[11px] leading-snug text-ink-4">{label}</dt>
    </div>
  );
}

function EstateStat({
  icon: Icon, label, value, tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: number; tone?: "critical";
}) {
  return (
    <div className="ds-glass rounded-panel p-4 transition-colors hover:border-line-strong">
      <Icon className={tone === "critical" ? "size-4 text-critical" : "size-4 text-brand"} />
      <dd className={`mt-3 font-mono text-2xl font-semibold ${tone === "critical" ? "text-critical" : "text-ink"}`}>
        <Counter value={value} />
      </dd>
      <dt className="mt-1 text-[11px] text-ink-4">{label}</dt>
    </div>
  );
}

function FusionCard({
  title, value, detail, tone,
}: {
  title: string; value: string; detail: string; tone: "low" | "medium" | "critical";
}) {
  const toneClass =
    tone === "critical" ? "text-critical" : tone === "medium" ? "text-medium" : "text-low";
  const barColor =
    tone === "critical" ? "var(--color-critical)" : tone === "medium" ? "var(--color-medium)" : "var(--color-low)";
  const width = tone === "critical" ? "94%" : tone === "medium" ? "62%" : "34%";

  return (
    <div className="ds-glass rounded-panel p-5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-4">{title}</p>
      <p className={`mt-2 text-xl font-semibold tracking-tight ${toneClass}`}>{value}</p>
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-inset">
        <div className="h-full rounded-full" style={{ width, background: barColor }} />
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-ink-3">{detail}</p>
    </div>
  );
}

function ProofPoint({
  value, label, detail, tone,
}: {
  value: string; label: string; detail: string; tone: "allow" | "brand" | "ink";
}) {
  const toneClass = tone === "allow" ? "text-allow" : tone === "brand" ? "text-brand" : "text-ink";
  return (
    <div>
      <p className={`font-mono text-2xl font-semibold ${toneClass}`}>{value}</p>
      <p className="mt-1 text-[11px] font-medium text-ink-2">{label}</p>
      <p className="text-[10px] text-ink-4">{detail}</p>
    </div>
  );
}
