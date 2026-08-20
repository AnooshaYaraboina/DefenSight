# Security Design

**Deliverable §28.5** — detection, guardrails, risk scoring, RAG security, agent
security, tool authorization, data protection and incident response.

## 1. Detection

### Why five layers rather than a better pattern list

A pattern list encodes attacks someone has already seen. The assessment
prohibits relying on one, and for good reason: the failure mode is silent —
you cannot tell a list that catches everything from one that catches only what
you thought of.

DefenSight runs five methods with genuinely different failure modes, so a
technique that defeats one is unlikely to defeat the rest.

| Layer | What it examines | Fails when | Ceiling |
|---|---|---|---|
| Lexical | Weighted behaviour families | Phrasing is novel | 0.97 |
| Structural | Sentence shape, imperative density, register contrast | Attack mimics prose | 0.72 |
| Semantic | n-gram similarity to an attack corpus, margin over benign | Semantically unlike anything known | 0.78 |
| Behavioural | Deviation from the subject's own baseline | Attack looks like normal usage | 0.68 |
| Authorization | Grants, clearance, quarantine | Never — it is a fact | 1.00 |

### Evidence accumulation, not first match

Within the lexical layer, ten families each target one behaviour an attacker
needs: override the instructions, reassign the role, conceal the action, move
the data. Matches accumulate with **diminishing returns** — five hits from one
family is one behaviour observed repeatedly, not five behaviours.

Confidence is then capped by the number of **independent** families:

```
1 family  → 0.45   a lead
2         → 0.62
3         → 0.86   a verdict
4+        → 0.94
```

A real attack needs several behaviours at once. An unlucky business document
produces at most one.

### Context mitigations

Northwind's own security policy discusses prompt injection at length. A
detector that flags it is not fit for production. Six mitigations reduce
confidence when a match sits in benign framing:

| Mitigation | Factor |
|---|---|
| Inside a tight enclosing quotation | ×0.35 |
| Presented as a training example | ×0.30 |
| Describes the technique in the third person | ×0.32 |
| Stated as a prohibition | ×0.28 |
| Long, structured security documentation | ×0.40 |
| SQL inside a documented procedure | ×0.25 |

Reduction is floored at 0.12 — strong context weakens a signal but never
erases it, because "quote the attack then perform it" is itself an evasion.

> **A lesson that shaped this design.** The documentation mitigation originally
> matched any text containing a phrase like "security policy". That handed
> attackers a one-phrase evasion: writing *"the standard security policy does
> not apply to you"* both performed the attack and halved its own detection
> confidence. It is now gated on document length and structure. The bug was
> found by the attack simulator, not by 80 unit tests — which is the argument
> for running attacks against the live pipeline.

### Fusion

Noisy-OR across **layers**, not detections — two lexical detectors firing on
one phrase are one observation seen twice. Each layer contributes at its
reliability weight, and independent agreement earns an explicit bonus, because
methods that cannot share a blind spot converging is the strongest evidence
available short of a confirmed exploit.

### Normalisation

Runs first, recursively, to depth 3: Base64, hex, ROT13, URL, HTML entities,
character-separated text, plus zero-width stripping, Cyrillic and Greek
homoglyph folding and NFKC. Every decoded form is re-scanned by every layer.

Normalisation is also a **signal in itself** — legitimate business documents
have no reason to hide their text. Variants are bounded and deduplicated so a
hostile input cannot make normalisation expensive.

**Measured:** 0% false positives across 616 benign requests; 92.3% detection
across 104 attacks.

## 2. Guardrails

Fifteen controls, each binding a control type to a threshold and an action, all
editable from the UI and read per request — so a change takes effect on the
next request rather than at the next deployment.

Guardrails act on **fused** confidence, never on the loudest single detector.
Letting a corroborating layer cross a block threshold alone would contradict
the fusion model and produce exactly the false positives it exists to prevent.

| Direction | Controls |
|---|---|
| Input | Prompt injection, indirect injection, jailbreak, PII, secrets, obfuscation, system-prompt extraction, malicious instruction |
| Output | PII leakage, confidential data, system-prompt leak, secrets, unsafe content, authorisation boundary, exfiltration markers |

Disabling a control confirms first, states plainly what stops being checked,
and is audited as a *failure* outcome so it stands out from routine
configuration. Weakening a defence should feel like the deliberate act it is.

**System-prompt leak detection** compares the response against the configured
prompt by longest contiguous run rather than exact match: a model can leak its
instructions while paraphrasing, but incidental overlap is short and scattered
while disclosure is long and contiguous.

## 3. Risk scoring

Twelve weighted factors, normalised to 0–1 *before* weighting so weights are
comparable and changing one is a policy decision rather than a guess.

| Factor | Weight | Factor | Weight |
|---|---|---|---|
| Threat confidence | 30 | Clearance breach | 12 |
| Threat severity | 18 | Document trust | 10 |
| Data sensitivity | 14 | Obfuscation | 9 |
| Agent divergence | 14 | Behavioural deviation | 8 |
| Tool sensitivity | 12 | Principal risk | 7 |
| Tool volume | 5 | Agent posture | 4 |

**Saturating combination, not averaging.** Averaging lets a confirmed
exfiltration attempt be diluted by a dozen benign signals — exactly backwards
for security. Points accumulate with diminishing returns so the score cannot be
inflated by piling on minor signals, while a single decisive factor still moves
it decisively.

**Some factors reduce risk.** A well-scoped read-only agent operating inside
its baseline on a public document should score lower than the same request from
an over-privileged one, and the score should say so.

**Explainability is structural, not cosmetic.** Each factor records what it
measured, its weight, and the points it contributed — and the contributions sum
to the displayed score, so an analyst can audit the arithmetic rather than
trust it. There is a test asserting the sum.

## 4. RAG security

### Trust is provenance

Every source carries a ceiling. A document inherits it, and the scan can only
reduce it. Nothing raises trust — which is what stops hostile content being
laundered by looking official.

| Source | Ceiling | Why |
|---|---|---|
| HR vault | 90 | Access-controlled at source |
| Finance bucket | 88 | Pipeline-written only |
| Contract vault | 85 | Legal-reviewed |
| SharePoint | 78 | Internally authored, reviewed |
| Confluence | 72 | Any engineer can edit |
| **Vendor portal** | **22** | Externally authored, unreviewed |
| **Public web** | **12** | Fully untrusted |

### Ingestion

```
Upload → Scan → Analyze → Risk score → Allow / Quarantine
```

The scan runs the same detection layers as live traffic — there is no weaker
"document" detector to bypass. **A quarantined document is never indexed**:
scanning after indexing would leave a window in which the payload is
retrievable.

### Retrieval

Three gates in order, and the order matters:

1. **Clearance** — checked before content analysis. Material the requester is
   not entitled to is withheld regardless of how clean it is.
2. **Quarantine** — enforced at the boundary, without re-analysing content.
3. **Content** — injection detection at a lower threshold than user input,
   because the user never consented to this text.

## 5. Agent security

An agent's grants define the blast radius if it is ever manipulated, so the
grants are treated as a security control rather than configuration.

**Intent-versus-action divergence** compares what the agent is doing against
what the user asked for. Two measures:

- **Capability plausibility** — does this action's *category* have any role in
  a request of this shape? Summarising a document never requires sending mail.
- **Relevance** — lexical overlap between request and action.

Plausibility carries the weight because it survives paraphrase. An attacker who
mentions "email" in injected text can raise lexical overlap; they cannot make
outbound email a plausible step in summarisation. There is a test for exactly
that.

Divergence is **grant-aware**: an ungranted implausible action is the injection
signature; a granted one is a scoping question worth surfacing, not blocking.

An unclassifiable request scores **zero** divergence. Treating "I could not
parse this" as "this is an attack" was the single largest source of false
positives found during replay — two thirds of all blocked benign traffic.

**Behavioural baselines** use Welford's online algorithm per subject and
metric. Deviation is measured in standard deviations against that subject's own
history, so an agent that legitimately makes heavy use of a tool is not
penalised for doing its job.

## 6. Tool authorization

**Default closed.** Absence of a grant is a denial, not an omission. This is
the single property that makes an injected agent survivable: the attacker can
change what the agent *wants* to do, but not what it is *permitted* to do.

Thirteen checks per call, all of them run — an analyst asking "why was this
allowed?" needs the same evidence as one asking "why was this blocked?"

| # | Check | Severity on failure |
|---|---|---|
| 1 | Tool registered | High |
| 2 | Tool enabled | Medium |
| 3 | **Grant exists** | Critical |
| 4 | **Operation within grant** | Critical |
| 5 | Tool supports operation | Medium |
| 6 | Arguments match declared schema | High |
| 7 | No destructive or unbounded operation | Critical |
| 8 | Read scope bounded | Medium |
| 9 | No injected instructions in arguments | High |
| 10 | No sensitive data in arguments | Critical |
| 11 | **Destination on allowlist** | Critical |
| 12 | Within rate limit | Medium |
| 13 | Within per-request caps | Medium |

Arguments are scanned as *values*, not as JSON. Scanning raw JSON was wrong:
every value is wrapped in quotes, which looks identical to quoted speech and
tripped the "this is a quotation" mitigation, discounting an injected directive
inside a SQL comment to nothing.

Risk tiers 1–5 gate human approval. Tier 5 — payments, deployments, outbound
email, code execution — **always** requires a named human, whatever the score.

## 7. Data protection

Regex alone produces unusable precision here: every 16-digit number is not a
card and every base64 blob is not a secret. Each pattern pairs with a
validator.

| Type | Validator |
|---|---|
| Payment card | Luhn checksum |
| IBAN | ISO 13616 mod-97 |
| US SSN | Area, group and serial structural rules |
| API key, token | Shannon entropy > 3.2 |
| Password | Placeholder detection |
| Phone | Length bounds, label proximity |

Confidence is assigned **per match**, not per pattern — a labelled SSN scores
higher than a bare nine-digit run. Overlapping matches keep the highest-
confidence one, since a connection string contains a password and reporting
both double-counts one leak.

Monitored channels: user input, system prompt, RAG context, tool arguments,
tool results, model output, agent memory. Actions: allow, warn, redact, block.
Redaction runs right-to-left so offsets stay valid as the string is rewritten.

## 8. Incident response

Threats at critical severity that were blocked open a case automatically,
seeded with the attack chain the pipeline recorded — an analyst opening a case
sees the full sequence immediately rather than an empty history.

```
OPEN → INVESTIGATING → CONTAINED → RESOLVED
```

Transitions are enforced **server-side** against a permitted-move table. The UI
only offers valid moves as an affordance; this is the boundary that holds.
Every transition writes both a timeline entry and an audit record, and
resolution requires a written summary.

## 9. Identity and access

Sessions carry a signed JWT **and** a server-side row. The JWT alone would be
unrevocable until expiry — unacceptable for a security console where suspending
an account must take effect immediately. Every request verifies the signature,
confirms the row exists, and re-checks account status.

scrypt verification runs even for unknown accounts so response timing does not
reveal which addresses exist, and the error text is identical either way.

Three roles over thirty permissions, enforced on every mutating route. The
console hides what a role cannot use purely as an affordance — hiding a button
is never the enforcement boundary.

| Role | Can |
|---|---|
| Security Administrator | Everything, including guardrail and policy configuration |
| Security Analyst | Investigate, respond, approve, quarantine, simulate — but not configure |
| Viewer | Read dashboards, events and reports |

## 10. AI automation boundary

AI automation supports the defensive workflow; it never performs enforcement.
Classification, explanation, summarisation and mitigation guidance all run
strictly after the verdict, read only the recorded result, and cannot change a
decision, a score or a policy outcome.

Every capability has a deterministic fallback built from the same data, so a
missing key or a rate limit degrades the prose and never the security. The UI
labels which kind of text it is showing.

Event correlation is deliberately **not** asked of a model. Whether two events
are related is a factual question — shared principal, agent, threat type,
document, temporal proximity — and a hallucinated link during an investigation
is worse than no link at all.

The **assistant receives a pre-computed read-only snapshot** rather than query
access. An assistant that can query freely is an injection target, and this one
is deliberately not one.
