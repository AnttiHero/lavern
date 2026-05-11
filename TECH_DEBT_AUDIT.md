# Technical Debt Audit — Lavern / The Shem

**Date:** 2026-05-11
**Scope:** 264 backend TS files (65,315 LOC) + 282 frontend TS/TSX files (72,181 LOC) + 107 test files (23,219 LOC) + 19 scripts (3,677 LOC)
**Methodology:** automated scanning (ts-prune, npm audit, grep heuristics) + manual inspection of hotspots

---

## TL;DR

**The codebase is unusually healthy for a project of this size and age.** Most "audits" find dozens of FIXMEs, hundreds of `any`-casts, broken catch blocks, and decaying dependencies. This codebase has effectively none of that. The real debt is concentrated in **three areas**:

| Severity | Area | Why it matters |
|---|---|---|
| 🔴 **High** | **8 known security advisories** in production dependencies | Two are in Fastify's own packages (the API server) and at least one (basic-ftp) shouldn't even be in the dependency tree. Fixable in ~30 min via `npm audit fix`. |
| 🟡 **Medium** | **Test coverage gap on api/, mcp/, providers/, workflows/, utils/** | Claw and session layers are well-covered (the recent v1→v3.4 lighthouse work). The auth/routes/MCP-tool layer has 3-test coverage on 48 source files. |
| 🟡 **Medium** | **CLAUDE.md is consistently behind reality** by 1-7 items per claim | Routes: claimed 20, actual 27. Claw modules: claimed 22, actual 28. Tests: claimed 1500+/92 files, actual 1686/107. Drift accumulated over multiple feature additions. |

**No critical debt.** Zero TODO/FIXME/HACK markers in real code. Zero `@ts-ignore` in src/. Zero empty catch blocks. Zero `.only` tests. Zero `.skip` tests. Type-safety casts (`as any`, `as unknown as`) all have legitimate framework-bridging reasons.

---

## Findings by category

### 🟢 Code markers — clean

| Marker | Count in real code |
|---|---|
| `TODO` | 0 (5 hits inside string literals — validation regex looking for `[TODO]` placeholders in user content) |
| `FIXME` | 0 |
| `HACK` | 0 |
| `XXX` | 0 (2 hits inside agent-prompt string literals as table headers `[F-XXX]`) |
| `@deprecated` | 4 (all in viz/ — clean migrations away from old type names, with replacement pointers) |
| `@stub` | 0 |

This is the cleanest TODO-marker scan I have ever seen in a 70k+ LOC codebase. Either the team is disciplined about not leaving markers, or the convention is to file issues instead. Either is fine; the result is zero in-code rot signals.

### 🟢 Type safety — clean

| Concern | Count | Reality |
|---|---|---|
| `@ts-ignore` in src/ + viz/ | 1 | A CSS custom property `--w` in a JSX inline style — legitimate React+TS quirk, not a real bypass |
| `@ts-expect-error` | 4 | All in `claw-reader-templates.test.ts` deliberately probing defensive fallback paths |
| `: any` (real, not in strings) | 0 | Initial grep hit was inside agent-prompt content |
| `as any` in src/ | 10 | All are framework-bridging: Fastify request augmentation (rawBody, userId), Zod schema coercion for MCP bridge, SQLite `better-sqlite3` `unknown[]` returns. Every one has a clear reason. |
| `as unknown as` in src/ | 7 | Same pattern — bridging between library types (Mistral/MCP, sessionRecord runtime extension) |

`tsc --noEmit --noUnusedLocals` returns 0 warnings.

### 🟢 Error handling — clean

| Concern | Count |
|---|---|
| Empty catch blocks (`catch {}`, `catch (_) {}`) | **0** |
| Catches with `/* ignore */` or `/* non-fatal */` comments | 5 (all explain why) |
| `console.error` left in code paths | 14 files (most in CLI: terminal.ts, init.ts, daemon.ts — where stdout IS the UI) |
| Sentry integration | 10 call sites across 9 files (assembler, claw delivery + processor, API server, engage, session-manager, billing, email) — silent-failure paths are wired |

The 14 console-using files break down as:
- **Intentional CLI output** (12 files: claw/terminal, init, daemon, daemon-systemd, daemon-factory, hybrid-analysis, index, api/server startup banner, config validation, logger itself) — stdout IS the user interface
- **Possible cleanup candidates** (2 files: `gate-resolver.ts`, `auth-routes.ts` — 1 console call each, could go via structured logger)

### 🟡 Test coverage gap (backend, by module)

| Module | Source files | Test files (by name match) | Status |
|---|---|---|---|
| `claw/` | 28 | 20 | 🟢 Strong (the recent v1→v3.4 work landed here) |
| `db/` | 1 | 2 | 🟢 Good |
| `session/` | 4 | 3 | 🟢 Good |
| `events/`, `permissions/`, `router/` | 1-3 each | 1-2 each | 🟢 Adequate |
| `mcp/` | 27 | 2 | 🟡 Gap — MCP tools (debate board, scoring, verification, memory) mostly untested |
| `api/` | 48 | 3 | 🟡 Gap — 45 route + middleware files without dedicated tests |
| `assembly/` | 9 | 1 | 🟡 Gap — format converter has tests, the other 8 (validate-deliverable, post-assembly-verifier, document-assembler) do not |
| `workflows/` | 13 | 0 | 🟡 Gap — orchestrator, executor, dispatch all untested at unit level |
| `providers/` | 12 | 0 | 🟡 Gap — Mistral path + managed-agents executor untested |
| `utils/` | 11 | 0 | 🟡 Gap — shared utilities (fs-helpers, logger, spend-tracker, retry-query, stream-messages) untested |
| `documents/` | 6 | 0 | 🟡 Gap — parser + SMAC-L1 sanitiser untested |
| `hooks/` | 3 | 0 | 🟡 Gap — audit + gate hooks untested |
| `agents/` | 69 | 0 | ⚪ Acceptable — these are prompt files (text), not testable as units |

**Note**: counts are by filename pattern (`<module>` in test filename). Some tests cover multiple modules under different names — e.g., `auth-cookie.test.ts` covers api auth without "api" in the name. So the gap is somewhat overstated. But the qualitative picture is correct: claw and session are well-covered, the wider API + MCP + workflows + providers layer has thin unit-test coverage.

Many gaps are covered by integration tests (`format-converter.test.ts` covers the assembly pipeline end-to-end) and API integration smoke tests, so production isn't unprotected. But unit-level regressions in routes, MCP tools, and workflow executors would only be caught at integration time.

### 🟡 Frontend test coverage gap

| Frontend area | Source files | Test files |
|---|---|---|
| Total `viz/src/*` | 282 | 12 |

~4% file-level coverage. Most React components and hooks rely on visual review + manual smoke testing. Acceptable for an early-stage product but worth noting.

### 🔴 Security advisories (production dependencies)

`npm audit --omit=dev` reports **8 advisories**: 0 critical, **5 high**, 3 moderate.

| Severity | Package | Issue | Path |
|---|---|---|---|
| 🔴 high | `fastify@5.7.4` | Missing end-anchor in subtype regex allows malformed Content-Types to pass validation | direct dependency |
| 🔴 high | `fast-uri@3.1.0` | Path traversal via percent-encoded dot segments | transitive via `fastify` |
| 🔴 high | `minimatch@10.1.2` | ReDoS via repeated wildcards | transitive via `@fastify/static` → `glob` |
| 🔴 high | `@xmldom/xmldom@0.8.11` | XML injection via unsafe CDATA serialization | transitive via `mammoth` (DOCX parser) |
| 🔴 high | `basic-ftp` | Incomplete CRLF Injection Protection — FTP command execution via credentials | transitive — **why is FTP in the tree at all?** Worth tracing. |
| 🟡 moderate | `@fastify/static@9.0.0` | Path traversal in directory listing | direct (minor upgrade available: 9.1.3) |
| 🟡 moderate | `ajv@8.17.1` | ReDoS via `$data` option | transitive via fastify |
| 🟡 moderate | `ip-address` | XSS in HTML-emitting methods | transitive |

**Action:** `npm audit fix` should resolve most. The `basic-ftp` advisory may need a manual upstream check — it suggests one of the transitive chains pulls a CLI/SDK that has FTP support baked in. Worth investigating.

### 🟡 Outdated direct dependencies

**Major upgrades pending (8):**
- `typescript: 5.9.3 → 6.0.3` (worth doing — strictness improvements + perf)
- `vitest: 2.1.9 → 4.1.5` (two majors behind — test runner API may have changed)
- `openai: 4.104.0 → 6.37.0` (two majors behind — likely breaking changes)
- `stripe: 20.4.1 → 22.1.1` (two majors behind — billing flows)
- `@fastify/multipart: 9 → 10`
- `@stripe/stripe-js: 8 → 9`
- `@types/node: 22 → 25`
- `marked: 17 → 18`

**Minor/patch pending (10):** all routine. `@anthropic-ai/claude-agent-sdk: 0.2.38 → 0.2.138` is a 100-version jump worth a careful read of the changelog.

### 🟢 Dead code — minimal

`ts-prune` reports 40 unused exports across `src/`. Manual inspection shows the great majority are:

- **Test seams** intentionally exported (`_resetForTesting`, `validateSummaryNames`, `CONFIRM_THRESHOLD`)
- **Public-API types** that downstream consumers (the frontend, scripts, MCP bridge) import — ts-prune is conservative and flags anything not imported within `src/`
- **Future-use code** for the Managed Agents Bridge (CLAUDE.md says "Stage 2 executor is still pending" — `ManagedAgentsClient`, `runManagedAgentsWorkflow`, `mapManagedEvent` are wired but unreferenced internally)
- **API schema types** (`InterviewTurnRequest`, `PartnerConsultInput`, `PartnerRecommendation`) — used at runtime via Zod parse, ts-prune misses these

True dead-code candidates worth investigating (most likely <10 of the 40):

- `src/assembly/post-assembly-verifier.ts:verifyAssemblyFidelity` — may be a legacy verification path superseded by `validate-deliverable.ts`
- `src/router/router.ts:getRouterPromptWithContext` — alternative router prompt entry point, may be from an earlier router version
- `src/types/verification.ts:PASS_LABELS`, `PASS_DESCRIPTIONS` — old verification type constants, may have been replaced
- Some `src/types/index.ts` types (`DimensionScore`, `ComplexityTax`, `ChangeLogEntry`, `AmbiguityFlag`, `NonNegotiableCheck`) — old verification dimension types possibly superseded
- `src/utils/fs-helpers.ts:writeJsonFile` — non-atomic version, possibly replaced by `writeJsonFileAtomic`

Total estimated real dead code: ~200-400 lines. Worth a one-hour cleanup pass if you ever want to do one, but not blocking.

### 🟡 Documentation drift — CLAUDE.md is behind

| CLAUDE.md claim | Actual | Drift |
|---|---|---|
| 66 agent prompts | 67 | +1 (close enough) |
| 8 workflow templates | 9 | +1 |
| 19 MCP tool modules | 21 | +2 |
| 22 claw modules | 28 | **+6** |
| 20 API route modules | 27 | **+7** ← biggest drift |
| 1,500+ tests across 92 files | 1,686 across 107 files | +186 / +15 |
| 63-agent profile registry | (matches, not re-counted) | likely accurate |
| 5 newer MCP tool factories (Counsel bridge) | (matches) | accurate |

The article (`lavern_article.md`, on your desktop) has already had the 28-module + 66-agent corrections applied — so the article is currently *more accurate* than CLAUDE.md. Worth a single-commit refresh of CLAUDE.md before publishing.

### 🟡 Config / env-var sprawl

- **162** `process.env.*` references across **24** files
- **`config.ts` is only 343 lines** — too small to be the single source of truth for 162 env-var reads
- Many files (especially in `claw/`) read env vars directly rather than going through `config.claw.*` getters

This isn't a bug — it works fine — but it's the kind of debt that makes future env-var refactors painful. If you ever want to add a `LAVERN_CONFIG_FILE` (load from JSON instead of env), you'll have to refactor 24 files.

**Suggested cleanup**: pull the remaining 24 files' direct env reads into `config.ts`, treat config as the only source of truth. ~2 hours.

### ⚪ Complexity hotspots — acceptable

Largest files in `src/`:

| File | Lines | Concern |
|---|---|---|
| `agents/profiles.ts` | 3,246 | Data file — 63 agent profiles with skill ratings + personality + DiceBear avatars. Big but mechanical. Splitting wouldn't help readability. |
| `db/database.ts` | 1,821 | SQL layer — 99 methods, 120 prepared statements, 11 transactions. Could be split by domain (auth/sessions/billing/archive) but the cohesion is real. |
| `api/routes/sessions.ts` | 1,743 | 20 route handlers + 15 helper functions. **Could plausibly split into `sessions-core.ts` + `sessions-derivatives.ts` + `sessions-revisions.ts`.** ~3 hours, low risk. |
| `assembly/format-converter.ts` | 1,560 | PDF + DOCX + HTML conversion logic. Has dedicated tests. Cohesive. Don't split. |
| `claw/local-analysis.ts` | 1,318 | Just grew during v3.x — chunker, two-pass synthesis, party extractor, validation. The recent work is responsible for ~30% of this file. Could plausibly split into `reader.ts` + `synthesis.ts` + `party-extraction.ts`. ~2 hours, medium risk (the v1→v3.4 fixes are interrelated). |
| `claw/index.ts` | 852 | Heartbeat + CLI entry. Has been growing. |
| `api/server.ts` | 801 | Acceptable. |
| `api/routes/claw.ts` | 765 | Acceptable. |

None of these are critical. `sessions.ts` is the highest-leverage split if you ever do one.

### 🟢 No duplicate / parallel implementations

- 0 files with `-v2`, `-old`, `-new`, `-copy`, `-backup` in their name (other than `claw/backup.ts` which is the daily-backup feature)
- 0 near-empty files
- 0 `noUnusedLocals` warnings

The codebase is structurally clean — no abandoned refactors, no dead branches.

---

## Prioritized fix list

### This week (~2 hours)

1. **`npm audit fix`** — close the 5 high-severity advisories. Most are transitive and fixable with a single command. Worth verifying which transitive chain pulls in `basic-ftp`. (~30 min)
2. **`@fastify/static: 9.0.0 → 9.1.3`** — closes one moderate advisory directly. (~5 min)
3. **Refresh CLAUDE.md** — update the 6-7 claim counts (claw 22→28, routes 20→27, tests 1500/92→1686/107, MCP 19→21, workflows 8→9). (~20 min)
4. **Remove ContractNLI from `scripts/seed-knowledge-base.ts`** if you're going Apache 2.0 — the CC BY-NC-SA license is incompatible with permissive open-source. Note in CLAUDE.md that it's available as opt-in download. (~30 min)
5. **Add a LICENSE file** if you're publishing. (~10 min)

### This month (~10 hours)

6. **Bump `vitest 2 → 4`** — two majors behind; CI startup time will improve. Test API hasn't changed dramatically but worth a careful read. (~2 hours) ✅ shipped 8efe981
7. **Bump `typescript 5.9 → 6`** — strictness improvements may surface real issues; expect 30-60 min of fix-up. (~2 hours) ✅ shipped 7be3663
8. **Bump `@anthropic-ai/claude-agent-sdk 0.2.38 → 0.2.138`** — 100-version jump deserves careful changelog read. (~3 hours) ⚠ **ATTEMPTED 50d1d17, REVERTED 2a9f805 + pinned 0.2.38 in f11d233.** Failure mode: 0.2.138's auth path no longer honors ANTHROPIC_API_KEY the way 0.2.38 does — returns 401 even with a valid key in process.env. The new SDK's `Options` type exposes only `apiKeyHelper` (a shell command that outputs the key) and `apiKeySource: 'user' | 'project' | 'org' | 'temporary' | 'oauth'` — no direct `apiKey` field. Auth flow appears to have moved to Claude Code's OAuth model (`CLAUDE_CODE_OAUTH_TOKEN` + `~/.claude/credentials.json`). Real migration deferred to v0.15 — needs either `claude auth login` interactive setup or a credentials-shim we control. Sample line from SDK internals: `ANTHROPIC_API_KEY&&!(Y??process.env).CLAUDE_CODE_OAUTH_TOKEN)z=await F6$()??z` — suggests the new auth path tries an OAuth bootstrap function (`F6$`) before falling back. The SDK code refactor work (32 `readOnly → readOnlyHint` renames + `document-reader.ts` content-block wrapping) is preserved in git history at commit 50d1d17 and can be cherry-picked back when we tackle the OAuth migration.
9. **Consolidate the 24 files' direct env reads into `config.ts`** — single source of truth. (~3 hours) ✅ shipped a42a03b

### This quarter (~30 hours)

10. **Test coverage backfill** for `api/routes/*`, `mcp/tools/*`, `workflows/*`, `providers/mistral.ts`, `utils/*`. Pick the 5 modules most likely to regress and add unit tests. (~10 hours)
11. **Split `api/routes/sessions.ts`** (1,743 lines) into 3 cohesive files. (~3 hours)
12. **Refresh dead-code candidates** — verify each of the ~10 suspect exports, delete confirmed dead ones, document the rest with `@public` or test-seam comments. (~2 hours)
13. **Bump `openai 4 → 6` and `stripe 20 → 22`** — both two majors behind, both touch user-facing flows (billing, alternative LLM). Schedule carefully. (~8 hours)
14. **Frontend test coverage** — pick 10 components with the most logic and add a `*.test.tsx` for each. (~6 hours)

---

## What's surprisingly healthy

For context, here's what most audits of 137k-LOC codebases find that this one doesn't have:

- ❌ Dozens of `TODO`/`FIXME`/`HACK` markers (real count here: 0)
- ❌ Hundreds of `any` casts (real count: ~10, all framework-bridging)
- ❌ Empty `catch (e) {}` blocks (real count: 0)
- ❌ Skipped tests left in CI (real count: 0)
- ❌ A `.only` test breaking CI (real count: 0)
- ❌ Dead modules with no callers (real count: maybe 5-10 small ones)
- ❌ Duplicate parallel implementations (real count: 0)
- ❌ Unbounded technical-debt comments
- ❌ Critical security advisories (real count: 0 critical, 5 high — all fixable with `npm audit fix`)
- ❌ Whole modules without any error handling

**Net read: this is a tier-1 codebase.** The debt is in known, measurable places — security advisories that need a routine `npm audit fix`, test coverage gaps in the API/MCP layer, documentation drift in `CLAUDE.md` — not in structural rot. Six months of disciplined engineering shows here.

If you push v3.5+ from this baseline, you start from a healthy foundation. The main risk to that health is the dependency drift (vitest, typescript, openai, stripe each two majors behind). A quarterly dependency-bump sprint would keep it clean.
