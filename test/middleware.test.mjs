/**
 * Trust Middleware Tests
 *
 * Tests the createTrustMiddleware(), expressAdapter(), and honoAdapter()
 * functions without hitting live APIs (uses mock client).
 */

import {
  createTrustMiddleware,
} from '../dist/middleware.js';

let passed = 0, failed = 0;

function assert(name, cond) {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}`); }
}

// ── Mock SAIDClient ──────────────────────────────────────────────────────────

function createMockClient(overrides = {}) {
  const defaultAgent = {
    registered: true,
    verified: true,
    wallet: 'TEST_WALLET',
    identity: { name: 'Test Agent', description: 'A test agent' },
    reputation: { tier: 'Gold', score: 85, feedbackCount: 10, compositeScore: 85, trustTier: 'Gold', scored: true },
    trustScore: { score: 85, tier: 'Gold', badges: ['early-adopter'], sources: ['onscore'], identity: 90, activity: 80, economic: 85, ecosystem: 70, longevity: 95, fairscale: 80, computedAt: '2026-07-22T00:00:00Z' },
  };

  const defaultStake = {
    agent: 'TEST_WALLET',
    stakePDA: 'STAKE_PDA',
    amountLamports: 500000000,
    amountSOL: 0.5,
    status: 'active',
    requestedAt: null,
    cooldownEndsAt: null,
    slashedCount: 0,
  };

  const agent = { ...defaultAgent, ...overrides.agent };
  const stake = { ...defaultStake, ...overrides.stake };

  return {
    getAgent: async () => agent,
    getStakeInfo: async () => stake,
    _agent: agent,
    _stake: stake,
  };
}

// ── Helper: create a Request with wallet header ─────────────────────────────

function makeRequest(wallet) {
  const headers = new Headers();
  if (wallet) headers.set('x-agent-wallet', wallet);
  return new Request('https://example.com/api/test', { headers });
}

console.log('\n  ── Trust Middleware Tests ──\n');

// ── Block Mode Tests ──

// Trusted agent passes block mode
{
  const client = createMockClient();
  const mw = createTrustMiddleware(client, { mode: 'block', minScore: 50 });
  const result = await mw(makeRequest('TEST_WALLET'));
  assert('block mode: trusted agent passes', !result.denied);
  assert('block mode: returns wallet', result.wallet === 'TEST_WALLET');
  assert('block mode: returns trust score', result.trustScore?.score === 85);
  assert('block mode: returns headers', Object.keys(result.headers).length > 0);
  assert('block mode: score header', result.headers['x-said-score'] === '85');
  assert('block mode: tier header', result.headers['x-said-tier'] === 'Gold');
}

// Untrusted agent blocked
{
  const client = createMockClient({
    agent: { registered: true, verified: false, trustScore: { score: 20, tier: 'Bronze' } },
  });
  const mw = createTrustMiddleware(client, { mode: 'block', minScore: 50 });
  const result = await mw(makeRequest('TEST_WALLET'));
  assert('block mode: low-score agent denied', result.denied);
  assert('block mode: denial has reason', !!result.reason);
}

// requireVerified flag
{
  const client = createMockClient({
    agent: { registered: true, verified: false, trustScore: { score: 90, tier: 'Gold' } },
  });
  const mw = createTrustMiddleware(client, { mode: 'block', requireVerified: true });
  const result = await mw(makeRequest('TEST_WALLET'));
  assert('block mode: unverified agent denied with requireVerified', result.denied);
}

// Unregistered agent blocked
{
  const client = createMockClient({
    agent: { registered: false, verified: false, wallet: 'UNKNOWN', trustScore: null },
  });
  const mw = createTrustMiddleware(client, { mode: 'block' });
  const result = await mw(makeRequest('UNKNOWN'));
  assert('block mode: unregistered agent denied', result.denied);
}

// ── Flag Mode Tests ──

{
  const client = createMockClient({
    agent: { registered: true, verified: false, trustScore: { score: 20, tier: 'Bronze' } },
  });
  const mw = createTrustMiddleware(client, { mode: 'flag', minScore: 50 });
  const result = await mw(makeRequest('TEST_WALLET'));
  assert('flag mode: never denies', !result.denied);
  assert('flag mode: still returns headers', result.headers['x-said-score'] === '20');
  assert('flag mode: still returns wallet', result.wallet === 'TEST_WALLET');
}

// ── Escalate Mode Tests ──

{
  const client = createMockClient();
  const mw = createTrustMiddleware(client, { mode: 'escalate', minScore: 50, minStakeSOL: 1.0 });
  const result = await mw(makeRequest('TEST_WALLET'));
  // Stake is 0.5 SOL, min is 1.0
  assert('escalate mode: insufficient stake denied', result.denied);
  assert('escalate mode: returns stake data', result.stake !== null);
  assert('escalate mode: stake header set', result.headers['x-said-stake-sol'] === '0.5000');
}

{
  const client = createMockClient({
    stake: { amountSOL: 2.0, status: 'active', amountLamports: 2000000000, agent: 'TEST_WALLET', stakePDA: 'PDA', requestedAt: null, cooldownEndsAt: null, slashedCount: 0 },
  });
  const mw = createTrustMiddleware(client, { mode: 'escalate', minScore: 50, minStakeSOL: 1.0 });
  const result = await mw(makeRequest('TEST_WALLET'));
  assert('escalate mode: sufficient stake passes', !result.denied);
}

// ── No Wallet Header ──

{
  const client = createMockClient();
  const mw = createTrustMiddleware(client, { mode: 'block', minScore: 99 });
  const result = await mw(makeRequest(null));
  assert('no wallet header: passes by default', !result.denied);
  assert('no wallet header: wallet is null', result.wallet === null);
}

// ── Allowlist ──

{
  const client = createMockClient({
    agent: { registered: false, verified: false, wallet: 'ADMIN', trustScore: null },
  });
  const mw = createTrustMiddleware(client, { mode: 'block', minScore: 99, allowlist: ['ADMIN'] });
  const result = await mw(makeRequest('ADMIN'));
  assert('allowlist: bypasses trust check', !result.denied);
  assert('allowlist: sets allowlisted header', result.headers['x-said-allowlisted'] === 'true');
}

// ── Custom extractWallet ──

{
  const client = createMockClient();
  const mw = createTrustMiddleware(client, {
    mode: 'block',
    extractWallet: (req) => req.headers.get('x-custom-wallet') ?? undefined,
  });
  const headers = new Headers({ 'x-custom-wallet': 'CUSTOM_WALLET' });
  const req = new Request('https://example.com', { headers });
  const result = await mw(req);
  assert('custom extractWallet: extracts wallet', result.wallet === 'CUSTOM_WALLET');
}

// ── Summary ──
console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
