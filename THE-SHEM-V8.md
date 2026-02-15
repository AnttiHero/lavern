```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║                         THE SHEM                             ║
║              "We know what's written in the Golem's mouth"   ║
║                                                              ║
║         The world's first driverless law firm.               ║
║         Multi-agent legal design system.                     ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

## What This Is

The Shem is an autonomous legal services platform. It reads legal
documents, answers legal questions, produces research memos, reviews
contracts, and redesigns consumer-facing legal text — all without
a human lawyer doing the work. A human approves the work. The system
does it.

It runs on a team of 70 AI specialist agents — organized as a full
law firm with orchestrators, partners, associates, designers, and
infrastructure — that analyze, debate, verify, challenge, and price
the risk of their own output. Built by Legit (wearelegit.ai).

This is not a chatbot with a legal prompt. It is a workflow engine
with four specialized orchestrators, quality gates, adversarial
review, risk pricing, institutional memory, and a tamper-evident
audit trail. Every action is logged. Every gate decision is recorded.
Every output is quality-scored, adversarially tested, and risk-priced
before a human sees it.

──────────────────────────────────────────────────────────────

## Why This Matters

Legal services is a $1 trillion global market that runs on one
scarce resource: qualified attorney time. A senior associate
reviewing a standard NDA bills $500–$800/hour. A research memo on
a routine question costs $2,000–$5,000. A full contract review
with redlines: $5,000–$25,000. And the turnaround is days to weeks.

Most of this work is pattern-matching on precedent, applied to facts.
It requires deep expertise — but the expertise follows repeatable
structures. Research follows a framework. Contract review follows a
rubric. Document redesign follows design principles. The judgment is
real, but the process is learnable.

The Shem learns the process. Every engagement feeds back into
institutional memory. Successful patterns become precedents. Failures
become anti-patterns. The system gets better with every piece of work,
and it remembers across clients, across matters, across time.

The economics are different from a law firm. The marginal cost of
the 1,000th contract review is near zero. The quality of the 1,000th
review is higher than the 1st, because the system has learned from
999 prior reviews. Traditional firms have the opposite curve.

──────────────────────────────────────────────────────────────

## How It Works

A request comes in. The Router reads it and decides: **what is the
minimum viable workflow to handle this well?** Then the right
Orchestrator takes over — a specialized coordination agent matched
to that workflow's pattern.

```
                    ┌─────────────────────────────────┐
                    │        INCOMING REQUEST          │
                    │                                  │
                    │  "Review this NDA"               │
                    │  "Research non-compete law in CA" │
                    │  "Redesign these terms"          │
                    └──────────────┬───────────────────┘
                                   │
                    ┌──────────────▼───────────────────┐
                    │         LLM ROUTER               │
                    │                                   │
                    │  Classifies the request.          │
                    │  Estimates complexity & risk.     │
                    │  Selects workflow + orchestrator.  │
                    └──┬──────┬──────────┬──────────┬──┘
                       │      │          │          │
            ┌──────────▼┐ ┌──▼────────┐ ┌▼────────┐ ┌▼───────────────┐
            │simple-query│ │ contract  │ │research │ │  legal-design   │
            │  4 steps   │ │  review   │ │  memo   │ │   11 steps      │
            │  1 agent   │ │  6 steps  │ │ 5 steps │ │   8 agents      │
            │  0 gates   │ │  4 agents │ │ 3 agents│ │   3 gates       │
            └─────┬──────┘ └────┬──────┘ └───┬─────┘ └───────┬─────────┘
                  │             │             │               │
            THE FIXER     THE CLOSER   THE PROFESSOR    THE CONDUCTOR
            ──────────    ──────────   ─────────────    ─────────────
            Triage &      Pipeline     Deep research    Multidisciplinary
            dispatch.     management.  + adversarial    synthesis.
            Fast.         Reliable.    testing. Right.  Collaborative.
```

The principle: **don't spin up eight agents, three debates, and
three human gates to answer a question that needs one sentence.**
Default to the simplest path. Escalate complexity only when required.

──────────────────────────────────────────────────────────────

## The Four Orchestrators

This is the core of the whole operation. Each engagement is led
by one of four orchestrators — specialized coordination agents,
each built for a fundamentally different kind of work.

They are not generic project managers. Each one embodies a different
coordination strategy, built from hard-won lessons about what makes
multi-step AI pipelines fail or succeed.

### The Conductor — Multidisciplinary Synthesis

Runs the flagship legal-design pipeline: 11 steps, 8 specialists,
3 human gates. Dispatches five analysis agents in parallel, manages
two rounds of structured debate, coordinates verification loops,
and synthesises conflicting perspectives into a unified output.

The Conductor's job is managing disagreement. The ethics auditor
and the service designer will disagree. That disagreement IS the
insight. The Conductor resolves conflicts through structured debate
protocols — not by overruling, but by finding the synthesis that
none of the individual agents could produce alone.

```
  Coordination pattern:  Fan-out → Debate → Converge → Verify → Synthesize
  Assigned to:           legal-design
  Key strength:          Turns expert disagreement into better output
```

### The Closer — Sequential Pipeline Management

Runs contract reviews and pre-engagement onboarding: linear
pipelines with quality gates at every step. The Closer drives
work to completion. Every step has a clear entry condition, a
defined output, and a gate that opens only when quality is proven.

Where the Conductor thrives in ambiguity, the Closer eliminates it.
Handoffs between agents are managed like relay batons — no fumbles,
no drift. If the automated quality check fails, the work goes back.
No exceptions.

```
  Coordination pattern:  Step A → Gate → Step B → Gate → Deliver
  Assigned to:           contract-review, pre-engagement
  Key strength:          Delivers on deadline — every pipeline completes
```

### The Professor — Deep Research + Adversarial Testing

Runs research memos: deep investigation with citation validation
and adversarial stress-testing. The Professor coordinates research
the way a thesis advisor runs a doctoral defence — the answer only
ships when it survives attack.

Dispatches the legal researcher with exhaustive specifications.
Then sends the red team with one mandate: find what the research
missed. Citation validity is non-negotiable. "Probably right" is
not a passing grade.

```
  Coordination pattern:  Investigate → Validate → Stress-test
  Assigned to:           research-memo
  Key strength:          Output is bulletproof — survives adversarial review
```

### The Fixer — Rapid Triage

Handles simple queries: fast turnaround, minimal overhead. The
Fixer reads the incoming request and knows within seconds which
specialist to dispatch. Tight task specs, lean quality check,
immediate delivery.

Most queries are done before the other orchestrators finish their
intake phase. If the quality gate fails twice, the Fixer escalates
to a human — doesn't burn tokens on a third retry, because
compound failure rates make repeated attempts worse, not better.

```
  Coordination pattern:  Classify → Dispatch → Check → Deliver
  Assigned to:           simple-query
  Key strength:          Fastest time-to-answer — minimal overhead
```

──────────────────────────────────────────────────────────────

## Five Workflows

The Shem has five pipelines, each designed for a different kind
of legal work. Adding a sixth takes one file.

### Simple Query — The Fast Path

Someone asks a legal question. The Fixer dispatches one specialist.
The Evaluator Gate checks the answer. Done.

```
  ┌──────────┐   ┌────────────────────┐   ┌────────────────┐   ┌───────────┐
  │  INTAKE   │──▶│ SPECIALIST         │──▶│ EVALUATOR GATE │──▶│ DELIVERED │
  │           │   │ EXECUTION          │   │ (automated)    │   │           │
  │  Parse    │   │ One agent answers  │   │ Score >= 0.75? │   │  Return   │
  │  request  │   │ the question       │   │ Max 2 retries  │   │  answer   │
  └──────────┘   └────────────────────┘   └────────────────┘   └───────────┘

  Orchestrator: The Fixer
  Steps:  4
  Agents: 1 specialist + evaluator
  Gates:  0 human gates
  Cost:   ~$0.10–$0.50
```

### Contract Review — The Middle Path

Someone hands the system a contract. The Closer drives it through
clause-by-clause risk analysis, automated quality checking, risk
pricing, plain-language translation, and human approval.

```
  ┌──────────┐  ┌─────────────────┐  ┌────────────────┐  ┌─────────────────┐  ┌────────────┐  ┌───────────┐
  │  INTAKE   │─▶│ CONTRACT        │─▶│ EVALUATOR GATE │─▶│ PLAIN LANGUAGE  │─▶│ FINAL GATE │─▶│ DELIVERED │
  │           │  │ ANALYSIS        │  │ + RISK PRICING │  │ REVIEW          │  │ (human)    │  │           │
  │  Parse    │  │ Clause-by-clause│  │ Score + insure │  │ Translate for   │  │ Approve?   │  │  Return   │
  │  contract │  │ risk scoring    │  │ Max 2 retries  │  │ business reader │  │            │  │  package  │
  └──────────┘  └─────────────────┘  └────────────────┘  └─────────────────┘  └────────────┘  └───────────┘

  Orchestrator: The Closer
  Steps:  6
  Agents: contract-reviewer, plain-language-specialist, evaluator, risk-pricer
  Gates:  1 human gate (final delivery)
  Cost:   ~$1.00–$5.00
```

### Research Memo — The Knowledge Path

Someone asks a research question. The Professor dispatches the
legal researcher, runs the evaluator gate on citation quality,
then sends in the red team to adversarially stress-test everything.

```
  ┌──────────┐  ┌────────────────────┐  ┌────────────────┐  ┌────────────────┐  ┌───────────┐
  │  INTAKE   │─▶│ RESEARCH           │─▶│ EVALUATOR GATE │─▶│ RED TEAM       │─▶│ DELIVERED │
  │           │  │ EXECUTION          │  │ (automated)    │  │ REVIEW         │  │           │
  │  Frame    │  │ Citations, thesis, │  │ Citation check │  │ Adversarial    │  │  Return   │
  │  question │  │ confidence levels  │  │ Max 2 retries  │  │ stress test    │  │  memo     │
  └──────────┘  └────────────────────┘  └────────────────┘  └────────────────┘  └───────────┘

  Orchestrator: The Professor
  Steps:  5
  Agents: legal-researcher, evaluator, red-team
  Gates:  0 human gates
  Cost:   ~$0.50–$3.00
```

### Legal Design — The Full Pipeline

This is the big one. The Conductor dispatches eight specialist
agents to analyze a document in parallel, manages two rounds of
structured debate, coordinates transformation and verification,
and delivers a dual-artifact output.

Three human gates ensure a person approves critical decisions:
ethics, meaning preservation, and final delivery.

```
  ┌───────┐ ┌──────────┐ ┌────────┐ ┌───────┐ ┌──────────────┐ ┌────────┐ ┌────────┐ ┌───────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
  │INTAKE │▶│PARALLEL  │▶│DEBATE 1│▶│ETHICS │▶│TRANSFORMATION│▶│PARALLEL│▶│DEBATE 2│▶│MEANING│▶│SYNTHESIS│▶│FINAL   │▶│DELIVERED│
  │       │ │ANALYSIS  │ │        │ │GATE   │ │              │ │VERIFY  │ │        │ │GATE   │ │         │ │GATE    │ │         │
  └───────┘ └──────────┘ └────────┘ └───────┘ └──────────────┘ └────────┘ └────────┘ └───────┘ └─────────┘ └────────┘ └─────────┘

  Orchestrator: The Conductor
  Steps:  11
  Agents: 8 specialists
  Gates:  3 human gates (ethics, meaning, final)
  Cost:   ~$3.00–$10.00
```

### Pre-Engagement — Client Onboarding

The Closer runs the administrative process that precedes any
substantive work: conflict check, KYC screening, engagement letter,
client approval, team staffing, matter opening.

```
  Orchestrator: The Closer
  Steps:  7
  Agents: orchestrator-only (no specialist dispatch)
  Gates:  2 human gates (client acceptance, team selection)
```

──────────────────────────────────────────────────────────────

## The Firm: 70 Agents

The Shem is structured as a full law firm. Clients see the roster
in a team selection interface and choose who works their matter.

```
═══════════════════════════════════════════════════════════
  THE FIRM
═══════════════════════════════════════════════════════════

  ORCHESTRATORS (4)                        Always on. System agents.
  ──────────────────────────────────────   ─────────────────────────
  The Conductor                            Multidisciplinary synthesis
  The Closer                               Sequential pipelines
  The Professor                            Research + adversarial testing
  The Fixer                                Rapid triage

  LAWYERS (34)                             Legal expertise by seniority.
  ──────────────────────────────────────   ─────────────────────────
  8 Partners                               Strategic leadership
    Managing Partner (The Architect)
    Supervising Partner (The Mentor)
    Of Counsel (The Oracle)
    Innovation Partner (The Pioneer)
    Client Relations Partner (The Connector)
    Risk Partner (The Sentinel)
    Transaction Partner (The Closer)
    Litigation Partner (The Gladiator)

  10 Senior Associates                     Deep domain expertise
    M&A, Banking & Finance, Capital Markets,
    IP, Employment, Data Privacy,
    International Counsel, Restructuring, ...

  10 Associates                            Core delivery
    Corporate, Contract, Litigation, Tax,
    Real Estate, Regulatory, Environmental,
    Startup Counsel, Public Law, Tech Transactions

  6 Juniors                                Volume work + support
    Junior Associate, Paralegal, Legal Intern, ...

  SPECIALISTS (29)                         Non-legal domain experts.
  ──────────────────────────────────────   ─────────────────────────
  Design & Communication                   Service designer, UX writer,
                                           visual designer, information
                                           architect, plain language

  User Research & Testing                  Client proxy, user researcher,
                                           behavioral scientist,
                                           accessibility specialist

  Ethics & Governance                      Ethics auditor, DEI specialist,
                                           sustainability analyst

  Technology & Data                        Legal engineer, data analyst,
                                           cybersecurity advisor,
                                           AI ethics specialist

  Industry                                 Fintech, healthcare, media,
                                           energy

  INFRASTRUCTURE (3)                       Quality gates + operations.
  ──────────────────────────────────────   ─────────────────────────
  Evaluator (The Quality Gate)             Different model. 7-dimension
                                           rubric. Max 2 retries.
  Risk Pricer                              Error probability, loss
                                           magnitude, insurability.
  Red Team (The Adversary)                 Four hostile personas.
                                           Finds vulnerabilities.

═══════════════════════════════════════════════════════════
```

Every agent has an NBA2K-style profile card: 8 skill dimensions
rated 1–10, 5 personality axes, an archetype name, practice areas,
strengths, limitations, and a billing rate. Clients see these in
a team selection UI and build their team — from a 4-agent lean
squad to a 14-agent full-service engagement.

──────────────────────────────────────────────────────────────

## The Quality Stack

Quality is not one gate. It is four independent layers, each
designed to catch what the previous one missed.

### Layer 1: The Evaluator Gate

Every workflow passes through an Evaluator Gate before delivery.
The core idea: **use a different model to check the work.** If the
same model writes an answer and checks it, it makes the same mistakes
both times. A different model catches what the first one missed.

Seven scoring dimensions: factual correctness, citation validity,
policy compliance, tool consistency, jurisdictional accuracy,
internal consistency, completeness. Pass threshold: 0.75.
Max 2 revision loops. Then human.

### Layer 2: Red Team — Adversarial Testing

The Red Team attacks completed deliverables from the perspective
of a hostile counterparty. It asks: *how would opposing counsel use
this against our client?*

It finds: logical contradictions, unintended obligations,
jurisdictional gaps, ambiguous language, enforcement weaknesses.
Four adversarial personas: hostile counterparty, aggressive
regulator, opposing counsel, sophisticated bad actor.

### Layer 3: Risk Pricing — Insurability

The Risk Pricer runs on every deliverable. It produces:

```
═══════════════════════════════════════════════════════════
  RISK ASSESSMENT
═══════════════════════════════════════════════════════════

  Overall Risk Score:      0.23 (LOW)
  Error Probability:       12%
  Potential Loss:          $5,000 – $25,000 – $150,000
  Insurable:               Yes
  Premium Estimate:        $800–$1,200

  Risk Factors:
  ├── Jurisdictional complexity        0.15 × 0.3 = 0.045
  ├── Matter value sensitivity         0.20 × 0.2 = 0.040
  ├── Specialist confidence            0.15 × 0.1 = 0.015
  ├── Evaluator gate score             0.20 × 0.3 = 0.060
  ├── Historical error rate            0.15 × 0.2 = 0.030
  └── Recency of law                   0.15 × 0.3 = 0.045

═══════════════════════════════════════════════════════════
```

This makes the output insurable. A law firm that can tell an insurer
exactly what the error probability is, what the worst-case loss
looks like, and what mitigation factors exist — that firm gets
coverage. A firm that says "we used AI" does not.

### Layer 4: Institutional Memory

The system remembers. Successful patterns become precedents. Failures
become anti-patterns. Quality baselines track whether the system is
getting better or worse over time. Report cards compile per-session
quality metrics.

This isn't storage — it feeds back into every future engagement.
The 1,000th review is better than the 1st.

──────────────────────────────────────────────────────────────

## The Business Model

The Shem doesn't replace lawyers. It replaces the repetitive,
process-driven work that consumes most of a lawyer's billable hours,
and it makes the output insurable.

**Revenue model: per-engagement pricing.**

```
═══════════════════════════════════════════════════════════
  UNIT ECONOMICS (illustrative)
═══════════════════════════════════════════════════════════

  Service              Law Firm     The Shem    Margin
  ──────────────────   ──────────   ──────────  ───────
  Simple Q&A           $200–$500    $0.10–$0.50   99%
  Contract review      $1,600       $1–$5         99%
  Research memo        $2,000–$5K   $1–$3         99%
  Document redesign    $5K–$25K     $3–$10        99%

  Quality signal:      Trust-based  Measured
  Risk pricing:        None         Per-deliverable
  Insurability:        Firm-level   Output-level
  Learning curve:      Per-person   Institutional

═══════════════════════════════════════════════════════════
```

The system is not competing on price alone. It is competing on
**measurability**. The Shem knows its error rate. A law firm does not.

──────────────────────────────────────────────────────────────

## Architecture

### The Session

Every workflow runs inside a session — the system's memory for
a single engagement.

```
  ┌────────────────────────────────────────────────────────┐
  │                     SessionState                       │
  │                                                        │
  │  Events ─── Real-time event bus. WebSocket streaming.  │
  │             Routing, gates, workflow, cost, errors.     │
  │                                                        │
  │  Audit ──── JSONL audit trail with SHA-256 checksum    │
  │             chain. Tamper-evident. Every tool call,     │
  │             every gate decision, every cost event.      │
  │                                                        │
  │  Cost ───── Per-session budget tracking with hooks.    │
  │             Blocks tool calls when budget exceeded.     │
  │                                                        │
  │  Memory ─── Institutional memory (lessons learned).    │
  │             Matter memory (per-client context).         │
  │             Precedent library (successful patterns).    │
  │             Anti-pattern registry (known pitfalls).     │
  │                                                        │
  │  Gates ──── Human-in-the-loop decision points.         │
  │             Approve / reject / modify.                  │
  │                                                        │
  │  Risk ───── Per-deliverable risk assessments.          │
  │             Error probability, loss magnitude,          │
  │             insurability, recommendations.              │
  │                                                        │
  │  Debate ─── Shared debate board. Findings, challenges, │
  │             responses, resolutions. Severity scores.    │
  │                                                        │
  │  Workflow ── State machine with preconditions.          │
  │             Phase-based tool permissions enforce what    │
  │             agents can do at each step.                  │
  │                                                        │
  └────────────────────────────────────────────────────────┘
```

The audit trail is tamper-evident. Every action is logged to a JSONL
file with a SHA-256 checksum chain. If a single line is modified,
the chain breaks. This matters for legal work where you need to prove
what happened, in what order, and who approved it.

### Permissions

Agents can only use tools appropriate for the current workflow phase.
This is enforced at the SDK level — not in the prompt, where it could
be ignored. During analysis, agents post findings but cannot challenge.
During debate, they can challenge but cannot advance. During delivery,
no one can post new findings.

Secure by construction, not by instruction.

### Team Selection

Clients compose their team through an interactive staffing UI.
Every agent's skills, personality, billing rate, strengths, and
limitations are visible. Five presets offer starting points — Lean
(4 agents), Balanced (8), Full-Service (14), Litigation War Room
(10), Innovation Lab (10) — or clients build custom teams.

The engagement configurator recommends teams based on workflow type,
intensity level, and budget constraints. Orchestrators are always
included — they're system agents, not optional add-ons.

──────────────────────────────────────────────────────────────

## Design Decisions

### Why four orchestrators instead of one?

Different work requires different coordination strategies. A 10-step
multidisciplinary pipeline with parallel debate rounds needs a
conductor who thrives in ambiguity. A 6-step sequential contract
review needs a closer who drives gates to completion. A research
memo needs a professor who won't ship until citations survive
adversarial attack. A simple query needs a fixer who dispatches
in seconds.

One generic orchestrator would be mediocre at everything. Four
specialized orchestrators are excellent at their specific pattern.
Different pipeline lengths need different management strategies —
a 4-step triage and a 11-step design pipeline have fundamentally
different failure modes, and pretending otherwise is how you get
36% end-to-end success rates.

### Why different models for specialist and evaluator?

Correlated errors. If the same model writes and checks, it makes
the same mistakes both times. The #1 failure mode in multi-agent
systems is correlated confidence — two instances agreeing on
something that's wrong.

### Why adversarial review (Red Team)?

Quality gates catch *whether* something is wrong. The Red Team
catches *how* someone could exploit it. Different failure mode,
different detection method.

### Why risk pricing on every deliverable?

It makes the output insurable. An insurer needs error probability
and potential loss magnitude. The system calculates both. It also
makes pricing rational — bill for risk-adjusted output, not time.

### Why a state machine instead of free-form agent chatter?

Legal work requires auditability. You need to prove what happened,
in what order, and who approved it. A state machine with
preconditions gives you that.

### Why institutional memory?

Compounding advantage. Every engagement teaches the system something.
The 1,000th review is better than the 1st. Traditional firms have
the opposite curve — they lose institutional knowledge when people
leave.

──────────────────────────────────────────────────────────────

## The Numbers

```
═══════════════════════════════════════════════════════════
  THE SHEM v8 BUILD
═══════════════════════════════════════════════════════════

  Tests                          399
  Test files                      25
  Source lines (backend)      23,103
  Source lines (frontend)      6,338
  Total application code      29,441

  Workflow templates               5
  Agent profiles                  70
    Orchestrators                  4
    Lawyers                       34
    Specialists                   29
    Infrastructure                 3
  MCP tools                      ~62

  TypeScript errors                0

═══════════════════════════════════════════════════════════
```

──────────────────────────────────────────────────────────────

## What's Next

```
  Capability                       Status
  ────────────────────────────     ──────────────────────────────
  Compliance check workflow    →   Next. Template + compliance
                                   specialist.

  Litigation strategy          →   Debate pattern. Multiple agents
                                   argue opposing positions.

  Due diligence               →   Swarm pattern. Parallel
                                   document review across a data
                                   room.

  Multi-jurisdiction review   →   Template with parallel
                                   jurisdiction analysis steps.

  Client portal               →   WebSocket events stream.
                                   Build the client-facing UI.

  Cross-session analytics     →   Report cards and baselines are
                                   built. Connect to dashboard.
```

──────────────────────────────────────────────────────────────

```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║         The Shem v8                                          ║
║         399 tests. 70 agents. 4 orchestrators. 5 workflows. ║
║         Clean TypeScript. Insurable output.                  ║
║                                                              ║
║         "We know what's written in the Golem's mouth"        ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```
