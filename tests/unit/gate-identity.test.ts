/**
 * Gate identity (L02): consent is per request, never per gate type. A delayed
 * or duplicated answer must never resolve a superseding request.
 */
import { describe, it, expect, vi } from 'vitest';
import { AsyncGateResolver, WebhookGateResolver, identifyGateRequest } from '../../src/gates/gate-resolver.js';

const gate = (details: string) => ({ gateType: 'final_delivery' as const, summary: 'Deliver?', details, proposedAction: 'deliver' });

describe('identifyGateRequest', () => {
  it('assigns an unpredictable gateId and a digest of what is being decided', () => {
    const a = identifyGateRequest(gate('Version A'));
    const b = identifyGateRequest(gate('Version B'));
    expect(a.gateId).not.toBe(b.gateId);
    expect(a.artifactDigest).not.toBe(b.artifactDigest);
    expect(identifyGateRequest(gate('Version A')).artifactDigest).toBe(a.artifactDigest);
    expect(identifyGateRequest(a)).toEqual(a); // stable once assigned
  });
});

describe('AsyncGateResolver decisions are bound to a gateId', () => {
  it("a decision naming the superseded request does not resolve its replacement", async () => {
    const r = new AsyncGateResolver(0);
    const old = r.resolve(gate('Version A: cap EUR 1000'));
    const oldId = r.getPendingGate()!.gateId!;
    const current = r.resolve(gate('Version B: unlimited liability'));
    expect((await old).decision).toBe('reject');
    const bId = r.getPendingGate()!.gateId!;
    const res = r.submitDecision({ decision: 'approve', notes: 'Approving version A' }, oldId);
    // A was superseded and recorded as rejected; a different decision for it is refused,
    // and the caller learns which gate is actually open.
    expect(res).toMatchObject({ ok: false, reason: 'gate_superseded', currentGateId: bId, recordedDecision: { decision: 'reject' } });
    expect(r.hasPendingGate()).toBe(true); // B is still waiting
    expect(r.submitDecision({ decision: 'approve' }, 'not-a-real-gate')).toMatchObject({ ok: false, reason: 'gate_mismatch', currentGateId: bId });
    expect(r.submitDecision({ decision: 'reject', notes: 'no' }, bId)).toMatchObject({ ok: true, gateId: bId });
    expect((await current).decision).toBe('reject');
  });

  it('a duplicate submission for the same decided gate is idempotent', async () => {
    const r = new AsyncGateResolver(0);
    const p = r.resolve(gate('V1'));
    const id = r.getPendingGate()!.gateId!;
    expect(r.submitDecision({ decision: 'approve' }, id)).toMatchObject({ ok: true });
    expect((await p).decision).toBe('approve');
    expect(r.submitDecision({ decision: 'approve' }, id)).toMatchObject({ ok: true, idempotent: true, decision: { decision: 'approve' } });
    expect(r.submitDecision({ decision: 'reject' }, id)).toMatchObject({ ok: false, reason: 'gate_superseded' });
    expect(r.submitDecision({ decision: 'approve' }, 'never-seen')).toMatchObject({ ok: false, reason: 'no_pending' });
  });
});

describe('WebhookGateResolver carries the identity and rejects a stale echo', () => {
  it('sends gateId + digest and refuses a response naming another gate', async () => {
    const calls: Array<{ body: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
      calls.push({ body: init.body });
      return { ok: true, json: async () => ({ decision: 'approve', gateId: 'some-other-gate' }) };
    }));
    try {
      const decision = await new WebhookGateResolver('https://example.com/gate').resolve(gate('Synthetic'));
      const sent = JSON.parse(calls[0].body);
      expect(sent.gateId).toBeTruthy();
      expect(sent.artifactDigest).toBeTruthy();
      expect(decision.decision).toBe('reject'); // stale echo is not consent
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('accepts a response that echoes the right gate', async () => {
    let sentId = '';
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
      sentId = JSON.parse(init.body).gateId;
      return { ok: true, json: async () => ({ decision: 'approve', gateId: sentId }) };
    }));
    try {
      const decision = await new WebhookGateResolver('https://example.com/gate').resolve(gate('Synthetic'));
      expect(decision.decision).toBe('approve');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
