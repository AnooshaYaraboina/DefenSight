# Documentation

| Document | Deliverable | Contents |
|---|---|---|
| [architecture.md](architecture.md) | §28.3 | Components, data flows, trust boundaries, pipeline stages |
| [threat-model.md](threat-model.md) | §28.4 | Assets, actors, 23 threats mapped to OWASP LLM and MITRE ATLAS, residual risk |
| [security-design.md](security-design.md) | §28.5 | Detection, guardrails, risk scoring, RAG, agent, tool authorization, data protection, incident response |
| [test-cases.md](test-cases.md) | §28.6 | Attack, expected, actual, detection, mitigation — generated from real runs |

The test matrix is generated rather than written: `npm run docs:tests` executes
every case against the production pipeline and reports what the engine actually
did. It cannot drift from the implementation.
