# Eval Rubric — JV Lighthouse Pass (pre-registered)

**Written before the lighthouse is run.** Lists what a competent lawyer would
flag on a first-pass review. Scoring after the run will use these lists as
the human-graded baseline.

Grader bias: same person (the model itself) is doing both the running and
the grading. Pre-registration of the rubric is the only bias-control
available without an independent reviewer. Read with that in mind.

Scoring per document:
- **Recall** = % of rubric items the Reader's findings cover (any match counts)
- **Precision** = % of Reader findings that map to a rubric item OR are
  defensible additional concerns
- **Hallucination count** = findings that reference text not in the doc OR
  invent dollar amounts / clause refs that aren't there
- **Watchman accuracy** = documentType correct? route appropriate? juris caught?
- **Qualitative** = does the synthesis read like a senior partner first-pass,
  or like a junior trying to sound thorough?

---

## Doc 1 — BorrowMoney.com × JVLS (Vaccines2Go) JV Agreement

**File:** `evals/jv/borrowmoneycom_06_11_2020.txt` (21,450 chars, ~67 clauses)
**Type:** Substantive 2-member JV, FL law, IT development + medical services
**What a lawyer should catch (in rough priority order):**

| # | Risk | Severity | Where |
|---|---|---|---|
| 1 | **Joint & several liability for breach-caused harm** — broad, no cap | RED | cl 32-33 |
| 2 | **Unanimous consent for Additional Capital** — creates deadlock risk if one party refuses | major | cl 19 |
| 3 | **Asymmetric capital economics**: no interest on contributions (cl 22), but interest IS payable on Member advances at majority-set rate (cl 20) | major | cl 20 vs 22 |
| 4 | **Confidentiality survives only 1 year** after termination — short for a JV | major | cl 46 |
| 5 | **Force Majeure ridiculously broad** — "any other unforeseen and uncontrollable event" | major | cl 43 |
| 6 | **No Reserved Matters / supermajority list** — only "majority vote of Members" for major issues | major | cl 11 |
| 7 | **Involuntary Withdrawal triggers indemnity by the defaulting Member** — broad, no cap | major | cl 33 |
| 8 | **No dilution formula** for Members who don't fund additional capital | major | implicit |
| 9 | **Mediation rules unspecified** — "statutory rules of mediation" — vague | minor | cl 55-56 |
| 10 | **Severability with judicial reformation** — court may rewrite, not just strike | minor | cl 64 |
| 11 | **Bankruptcy / Operation of Law triggers Involuntary Withdrawal** | minor | cl 34 |
| 12 | **Conflict-of-interest disclosure with majority consent only** | minor | cl 44 |

**Expected Watchman:** `jv` / deep-read / Florida or US / confidence ≥ 0.85
**Expected reader template:** `jv`
**Expected qualitative tone:** should reference operator/non-operator dynamics
(but this JV is symmetrical, no operator), capital calls, deadlock,
reserved matters.

---

## Doc 2 — Bravatek × Sibannac Strategic Alliance Agreement

**File:** `evals/jv/sibannac_12_04_2017.txt` (8,380 chars, ~12 clauses)
**Type:** Non-exclusive commission-based sales channel partnership, TX law
**Watchman complication:** this is labelled "Strategic Alliance" but is
effectively a commission/referral agreement. Whether the Watchman calls
it `jv` or `other` or `saas` is interesting.

**What a lawyer should catch:**

| # | Risk | Severity | Where |
|---|---|---|---|
| 1 | **Commission unilaterally set by COMPANY in 10-20% range** — Bravatek has no certainty on fee | RED | cl 4 |
| 2 | **NET 30 from CLIENT payment received** — Bravatek bears credit/collection risk | major | cl 4 |
| 3 | **Termination on 90 days notice by either party** — convenience kill switch, no ramp-down protection | major | cl 7 |
| 4 | **Non-exclusive arrangement** — leads not protected, Bravatek can be cut out | major | cl 1 |
| 5 | **No minimum performance / no exclusivity protections either way** | major | implicit |
| 6 | **Mutual indemnification limited to negligence + intentional misconduct + breach** — narrow | minor | cl 10 |
| 7 | **No IP ownership clause** for materials created during cooperation | minor | implicit |
| 8 | **Auto-renewal with 90-day opt-out** — modest dark-pattern risk | minor | cl 7 |
| 9 | **No specification of how leads are tracked / disputed** | minor | implicit |
| 10 | **Texas governing law + no venue clause** — could be ambiguous for non-TX parties | minor | cl 9 |

**Expected Watchman:** could be `jv`, `saas`, or `other`. The doc says
"Strategic Alliance" so `jv` is defensible; the content reads like a
sales-rep agreement so `other` is also defensible. confidence likely 0.5-0.8.
**Expected route:** deep-read or quick-scan.

---

## Doc 3 — Veoneer × Nissin JV Amendment & Termination

**File:** `evals/jv/veoneer_02_21_2020.txt` (8,257 chars, ~6 articles)
**Type:** Wind-down amendment to an existing JV — terminates Veoneer parties'
involvement in two JVs (VNBJ, VNBZ), preserves Autoliv AB's role in ANRA
**Watchman complication:** this is a JV-related document but not a fresh
JV. Whether the Reader recognises it as a wind-down vs a JV body is
interesting.

**What a lawyer should catch:**

| # | Risk | Severity | Where |
|---|---|---|---|
| 1 | **No general release of pre-closing claims** — Veoneer parties cease to be parties but liability for pre-closing breach SURVIVES | RED | Article 1.d |
| 2 | **Conditional effectiveness on TWO closings (VNBJ + VNBZ)** — what if only one closes? Document is ambiguous | major | Article 3 |
| 3 | **ANRA wind-down obligations continue indefinitely** for Nissin + Autoliv AB | major | (D), Article 1.c |
| 4 | **D&O indemnification carve-out continues** but only for pre-closing liabilities | minor | Article 1 (last para) |
| 5 | **No governing law in the Amendment itself** — inherits from underlying JV which is not attached | minor | implicit |
| 6 | **Tail liability for representations + warranties + covenants** — pre-closing only, narrow | minor | Article 1.d |
| 7 | **No specified mechanism for resolving disputes about whether a breach was pre- or post-closing** | minor | implicit |

**Expected Watchman:** `jv` is defensible (it's titled "Joint Venture Agreement Amendment");
`other` also defensible because it's a termination doc. confidence 0.6-0.85.
**Expected qualitative tone:** Should flag survival of pre-closing liability
as the single biggest risk. Synthesis should be SHORT because the doc is
narrow — overproducing concerns on a wind-down is a sign of generic blather.
A junior would flag every word; a senior would flag 2-3 things.

---

## What I'm specifically watching for

1. **Does the precedent board actually compound across docs?**
   Doc 1 will populate it. Doc 2 and 3 should see those precedents in the
   Reader's per-clause prompt.

2. **Does the Reader's JV template fire its specific vocabulary?**
   Operator/non-operator, cash call, reserved matter, dilution, deadlock.
   If those words don't appear in any Reader output, the template is a
   wallflower.

3. **Does the grounding pass strip plausible-but-fake findings?**
   I want to see at least one unanchored-strip event across the three docs.

4. **Does the Watchman skip-route ever misfire on a real contract?**
   None of these 3 should be skipped. If any is, that's a Watchman bug.

5. **Hallucination rate on gemma2:2b?**
   This is the realistic deployment-model question. Will the article's
   "runs on a Mac mini" promise hold under real contract noise?
