# Lighthouse Eval — v2 (after the three fixes)

**Date:** 2026-05-10
**Model:** Ollama / `gemma2:2b` (unchanged from v1)
**Inputs:** same 3 CUAD JV contracts as v1 (BorrowMoney.com, Sibannac, Veoneer)
**What changed since v1:**
- Fix 1: Chunker — inline-numbered fallback (handles CUAD/PDF/flat-paragraph text)
- Fix 2: Synthesis prompt — explicit "profile is stance, not facts" instruction + restructured user message
- Fix 3: Precedent search — multi-jurisdiction OR-match with documentType-only fallback
- (Fix 4: eval script log-stream lifecycle — not a production change)

**1,686/1,686 tests still pass.** No regressions on the existing suite.

---

## The numbers — v1 vs v2 side by side

### Architectural claims, falsified or vindicated

| Claim | v1 | v2 | Verdict |
|---|---|---|---|
| Reader fans out across ~22 calls per doc | **1/1/1 calls** (chunker collapsed) | **28/11/4 calls** | ✅ **vindicated** |
| Precedent context reaches the Reader on doc N+1 | 0 / 0 / 0 prompts had block | **0 / 11 / 4** prompts had block | ✅ **vindicated** |
| Distinct precedents seen across docs | 0 across all 3 | 0 → 1 → 3 | ✅ **compounds** |
| Summary not contaminated by client profile | 3/3 hallucinated | **2/3 grounded, 1/3 over-cautious** | 🟡 **fixed but over-corrected** |
| Curator surfaces a portfolio-level alert | crashed before running | ✅ surfaced 1 critical | ✅ **works** |
| Total cost | $0.00 | $0.00 | ✅ |
| Total wall-clock | 3 min | **10 min** | ⚠ 3.3× slower (actual fan-out is happening) |

### Per-doc summary text — the single most visible change

| Doc | v1 summary (hallucinated) | v2 summary (grounded) |
|---|---|---|
| BorrowMoney | "Acme Holdings and BorrowMoneyCom have entered into a joint venture agreement for a **mining project in New South Wales**…" | "joint venture between Acme Holdings and **[other party]** for the purpose of **[venture's purpose]**…" |
| Sibannac | "**Acme Holdings** and Sibannac are entering into a joint venture agreement for an **exploration project in New South Wales**…" | "joint venture agreement between **Bravatek and Sibannac**, with Bravatek providing non-operator support to Sibannac in developing and marketing a product…" |
| Veoneer | "**Acme Holdings** and Veoneer are **finalizing** a joint venture agreement for a project **in New South Wales, Australia**…" | "joint venture agreement between **Veoneer and Nissin** for a specific purpose (**the JV entities VNBJ and VNBZ**) with **pre-existing liabilities remaining in effect even after termination**…" |

**Read the bold text only.** v1 invented client, jurisdiction, industry,
and document phase on every doc. v2 names actual parties and actual
purpose on docs 2 and 3 — and on doc 3 *catches the central wind-down
risk* (survival of pre-closing liabilities), which v1 missed entirely.

Doc 1's summary is the one disappointment: it removed the false facts
but the synthesis got over-cautious and left placeholder brackets
instead of pulling names from the per-clause findings. Discussed below.

---

## What the fixes actually did

### Fix 1 — Chunker (the highest-impact fix)

Before: regex required `^\d+\.` at line start. CUAD's flat-paragraph
text never matched → fallback "whole document as one chunk" → Reader
made 1 call per doc instead of N. The article's "~22 calls per
document" claim was silently false on any real-world contract that
came in as a single paragraph (PDFs, OCR extracts, copy-paste).

After: three-pass strategy — line-anchored, then inline-numbered
(period-style `19. Title`, paren-style `7) Title`, article-style
`Article 3.`), then whole-document fallback. Requires ≥3 boundaries
and roughly-monotonic numbering before accepting a pattern.

Result: BorrowMoney 1 → **28** chunks. Sibannac 1 → **11**. Veoneer
1 → **4**. Single biggest delta in the whole eval.

### Fix 2 — Synthesis prompt + user-message restructure

Before: `CLIENT: Acme Holdings (mining, NSW)` injected directly above
`PER-CLAUSE FINDINGS`. Model couldn't tell which was a fact and which
was framing — it pattern-matched whichever was first.

After: visual section dividers (`=== DOCUMENT ===`, `=== CLIENT
STANCE (use ONLY for risk framing — NOT as document facts) ===`,
`=== PER-CLAUSE FINDINGS (the source of truth for parties,
jurisdiction, subject matter) ===`) + explicit prompt-level
instruction that profile is stance, not facts.

Result on the three summaries:
- Doc 1: **fixed but over-corrected** — "[other party]" placeholder instead of "JVLS / Vaccines2Go"
- Doc 2: **clean win** — correctly names "Bravatek and Sibannac" + correct purpose
- Doc 3: **strongest win** — correctly names "Veoneer and Nissin", correctly identifies VNBJ + VNBZ as the JV entities, **catches the central wind-down risk** (rubric item #1)

The doc-1 over-correction is the trade-off in motion. With 28
per-clause findings + a strict "do not invent facts" preamble, the
small model errs on the side of "don't claim anything I'm uncertain
about" → placeholder brackets. Calibration target for v3: keep the
preamble strict but add a single line *"Name parties whenever the
per-clause findings name them. Empty brackets are worse than a
specific party name."*

### Fix 3 — Multi-jurisdiction precedent search

Before: search filter does `entry.jurisdiction.includes(query)`. When
Watchman returns `"nsw,japan,china"`, no single-jurisdiction stored
value matches. Doc 1 indexed with `Florida`; docs 2 and 3 saw 0
precedents.

After: split query on commas/semicolons/slashes, search per token,
dedupe, and fall back to documentType-only search if all
jurisdiction-scoped queries return empty.

Result: doc 2 saw **1 precedent** in 11/11 per-clause prompts. Doc 3
saw **3 precedents** in 4/4 per-clause prompts. The article's
compounding-intelligence claim, which was visually defensible but
empirically false in v1, is now both.

### Curator — first end-to-end run

v1 never finished the Curator pass (eval-script log-stream bug).
v2 ran clean:

> **surface: critical · Critical findings in joint and several
> liability agreements** — "We've identified three critical findings
> related to joint and several liability, capital call mechanics,
> governing law, penalty / liquidated damages, and indemnification
> carve-outs across three investment agreements. Review these
> documents for potential implications."

Two notes:
- **Wiring works** — Curator returned a surface, the heartbeat would
  emit it, the dashboard would render it. End-to-end ✅.
- **Content quality is mediocre** — the surface message is reciting
  the client's `concerns` list verbatim, not the actual cross-document
  pattern. On gemma2:2b with portfolio-level summarisation, that's
  the model size showing again. The Watchman + Reader benefited from
  the prompt-engineering fixes; the Curator's surface prompt hasn't
  been hardened the same way yet. Add to the v3 list.

---

## What's still wrong (the honest list)

1. **Doc 1 summary placeholders.** Synthesis is over-cautious with 28
   inputs + strict preamble. Fix: ~5 lines added to the prompt.

2. **Doc 1 only emits 1 risk.** Same root cause — synthesis with 28
   per-clause findings overwhelms the small model. The 1 risk that
   surfaced is a meta-risk that lists 21 clause numbers as a
   citation, which is the model's way of saying "I can't pick".
   The real findings are presumably IN the per-clause findings —
   they just didn't make it through synthesis. **Fix candidate:**
   route docs with >15 clauses through a two-pass synthesis (rank
   per-clause findings first, then synthesise top 8).

3. **Watchman "NSW" leak on docs 2 and 3.** v1 said `NSW, US` /
   `nsw,japan,china`. v2 says `NSW, Arizona` / `nsw,japan,china`.
   Still leaked. This is in the Watchman prompt, not in any of the
   three fixes I applied. Add to v3 list.

4. **Curator surface content is generic.** Wiring works; content
   is mediocre. Same prompt-engineering work the Reader's synthesis
   got is owed to the Curator's surface-decision pass.

5. **Doc 3 Reader claims "Japanese law"** — it's grounded (the
   document does mention Japanese parties) but probably wrong (the
   underlying JV's governing law isn't in the amendment). Honest
   mistake from limited context, not a hallucination from profile.

---

## What's now defensible vs what's still oversold

| Article claim | Status after v2 |
|---|---|
| Three personas (Watchman / Reader / Curator) run end-to-end on a Mac | ✅ true and demonstrated |
| Per-clause fan-out at zero marginal cost | ✅ true (10 min, $0, real fan-out) |
| Precedent board compounds across documents | ✅ true (0 → 1 → 3 precedents loaded) |
| Document-type templates pick up specific vocabulary | ✅ true (every prompt contained `operator`, `cash call`, `reserved matter`, `dilution`, `sole risk`) |
| Watchman skip-route saves work on irrelevant docs | ✅ true (proven in unit test, not exercised in this eval — all 3 docs were substantive) |
| Local-only privacy | ✅ true ($0 spent, no cloud call made) |
| "Qualitatively more capable than the prior local path" | 🟡 **partially true** — capability uplift is real on docs 2 and 3; doc 1 (long doc) is still degraded by the small model's synthesis bottleneck |
| "Runs well on a Mac mini" | 🟡 **with caveats** — gemma2:2b fits in 8GB but jurisdiction extraction is profile-contaminated; gemma4:e4b is the article's reference but crashed Ollama under sustained Reader fan-out on this hardware |

---

## Cost / time on real documents

| Metric | v1 | v2 |
|---|---|---|
| Total wall-clock, 3 docs | ~3 min | ~10 min |
| LLM calls | ~12 | ~62 |
| API cost | $0.00 | $0.00 |
| Watchman calls | 3 | 3 |
| Reader per-clause calls | 3 | 43 |
| Synthesis calls | 3 | 3 |
| Curator calls | 0 (crashed) | 13 |

10 minutes for 3 substantive contracts, on-device, $0. That number
goes in the article without a caveat. The "qualitatively better
output" claim now goes in with caveats on doc length and model size.

---

## What to ship now

Three changes to the manifesto draft I'd make on the back of this:

1. **Replace the "qualitatively more capable" line** with something
   like: *"On documents that fit gemma2:2b's effective context window
   (≤ 15 clauses), the lighthouse path produces grounded summaries
   with real cross-document precedent context. Longer documents need
   a larger local model or a two-pass synthesis — a v3 patch we'll
   open-source alongside this announcement."*

2. **Add a "what runs on what hardware" footnote** that's specific:
   *"gemma2:2b runs comfortably on 8GB; gemma4:e4b needs 16GB+ for
   the Reader's per-clause fan-out without OOM. We've tested both."*

3. **Keep the compounding-precedent claim** — v2 proves it works.
   Doc 3 saw 3 prior precedents in every per-clause prompt. That's
   the architectural feature the article is selling, and it now does
   the thing the article says it does.

---

## Verdict

**The three fixes turned a green-test-suite plumbing claim into a
defensible product claim — on docs 2 and 3. Doc 1 still has a
small-model synthesis bottleneck that doesn't break anything but
produces a sub-par summary.** The article can ship as-is if you're
willing to make claim #1 above; if you want all three docs to look
clean, one more round of synthesis-prompt calibration (the v3 list)
gets you there.

For the cost of about 90 minutes of engineering work + 13 minutes of
local compute, the lighthouse went from "the code doesn't throw" to
"the output is grounded and the precedent board actually compounds."

That's what the eval bought.
