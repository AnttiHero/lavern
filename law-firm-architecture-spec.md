# Law Firm of the Future — Architecture Specification

## Purpose

This document specifies the architecture for an AI-native law firm staffed by specialized agents. It is intended as a buildable specification, not a think piece. The system's core product is **insured legal outcomes** — not legal advice. The design prioritizes clarity, auditability, and human-centeredness over raw capability.

---

## Core Decision Architecture

Every request flows through a 4-stage pipeline. This is the backbone. Everything else hangs off it.

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  REQUEST IN                                             │
│       │                                                 │
│       ▼                                                 │
│  ┌─────────┐                                            │
│  │ ROUTER  │ ── Is this a direct answer or a workflow?  │
│  └────┬────┘    Which specialist(s)?                    │
│       │         How much machinery does this need?      │
│       ▼                                                 │
│  ┌──────────────┐                                       │
│  │ SPECIALIST(S)│ ── Execute: retrieve, draft,          │
│  │              │    calculate, use tools                │
│  └──────┬───────┘                                       │
│         │                                               │
│         ▼                                               │
│  ┌──────────────┐                                       │
│  │  EVALUATOR   │ ── Gate check against rubric:         │
│  │    GATE      │    correctness, citations, policy,    │
│  │              │    consistency with tool outputs       │
│  └──────┬───────┘                                       │
│         │                                               │
│    PASS │        FAIL                                   │
│         │          │                                    │
│         ▼          ▼                                    │
│     OUTPUT    LOOP (max 2x)                             │
│                    │                                    │
│                    ▼                                    │
│              Revise / re-run tools                      │
│                    │                                    │
│                    ▼                                    │
│              Back to EVALUATOR GATE                     │
│                    │                                    │
│              If still fails after 2 loops:              │
│              STOP + escalate to human                   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Special Patterns (used selectively, not by default)

**Debate / Panel** — Only for high-stakes forks where you want adversarial stress-testing. Examples: novel litigation strategy, untested jurisdictional question, ethical edge case. Evidence shows debate structure alone does not reliably beat strong single-agent strategies. Value comes from heterogeneous agents (different models or different prompt structures) with genuine initial disagreement. The evaluator gate still applies after debate concludes.

**Swarm / Handoffs** — Useful inside a bounded matter where agents need to dynamically delegate to each other without central routing. Example: a due diligence workstream where the contract review agent finds a regulatory issue and hands off to the compliance agent directly. A top-level control plane (state, stop rules, permissions) always wraps the swarm.

---

## Stage 1: Router

The router is the single highest-leverage component. Its job is NOT just "which specialist" — it is "how much machinery does this actually need." Most requests do not need the full pipeline.

### Router Responsibilities

- Classify incoming request: direct answer vs. single-specialist vs. multi-specialist workflow
- Estimate complexity and risk level
- Select the minimum viable pipeline (do not over-engineer simple queries)
- Route to appropriate specialist(s)
- Determine if debate pattern is warranted (high-stakes, genuine uncertainty, novel question)
- Flag requests that need human involvement before any agent acts

### Router Decision Matrix

| Signal | Route |
|--------|-------|
| Simple factual legal question | Direct answer from Legal Research Agent, no workflow |
| Standard contract review | Contract Review Agent → Evaluator Gate |
| New contract drafting | Intake Agent → Contract Drafting Agent → Plain Language Agent → Evaluator Gate |
| Complex multi-jurisdictional matter | Full pipeline, multiple specialists in sequence |
| Novel litigation strategy | Debate pattern with heterogeneous agents + Evaluator Gate |
| Ethical edge case | Ethics Agent review before any execution |
| Request touches existing client matter | Consistency Agent check before routing |

### Implementation Notes

- The router should be a strong reasoning model (use best available)
- It should have access to a schema of all available specialists and their capabilities
- It should log every routing decision with reasoning for audit trail
- It should default to the simplest path that could work, not the most thorough

---

## Stage 2: Specialists

Specialists execute the actual work. They are organized into 7 functional areas. Each specialist has a defined scope, defined inputs/outputs, and defined escalation triggers.

### Area 1: Legal Core

#### 1.1 Contract Drafting Agent
- **Input:** Deal parameters, jurisdiction, client preferences, risk appetite
- **Output:** Structured contract with layered access (summary → key terms → full detail)
- **Tools:** Clause library, jurisdiction database, precedent database
- **Escalation triggers:** Unusual deal structure, conflicting jurisdictional requirements, value above threshold

#### 1.2 Contract Review Agent
- **Input:** Incoming contract document
- **Output:** Risk-scored summary, flagged deviations, recommended changes, redlined version
- **Tools:** Standard position database, risk scoring model, clause comparison engine
- **Escalation triggers:** Unusual clauses not in training data, risk score above threshold

#### 1.3 Contract Negotiation Agent
- **Input:** Negotiation parameters (walk-away points, must-haves, nice-to-haves), counterparty agent or communication channel
- **Output:** Negotiated terms, full exchange log
- **Tools:** Negotiation strategy engine, communication interface
- **Escalation triggers:** Counterparty demands outside parameters, deadlock, bad faith signals
- **Note:** Every exchange is logged for audit trail. This agent operates within strict guardrails.

#### 1.4 Litigation Strategy Agent
- **Input:** Dispute facts, applicable law, client objectives
- **Output:** Strategy recommendation with probabilistic outcome ranges, cost estimates, timeline
- **Tools:** Case law database, outcome prediction model, cost modeling engine
- **Escalation triggers:** Low-confidence predictions, novel legal questions, high-value matters
- **Note:** This is the primary candidate for the DEBATE pattern. Use heterogeneous agents to stress-test strategy options.

#### 1.5 Regulatory Compliance Agent
- **Input:** Client operations description, applicable jurisdictions
- **Output:** Compliance gap analysis, remediation plan, audit-ready documentation
- **Tools:** Regulatory database (real-time updated), compliance checklist engine
- **Escalation triggers:** Ambiguous regulatory guidance, pending regulatory changes

#### 1.6 Due Diligence Agent
- **Input:** Target entity information, transaction type, scope definition
- **Output:** Structured risk report with severity ratings, deal-breaker flags
- **Tools:** Corporate records database, litigation history search, IP registry, regulatory filings
- **Escalation triggers:** Material undisclosed liabilities, data gaps, conflicting information
- **Note:** This is the primary candidate for SWARM/HANDOFF pattern — sub-issues get routed to other specialists dynamically.

#### 1.7 Legal Research Agent
- **Input:** Specific legal question, jurisdictions of interest
- **Output:** Research memo with citations, confidence levels, conflicting authorities flagged
- **Tools:** Case law search, statute database, commentary database
- **Escalation triggers:** No clear authority, conflicting binding precedent

---

### Area 2: Risk and Insurance

#### 2.1 Risk Pricing Agent
- **Input:** Work output from any specialist, matter metadata
- **Output:** Risk score, error probability estimate, potential loss magnitude
- **Tools:** Actuarial models, historical error rate database, jurisdictional risk factors
- **Note:** Runs on every piece of work. This is continuous, not on-demand.

#### 2.2 Insurance Management Agent
- **Input:** Risk scores, coverage requirements, claims history
- **Output:** Coverage recommendations, premium optimization, claims triggers
- **Tools:** Insurance provider APIs, coverage comparison engine, claims processing system
- **Note:** The firm's real profit center. This agent manages the insurance wrapper that is the actual product.

#### 2.3 Liability Mapping Agent
- **Input:** All agent activity logs for a given matter
- **Output:** Accountability chain — which agent, which version, which data contributed to each output
- **Tools:** Agent activity log aggregator, version tracking system
- **Note:** Exists for when things go wrong. Must be able to reconstruct exactly what happened and why.

---

### Area 3: Quality and Security

#### 3.1 Quality Audit Agent (= THE EVALUATOR GATE)
- **Input:** Output from any specialist agent + the original request + the rubric
- **Output:** Pass/fail decision with specific failure reasons, quality score
- **Rubric checks:**
  - Factual correctness
  - Citation validity (do cited sources exist and say what's claimed?)
  - Policy compliance (does output comply with firm standards and client policies?)
  - Consistency with tool outputs (if agent used tools, does the narrative match the data?)
  - Jurisdictional accuracy
  - Internal consistency (no contradictions within the document)
  - Completeness (all aspects of the request addressed)
- **CRITICAL: This agent must use a DIFFERENT model or at minimum a different prompt structure than the specialist it is evaluating. Same model checking its own work produces correlated errors.**

#### 3.2 Adversarial Testing Agent (Red Team)
- **Input:** Any high-stakes deliverable before it goes to client
- **Output:** Vulnerability report — exploits, edge cases, ambiguities, failure modes
- **Tools:** Adversarial prompt library, edge case generator, counterparty simulation
- **Note:** This is the "loop once or twice" mechanism. If the evaluator gate fails, the adversarial agent gets 1-2 shots at identifying what's wrong and suggesting fixes.

#### 3.3 Security Agent
- **Input:** All agent-to-agent and agent-to-external communications
- **Output:** Threat alerts, access control decisions, integration audit results
- **Tools:** Communication monitoring system, authentication manager, plugin/skill auditor
- **Note:** Inspired by Moltbook's Rufio — proactively scans for prompt injection, data exfiltration, unauthorized access. Audits third-party integrations before onboarding.

#### 3.4 Consistency Agent
- **Input:** New work output + firm's historical position database
- **Output:** Conflict flags — does this contradict prior advice, existing commitments, or other active matters?
- **Tools:** Knowledge graph of all positions taken, advice given, terms agreed across all matters
- **Note:** Runs before routing on matters that touch existing clients, and after specialist execution on all matters.

---

### Area 4: Design and Communication

These agents are what make this firm different from "a faster version of the old thing." They ensure the output is understandable, usable, and human-centered.

#### 4.1 Legal Design Agent
- **Input:** Raw legal output from specialist
- **Output:** Redesigned document — restructured around actual risk profiles, modular, concise
- **Tools:** Document structure templates, risk-based formatting engine
- **Questions it asks:** Does this need to be 40 pages? What if it were 4? What does the reader actually need to decide?

#### 4.2 Plain Language Agent
- **Input:** Any legal output
- **Output:** Human-readable version — a person with no legal training understands this in 30 seconds
- **Tools:** Readability scoring, jargon detection, simplification engine
- **Note:** Not dumbing down. Clarifying. Maintains legal precision while removing unnecessary complexity. Can produce multiple versions at different comprehension levels.

#### 4.3 Information Architecture Agent
- **Input:** Complex legal deliverable
- **Output:** Layered, navigable document structure — summary → key risks → full detail → jurisdiction-specific notes
- **Tools:** Document structuring engine, dynamic content layering system
- **Note:** The reader should be able to zoom in and out based on their role and needs.

#### 4.4 Visual Communication Agent
- **Input:** Legal relationships, timelines, obligations, deal structures
- **Output:** Diagrams, flowcharts, decision trees, timelines, risk maps
- **Tools:** Visualization engine, diagramming library, interactive chart builder
- **Note:** A diagram of who owes what to whom by when is worth more than ten pages of prose.

#### 4.5 Service Design Agent
- **Input:** Client journey data, satisfaction signals, friction point analysis
- **Output:** Service improvement recommendations, redesigned touchpoints
- **Tools:** Client journey mapping engine, feedback analysis system
- **Note:** Continuously asks: where does someone feel confused, anxious, or powerless? Then fixes it.

#### 4.6 Behavioral Design Agent
- **Input:** Decision context — what is the client deciding, under what uncertainty, with what stakes?
- **Output:** Information presentation strategy — what to surface, when, how to frame options
- **Tools:** Behavioral science framework library, decision framing engine
- **Note:** Applies behavioral science to how legal information is presented. Nudges, framing, timing.

#### 4.7 Accessibility Agent
- **Input:** Any client-facing output
- **Output:** Adapted versions — multilingual, multi-literacy-level, accessibility-compliant, culturally appropriate
- **Tools:** Translation engine, accessibility checker, cultural adaptation framework
- **Note:** The current legal system barely works for educated native speakers. This agent fixes that.

---

### Area 5: Client Interface

#### 5.1 Client Translation Agent
- **Input:** Complex agentic output, client profile
- **Output:** Explanation the human principal can act on — what happened, why, what the risks are
- **Tools:** Client profile database, explanation generation engine
- **Note:** This role gets MORE important as the legal work gets more complex. It is the "last mile."

#### 5.2 Intake and Scoping Agent (= THE ROUTER's front-end)
- **Input:** New matter request from client (human or agent)
- **Output:** Scope definition, cost estimate, timeline, specialist selection
- **Tools:** Matter intake form, pricing model, capacity checker
- **Note:** First contact. Understands the actual problem, not just the legal framing the client arrives with. Feeds the router.

#### 5.3 Reporting Agent
- **Input:** Matter activity data, milestones, deliverables
- **Output:** Status updates, progress reports, dashboards, alerts
- **Tools:** Project tracking system, dashboard builder, alert engine
- **Note:** Adapts format and frequency to client preferences. Alerts humans only when their attention is actually needed.

---

### Area 6: Commercial and Operations

#### 6.1 Pricing Agent
- **Input:** Matter complexity, risk score, insurance cost, jurisdiction, competitive landscape
- **Output:** Fee proposal — fixed, outcome-based, or subscription, optimized for competitiveness
- **Tools:** Pricing model, competitive intelligence database, margin calculator

#### 6.2 Business Development Agent
- **Input:** Market signals, pipeline data, client agent inquiries
- **Output:** Engagement proposals, pipeline reports, forecasts
- **Tools:** CRM, market intelligence engine, proposal generator
- **Note:** Operates at machine speed in agent-to-agent markets.

#### 6.3 Reputation and Trust Agent
- **Input:** Quality scores, client feedback, agent-to-agent reputation signals
- **Output:** Reputation dashboard, trust score management, reputation risk alerts
- **Tools:** Reputation tracking system, agent ecosystem monitor
- **Note:** Monitors agent-to-agent reputation networks. The firm's reputation in agentic ecosystems may matter more than its human reputation.

#### 6.4 Coordination and Orchestration Agent (= THE ROUTER's back-end)
- **Input:** All active matters, agent capacity, dependencies
- **Output:** Work allocation, dependency management, escalation triggers
- **Tools:** Project management engine, capacity planner, dependency tracker
- **Note:** The project manager. Ensures nothing falls through the cracks. Works with the router to manage flow.

#### 6.5 Regulatory Horizon Agent
- **Input:** Global regulatory monitoring feeds
- **Output:** Change alerts, impact assessments, update propagation to affected matters
- **Tools:** Regulatory monitoring system, impact analysis engine
- **Note:** Watches 195 jurisdictions simultaneously. Propagates updates in real time.

---

### Area 7: Ethics and Oversight

#### 7.1 Ethics and Alignment Agent
- **Input:** Any matter or output flagged by router, evaluator, or consistency agent
- **Output:** Ethical assessment, recommendation to proceed / modify / decline
- **Tools:** Ethics framework library, conflict of interest database, values alignment checker
- **Note:** The conscience of the operation. Reviews edge cases before execution.

#### 7.2 Human Oversight Agent
- **Input:** All agent activity, escalation triggers, anomaly signals
- **Output:** Oversight reports, intervention recommendations, drift alerts
- **Tools:** Agent behavior monitoring system, anomaly detection engine
- **Note:** Prevents the "legal fiction of oversight" — humans rubber-stamping things they don't understand. This agent determines which decisions genuinely require human judgment vs. which can be autonomous.

---

## Architecture Rules

### 1. Evaluator Gate Rules
- The evaluator gate (Quality Audit Agent 3.1) runs on EVERY deliverable before it reaches a client
- The evaluator MUST use a different model or different prompt architecture than the specialist
- Maximum 2 revision loops. If it still fails after 2 loops, stop and escalate to human
- Every gate decision is logged with reasoning

### 2. Debate Rules
- Debate pattern is ONLY triggered for: novel legal questions, high-stakes strategic forks, ethical edge cases
- Debate requires heterogeneous agents (different models or fundamentally different prompt structures)
- Minimum 2, maximum 4 debaters
- A separate judge agent synthesizes — the judge is not one of the debaters
- The evaluator gate still applies after debate concludes
- Maximum 2 debate rounds before forcing a decision

### 3. Swarm / Handoff Rules
- Swarm is permitted inside a bounded matter (e.g., due diligence workstream)
- A top-level control plane always wraps the swarm: state tracking, stop conditions, permission boundaries
- Any agent can hand off to any other specialist, but must log the handoff with reasoning
- Maximum handoff chain depth: 4. After that, escalate to orchestration agent

### 4. Logging and Auditability
- Every agent logs every decision, every tool call, every input/output
- Logs are structured and machine-readable
- The liability mapping agent (2.3) can reconstruct any deliverable's full provenance chain
- Logs are immutable once written

### 5. Human Escalation
- Every agent has defined escalation triggers (documented per agent above)
- Escalation is not failure — it is the system working correctly
- The human oversight agent (7.2) monitors escalation patterns for systemic issues
- Humans can intervene at any stage, but the system should minimize unnecessary interruptions

### 6. Model Selection
- Router: strongest available reasoning model
- Specialists: best available for the domain (can vary by specialist)
- Evaluator gate: MUST be different from the specialist it evaluates
- Debate participants: heterogeneous by design
- Security and monitoring agents: can use smaller, faster models for continuous monitoring

---

## The Thesis

This is not a faster version of the old law firm. It is a system whose core premise is: **legal outcomes should be understandable, usable, and human-centered.** The reason they never were is because the old system had no incentive to make them that way.

The ratio is inverted from traditional law firms:
- ~30% legal core
- ~25% quality, risk, and security
- ~30% design, communication, and client interface
- ~15% commercial and operations

The legal work gets commoditized. The wrapper — insurance, trust, quality, design, translation — is the actual value.

---

## Build Order Suggestion

If building incrementally, start with:
1. Router + 1 specialist (e.g., Contract Review) + Evaluator Gate — this is the minimum viable pipeline
2. Add Plain Language Agent and Legal Design Agent — this is what makes the output different
3. Add Risk Pricing Agent and Liability Mapping Agent — this is what makes the firm insurable
4. Add remaining specialists one at a time, each with evaluator gate integration
5. Add debate pattern for litigation strategy
6. Add swarm pattern for due diligence
7. Add remaining design, commercial, and oversight agents

Each stage should be functional and testable on its own before adding the next.
