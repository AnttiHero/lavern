/**
 * L08: parsed IP ranges, not string prefixes. Mapped IPv6 in both notations,
 * ULA range boundaries, loopback, link-local, malformed literals, and public
 * controls; plus the webhook resolver's refusal to follow redirects.
 */
import { describe, it, expect, vi } from 'vitest';
import { isUrlSafe, isPrivateIPv4, isPrivateIPv6, expandIPv6 } from '../../src/utils/url-safety.js';
import { WebhookGateResolver } from '../../src/gates/gate-resolver.js';

const blocked = [
  'https://[::ffff:127.0.0.1]/', 'https://[::ffff:7f00:1]/', 'https://[::ffff:169.254.169.254]/', 'https://[::ffff:a9fe:a9fe]/',
  'https://[::ffff:10.0.0.5]/', 'https://[::ffff:192.168.1.1]/', 'https://[::ffff:172.16.0.1]/',
  'https://[fd12:3456::1]/', 'https://[fc00::1]/', 'https://[fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff]/',
  'https://[fe80::1]/', 'https://[febf::1]/', 'https://[::1]/', 'https://[::]/', 'https://[ff02::1]/',
  'https://[64:ff9b::7f00:1]/', 'https://[2002:7f00:1::1]/',
  'https://127.0.0.1/', 'https://10.1.2.3/', 'https://172.31.255.255/', 'https://192.168.0.1/', 'https://169.254.169.254/',
  'https://100.64.0.1/', 'https://0.0.0.0/', 'https://224.0.0.1/', 'https://255.255.255.255/',
  'https://localhost/', 'https://foo.localhost/', 'https://localhost./',
  'ftp://example.com/', 'http://example.com/', 'not a url',
];
const allowed = [
  'https://example.com/', 'https://8.8.8.8/', 'https://[2606:4700:4700::1111]/', 'https://172.15.0.1/', 'https://172.32.0.1/',
  'https://100.63.255.255/', 'https://100.128.0.1/', 'https://[fe7f::1]/', 'https://[fec0::1]/', 'https://[fbff::1]/', 'https://[::ffff:8.8.8.8]/',
];

describe('isUrlSafe', () => {
  for (const u of blocked) it(`blocks ${u}`, () => expect(isUrlSafe(u)).toBe(false));
  for (const u of allowed) it(`allows ${u}`, () => expect(isUrlSafe(u)).toBe(true));
});

describe('IP parsing', () => {
  it('expands compressed and mapped IPv6', () => {
    expect(expandIPv6('::1')).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(expandIPv6('::ffff:127.0.0.1')).toEqual([0, 0, 0, 0, 0, 0xffff, 0x7f00, 1]);
    expect(expandIPv6('2001:db8::8a2e:370:7334')).toEqual([0x2001, 0xdb8, 0, 0, 0, 0x8a2e, 0x370, 0x7334]);
    expect(expandIPv6('1:2:3:4:5:6:7:8:9')).toBeNull();
    expect(expandIPv6('::g')).toBeNull();
  });
  it('treats malformed literals as unsafe', () => {
    expect(isPrivateIPv4('300.1.1.1')).toBe(true);
    expect(isPrivateIPv6('::zz')).toBe(true);
  });
});

describe('WebhookGateResolver redirects', () => {
  it('refuses to follow redirects (redirect: error)', async () => {
    const mock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ decision: 'approve' }) });
    vi.stubGlobal('fetch', mock);
    try {
      await new WebhookGateResolver('https://example.com/gate').resolve({ gateType: 'final_delivery', summary: 's', details: 'd', proposedAction: 'p' });
      expect(mock.mock.calls[0][1].redirect).toBe('error');
    } finally { vi.unstubAllGlobals(); }
  });
});
