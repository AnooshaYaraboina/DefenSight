<div align="center">

# DefenSight

**AI Security Defense & Monitoring**

A centralised defensive layer for enterprise AI — monitoring every request,
detecting manipulation, authorising every tool call, and showing analysts
exactly where an attack was stopped.

</div>

---

## The problem

An attacker no longer needs your credentials. They need a paragraph inside a
document your assistant will read.

A firewall sees an HTTPS call. A DLP tool sees a text blob. Neither can tell
you what the model was *instructed* to do, which document did the instructing,
what the agent decided as a result, or whether the tool it just invoked was one
it was ever allowed to touch. That gap is the attack surface.

## Running it

```bash
npm install
cp .env.example .env      # generate SESSION_SECRET as the file describes
npm run setup             # migrate, seed the estate, replay 14 days of traffic
npm run dev
```

Open **http://localhost:3000** and sign in.

| Role | Account | Password |
|---|---|---|
| Security Administrator | `priya.r@northwind.example` | `DefenSight!2026` |
| Security Analyst | `marcus.a@northwind.example` | `DefenSight!2026` |
| Viewer | `daniel.o@northwind.example` | `DefenSight!2026` |

Each role sees a different console. Sign in as the viewer to watch controls
disappear.

No database server is required — SQLite, created by the setup script.
`OPENAI_API_KEY` is optional: every AI feature has a deterministic fallback, so
the platform is fully functional without one.

## Worth looking at first

1. **`/simulator` → Run full test suite.** Eight real attacks through the
   production pipeline. Not scripted — the detections, scores and decisions are
   whatever the engine concludes, and a shortfall is reported as a control gap.

2. **Any incident → Attack chain.** The full pipeline trace with a
   **ATTACK STOPPED HERE** marker on the exact stage that caught it. Expand any
   stage for the evidence recorded there.

3. **Dashboard → Start traffic.** Requests begin flowing through the real
   pipeline every few seconds; the live feed and connection state update over
   SSE.

4. **`/guardrails` → toggle a control off.** It confirms first, states what
   stops being checked, and audits the change as a failure outcome.

## What it does

| | |
|---|---|
| **Detection** | Five independent layers — pattern, structural, semantic, behavioural, authorization — fused rather than stacked. Recursive decoding of Base64, hex, ROT13, homoglyphs and zero-width concealment. |
| **RAG security** | Trust inherited from provenance and only ever reduced. Upload → Scan → Analyze → Risk Score → Allow/Quarantine. Quarantined documents are never indexed. |
| **Agent security** | Intent-versus-action divergence, grant-aware. Least-privilege findings. Per-subject behavioural baselines. |
| **Tool gateway** | Default-closed. Thirteen checks per call: grants, operations, JSON Schema validation, destructive-SQL detection, egress allowlists, rate limits, human approval. |
| **Data protection** | Validators, not just patterns — Luhn, mod-97, SSN structure, Shannon entropy. Seven monitored channels. |
| **Risk engine** | Twelve weighted factors, saturating combination. Contributions sum to the displayed score. |
| **Policy engine** | Declarative conditions evaluated as data. Order-independent: the most restrictive matched action always wins. |
| **Incidents** | Auto-opened from critical threats, seeded with the attack chain. Lifecycle enforced server-side. |
| **AI automation** | Classification, explanation, summarisation, mitigation guidance, correlation — all advisory, all with deterministic fallbacks. |

## Measured

| | |
|---|---|
| False positives | **0%** across 616 benign requests |
| Detection rate | **92.3%** across 104 attacks |
| Simulator | **8/8** scenarios defended |
| Test matrix | **19/19** cases passing |
| Unit suite | **83** tests |

The false-positive corpus deliberately includes documents that *look* like
attacks: a security policy discussing prompt injection, a runbook full of
`DROP TABLE`, phishing training that quotes attacker language. A detector that
flags those is not fit for production.

## Design commitments

**The engine is pure.** No database, no framework, no I/O — it takes a
materialised context and returns a result. Live traffic, the attack simulator
and historical replay share one code path, so simulator results are real
results.

**Order independence.** Stages contribute findings; they never decide. The
verdict is the most restrictive outcome computed once at the end. Reversing
policy order provably cannot change it. There is a test.

**Retrieved content is never instructions.** Text from a document or tool
result is judged more strictly than text the user typed, and directives found
there are withheld rather than obeyed.

**Trust only falls.** A document's ceiling is set by its provenance. Content
cannot earn credibility its origin does not justify.

**AI is advisory.** Automation runs after the verdict and cannot change a
decision, a score or a policy outcome. A missing key degrades the prose, never
the security.

## Deliverables

| | |
|---|---|
| [Architecture](docs/architecture.md) | Components, data flows, trust boundaries |
| [Threat Model](docs/threat-model.md) | 23 threats mapped to OWASP LLM Top 10 and MITRE ATLAS, with residual risk |
| [Security Design](docs/security-design.md) | Detection, guardrails, risk, RAG, agent, tool, data, incident response |
| [Test Cases](docs/test-cases.md) | Generated from real runs — regenerate with `npm run docs:tests` |

## Commands

```bash
npm run dev          # development server
npm run build        # production build
npm test             # 83 unit and integration tests
npm run setup        # migrate + seed + replay history
npm run db:seed      # estate only
npm run db:history   # replay traffic through the real pipeline
npm run db:studio    # inspect the database
npm run docs:tests   # regenerate the test matrix from live runs
```

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 · Prisma 7 + SQLite ·
Radix primitives · SSE · Vitest

Chart colours were validated against the dark surface for colour-vision
separation and contrast. A red-orange-yellow severity ramp cannot clear the
adjacent-pair floor at any stepping — those hues are neighbours — so severity
magnitude uses a single-hue ordinal ramp instead.
