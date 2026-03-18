# What Is Lavern?

## The One-Sentence Version

Lavern is a law firm that runs on software instead of people.

---

## The Problem

Legal services are broken in a way that everyone knows but nobody fixes.

When you start a company, sign a lease, hire your first employee, or agree to a vendor contract, you're handling legal documents that can determine whether your business lives or dies. An overlooked clause in an NDA can expose your trade secrets. A poorly understood liability cap can bankrupt you. A buried arbitration clause can strip you of your right to go to court.

There are two options available to most people and businesses:

**Option A: Hire a law firm.** A good one charges $500-$2,500 per hour. A contract review that a junior associate handles in a few days costs $5,000-$15,000. For a startup or a small business, that's not a legal expense -- it's an existential threat to the budget. And even after you pay, you're getting the work of whatever associate happened to be available that week, not the entire collective intelligence of the firm.

**Option B: Do it yourself.** Read the 47-page terms of service. Google the Latin phrases. Hope you catch the important parts. Most people choose this option, and most people miss things that matter.

There is no Option C. There is no middle ground between spending thousands of dollars and going in blind.

---

## What Lavern Actually Is

Lavern is Option C.

It's a software system that operates like a full-service law firm. When you bring a document to Lavern -- a contract, an NDA, terms of service, a privacy policy, an employment agreement -- a team of AI specialists analyzes it the way a real firm would, except faster and at a fraction of the cost.

That team isn't one AI chatbot giving you a single opinion. It's a coordinated group of 57 specialized agents, each with a defined role, expertise area, and professional personality. There's a managing partner who signs off on everything. There are contract specialists, regulatory counsel, privacy experts, risk analysts, ethics auditors. There's even a red team whose entire job is to attack the work of the other agents and find the holes.

These agents debate each other. They challenge each other's findings. They provide evidence for their positions. When they disagree, the system forces resolution through structured deliberation -- just like a real firm's internal review process, except it happens in minutes instead of weeks.

The result is a work product that looks like what you'd get from a real firm: a reviewed document with findings organized by severity, a risk assessment, specific clause-level analysis, and actionable recommendations. Every finding cites the specific text it's based on. Every claim is evidence-backed. Nothing is hand-waved.

---

## How It Works (For Regular People)

You go to Lavern the way you'd walk into a law firm's office.

**Step 1: Walk in.** You arrive at Lavern's reception. You can either drop your document and type a question ("Review this NDA for red flags") or go through a full client intake process where an AI interviewer asks you about your situation, your concerns, and what you need.

**Step 2: The firm staffs your matter.** Based on what you need, Lavern assembles a team. A simple question gets 3 agents. A contract review gets 8. A complex, high-stakes analysis gets 14 or more. You can see who's on your team, their specialties, and even their "billing rates" (which map to the computational cost of the AI model powering each agent).

**Step 3: The firm works your matter.** You can watch the agents work in real time. You see their thinking, their findings, their debates with each other. If the system needs your input at a decision point (a "gate"), it asks. You approve or redirect.

**Step 4: Delivery.** You receive the completed work product: a redesigned document, a contract review report, a research memo, or a legal analysis. Always two artifacts -- one for you to use, and one that shows all the work behind it (the debate transcripts, the verification results, the audit trail). You also get a clear invoice showing exactly what it cost, broken down by phase and by which agents did what.

---

## What It Costs

Lavern runs on a budget model. You set how much you want to spend, and the system works within that.

| Depth | Budget | Team Size | Time | What You Get |
|-------|--------|-----------|------|-------------|
| Quick | ~$3 | 3 agents | 2-5 min | Fast answer, no debate |
| Standard | ~$10 | 6 agents | 10-25 min | Reviewed answer, critical gates only |
| Thorough | ~$20 | 10 agents | 25-60 min | Full analysis with debate |
| Maximal | ~$40 | 14 agents | 1-3 hours | Everything: full team, all gates, extended deliberation |

A contract review that would cost $5,000-$15,000 at a traditional firm costs $10-$40 at Lavern.

The system enforces a hard budget cap. If your budget runs out mid-work, the session stops. You never get a surprise bill.

---

## The Three Ways to Use Lavern

**1. Manual Mode (The Full Experience)**
Walk through the entire firm experience: intake, briefing with an AI interviewer, strategy selection, team staffing, live work dashboard, delivery, billing. This is the way to use Lavern when you want to understand and control every step.

**2. Quick Start (Drop and Go)**
Drop a document, type a question, hit "Instruct." The firm handles everything automatically -- no intake, no strategy conference, no gate approvals. Results in minutes. This is for when you know what you need and just want the answer.

**3. Clawern (The Firm on Retainer)**
Point Lavern at a folder on your computer. Every time a new document appears -- a contract comes in via email, a policy gets updated, an agreement gets drafted -- Lavern automatically picks it up, figures out what kind of document it is, assembles the right team, analyzes it, and delivers the results. No human involvement at all. It runs while you sleep.

Clawern is what turns Lavern from a tool you use into a firm that works for you, continuously, in the background.

---

## Why This Matters

The legal system is one of the last industries where access is almost entirely a function of wealth. If you can afford a $2,500/hour partner, you get excellent protection. If you can't, you get nothing -- you're on your own reading documents you weren't trained to understand, written by people who were trained to make them hard to understand.

Lavern doesn't make legal services free. But it makes them affordable enough that a freelancer signing a client contract, a startup reviewing their first term sheet, a small business evaluating a vendor agreement, or an individual reading their lease can all get the kind of analysis that used to be reserved for corporations with seven-figure legal budgets.

The work is done by AI, not by licensed attorneys, and Lavern does not provide legal advice. What it provides is analysis -- thorough, multi-perspective, evidence-based analysis -- that dramatically narrows the gap between what you can see on your own and what a full legal team would catch.

---

## The Name

Lavern. The old-money firms -- the ones with marble lobbies and partner names carved in stone above the entrance. Except this one runs on code instead of associates, and charges $10 instead of $10,000.

The internal codename is "The Shem" -- Hebrew for "the name." In Jewish folklore, the Golem is animated by placing a shem in its mouth: a word that brings something to life. Lavern is the word that brings the firm to life.

---

## Security and Client Privilege

Lavern takes security seriously. The API is authenticated (Bearer token + cookie auth), all endpoints require authorization, and the system supports HTTPS via reverse proxy (Caddy). API keys can be stored in macOS Keychain instead of plaintext .env files.

The hardest problem in legal AI isn't technical -- it's privilege. When document content is sent to an external API, opposing counsel can argue that attorney-client privilege was waived. This is the single biggest blocker of AI adoption in legal.

Lavern addresses this with a dual-model architecture:

**Confidential documents** (filenames matching sensitivity patterns like "confidential," "privileged," "merger," "litigation") are processed entirely on-device using a local model via Ollama. No data leaves the machine. The analysis is simpler than the full pipeline -- a focused single-model review rather than the 57-agent debate system -- but it provides useful clause-level analysis, risk flagging, and plain-language summary with zero data exfiltration. Cost: $0.

**Regular documents** go through the full frontier model pipeline with Claude: multi-agent analysis, debate, verification, and synthesis.

The system fails safe. If a confidential document is detected but no local model is configured, Lavern flags it and refuses to process it rather than sending privileged content to an external API.

---

## Who Built This

Lavern is built by Legit (wearelegit.ai). The system is currently in version 0.10. It runs on Anthropic's Claude models and operates as a self-hosted application -- your documents stay on your infrastructure, processed by your API key.

---

*This system assists with document design, analysis, and accessibility. It does not provide legal advice. Always verify results with qualified legal professionals.*
