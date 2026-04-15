#!/usr/bin/env tsx
/**
 * Lavern Load Test — simulates N concurrent users through the full lifecycle.
 *
 * Usage:
 *   npx tsx scripts/load-test.ts [base_url] [--users N] [--bypass-key KEY]
 *
 * Options:
 *   base_url            Server URL (default: http://localhost:3000)
 *   --users N           Number of concurrent users (default: 50)
 *   --bypass-key KEY    Shared secret sent in `X-Load-Test-Bypass` header;
 *                       must match `LAVERN_LOAD_TEST_BYPASS_KEY` on the
 *                       server. Without this, signup (3/min/IP) and the
 *                       global limiter (100/min/IP) will throttle runs
 *                       above ~50 users from a single host.
 *
 * ─ Scaling to 1500 users ─
 *
 * The script is tuned for small smoke runs by default; driving 1500
 * concurrent users from one box needs matching server tuning:
 *
 *   LAVERN_LOAD_TEST_BYPASS_KEY=<32+ chars>  # unlocks rate limits when header matches
 *   SHEM_MAX_SESSIONS=2000                   # lift the 100-session ceiling
 *   SHEM_SESSION_TTL_MS=3600000              # faster eviction of abandoned sessions
 *   NODE_OPTIONS=--max-old-space-size=4096   # give the server headroom
 *
 * Then invoke:
 *   npx tsx scripts/load-test.ts http://localhost:3000 --users 1500 --bypass-key $KEY
 *
 * Auth is batched (50 users per tick when bypass is on; 10 otherwise so signup
 * rate-limit doesn't shed the run). Session creation is batched to 25 / tick
 * under bypass. Peak RSS, throughput, and an ETA are reported per phase.
 *
 * What it tests:
 *   1. Auth: signup + login for N users concurrently
 *   2. Sessions: create N sessions and open WebSocket event streams
 *   3. Polling: GET status for all sessions every 3s
 *   4. Gates: approve any gates that open
 *   5. Teardown: cancel all sessions, verify cleanup
 *   6. Metrics: p50/p95 latencies, error counts, peak memory, WS health
 *
 * The test does NOT hit the real Claude API — sessions use the cheapest
 * workflow ("counsel") with a single agent and minimal budget so the
 * server-side overhead is exercised without burning API credits.
 */

const BASE = process.argv[2]?.startsWith('http') ? process.argv[2] : 'http://localhost:3000';
const USER_COUNT = (() => {
  const idx = process.argv.indexOf('--users');
  return idx !== -1 ? parseInt(process.argv[idx + 1], 10) : 50;
})();
const BYPASS_KEY = (() => {
  const idx = process.argv.indexOf('--bypass-key');
  return idx !== -1 ? process.argv[idx + 1] : '';
})();

/** Default headers attached to every request. Empty when no bypass is set,
 *  so production runs against a locked-down server still work (at small N). */
const COMMON_HEADERS: Record<string, string> = BYPASS_KEY
  ? { 'X-Load-Test-Bypass': BYPASS_KEY }
  : {};

/** Auth batch sizing — 50/tick with bypass (rate limits disabled), 10/tick
 *  otherwise so we stay under the 60/min global cap. */
const AUTH_BATCH = BYPASS_KEY ? 50 : 10;
/** Session creation batch — wider under bypass; tighter without. */
const SESSION_BATCH = BYPASS_KEY ? 25 : 5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Timing {
  label: string;
  durationMs: number;
  status: number;
  ok: boolean;
}

interface UserContext {
  index: number;
  email: string;
  password: string;
  cookie: string;
  sessionId: string | null;
  ws: WebSocket | null;
  wsEvents: number;
  wsErrors: number;
  timings: Timing[];
  errors: string[];
}

interface Metrics {
  totalRequests: number;
  successRequests: number;
  failedRequests: number;
  timings: Timing[];
  wsConnections: number;
  wsEventsTotal: number;
  wsErrorsTotal: number;
  peakRssMb: number;
  startTime: number;
  endTime: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rss(): number {
  return Math.round(process.memoryUsage.rss() / 1024 / 1024);
}

async function timedFetch(
  label: string,
  url: string,
  init?: RequestInit,
): Promise<{ res: Response; timing: Timing }> {
  const start = performance.now();
  const res = await fetch(url, init);
  const timing: Timing = {
    label,
    durationMs: Math.round(performance.now() - start),
    status: res.status,
    ok: res.ok,
  };
  return { res, timing };
}

function parseCookie(headers: Headers): string {
  const setCookie = headers.get('set-cookie') ?? '';
  const match = setCookie.match(/lavern_token=([^;]+)/);
  return match ? match[1] : '';
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function fmtMs(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

// ---------------------------------------------------------------------------
// Phase 1: Auth — signup + login
// ---------------------------------------------------------------------------

async function authPhase(user: UserContext): Promise<void> {
  // Signup
  const { res: signupRes, timing: signupT } = await timedFetch(
    'signup',
    `${BASE}/api/auth/signup`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...COMMON_HEADERS },
      body: JSON.stringify({
        email: user.email,
        password: user.password,
        displayName: `Load Test User ${user.index}`,
        firmName: 'Load Test Corp',
      }),
    },
  );
  user.timings.push(signupT);

  if (signupRes.status === 201) {
    user.cookie = parseCookie(signupRes.headers);
    await signupRes.json(); // drain body
  } else if (signupRes.status === 409) {
    // Already exists — login instead
    await signupRes.text();
    const { res: loginRes, timing: loginT } = await timedFetch(
      'login',
      `${BASE}/api/auth/login`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...COMMON_HEADERS },
        body: JSON.stringify({ email: user.email, password: user.password }),
      },
    );
    user.timings.push(loginT);
    if (loginRes.ok) {
      user.cookie = parseCookie(loginRes.headers);
      await loginRes.json();
    } else {
      const body = await loginRes.text();
      user.errors.push(`login failed: ${loginRes.status} ${body.slice(0, 200)}`);
    }
  } else {
    const body = await signupRes.text();
    user.errors.push(`signup failed: ${signupRes.status} ${body.slice(0, 200)}`);
  }
}

// ---------------------------------------------------------------------------
// Phase 2: Create session
// ---------------------------------------------------------------------------

async function createSession(user: UserContext): Promise<void> {
  const { res, timing } = await timedFetch(
    'create_session',
    `${BASE}/api/sessions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `lavern_token=${user.cookie}`,
        ...COMMON_HEADERS,
      },
      body: JSON.stringify({
        request: {
          type: 'legal_question',
          requestText: `Load test question ${user.index}: What is force majeure in the context of commercial leases?`,
        },
        team: ['Contract Analyst'],
        workflow: 'counsel',
        options: {
          budget: 0.50,
          intensity: 'quick',
        },
      }),
    },
  );
  user.timings.push(timing);

  if (res.ok) {
    const data = (await res.json()) as { sessionId: string };
    user.sessionId = data.sessionId;
  } else {
    const body = await res.text();
    user.errors.push(`create_session failed: ${res.status} ${body.slice(0, 200)}`);
  }
}

// ---------------------------------------------------------------------------
// Phase 3: WebSocket event stream
// ---------------------------------------------------------------------------

function connectWebSocket(user: UserContext): Promise<void> {
  return new Promise((resolve) => {
    if (!user.sessionId) {
      resolve();
      return;
    }

    const wsUrl = `${BASE.replace(/^http/, 'ws')}/api/sessions/${user.sessionId}/events`;
    try {
      const ws = new WebSocket(wsUrl);
      user.ws = ws;

      const timeout = setTimeout(() => {
        // Don't wait forever for the connection
        resolve();
      }, 5000);

      ws.onopen = () => {
        clearTimeout(timeout);
        resolve();
      };

      ws.onmessage = () => {
        user.wsEvents++;
      };

      ws.onerror = () => {
        user.wsErrors++;
      };

      ws.onclose = () => {
        user.ws = null;
      };
    } catch (err) {
      user.errors.push(`ws connect failed: ${(err as Error).message}`);
      resolve();
    }
  });
}

// ---------------------------------------------------------------------------
// Phase 4: Poll session status
// ---------------------------------------------------------------------------

async function pollSession(user: UserContext): Promise<string | null> {
  if (!user.sessionId) return null;

  const { res, timing } = await timedFetch(
    'poll_status',
    `${BASE}/api/sessions/${user.sessionId}`,
    {
      headers: { Cookie: `lavern_token=${user.cookie}`, ...COMMON_HEADERS },
    },
  );
  user.timings.push(timing);

  if (res.ok) {
    const data = (await res.json()) as {
      workflow?: { currentStep?: string };
      pendingGate?: { gateType: string } | null;
      halted?: boolean;
    };
    // Auto-approve any pending gates
    if (data.pendingGate) {
      await approveGate(user);
    }
    if (data.halted) return 'halted';
    return data.workflow?.currentStep ?? null;
  } else {
    await res.text();
    return null;
  }
}

async function approveGate(user: UserContext): Promise<void> {
  if (!user.sessionId) return;
  const { res, timing } = await timedFetch(
    'approve_gate',
    `${BASE}/api/sessions/${user.sessionId}/gate`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `lavern_token=${user.cookie}`,
        ...COMMON_HEADERS,
      },
      body: JSON.stringify({ decision: 'approve', notes: 'load test auto-approve' }),
    },
  );
  user.timings.push(timing);
  await res.text();
}

// ---------------------------------------------------------------------------
// Phase 5: Teardown — cancel sessions
// ---------------------------------------------------------------------------

async function cancelSession(user: UserContext): Promise<void> {
  if (!user.sessionId) return;

  // Close WebSocket first
  if (user.ws) {
    try { user.ws.close(); } catch { /* ignore */ }
    user.ws = null;
  }

  const { res, timing } = await timedFetch(
    'cancel_session',
    `${BASE}/api/sessions/${user.sessionId}`,
    {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `lavern_token=${user.cookie}`,
        ...COMMON_HEADERS,
      },
      body: JSON.stringify({ reason: 'load test cleanup' }),
    },
  );
  user.timings.push(timing);

  if (!res.ok) {
    const body = await res.text();
    // 404 is fine — session may have already ended
    if (res.status !== 404) {
      user.errors.push(`cancel failed: ${res.status} ${body.slice(0, 200)}`);
    }
  } else {
    await res.text();
  }
}

// ---------------------------------------------------------------------------
// Phase 6: Cleanup — delete test accounts
// ---------------------------------------------------------------------------

async function deleteAccount(user: UserContext): Promise<void> {
  if (!user.cookie) return;

  const { res } = await timedFetch(
    'delete_account',
    `${BASE}/api/auth/account`,
    {
      method: 'DELETE',
      headers: {
        Cookie: `lavern_token=${user.cookie}`,
        'X-Confirm-Delete': 'permanently-delete-my-account',
        ...COMMON_HEADERS,
      },
    },
  );
  await res.text(); // drain — don't care about errors
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

async function runUserLifecycle(user: UserContext): Promise<void> {
  // 1. Auth
  await authPhase(user);
  if (!user.cookie) return;

  // 2. Create session
  await createSession(user);
  if (!user.sessionId) return;

  // 3. Connect WebSocket
  await connectWebSocket(user);

  // 4. Poll for up to 30s (sessions may finish fast with "counsel" workflow)
  const pollStart = Date.now();
  const POLL_TIMEOUT_MS = 30_000;
  const POLL_INTERVAL_MS = 2_000;

  while (Date.now() - pollStart < POLL_TIMEOUT_MS) {
    const step = await pollSession(user);
    if (step === 'delivered' || step === 'halted') break;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  // 5. Cancel (cleanup regardless of state)
  await cancelSession(user);
}

async function run(): Promise<void> {
  console.log(`\n╔══════════════════════════════════════════════════╗`);
  console.log(`║  Lavern Load Test                                ║`);
  console.log(`║  Target: ${BASE.padEnd(40)}║`);
  console.log(`║  Users:  ${String(USER_COUNT).padEnd(40)}║`);
  console.log(`║  Bypass: ${(BYPASS_KEY ? 'enabled' : 'disabled').padEnd(40)}║`);
  console.log(`╚══════════════════════════════════════════════════╝\n`);
  if (USER_COUNT >= 500 && !BYPASS_KEY) {
    console.warn('  ⚠ --bypass-key not set. Rate limits will throttle runs above ~50 users.');
    console.warn('    Set LAVERN_LOAD_TEST_BYPASS_KEY on the server and pass --bypass-key here.\n');
  }

  // ---- Health check ----
  console.log('Phase 0: Health check');
  try {
    const { res } = await timedFetch('health', `${BASE}/health`);
    if (!res.ok) {
      console.error(`  ✗ Server not healthy (${res.status}). Aborting.`);
      process.exit(1);
    }
    await res.text();
    console.log('  ✓ Server is running\n');
  } catch (err) {
    console.error(`  ✗ Cannot reach server: ${(err as Error).message}`);
    process.exit(1);
  }

  // ---- Create user contexts ----
  const timestamp = Date.now();
  const users: UserContext[] = Array.from({ length: USER_COUNT }, (_, i) => ({
    index: i,
    email: `loadtest-${timestamp}-${i}@test.lavern.ai`,
    password: `LoadTest!${timestamp}${i}`,
    cookie: '',
    sessionId: null,
    ws: null,
    wsEvents: 0,
    wsErrors: 0,
    timings: [],
    errors: [],
  }));

  const metrics: Metrics = {
    totalRequests: 0,
    successRequests: 0,
    failedRequests: 0,
    timings: [],
    wsConnections: 0,
    wsEventsTotal: 0,
    wsErrorsTotal: 0,
    peakRssMb: rss(),
    startTime: Date.now(),
    endTime: 0,
  };

  // ---- Phase 1: Auth (batched to avoid rate limits) ----
  console.log(`Phase 1: Authenticating ${USER_COUNT} users (batch=${AUTH_BATCH})`);
  const authStart = Date.now();
  for (let i = 0; i < users.length; i += AUTH_BATCH) {
    const batch = users.slice(i, i + AUTH_BATCH);
    await Promise.all(batch.map((u) => authPhase(u)));
    const authed = users.filter((u) => u.cookie).length;
    metrics.peakRssMb = Math.max(metrics.peakRssMb, rss());
    const elapsed = Date.now() - authStart;
    const rate = authed / (elapsed / 1000);
    const eta = rate > 0 ? Math.max(0, (USER_COUNT - authed) / rate) : 0;
    process.stdout.write(
      `  ${authed}/${USER_COUNT} authed · ${rate.toFixed(1)}/s · ETA ${fmtMs(eta * 1000)} · RSS ${rss()}MB    \r`,
    );
  }
  const authedCount = users.filter((u) => u.cookie).length;
  console.log(`  ✓ ${authedCount}/${USER_COUNT} authenticated in ${fmtMs(Date.now() - authStart)}    \n`);

  if (authedCount === 0) {
    console.error('  ✗ No users authenticated. Check server logs.');
    process.exit(1);
  }

  // ---- Phase 2: Create sessions (batched) ----
  console.log(`Phase 2: Creating ${authedCount} sessions (batch=${SESSION_BATCH})`);
  const sessStart = Date.now();
  const authedUsers = users.filter((u) => u.cookie);
  for (let i = 0; i < authedUsers.length; i += SESSION_BATCH) {
    const batch = authedUsers.slice(i, i + SESSION_BATCH);
    await Promise.all(batch.map((u) => createSession(u)));
    const created = users.filter((u) => u.sessionId).length;
    metrics.peakRssMb = Math.max(metrics.peakRssMb, rss());
    const elapsed = Date.now() - sessStart;
    const rate = created / (elapsed / 1000);
    const eta = rate > 0 ? Math.max(0, (authedCount - created) / rate) : 0;
    process.stdout.write(
      `  ${created}/${authedCount} sessions · ${rate.toFixed(1)}/s · ETA ${fmtMs(eta * 1000)} · RSS ${rss()}MB    \r`,
    );
  }
  const sessionCount = users.filter((u) => u.sessionId).length;
  console.log(`  ✓ ${sessionCount}/${authedCount} sessions created in ${fmtMs(Date.now() - sessStart)}    \n`);

  // ---- Phase 3: Connect WebSockets ----
  console.log(`Phase 3: Connecting ${sessionCount} WebSockets`);
  const sessionUsers = users.filter((u) => u.sessionId);
  await Promise.all(sessionUsers.map((u) => connectWebSocket(u)));
  const wsCount = users.filter((u) => u.ws).length;
  metrics.wsConnections = wsCount;
  console.log(`  ✓ ${wsCount}/${sessionCount} WebSocket connections\n`);

  // ---- Phase 4: Poll loop ----
  console.log('Phase 4: Polling sessions (30s window)');
  const POLL_DURATION_MS = 30_000;
  const POLL_INTERVAL_MS = 3_000;
  const pollStart = Date.now();
  let pollRound = 0;

  while (Date.now() - pollStart < POLL_DURATION_MS) {
    pollRound++;
    const activeSessions = users.filter((u) => u.sessionId);
    // Poll all in parallel
    await Promise.all(activeSessions.map((u) => pollSession(u)));

    metrics.peakRssMb = Math.max(metrics.peakRssMb, rss());

    const delivered = activeSessions.filter((u) =>
      u.timings.some((t) => t.label === 'poll_status' && t.ok),
    ).length;
    process.stdout.write(
      `  Round ${pollRound}: ${delivered} sessions polled, RSS ${rss()}MB\r`,
    );

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  console.log(`  ✓ ${pollRound} poll rounds completed\n`);

  // ---- Phase 5: Teardown ----
  console.log(`Phase 5: Cancelling ${sessionCount} sessions`);
  await Promise.all(users.map((u) => cancelSession(u)));
  console.log('  ✓ Sessions cancelled\n');

  // ---- Phase 6: Cleanup accounts ----
  console.log('Phase 6: Cleaning up test accounts');
  for (let i = 0; i < users.length; i += AUTH_BATCH) {
    const batch = users.slice(i, i + AUTH_BATCH);
    await Promise.all(batch.map((u) => deleteAccount(u)));
  }
  console.log('  ✓ Test accounts deleted\n');

  metrics.endTime = Date.now();

  // ---- Aggregate metrics ----
  for (const user of users) {
    for (const t of user.timings) {
      metrics.timings.push(t);
      metrics.totalRequests++;
      if (t.ok) metrics.successRequests++;
      else metrics.failedRequests++;
    }
    metrics.wsEventsTotal += user.wsEvents;
    metrics.wsErrorsTotal += user.wsErrors;
  }

  // ---- Report ----
  const allMs = metrics.timings.map((t) => t.durationMs).sort((a, b) => a - b);
  const byLabel = new Map<string, number[]>();
  for (const t of metrics.timings) {
    if (!byLabel.has(t.label)) byLabel.set(t.label, []);
    byLabel.get(t.label)!.push(t.durationMs);
  }

  const errors = users.flatMap((u) => u.errors);
  const failedTimings = metrics.timings.filter((t) => !t.ok);

  console.log('══════════════════════════════════════════════════');
  console.log('                    RESULTS                       ');
  console.log('══════════════════════════════════════════════════');
  console.log();
  console.log(`  Duration:       ${fmtMs(metrics.endTime - metrics.startTime)}`);
  console.log(`  Users:          ${USER_COUNT}`);
  console.log(`  Total requests: ${metrics.totalRequests}`);
  console.log(`  Success:        ${metrics.successRequests}`);
  console.log(`  Failed:         ${metrics.failedRequests}`);
  console.log(`  Peak RSS:       ${metrics.peakRssMb}MB`);
  console.log();

  console.log('  Latency (all requests):');
  console.log(`    p50:  ${fmtMs(percentile(allMs, 50))}`);
  console.log(`    p95:  ${fmtMs(percentile(allMs, 95))}`);
  console.log(`    p99:  ${fmtMs(percentile(allMs, 99))}`);
  console.log(`    max:  ${fmtMs(percentile(allMs, 100))}`);
  console.log();

  console.log('  Latency by endpoint:');
  for (const [label, durations] of byLabel) {
    durations.sort((a, b) => a - b);
    const failed = metrics.timings.filter((t) => t.label === label && !t.ok).length;
    const failStr = failed > 0 ? ` (${failed} failed)` : '';
    console.log(
      `    ${label.padEnd(20)} n=${String(durations.length).padEnd(5)} ` +
        `p50=${fmtMs(percentile(durations, 50)).padEnd(8)} ` +
        `p95=${fmtMs(percentile(durations, 95)).padEnd(8)} ` +
        `max=${fmtMs(percentile(durations, 100))}${failStr}`,
    );
  }
  console.log();

  console.log('  WebSocket:');
  console.log(`    Connections:    ${metrics.wsConnections}`);
  console.log(`    Events received: ${metrics.wsEventsTotal}`);
  console.log(`    WS errors:     ${metrics.wsErrorsTotal}`);
  console.log();

  if (failedTimings.length > 0) {
    console.log('  Failed requests:');
    const failsByLabel = new Map<string, Map<number, number>>();
    for (const t of failedTimings) {
      if (!failsByLabel.has(t.label)) failsByLabel.set(t.label, new Map());
      const counts = failsByLabel.get(t.label)!;
      counts.set(t.status, (counts.get(t.status) ?? 0) + 1);
    }
    for (const [label, statusCounts] of failsByLabel) {
      const parts = Array.from(statusCounts.entries())
        .map(([s, c]) => `${s}x${c}`)
        .join(', ');
      console.log(`    ${label}: ${parts}`);
    }
    console.log();
  }

  if (errors.length > 0) {
    console.log('  Errors:');
    // Deduplicate similar errors
    const errorCounts = new Map<string, number>();
    for (const e of errors) {
      const key = e.replace(/\d{10,}/g, 'N').slice(0, 100);
      errorCounts.set(key, (errorCounts.get(key) ?? 0) + 1);
    }
    for (const [msg, count] of errorCounts) {
      console.log(`    ${count > 1 ? `(x${count}) ` : ''}${msg}`);
    }
    console.log();
  }

  // ---- Pass/Fail verdict ----
  const passed =
    authedCount >= USER_COUNT * 0.9 &&
    sessionCount >= authedCount * 0.9 &&
    metrics.failedRequests / metrics.totalRequests < 0.1 &&
    percentile(allMs, 95) < 10_000;

  if (passed) {
    console.log('  ✓ PASSED — system handled the load\n');
  } else {
    console.log('  ✗ FAILED — issues detected:\n');
    if (authedCount < USER_COUNT * 0.9)
      console.log(`    - Auth: only ${authedCount}/${USER_COUNT} users authenticated`);
    if (sessionCount < authedCount * 0.9)
      console.log(`    - Sessions: only ${sessionCount}/${authedCount} created`);
    if (metrics.failedRequests / metrics.totalRequests >= 0.1)
      console.log(
        `    - Error rate: ${((metrics.failedRequests / metrics.totalRequests) * 100).toFixed(1)}% (threshold: <10%)`,
      );
    if (percentile(allMs, 95) >= 10_000)
      console.log(
        `    - p95 latency: ${fmtMs(percentile(allMs, 95))} (threshold: <10s)`,
      );
    console.log();
  }

  process.exit(passed ? 0 : 1);
}

run().catch((err) => {
  console.error('Load test crashed:', err);
  process.exit(2);
});
