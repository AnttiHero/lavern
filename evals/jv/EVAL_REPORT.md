# Lighthouse Eval Report — 3 CUAD JV Contracts on gemma2:2b

**Date:** 2026-05-10
**Model:** Ollama / `gemma2:2b` (1.6GB, Q4_0)
**Inputs:** 3 real SEC-filed JV-flavoured contracts from the CUAD dataset
**Rubric:** pre-registered at `evals/jv/RUBRIC.md` *before* running anything
**Honesty caveat:** same engineer wrote the code AND scored the output.
Rubric pre-registration is the only bias control. Treat scores as
self-graded — directionally useful, not externally validated.

---

## TL;DR — what this eval actually showed

**The plumbing works. The output is not yet good enough to ship.** Watchman
classification was 3/3 correct on document type, the JV template fired its
specific vocabulary on every per-clause prompt, and the precedent board
indexed cleanly. But three issues fired across every document:

1. **The clause chunker silently degrades to "whole document as one chunk"** on
   real-world (CUAD-style) text where clauses are inline-numbered rather
   than line-separated. This collapses a 22-call Reader fan-out to a single
   ~22K-character prompt — way past gemma2:2b's effective context window
   for grounded analysis.

2. **gemma2:2b's synthesis hallucinates the client's profile into the
   summary**, every single time. All three summaries claimed the JV was
   about mining/exploration in NSW, Australia, because that's what the
   client profile says. The actual contracts: Florida IT/medical services
   (doc 1), Texas sales channel (doc 2), Japan-China-Sweden brake-systems
   wind-down (doc 3). **Zero of three summaries got the basic facts right.**

3. **Precedent injection never fired across documents.** The board indexed
   3 precedents from doc 1, but docs 2 and 3 saw a precedent block in
   0/1 of their per-clause prompts. The jurisdiction filter is the
   culprit — doc 1 indexed with `Florida`, doc 2 searched with `NSW, US`,
   doc 3 searched with `nsw,japan,china`. The filter does
   `entry.jurisdiction.toLowerCase().includes(query.jurisdiction.toLowerCase())`
   so a multi-jurisdiction comma-joined query never matches a
   single-jurisdiction stored value.

**Verdict on the article's "Mac mini lighthouse" claim:** on gemma2:2b,
it is honest about the *architecture*, dishonest about the *output*. The
pipeline runs end-to-end. The findings are not yet trustworthy. **The
article is currently overselling.** Three concrete fixes below would
close most of the gap on the same hardware.

---

## Per-document scores

### Doc 1 — BorrowMoney.com × JVLS JV Agreement (21,450 chars, FL law)

| Dimension | Result |
|---|---|
| Watchman documentType | `jv` ✅ |
| Watchman route | `deep-read` ✅ |
| Watchman jurisdiction | `Florida` ✅ |
| Watchman confidence | 0.95 — appropriate |
| Reader clauses chunked | **1** ❌ (should be ~67) |
| Reader risks emitted | 3 |
| Rubric items recalled | **2/12** (Joint & Several Liability, Capital Call) |
| Hallucinated findings | 0 (the 3 risks are all defensible) |
| Hallucinated summary | **Yes** — "mining project in New South Wales" (actual: IT/medical in Florida) |
| Precedent context | 0/1 prompts had block (board empty — expected) |
| Total cost | $0 / 62.6s |

**Honest read:** The Reader caught the headline risk (joint & several
liability) and one of the two structural ones (capital call mechanics).
It missed 10 of the 12 rubric items because it processed the whole 21K-char
document as a single prompt to gemma2:2b — which simply doesn't have the
context-window capacity to reason about 67 clauses at once. The findings
that did surface were grounded; the rest never had a chance.

### Doc 2 — Bravatek × Sibannac Strategic Alliance (8,380 chars, TX law)

| Dimension | Result |
|---|---|
| Watchman documentType | `jv` ✅ (defensible — title says "Strategic Alliance") |
| Watchman route | `deep-read` ✅ |
| Watchman jurisdiction | `NSW, US` ❌ (actual: Texas; NSW leaked from profile) |
| Watchman confidence | 0.90 — too high given jurisdiction error |
| Reader clauses chunked | **1** ❌ (should be ~12) |
| Reader risks emitted | 3 |
| Rubric items recalled | **2/10** (commission ambiguity, NET 30 ambiguity) |
| Hallucinated findings | 0 — third risk ("liability allocation ambiguity") is defensible |
| Hallucinated summary | **Yes** — "exploration project in New South Wales" (actual: TX sales channel) |
| Precedent context | 0/1 prompts had block (jurisdiction filter blocked the 3 from doc 1) |
| Total cost | $0 / ~60s |

**Honest read:** Best per-clause output of the three. Findings correctly
named the actual parties ("Bravatek and COMPANY"), correctly flagged the
unilateral commission discretion, correctly flagged the NET-30 collection
risk. **Yet the summary above those findings hallucinates the whole
context.** The synthesis prompt sees the profile and the findings; the
profile wins. This is fixable in the synthesis prompt.

### Doc 3 — Veoneer × Nissin JV Amendment & Termination (8,257 chars)

| Dimension | Result |
|---|---|
| Watchman documentType | `jv` ✅ (defensible — title says "JV Agreement Amendment") |
| Watchman route | `deep-read` ✅ |
| Watchman jurisdiction | `nsw,japan,china` ⚠️ (partial — japan ✓, china ✓, NSW leaked) |
| Watchman confidence | 0.95 — high |
| Reader clauses chunked | **1** ❌ |
| Reader risks emitted | 3 (visible in log, lost from JSON capture by my eval-script bug) |
| Rubric items recalled | unknown — only the summary survived to the log |
| Hallucinated summary | **Yes** — "Acme Holdings and Veoneer finalizing a JV in NSW Australia" (actual: Veoneer + Nissin *terminating* a JV) |
| Precedent context | 0/1 prompts had block |
| Total cost | $0 / ~50s |

**Honest read:** The Reader missed the *nature* of the document — this is
a TERMINATION, not a fresh JV being finalised. The single biggest risk
on a wind-down is whether pre-closing breaches survive (which is the
one thing this contract gets right). I would expect a competent reviewer
to lead with that. The Reader led with generic JV-formation risks.

---

## What worked (don't lose these)

| Lighthouse claim | Eval result |
|---|---|
| Watchman classifies document type | ✅ 3/3 correct |
| Watchman routes substantive contracts to deep-read | ✅ 3/3 |
| Reader picks JV template when Watchman says `jv` | ✅ 3/3 |
| JV-specific vocabulary in per-clause prompt | ✅ 3/3 (operator, non-operator, cash call, reserved matter, dilution, sole risk all present) |
| Precedent board indexes Reader findings | ✅ 3 entries indexed after doc 1, board persisted |
| Soft-fail discipline | ✅ Reader returned usable result even with chunker degraded; my eval-script crash didn't corrupt the doc logs |
| Grounding pass | ⚠️ 0 unanchored stripped across 3 docs — but that's because the chunker produced one giant chunk so nearly anything in the prompt *was* in "clause body" by definition. Untested in practice. |
| Local-only privacy | ✅ All triage and analysis stayed local (cost: $0.00) |

---

## What didn't work (priorities for the next iteration)

### 1. Chunker fragility (the highest-impact bug)

`chunkByClauseBoundaries` in `src/claw/local-analysis.ts` expects
`^\d{1,2}\.\s+[A-Z]` at *line start*. CUAD extracts have inline
numbering: `... will be unanimous consent of the Members. 19. Capital
Contributions may be amended ...`. The regex never matches, the fallback
fires, and the entire document becomes one "clause" called "Document".

**Why this matters:** Lavern's core architectural claim is per-clause
fan-out. When the chunker degrades to single-chunk, the lighthouse
collapses to a single 22K-char prompt. gemma2:2b reasons fine over
1K-3K chars; over 22K it pattern-matches the surface and writes generic
findings. **The article says ~22 calls per document; in this eval it was 1.**

**Fix:** add an inline-numbered fallback. Scan the document for patterns
like `\b(\d{1,2})\.\s+([A-Z][^.]{3,80}?)(?=\s+[A-Z]|\s*$)` and split on
those boundaries when no line-anchored matches are found. About 30 lines
of code. Highest ROI fix in the whole report.

### 2. Synthesis prompt leaks profile facts into the summary

All 3 docs produced summaries that invented an NSW/mining/exploration
context lifted from the client profile. Looking at the synthesis
prompt construction (`synthesise()` in local-analysis.ts), the profile
is injected as plain context with no instruction to keep it analytical
rather than factual.

**Fix:** add an explicit synthesis-prompt instruction: *"Use the
CLIENT profile ONLY to choose how strict to be. Do NOT mention the
client's jurisdiction, industry, or size unless they appear in the
document itself. The summary must describe what is in the document,
not the client."* That alone should fix doc 1 + 2 summaries. Doc 3's
wind-down-vs-fresh-JV confusion is a separate issue (needs a
"document phase" hint in the Watchman → Reader handoff).

### 3. Precedent search filter mismatches multi-jurisdiction queries

`PrecedentBoard.search()` filters with
`entry.jurisdiction.toLowerCase().includes(query.jurisdiction.toLowerCase())`.
When Watchman returns a comma-joined multi-jurisdiction string
(`"nsw,japan,china"`), no single-jurisdiction precedent will match.

**Fix:** in `local-analysis.ts` where the precedent search is called,
split `watchman.jurisdiction` on commas and run separate searches per
token, then dedupe by precedent ID. Or: change the board's filter
semantics to allow OR-matching against comma-split tokens. Five lines
either way.

### 4. Watchman jurisdiction extraction is profile-contaminated

`gemma2:2b` cannot reliably extract jurisdiction from document text when
the profile is injected into the same prompt. 2/3 docs in this eval had
NSW prepended to the actual jurisdiction. **This is a small-model
ceiling, not an architecture bug** — but on the deployment hardware most
hobbyists will try (Mac mini, 16GB RAM), gemma4:e4b crashes Ollama under
sustained Reader fan-out (per the earlier smoke run). The realistic
near-term answer is gemma2:2b with hardened prompts.

**Fix:** restructure the Watchman prompt so the profile and the document
extract are clearly separated, and add: *"Jurisdiction must be drawn
ONLY from the FIRST 1500 CHARS section below. The CLIENT field is NOT
where the document was executed."*

### 5. My eval script's write-after-end crash

Not a lighthouse bug. The flight recorder ended each doc's log stream
before the Curator pass, and Curator's fetch tried to write to the
already-ended stream. I'd fix the eval script before any subsequent run.

---

## What this means for the next move

**Don't ship more architecture. Fix the three bugs above and re-run.**
Specifically:

1. **Patch chunker** — inline-numbering fallback (~30 lines)
2. **Patch synthesis prompt** — explicit profile-as-stance-not-fact instruction (~10 lines)
3. **Patch precedent search** — multi-jurisdiction OR-match (~5 lines)
4. **Re-run the same 3 contracts on gemma2:2b** — same rubric, same script
5. **Compare side-by-side.** Did per-clause fan-out actually produce ~20
   chunks per doc? Did the summary stop inventing mining? Did doc 2 see
   any of doc 1's precedents in its prompt?

If those three patches turn the eval green, the architecture's "Mac
mini lighthouse" claim is honest and the article ships. If they don't,
the realistic answer is gemma4:e4b minimum (memory permitting), and
that's a hardware footnote the article needs.

## Costs

Three real contracts, end-to-end, on local hardware: **$0.00**. Total
wall-clock: ~3 minutes. That part of the article is true *today*. The
"qualitatively more capable than the prior local path" claim is not
yet true on gemma2:2b — but is within 3 patches and a re-run of
becoming true.
