# The Shem v4 → Law Firm of the Future — Gap Analysis

## How to Read This Map

The architecture spec describes **~25 agent roles across 7 areas**. The Shem v4 is a working system with **8 specialist agents, 40+ MCP tools, and a 10-step workflow**. This document maps what exists against what's needed.

Legend:
- ✅ **Built** — The Shem v4 has this, working and tested
- 🔶 **Partial** — Capability exists but narrower than the spec requires
- ❌ **Gap** — Not yet built
- 🔄 **Reusable** — Existing infrastructure can be extended to cover this

---

## Area 1: Legal Core

| Spec Agent | Status | The Shem v4 Coverage | Gap |
|------------|--------|---------------------|-----|
| 1.1 Contract Drafting | ❌ | Nothing. The Shem reviews/transforms documents, does not draft from scratch. | Full agent needed: clause libraries, jurisdiction database, structured output with layered access. |
| 1.2 Contract Review | 🔶 | **design-reviewer** scores across 5 dimensions. **ethics-auditor** detects dark patterns. **plain-language-specialist** analyzes language. But none produce a *risk-scored summary with recommended changes and redlines*. | Missing: risk scoring model, standard position database, clause comparison, redlining, deviation flagging. The Shem reviews *design*, not *legal substance*. |
| 1.3 Contract Negotiation | ❌ | Nothing. No agent-to-agent negotiation capability. | Full agent needed: negotiation strategy engine, communication interface, parameter guardrails, exchange logging. |
| 1.4 Litigation Strategy | ❌ | Nothing. No case law analysis, outcome prediction, or cost modeling. | Full agent needed: case law database, outcome prediction, cost modeling, scenario analysis. Primary candidate for the debate pattern (which The Shem *does* have infrastructure for). |
| 1.5 Regulatory Compliance | 🔶 | **ethics-auditor** maps to GDPR/FTC/CCPA/CPA. But this is dark-pattern compliance, not operational regulatory compliance. | Missing: regulatory database, compliance gap analysis, remediation plans, multi-jurisdictional monitoring, audit-ready documentation. |
| 1.6 Due Diligence | ❌ | Nothing. No M&A/transaction due diligence. | Full agent needed: corporate records search, IP registry, litigation history, risk reports. Primary candidate for swarm/handoff pattern. |
| 1.7 Legal Research | ❌ | Nothing. No case law search, statute database, or research memo generation. | Full agent needed: case law search, statute database, commentary database, citation with confidence levels. |

**Summary**: The Shem covers **design review** of legal documents — a slice of what 1.2 Contract Review does. The entire Legal Core (drafting, negotiation, litigation, compliance, due diligence, research) is unbuilt.

---

## Area 2: Risk and Insurance

| Spec Agent | Status | The Shem v4 Coverage | Gap |
|------------|--------|---------------------|-----|
| 2.1 Risk Pricing | 🔶 | **scoring-engine** calculates complexity tax, readability, findability. **report-card** captures quality metrics. But this is *design risk*, not *legal error risk* or *financial loss risk*. | Missing: actuarial models, error probability estimation, loss magnitude, jurisdictional risk factors. Different kind of "risk." |
| 2.2 Insurance Management | ❌ | Nothing. | Full capability needed: insurance provider APIs, coverage matching, claims processing, premium optimization. This is described as the firm's "real profit center." |
| 2.3 Liability Mapping | 🔶 | **audit-logger** tracks every tool call, agent start/stop, decision. **audit-persistence** writes JSONL with checksum chains. Strong foundation. | Missing: full provenance chain reconstruction (which agent, which version, which data produced each output). The audit trail exists but isn't queryable as a liability map. |

**Summary**: The Shem has *design quality metrics* and *audit trails*. It does not have *actuarial risk pricing* or *insurance management*. The audit infrastructure (🔄) is reusable for liability mapping.

---

## Area 3: Quality and Security

| Spec Agent | Status | The Shem v4 Coverage | Gap |
|------------|--------|---------------------|-----|
| 3.1 Quality Audit (Evaluator Gate) | ✅ | **verification-engine** runs self-verification, cross-verification, and score-verification. **meaning-guardian** checks legal meaning preservation. **human-gate** enforces 3 mandatory approval points. Confidence-based routing. Different model for verification (Opus for meaning-guardian). | Close match. Missing: citation validity checking (do cited sources exist?), internal consistency detection (contradictions). The Shem's evaluator gate is *design quality*, not *legal correctness*. |
| 3.2 Adversarial Testing (Red Team) | 🔶 | **debate-board** enables agent-vs-agent challenge/response. Agents genuinely challenge each other (e.g., ethics-auditor vs. design-reviewer). But there is no dedicated *red team agent* that attacks deliverables. | Missing: dedicated adversarial agent, vulnerability scanning, edge case generation, counterparty simulation. The debate infrastructure (🔄) could support this. |
| 3.3 Security Agent | ❌ | Nothing. No prompt injection detection, data exfiltration monitoring, or integration auditing. | Full agent needed: communication monitoring, authentication, access control, plugin/skill auditing. The **dynamic-permissions** system is a foundation but only covers MCP tool access by workflow phase. |
| 3.4 Consistency Agent | 🔶 | **memory-system** stores institutional memory, precedents, and matter memory. **feedback-loop** tracks effectiveness. **anti-patterns** record what not to do. But there is no *cross-matter consistency checking*. | Missing: knowledge graph of all positions taken, conflict-of-interest detection, contradiction flagging across matters. The memory system (🔄) is the foundation. |

**Summary**: The Shem's strongest overlap with the full architecture. Verification, debate, human gates, and memory are all built. Missing: dedicated red team, security monitoring, cross-matter consistency.

---

## Area 4: Design and Communication

| Spec Agent | Status | The Shem v4 Coverage | Gap |
|------------|--------|---------------------|-----|
| 4.1 Legal Design | ✅ | **design-reviewer** scores across readability, findability, clarity, visual design, ethics. **synthesis-editor** applies 10 design patterns (TL;DR, Key Terms, Rights Block, Obligations Block, Cancellation Flow, Progressive Disclosure, etc.). | This IS The Shem's core competency. Fully built. |
| 4.2 Plain Language | ✅ | **plain-language-specialist** analyzes cognitive load, sentence structure, word choice. **transformation-specialist** rewrites with tiered substitutions (Safe/Caution/Preserve). Readability targets per audience. | Fully built. Multiple comprehension levels supported. |
| 4.3 Information Architecture | ✅ | **service-designer** analyzes full user journey, touchpoints, cognitive load, information architecture. Layered access is a core design pattern. | Fully built as part of service-designer. |
| 4.4 Visual Communication | 🔶 | **design-reviewer** scores visual design (hierarchy, whitespace, formatting). **synthesis-editor** can structure documents visually. But no *diagram generation, flowcharts, decision trees, or timeline visualization*. | Missing: visualization engine, diagramming library, interactive charts. The Shem works with text, not visual artifacts. |
| 4.5 Service Design | ✅ | **service-designer** agent — journey mapping, friction points, touchpoint analysis, emotional state tracking. | Fully built. |
| 4.6 Behavioral Design | 🔶 | **client-proxy** role-plays as real reader, maps emotional responses. **scoring-rubric** includes complexity tax (behavioral cost of poor design). But no dedicated *behavioral science framework*. | Missing: nudge design, framing optimization, timing strategies. The client-proxy (🔄) is the foundation. |
| 4.7 Accessibility | ❌ | Nothing. No translation, multi-literacy-level adaptation, or accessibility compliance. | Full agent needed: translation engine, accessibility checker, cultural adaptation. |

**Summary**: This is The Shem's home turf. Legal Design, Plain Language, Information Architecture, and Service Design are **fully built**. Visual Communication and Behavioral Design are partial. Accessibility is a gap.

---

## Area 5: Client Interface

| Spec Agent | Status | The Shem v4 Coverage | Gap |
|------------|--------|---------------------|-----|
| 5.1 Client Translation | 🔶 | **client-proxy** role-plays as the reader. **synthesis-editor** assembles dual artifacts (user-facing + legal review). But this is *document output*, not *explanation of agentic work to a human principal*. | Missing: explanation of what agents did and why, in language the client can act on. The dual-artifact approach is a start. |
| 5.2 Intake and Scoping | 🔶 | **Orchestrator Step 1 (INTAKE)** gathers context: moment, audience, jurisdiction, document type. Queries memory for prior work. | Missing: cost estimation, timeline, capacity checking, problem reframing (understanding actual problem vs. legal framing). Currently intake is document-focused, not matter-focused. |
| 5.3 Reporting | 🔶 | **report-card** compiles session metrics. **LEGAL.md** compiles institutional knowledge. **audit-persistence** writes structured logs. **event-bus** emits real-time events. **viz/** directory exists (visualization app). | Missing: status updates during matters, progress dashboards, alert engine, client preference adaptation. The event system (🔄) could drive all of this. |

**Summary**: Partial coverage. The Shem has intake, output assembly, and reporting infrastructure, but these are *document-processing-focused*, not *client-relationship-focused*.

---

## Area 6: Commercial and Operations

| Spec Agent | Status | The Shem v4 Coverage | Gap |
|------------|--------|---------------------|-----|
| 6.1 Pricing | ❌ | Nothing. | Full agent needed: pricing model, fee structures, margin calculator. |
| 6.2 Business Development | ❌ | Nothing. | Full agent needed: CRM, market intelligence, proposal generation, agent-to-agent market interaction. |
| 6.3 Reputation and Trust | ❌ | Nothing. | Full agent needed: reputation tracking, trust scores, agent ecosystem monitoring. |
| 6.4 Coordination/Orchestration | ✅ | **orchestrator.ts** — central coordinator dispatching 8 agents through a 10-step workflow. **workflow-engine** with preconditions. **dynamic-permissions** for phase-based tool access. **cost-tracker** for budget management. | The Shem's orchestrator is *document-processing-scoped*. The full spec needs *multi-matter project management* with capacity planning and dependency tracking. Foundation is strong (🔄). |
| 6.5 Regulatory Horizon | ❌ | Nothing. | Full agent needed: regulatory monitoring feeds, impact assessment, update propagation. |

**Summary**: Only the Coordination/Orchestration agent exists (as the orchestrator). All commercial operations are unbuilt.

---

## Area 7: Ethics and Oversight

| Spec Agent | Status | The Shem v4 Coverage | Gap |
|------------|--------|---------------------|-----|
| 7.1 Ethics and Alignment | ✅ | **ethics-auditor** scans 7 dark pattern categories, maps to regulations. **human-gate** enforces mandatory approval on RED findings. **confidence-based routing** for gate decisions. | Good coverage for document ethics. Missing: cross-portfolio conflict-of-interest detection, values alignment checking beyond dark patterns. |
| 7.2 Human Oversight | ✅ | **human-gate hooks** enforce 3 mandatory gates. **gate-resolver** supports CLI and API modes. **approval-gate** MCP tool. Confidence-based routing prevents rubber-stamping. | Good coverage. Missing: drift detection, anomaly monitoring, systemic issue detection across sessions. The feedback-loop/baselines (🔄) are a foundation for detecting systemic drift. |

**Summary**: Strong coverage. The Shem takes ethics and human oversight seriously. Missing pieces are cross-portfolio scope.

---

## Infrastructure: The Shem's Reusable Foundations

These systems exist in The Shem v4 and would serve as infrastructure for the full Law Firm:

| System | What It Does | Reusable For |
|--------|-------------|--------------|
| **Debate Board** | Agents post findings, challenge each other, respond, resolve | Litigation strategy debates, due diligence conflicts, any multi-agent disagreement |
| **Verification Engine** | Self/cross/score verification loops | Quality audit gate on any specialist output |
| **Memory System** | Institutional + matter + precedent memory with effectiveness tracking | Consistency agent knowledge graph, cross-matter learning, any agent that needs history |
| **Feedback Loop** | Post-session learning — effectiveness scores, anti-patterns, baselines | Firm-wide quality monitoring, regression detection, continuous improvement |
| **Session State** | Isolated per-session state with event bus | Multi-matter session management |
| **Event Bus** | Real-time typed events | Reporting dashboards, monitoring, alerting |
| **Dynamic Permissions** | Phase-based tool access control | Security boundaries for any workflow |
| **Audit Logger** | JSONL with checksum chains, immutable | Liability mapping, regulatory compliance |
| **Human Gates** | Confidence-based escalation to humans | Any agent that needs human oversight |
| **Report Cards + Baselines** | Quality metrics per session, statistical expectations | Firm-wide quality monitoring, pricing inputs |

---

## The Core Decision Architecture Gap

The architecture spec describes a **4-stage pipeline** that is fundamentally different from what The Shem currently does:

```
REQUEST → ROUTER → SPECIALIST(S) → EVALUATOR GATE → OUTPUT
```

The Shem v4 has a **fixed 10-step workflow** for a single task type (legal document redesign):

```
INTAKE → ANALYZE → DEBATE → GATE → TRANSFORM → VERIFY → DEBATE → GATE → SYNTHESIZE → GATE
```

**What's missing is the Router** — the component that looks at an incoming request and decides:
- Is this a simple question (direct answer from Legal Research)?
- Is this a standard review (single specialist + evaluator)?
- Is this a complex matter (full pipeline, multiple specialists)?
- Does this need the debate pattern (novel question, high stakes)?
- Does this need swarm/handoff (due diligence workstream)?

The Shem's orchestrator always runs the full 10-step pipeline. The Router would make the system *adaptive* — applying minimal machinery to simple requests and full machinery only when warranted.

---

## Heat Map: Coverage by Area

```
Area 1: Legal Core           ░░░░░░░░░░░░░░░░░░░░  ~10%  (design review only)
Area 2: Risk & Insurance     ░░░░░░░░░░░░░░░░░░░░  ~15%  (design metrics + audit)
Area 3: Quality & Security   ████████████░░░░░░░░  ~60%  (verification, debate, gates)
Area 4: Design & Comms       ██████████████████░░  ~85%  (THIS IS THE SHEM)
Area 5: Client Interface     ██████░░░░░░░░░░░░░░  ~30%  (intake, output, events)
Area 6: Commercial & Ops     ██░░░░░░░░░░░░░░░░░░  ~10%  (orchestration only)
Area 7: Ethics & Oversight   ████████████████░░░░  ~75%  (ethics, gates, oversight)
```

---

## What The Shem IS vs. What The Firm NEEDS

**The Shem v4 is Area 4 — Legal Design & Communication — built to production quality**, with strong Area 3 (Quality) and Area 7 (Ethics) support. It is the *design practice* of the law firm.

The full architecture needs The Shem to become the **platform** — its infrastructure (debate, verification, memory, permissions, audit, events, sessions, learning) becomes the substrate on which all 25 agents operate.

### The Shem today:
```
Document → [8 design agents] → Redesigned Document + Legal Review Package
```

### The Firm needs:
```
Any Legal Request → Router → [N specialist agents] → Evaluator Gate → Insured Legal Outcome
                              ↕ debate    ↕ memory    ↕ audit    ↕ oversight
```

---

## Build Priority (from the spec's own suggestion)

The spec says: "Start with Router + 1 specialist + Evaluator Gate."

Given that The Shem already has the Evaluator Gate (verification + human gates), the actual build order would be:

| Priority | What to Build | Why | Reuses from The Shem |
|----------|--------------|-----|---------------------|
| **1** | **Router** | Everything flows through it. Determines which agents to engage and how much machinery to use. | Orchestrator pattern, session state |
| **2** | **Contract Review Agent** | Most common legal task. High volume, proven demand. | design-reviewer scoring, debate board, verification engine |
| **3** | **Plain Language + Legal Design integration** | Already built. Wire into the router as a specialist. | The entire Shem v4 as-is |
| **4** | **Risk Pricing Agent** | Makes the output insurable. Core thesis of the firm. | Report cards, baselines, scoring engine |
| **5** | **Liability Mapping Agent** | Makes the audit trail queryable as provenance. | Audit logger, session state, event bus |
| **6** | **Legal Research Agent** | Supports all other specialists. Foundational capability. | Memory system, debate board |
| **7** | **Contract Drafting Agent** | High-value capability. Builds on clause libraries. | Pattern library, synthesis-editor approach |
| **8** | **Red Team / Adversarial Agent** | Strengthens the evaluator gate. | Debate board, verification engine |
| **9** | **Security Agent** | Required before any external integrations. | Dynamic permissions, audit logger |
| **10** | **Remaining specialists** one at a time | Each plugs into the router + evaluator gate | All infrastructure |

---

## Architectural Decisions Needed

Before building, these questions need answers:

1. **Single codebase or microservices?** — Does each agent role become a separate deployable, or does everything stay in one process like The Shem?

2. **Model heterogeneity** — The spec requires different models for evaluator vs. specialist. The Shem uses Opus for transformation/verification, Sonnet for analysis. How many models does the full system need?

3. **External tool integration** — Legal Research needs case law databases. Contract Review needs standard position databases. Due Diligence needs corporate registries. What are the actual data sources?

4. **Agent-to-agent communication** — The spec mentions Contract Negotiation engaging with *counterparty agents*. This requires a protocol for inter-firm agent communication. What does that look like?

5. **Insurance product design** — The spec says insurance management is the "real profit center." What insurance products exist or need to be created for AI-generated legal work?

6. **Multi-matter sessions** — The Shem is single-document-per-session. The full firm handles multiple concurrent matters. How does session management scale?

7. **The Router's intelligence** — The Router is described as "the single highest-leverage component." How sophisticated does it need to be? Simple classification, or full reasoning about matter complexity?
