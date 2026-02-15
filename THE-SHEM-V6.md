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

It runs on a team of AI specialist agents that analyze, debate, verify,
challenge, and price the risk of their own output. Built on Anthropic's
Claude Agent SDK. Built by Legit (wearelegit.ai).

This is not a chatbot with a legal prompt. It is a workflow engine
with specialists, quality gates, adversarial review, risk pricing,
institutional memory, and a tamper-evident audit trail. Every action
is logged. Every gate decision is recorded. Every output is quality-scored,
adversarially tested, and risk-priced before a human sees it.

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

A request comes in. The Router — the system's brain — reads it and
decides: **what is the minimum viable workflow to handle this well?**

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
                    │  Selects the minimum viable       │
                    │  workflow. Assigns specialists.    │
                    └──┬──────┬──────────┬──────────┬──┘
                       │      │          │          │
            ┌──────────▼┐ ┌──▼────────┐ ┌▼────────┐ ┌▼───────────────┐
            │simple-query│ │ contract  │ │research │ │  legal-design   │
            │  4 steps   │ │  review   │ │  memo   │ │   11 steps      │
            │  1 agent   │ │  6 steps  │ │ 5 steps │ │   8 agents      │
            │  0 gates   │ │  4 agents │ │ 3 agents│ │   3 gates       │
            └─────┬──────┘ └────┬──────┘ └───┬─────┘ └───────┬─────────┘
                  │             │             │               │
                  └─────┬───────┘             │               │
                        │        ┌────────────┘               │
                        │        │                            │
             ┌──────────▼────────▼───────┐  ┌────────────────▼────────┐
             │    Generic Executor       │  │   Legal Design           │
             │                           │  │   Executor               │
             └──────────┬────────────────┘  └────────────┬────────────┘
                        │                                │
                 ┌──────▼────────────────────────────────▼──────┐
                 │                SessionState                   │
                 │                                               │
                 │  Events  Audit  Cost  Memory  Gates  Risk     │
                 └───────────────────────────────────────────────┘
```

The principle: **don't spin up eight agents, three debates, and
three human gates to answer a question that needs one sentence.**
Default to the simplest path. Escalate complexity only when required.

──────────────────────────────────────────────────────────────

## The Router

The Router is the highest-leverage component in the system. One
classification determines the entire processing path — which workflow
runs, which specialists are assigned, how many quality gates,
whether adversarial review is needed, whether ethics screening
comes first.

v6 introduced LLM-based routing. The Router is no longer a lookup
table. It reasons about the request: reads the text, estimates
complexity, considers the document type, checks for jurisdictional
edge cases, and selects the right pipeline. If the LLM call fails
or hallucinates a non-existent workflow, deterministic rules catch
the fall. Two tiers. Always safe.

```
═══════════════════════════════════════════════════════════
  ROUTER DECISION MATRIX
═══════════════════════════════════════════════════════════

  What came in                                What runs
  ───────────────────────────────────────     ────────────────────
  "Redesign this terms of service"        →   legal-design
  "Review this NDA for red flags"         →   contract-review
  "What is force majeure?"                →   simple-query
  "Research non-compete law in California"→   research-memo
  "Assess the risk on this deliverable"   →   simple-query + risk-pricer
  Document attached, general              →   contract-review
  No document, general                    →   simple-query

═══════════════════════════════════════════════════════════
```

The Router also sets flags that modify how the workflow runs:

```
  Flag                        Fires When
  ─────────────────────────   ──────────────────────────────────
  requiresEthicsFirst     →   Consumer data, privacy, consent
  requiresConsistencyCheck →  Existing client/matter involved
  requiresDebate          →   Multi-specialist, conflicting concerns
```

──────────────────────────────────────────────────────────────

## Four Workflows

The Shem has four pipelines, each designed for a different kind
of legal work. Adding a fifth takes one file.

### Simple Query — The Fast Path

Someone asks a legal question. One specialist answers it. The
Evaluator Gate checks the answer. Done.

```
  ┌──────────┐   ┌────────────────────┐   ┌────────────────┐   ┌───────────┐
  │  INTAKE   │──▶│ SPECIALIST         │──▶│ EVALUATOR GATE │──▶│ DELIVERED │
  │           │   │ EXECUTION          │   │ (automated)    │   │           │
  │  Parse    │   │ One agent answers  │   │ Score >= 0.75? │   │  Return   │
  │  request  │   │ the question       │   │ Max 2 retries  │   │  answer   │
  └──────────┘   └────────────────────┘   └────────────────┘   └───────────┘

  Steps:  4
  Agents: 1 specialist + evaluator
  Gates:  0 human gates
  Cost:   ~$0.10–$0.50
```

**Example requests:**
- "What is force majeure?"
- "How do I file a GDPR data subject request?"
- "Assess the risk profile of this deliverable" (routes risk-pricer)

### Contract Review — The Middle Path

Someone hands the system a contract. A specialist does clause-by-clause
risk analysis. The Evaluator checks quality. The Risk Pricer scores
the deliverable for error probability and insurability. A plain-language
specialist translates the findings into business language. A human approves
before delivery.

```
  ┌──────────┐  ┌─────────────────┐  ┌────────────────┐  ┌─────────────────┐  ┌────────────┐  ┌───────────┐
  │  INTAKE   │─▶│ CONTRACT        │─▶│ EVALUATOR GATE │─▶│ PLAIN LANGUAGE  │─▶│ FINAL GATE │─▶│ DELIVERED │
  │           │  │ ANALYSIS        │  │ + RISK PRICING │  │ REVIEW          │  │ (human)    │  │           │
  │  Parse    │  │ Clause-by-clause│  │ Score + insure │  │ Translate for   │  │ Approve?   │  │  Return   │
  │  contract │  │ risk scoring    │  │ Max 2 retries  │  │ business reader │  │            │  │  package  │
  └──────────┘  └─────────────────┘  └────────────────┘  └─────────────────┘  └────────────┘  └───────────┘

  Steps:  6
  Agents: contract-reviewer, plain-language-specialist, evaluator, risk-pricer
  Gates:  1 human gate (final delivery)
  Cost:   ~$1.00–$5.00
```

The contract-reviewer produces a structured analysis:

```
  For each clause:
  ├── Risk score (1-5)
  ├── Standard position comparison
  ├── Deviation flag (GREEN / YELLOW / RED)
  └── Recommended redline language

  Negotiation priorities:
  ├── Tier 1: Must-change (deal-breakers)
  ├── Tier 2: Should-negotiate (material risk)
  └── Tier 3: Nice-to-have (can trade as concessions)
```

### Research Memo — The Knowledge Path

Someone asks a legal research question. The Legal Researcher produces
a structured memo with citations, confidence levels, and conflicting
authorities flagged. The Evaluator checks citation validity. The Red
Team adversarially stress-tests the research — looking for gaps the
researcher missed, authorities that cut the other way, jurisdictional
blind spots.

```
  ┌──────────┐  ┌────────────────────┐  ┌────────────────┐  ┌────────────────┐  ┌───────────┐
  │  INTAKE   │─▶│ RESEARCH           │─▶│ EVALUATOR GATE │─▶│ RED TEAM       │─▶│ DELIVERED │
  │           │  │ EXECUTION          │  │ (automated)    │  │ REVIEW         │  │           │
  │  Frame    │  │ Citations, thesis, │  │ Citation check │  │ Adversarial    │  │  Return   │
  │  question │  │ confidence levels  │  │ Max 2 retries  │  │ stress test    │  │  memo     │
  └──────────┘  └────────────────────┘  └────────────────┘  └────────────────┘  └───────────┘

  Steps:  5
  Agents: legal-researcher, evaluator, red-team
  Gates:  0 human gates
  Cost:   ~$0.50–$3.00
```

This is the first pipeline that chains **specialist, evaluator,
and adversarial review** — three independent perspectives on the
same work product, each trying to find what the others missed.

**Example requests:**
- "Research the enforceability of non-compete clauses in California"
- "What are the GDPR right-to-erasure requirements across EU member states?"
- "Analyze conflicting circuit court positions on arbitration clauses"

### Legal Design — The Full Pipeline

This is the big one. Eight specialist agents analyze a document in
parallel, debate their findings, challenge each other, transform the
document, verify the transformation preserved legal meaning, and
deliver a dual-artifact output: a redesigned document and a legal
review package with a full audit trail.

Three human gates ensure a person approves critical decisions:
ethics, meaning preservation, and final delivery.

```
  ┌───────┐ ┌──────────┐ ┌────────┐ ┌───────┐ ┌──────────────┐ ┌────────┐ ┌────────┐ ┌───────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
  │INTAKE │▶│PARALLEL  │▶│DEBATE 1│▶│ETHICS │▶│TRANSFORMATION│▶│PARALLEL│▶│DEBATE 2│▶│MEANING│▶│SYNTHESIS│▶│FINAL   │▶│DELIVERED│
  │       │ │ANALYSIS  │ │        │ │GATE   │ │              │ │VERIFY  │ │        │ │GATE   │ │         │ │GATE    │ │         │
  └───────┘ └──────────┘ └────────┘ └───────┘ └──────────────┘ └────────┘ └────────┘ └───────┘ └─────────┘ └────────┘ └─────────┘

  Steps:  11
  Agents: 8 specialists
  Gates:  3 human gates (ethics, meaning, final)
  Cost:   ~$3.00–$10.00
```

──────────────────────────────────────────────────────────────

## The Quality Stack

Quality is not one gate. It is four independent layers, each designed
to catch what the previous one missed.

### Layer 1: The Evaluator Gate

Every workflow passes through an Evaluator Gate before delivery.
The core idea: **use a different model to check the work.** If the same
model writes an answer and checks it, it makes the same mistakes both
times. The writer can't see its own blind spots. A different model —
a skeptic — catches what the first one missed.

```
  Specialist (Sonnet)              Evaluator (Opus)
  ┌──────────────────┐            ┌──────────────────┐
  │ Produces work    │───────────▶│ Scores on 7      │
  │                  │            │ dimensions       │
  └──────────────────┘            └────────┬─────────┘
                                           │
                                  Pass?    │    Fail?
                               ┌───────┐  │  ┌──────────────┐
                               │ Next  │◀─┘─▶│ Send back.   │
                               │ step  │      │ Max 2 loops. │
                               └───────┘      │ Then human.  │
                                              └──────────────┘
```

Seven scoring dimensions: factual correctness, citation validity,
policy compliance, tool consistency, jurisdictional accuracy,
internal consistency, completeness. Pass threshold: 0.75.

### Layer 2: Red Team — Adversarial Testing

The Red Team agent attacks completed deliverables from the perspective
of a hostile counterparty. It asks: *how would opposing counsel use
this against our client?*

It finds: logical contradictions, unintended obligations, jurisdictional
gaps, ambiguous language that could be interpreted against the client,
enforcement weaknesses. It runs four adversarial personas: hostile
counterparty, aggressive regulator, opposing counsel, sophisticated
bad actor.

If the Red Team finds nothing, the work is strong. If it finds
vulnerabilities, the specialist has specific feedback on what to fix
and why.

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

  Recommendations:
  ├── Seek second opinion on Section 7.2
  └── Verify client's insurance covers IP indemnity

═══════════════════════════════════════════════════════════
```

This is the piece that makes the output insurable. A law firm that
can tell an insurer exactly what the error probability is, what the
worst-case loss looks like, and what mitigation factors exist — that
firm gets coverage. A firm that says "we used AI" does not.

### Layer 4: Institutional Memory

The system remembers. Successful patterns become precedents. Failures
become anti-patterns. Research findings are saved for future queries.
Quality baselines track whether the system is getting better or worse
over time. Report cards compile per-session quality metrics.

This isn't just storage — it feeds back into every future engagement.
A legal researcher starts by querying: *has this question been answered
before?* A contract reviewer asks: *what clauses were commonly missed
in prior NDA reviews?* The 1,000th review is better than the 1st.

──────────────────────────────────────────────────────────────

## The Agents

Thirteen specialist agents, each with a defined role and mandate.

```
═══════════════════════════════════════════════════════════
  AGENT ROSTER
═══════════════════════════════════════════════════════════

  LEGAL CORE
  ──────────────────────────────────────────────────────
  legal-researcher            Research memos with citations,
                              confidence levels, conflicting
                              authorities. Escalates when
                              precedent is unclear.

  contract-reviewer           Clause-by-clause risk analysis.
                              Risk scores (1-5). Deviation flags.
                              Redline drafting. Negotiation tiers.

  RISK & INSURANCE
  ──────────────────────────────────────────────────────
  risk-pricer                 Error probability, potential loss
                              magnitude, insurability assessment.
                              Runs on every deliverable. Six
                              weighted risk factors.

  QUALITY & SECURITY
  ──────────────────────────────────────────────────────
  evaluator                   Automated quality gate. Different
                              model from specialists. 7-dimension
                              rubric. Max 2 revision loops.

  red-team                    Adversarial testing. Four hostile
                              personas. Finds vulnerabilities,
                              edge cases, ambiguities. Gets 1-2
                              shots at breaking the work.

  DESIGN & ANALYSIS TEAM
  ──────────────────────────────────────────────────────
  design-reviewer             Scores documents on 5 dimensions.
                              Readability, findability, clarity,
                              visual design, ethics.

  ethics-auditor              Detects 7 categories of dark patterns.
                              Maps to GDPR/FTC/CCPA regulations.

  service-designer            Analyzes the full user journey.
                              Touchpoints, tasks, emotional arcs.

  plain-language-specialist   Cognitive load analysis. FK grade
                              level. Plain language transformation.

  client-proxy                Role-plays as the actual reader.
                              Tests documents against user personas.

  TRANSFORMATION & SYNTHESIS
  ──────────────────────────────────────────────────────
  transformation-specialist   Rewrites the document, preserving
                              legal meaning while improving design.

  meaning-guardian            Verifies no legal meaning was lost
                              during transformation.

  synthesis-editor            Assembles the final dual-artifact
                              output: redesigned doc + review package.

═══════════════════════════════════════════════════════════
```

In the legal-design workflow, five analysis agents run in parallel.
They debate. The ethics-auditor challenges the design-reviewer's
severity ratings. The meaning-guardian challenges the transformation.
Findings are posted to a shared debate board with severity and
confidence scores. Conflicts are resolved through structured
challenge-response exchanges.

This isn't round-robin. It's genuine collaboration — the kind where
the output is better because the agents disagree.

──────────────────────────────────────────────────────────────

## The Business Model

The Shem doesn't replace lawyers. It replaces the repetitive,
process-driven work that consumes most of a lawyer's billable hours,
and it makes the output insurable.

**Revenue model: per-engagement pricing.**

A contract review that takes a junior associate 4 hours at $400/hr
($1,600) runs through The Shem for $1–$5 in API costs. Even at a
10x markup for risk, insurance, and margin, that's $10–$50.

The margin is API cost + risk premium. The risk premium is calculable
because the Risk Pricer tells you exactly what the error probability is.
The insurance premium is estimable because the system produces the data
insurers need: error rates, loss projections, audit trails, quality scores.

**Key insight:** traditional law firms cannot price risk because
they don't measure it. They price time. The Shem prices output —
and it knows how good that output is, because it measures quality
on every engagement.

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
  │             Routing decisions, gate results, workflow   │
  │             transitions, cost updates, errors.          │
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
  │             CLI (readline) or API (async resolver).     │
  │             Approve / reject / modify.                  │
  │                                                        │
  │  Risk ───── Per-deliverable risk assessments.          │
  │             Error probability, loss magnitude,          │
  │             insurability, recommendations.              │
  │                                                        │
  │  Debate ─── Shared debate board. Findings, challenges, │
  │             responses, resolutions. RED/YELLOW/GREEN    │
  │             severity with confidence scores.            │
  │                                                        │
  │  Workflow ── State machine with preconditions.          │
  │             Phase-based tool permissions enforce what    │
  │             agents can do at each step.                  │
  │                                                        │
  └────────────────────────────────────────────────────────┘
```

The audit trail is tamper-evident. Every action is logged to a JSONL
file with a SHA-256 checksum chain. Each entry's hash includes the
previous entry's hash. If a single line is modified, the chain breaks.
This matters for legal work where you need to prove what happened,
in what order, and who approved it.

### Permissions

Agents can only use tools appropriate for the current workflow phase.
This is enforced at the SDK level — not in the prompt, where it could
be ignored. During analysis, agents post findings but cannot challenge
each other. During debate, they can challenge but cannot advance the
workflow. During delivery, no one can post new findings.

Each workflow template defines its own permission rules. The system
is secure by construction, not by instruction.

### Workflow Templates

Every workflow is defined declaratively as a data structure. Adding
a new workflow takes one file: define the steps, preconditions,
agents, tools, permissions. Register it. The Router sees it.

```
╔══════════════════════════════════════════════════════════════╗
║                    WORKFLOW REGISTRY                         ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  legal-design    contract-review   research-memo  simple-    ║
║  ────────────    ───────────────   ─────────────  query      ║
║  11 steps        6 steps           5 steps        4 steps    ║
║  8 agents        4 agents          3 agents       1 agent    ║
║  ~55 tools       ~17 tools         ~15 tools      ~10 tools  ║
║  3 human gates   1 human gate      0 human gates  0 gates    ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

──────────────────────────────────────────────────────────────

## Using The Shem

### CLI

```bash
# Legal design — redesign a document
npx tsx src/index.ts ./terms-of-service.txt \
  --moment signup --audience consumer --jurisdiction EU

# Contract review — analyze a contract
npx tsx src/index.ts ./nda.pdf \
  --request "Review this NDA for red flags" --budget 3.00

# Legal research — structured research memo
npx tsx src/index.ts --request "Research non-compete enforceability in California" \
  --workflow research-memo

# Simple query — ask a legal question
npx tsx src/index.ts --request "What is force majeure?"

# Force a specific workflow
npx tsx src/index.ts --request "Explain GDPR Article 17" \
  --workflow simple-query
```

### API

```json
POST /api/sessions
{
  "request": {
    "type": "legal_research",
    "requestText": "Research the enforceability of non-compete clauses in California",
    "context": { "jurisdiction": "US" }
  },
  "options": { "budget": 5.00 }
}
```

The API returns a session ID. Connect to the WebSocket endpoint for
real-time event streaming. Submit gate decisions via POST.

──────────────────────────────────────────────────────────────

## Design Decisions

### Why different models for specialist and evaluator?

Correlated errors. If the same model writes an answer and checks it,
it makes the same mistakes both times. The #1 failure mode in
multi-agent systems is correlated confidence — two instances of the
same model agreeing on something that's wrong.

### Why adversarial review (Red Team)?

Quality gates catch *whether* something is wrong. The Red Team catches
*how* someone could exploit it. A contract might pass quality review
but contain an ambiguity that opposing counsel would use against the
client. The Red Team finds that ambiguity. Different failure mode,
different detection method.

### Why risk pricing on every deliverable?

Two reasons. First, it makes the output insurable. An insurer needs
to know the error probability and potential loss magnitude. The system
calculates both. Second, it makes pricing rational. Instead of billing
for time, bill for risk-adjusted output. The client knows exactly
what they're paying for and what the risk is.

### Why a state machine instead of free-form agent chatter?

Legal work requires auditability. You need to prove what happened,
in what order, and who approved it. A state machine with preconditions
gives you that. Step 5 cannot happen before step 4 is complete. Gate
decisions are recorded. The audit trail is tamper-evident.

### Why LLM-based routing with deterministic fallback?

The LLM Router can reason about ambiguous requests that don't fit
clean categories. But LLMs can hallucinate — including hallucinating
workflow IDs that don't exist. The deterministic fallback catches
that. Two tiers: smart when it works, safe when it doesn't.

### Why institutional memory?

The system gets better over time. When it learns that a particular
type of clause is commonly missed in NDA reviews, that lesson goes
into institutional memory. Precedents capture successful patterns.
Anti-patterns capture known pitfalls. Every engagement teaches the
system something. This is the compounding advantage — it grows with
every piece of work.

──────────────────────────────────────────────────────────────

## The Numbers

```
═══════════════════════════════════════════════════════════
  THE SHEM v6 BUILD
═══════════════════════════════════════════════════════════

  Tests                          374
  Test files                      23
  Source files                   ~60
  Workflow templates               4
  Agent roles                     13
  MCP tools                      ~62
  TypeScript errors                0

═══════════════════════════════════════════════════════════
```

──────────────────────────────────────────────────────────────

## What's Next

The architecture is built for extension. Each row below is one
template file and one agent prompt.

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

  Client portal               →   WebSocket events already stream.
                                   Build the UI.

  Cross-session learning      →   Report card, feedback loop, and
                                   baselines are built. Connect to
                                   analytics dashboard.
```

──────────────────────────────────────────────────────────────

## File Map

```
  src/
  ├── dispatch.ts                    Universal entry point
  ├── orchestrator.ts                Legal design executor
  │
  ├── router/
  │   ├── router.ts                  LLM + deterministic classification
  │   ├── router-prompt.ts           Router system prompt
  │   └── router-schema.ts           Zod schema for structured output
  │
  ├── workflows/
  │   ├── registry.ts                Template registry
  │   ├── executor.ts                Generic workflow executor
  │   ├── index.ts                   Auto-registration
  │   └── templates/
  │       ├── legal-design.ts        11-step document redesign
  │       ├── contract-review.ts     6-step contract analysis + risk pricing
  │       ├── research-memo.ts       5-step legal research + adversarial review
  │       └── simple-query.ts        4-step question answering
  │
  ├── agents/
  │   ├── definitions.ts             All 13 agent configs
  │   └── prompts/
  │       ├── orchestrator.ts        Lead orchestrator
  │       ├── design-reviewer.ts     5-dimension scorer
  │       ├── ethics-auditor.ts      Dark pattern detector
  │       ├── service-designer.ts    User journey analyst
  │       ├── plain-language-specialist.ts  Cognitive load
  │       ├── client-proxy.ts        Reader persona
  │       ├── transformation.ts      Document rewriter
  │       ├── meaning-guardian.ts    Legal meaning verifier
  │       ├── synthesis-editor.ts    Final assembly
  │       ├── evaluator.ts           Quality gate
  │       ├── contract-reviewer.ts   Clause-by-clause analysis
  │       ├── legal-researcher.ts    Research memos + citations
  │       ├── risk-pricer.ts         Risk scoring + insurability
  │       └── red-team.ts            Adversarial testing
  │
  ├── mcp/
  │   ├── server.ts                  MCP server factory
  │   └── tools/
  │       ├── debate-board.ts        Shared agent state
  │       ├── scoring-engine.ts      Computational scoring
  │       ├── approval-gate.ts       Human gates
  │       ├── workflow-engine.ts     11-step state machine
  │       ├── generic-workflow-engine.ts  N-step state machine
  │       ├── verification-engine.ts Self/cross/score checks
  │       ├── evaluator-gate.ts      Quality gate tools
  │       ├── risk-pricing.ts        Risk assessment tools
  │       ├── memory-system.ts       Institutional memory
  │       ├── report-card.ts         Quality metrics
  │       ├── feedback-loop.ts       Post-session learning
  │       ├── baselines.ts           Quality expectations
  │       ├── legal-md-compiler.ts   Knowledge export
  │       └── session-replay-testing.ts  Regression tests
  │
  ├── session/
  │   ├── session-state.ts           Per-session state
  │   └── session-manager.ts         Multi-session management
  │
  ├── permissions/
  │   └── dynamic-permissions.ts     Phase-based tool access
  │
  ├── hooks/
  │   ├── audit-logger.ts            Audit trail hooks
  │   ├── cost-tracker.ts            Budget enforcement
  │   └── human-gate.ts              Gate enforcement
  │
  ├── events/
  │   └── event-bus.ts               Real-time event system
  │
  ├── gates/
  │   └── gate-resolver.ts           CLI + API + auto-approve
  │
  ├── types/
  │   ├── index.ts                   Core types
  │   ├── workflow.ts                Workflow + template types
  │   ├── debate.ts                  Debate board types
  │   └── output-schemas.ts          Agent output formats (Zod)
  │
  ├── api/
  │   ├── server.ts                  Fastify API server
  │   ├── routes/sessions.ts         Session CRUD
  │   └── ws-handler.ts              WebSocket streaming
  │
  ├── utils/
  │   └── audit-persistence.ts       JSONL + checksum chain
  │
  └── index.ts                       CLI entry point
```

──────────────────────────────────────────────────────────────

```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║         The Shem v6                                          ║
║         374 tests. 13 agents. 4 workflows.                   ║
║         Clean TypeScript. Insurable output.                  ║
║                                                              ║
║         "We know what's written in the Golem's mouth"        ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```
