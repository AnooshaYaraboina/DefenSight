# Capability Reference

What every factor in DefenSight is, what it does, and when you would reach for
it. The other documents cover how the system is built (`architecture.md`), what
it defends against (`threat-model.md`) and why the controls are designed the way
they are (`security-design.md`). This one is the operator's index: you are
looking at something on screen and want to know what it means and what to do
about it.

Counts and figures here were read out of the running system, not from memory.
Section 10 records what is **not** currently demonstrable, because a reference
that only lists what works is a brochure.

---

## 1. The war room — the five things on the dashboard

The dashboard shows exactly five things. Everything else lives on its own screen.

| Factor | What it is | How it is derived | What you do with it |
|---|---|---|---|
| **Posture** | One score, 0–100, for the estate's health | `100 − blockedRate×34 − criticalRate×46 − (avgRisk/100)×20` over the window | A glance-level trend. A fall of more than a few points week-on-week is worth explaining |
| **Threat level** | LOW / GUARDED / ELEVATED / SEVERE | Open criticals first, then critical rate, then blocked share | Decides whether today is normal. Deliberately not volume-driven — a busy quiet day should not read as severe |
| **Estate map** | Live topology: ingress → applications → agents → tool surface | Real relations (`Agent.applicationId`, `ToolGrant`); packets are real requests | Watch where traffic goes and, more importantly, *where it stops*. A detonation shows the exact node that refused |
| **Needs you** | Incidents, approvals, quarantined documents | Open cases, `PENDING` approvals, `quarantined = true` | The only queue on the page. If it is empty, nothing is waiting on a human |
| **Vitals** | Analysed · Blocked · Critical incidents · Block rate | Counts over the trailing window | Volume sanity. A block rate that jumps without a matching incident usually means a control got stricter, not that attacks rose |

**Use case.** You open the console in the morning. Threat level and posture tell
you whether to keep reading. Needs you tells you what to action. The map tells
you which part of the estate is under pressure. That is the whole intent — it
answers "is anything wrong, and is anything waiting on me?" without a click.

---

## 2. Decisions — the five verdicts

Every analysed request ends in exactly one. The **most restrictive matched
action always wins**, so evaluation order can never weaken a verdict.

| Decision | Meaning | Typical cause |
|---|---|---|
| **Allowed** | Passed all controls, proceeded normally | Ordinary traffic |
| **Warned** | Proceeded, but flagged and logged | Elevated risk, suspicious behaviour |
| **Redacted** | Sensitive content masked before continuing | PII or credentials in a prompt or response |
| **Awaiting Approval** | Held pending human authorisation | Tier-5 tool, database write, irreversible action |
| **Blocked** | Stopped. Nothing reached the model, tool or user | Confirmed injection, exfiltration, unauthorised tool call |

**Use case.** The decision, not the risk score, is what actually happened. Risk
explains *why*; the decision is the *outcome* you report.

---

## 3. Detection layers — seven ways of looking

Findings are **fused across layers, not stacked across detections**. Ten pattern
hits from one detector remain one opinion; confidence rises only when methods
that could not share a blind spot agree.

| Layer | What it catches | Confidence ceiling |
|---|---|---|
| **Pattern (lexical)** | Weighted behaviour families with context mitigations | 0.97 |
| **Structural** | Imperative density, isolated command blocks, addressee shift — vocabulary-independent, so novel phrasings still fire | 0.72 |
| **Semantic** | Character n-gram similarity to an attack corpus, scored on the margin over a benign baseline. Runs locally, no embedding service | 0.78 |
| **Behavioural** | Welford baselines per subject; deviation in standard deviations against that subject's *own* history | 0.68 |
| **Authorization** | Grants, clearances, quarantine state. A permission *fact*, not an inference | 1.00 |
| **Obfuscation (normalization)** | Recursive Base64 / hex / ROT13 / URL / HTML decoding, homoglyph folding, zero-width stripping | 0.85 |
| **LLM adjudication** | Optional model second-opinion | — |

**Use case.** When you need to defend a verdict, the layer breakdown is the
argument. "Three independent layers agreed" is evidence; "the regex matched" is
not. Authorization is the only layer allowed a ceiling of 1.00, because a
missing grant is a fact rather than a judgement.

---

## 4. Risk score — twelve weighted factors

Normalise → weight → saturate, not average. Contributions sum to the number
shown, so the score is explainable by construction.

| Factor | Weight | What it measures |
|---|---|---|
| `threatConfidence` | 30 | How certain the fused detection is |
| `threatSeverity` | 18 | Intrinsic seriousness of the threat type |
| `dataSensitivity` | 14 | Weight of sensitive values found |
| `agentDivergence` | 14 | Actions taken versus the user's stated intent |
| `toolSensitivity` | 12 | Risk tier of the tools involved |
| `clearanceBreach` | 12 | Retrieval above the principal's clearance |
| `documentTrust` | 10 | Provenance of retrieved content |
| `obfuscation` | 9 | Encoding or homoglyph tricks in the input |
| `behaviouralDeviation` | 8 | Distance from this subject's own baseline |
| `userRisk` | 7 | The principal's standing risk |
| `toolVolume` | 5 | Unusual number of calls in one request |
| `agentPosture` | 4 | The agent's own security score |

Bands: **0–14** info · **15–39** low · **40–64** medium · **65–84** high ·
**85–100** critical.

**Use case.** Triage order, and the paper trail. Because contributions sum to the
displayed score, you can tell someone exactly which factors drove a block —
`/risk` shows declared weight beside observed behaviour.

---

## 5. Threat catalogue — 23 types in 7 families

| Family | Types | What the family is about |
|---|---|---|
| **Injection** | 7 | Manipulating the model's instructions |
| **RAG** | 3 | Attacks arriving inside retrieved content |
| **Data** | 4 | Sensitive material leaving the boundary |
| **Tool** | 4 | Misuse of the actions an agent can take |
| **Agent** | 2 | An agent doing what the user never asked |
| **Access** | 2 | Principals reaching beyond their clearance |
| **Output** | 1 | Unsafe generated content |

The distinction that matters most is **direct versus indirect injection**. Direct
is a user typing an attack — the user consented to their own input. Indirect
arrives inside a document the assistant reads, and the user never typed it. That
is why retrieved content is held to a lower confidence threshold than user input.

**Use case.** `/threats` groups all 23 by family with the layers that found each,
plus OWASP LLM Top 10 and MITRE ATLAS references for reporting.

---

## 6. Guardrails — 15 configurable controls

Eight screen input **before** the model sees it; seven screen output **before**
it reaches the user.

**Input** · Credential Detection · Inbound PII · Indirect Injection Shield ·
Jailbreak Detection · Malicious Instruction Filter · Obfuscation Decoder ·
Prompt Injection Shield · System Prompt Protection

**Output** · Authorisation Boundary · Confidential Data · Exfiltration Markers ·
Outbound Credential · Outbound PII · System Prompt Leak · Unsafe Content

Each has a confidence threshold and an action. Changes take effect on the next
request — the pipeline reads configuration per request rather than caching at boot.

**Use case.** Tuning. Raise a threshold when a control is noisy; lower it for
retrieved content, which nobody consented to.

---

## 7. Policies — 18 declarative rules

Stored as conditions and evaluated as data, so adding or retuning one is a
configuration change rather than a deployment.

**13 BLOCK** Credential Exposure · Data Exfiltration · Indirect Injection from
Retrieved Content · Malicious Documents · Critical Risk · Prompt Injection ·
Unauthorised Tool Calls · Confidential Retrieval Above Clearance · Agent Goal
Divergence · Jailbreak · System Prompt Extraction · External URLs · Tool-Call Limit

**2 REQUIRE_APPROVAL** Database Writes · High-Impact Actions
**1 REDACT** PII Leakage in Responses
**2 WARN** Suspicious User Behaviour · Elevated Risk

**Use case.** Policies express organisational intent; guardrails express
detection sensitivity. Change a policy to alter *what the business permits*;
change a guardrail to alter *what the engine notices*.

---

## 8. Channels — where content is inspected

`USER_INPUT` · `SYSTEM_PROMPT` · `RAG_CONTEXT` · `TOOL_ARGUMENTS` ·
`TOOL_RESULT` · `MODEL_OUTPUT` · `AGENT_MEMORY`

**Use case.** Channel tells you *how* something arrived. The same sensitive value
is routine in `USER_INPUT` and alarming in `MODEL_OUTPUT` — one is the user
supplying their own data, the other is the system leaking it.

---

## 9. Sentry — the assistant, and its four workflows

Reads freely. **Every write stops for a named human**, carried out through the
same endpoints, permission checks and audit entries a person would use.

| Workflow | What it does | Use case |
|---|---|---|
| **Scan** | Runs the production RAG scanner over pasted content or a URL | "Is this document safe to index?" |
| **Investigate** | Pulls a case, reconstructs the attack chain, correlates events, says what stopped it | "What happened in INC-2026-0158?" |
| **Triage** | Assesses the approval queue against each agent's grants and tier | "What is waiting, and what should I approve?" |
| **Hunt** | Sweeps the estate for a pattern, then checks control coverage | "Which agents touch customer data, and are we covered?" |

Triage deliberately **refuses to approve a tool call at all** — that is the one
decision the platform reserves for a person.

---

## 10. What is not currently demonstrable

Recorded because it is what someone will notice first.

**Policy and guardrail hit counters always read zero.** No application code
writes `hitCount`; only the generated Prisma client references it. So `/policies`
shows 0 hits against all 18 despite 102 real BLOCK decisions having occurred. The
blocks are genuine; the counter is simply never incremented.

**Eight threat types never fire in seeded traffic**, so their cards sit at zero
on `/threats`: Indirect Prompt Injection, Malicious Document, Sensitive Data
Exposure, Secret Exposure, Excessive Permissions, Abnormal Tool Usage,
Unauthorized Access, Unsafe Output. The engine detects them — the RAG scanner
returns Indirect Prompt Injection on demand — but the seed does not exercise them.

**Three of seven detection layers never fire** in seeded traffic: Normalization,
Structural, LLM adjudication. Observed: Authorization 151 · Behavioural 77 ·
Lexical 50 · Semantic 23.

**REDACT never occurs** as a decision, despite one REDACT policy and three
REDACT guardrails.

---

## 11. Where each factor appears

| Screen | Factors |
|---|---|
| `/dashboard` | Posture · threat level · estate map · needs you · vitals |
| `/monitor` | Every request, filterable; full pipeline trace per event |
| `/threats` | 23 types by family, with detecting layers and OWASP/ATLAS refs |
| `/detections` | The 7 layers, confidence ceilings, false-positive controls |
| `/risk` | 12 factors: declared weight beside observed behaviour |
| `/policies` | The 18 rules and their conditions |
| `/guardrails` | The 15 controls, thresholds and actions |
| `/data-protection` | 24 sensitive types by category and channel |
| `/rag` | Documents, trust, quarantine, vector stores |
| `/tools` | Tool catalogue, risk tiers, approval queue |
| `/agents` | Grants, least-privilege findings, behaviour |
| `/incidents` | Cases with reconstructed attack chains |
| `/analytics` | Trends, breakdowns, mean time to resolve |
| `/audit` | Append-only record of every decision and change |
| `/simulator` | 8 attack scenarios run through the production pipeline |
