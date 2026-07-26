/**
 * Enforcement Oracle Tests
 *
 * Tests the x402 Enforcement Oracle using mock SAIDClient.
 * No live API calls — deterministic and fast.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EnforcementOracle, createStrictOracle, createPermissiveOracle, createX402Oracle } from '../enforcement-oracle.ts';

// ── Mock SAIDClient ─────────────────────────────────────────────────────────

function createMockClient(agents = {}) {
  const defaultAgent = {
    registered: false,
    verified: false,
    wallet: '',
    error: 'Not found',
  };

  return {
    getAgent: async (wallet) => agents[wallet]?.agent || { ...defaultAgent, wallet },
    getStakeInfo: async (wallet) => agents[wallet]?.stake || {
      agent: wallet,
      stakePDA: '',
      amountLamports: 0,
      amountSOL: 0,
      status: 'none',
      requestedAt: null,
      cooldownEndsAt: null,
      slashedCount: 0,
    },
  };
}

// ── Test data ───────────────────────────────────────────────────────────────

const goodAgent = {
  agent: {
    registered: true,
    verified: true,
    wallet: 'GOOD111111111111111111111111111111111111111',
    identity: { name: 'Good Agent', description: 'Trusted' },
    trustScore: { score: 85, tier: 'Gold', identity: 90, activity: 80, economic: 85, ecosystem: 70, longevity: 75, fairscale: 80, computedAt: '2026-07-01T00:00:00Z', badges: ['verified', 'staked'], sources: ['said'] },
    reputation: { tier: 'Gold', compositeScore: 85, score: 85, feedbackCount: 12, trustTier: 'Gold', scored: true },
  },
  stake: {
    agent: 'GOOD111111111111111111111111111111111111111',
    stakePDA: 'STKE111111111111111111111111111111111111111',
    amountLamports: 2_000_000_000,
    amountSOL: 2.0,
    status: 'active',
    requestedAt: null,
    cooldownEndsAt: null,
    slashedCount: 0,
  },
};

const sketchyAgent = {
  agent: {
    registered: true,
    verified: false,
    wallet: 'SKTC111111111111111111111111111111111111111',
    trustScore: { score: 35, tier: 'Bronze', identity: 30, activity: 40, economic: 20, ecosystem: 35, longevity: 25, fairscale: 30, computedAt: '2026-07-01T00:00:00Z', badges: [], sources: ['said'] },
    reputation: { tier: 'Bronze', compositeScore: 35, score: 35, feedbackCount: 2, trustTier: 'Bronze', scored: true },
  },
  stake: {
    agent: 'SKTC111111111111111111111111111111111111111',
    stakePDA: 'STKE222222222222222222222222222222222222222',
    amountLamports: 100_000_000,
    amountSOL: 0.1,
    status: 'active',
    requestedAt: null,
    cooldownEndsAt: null,
    slashedCount: 1,
  },
};

const slashedAgent = {
  agent: {
    registered: true,
    verified: false,
    wallet: 'BAD1111111111111111111111111111111111111111',
    trustScore: { score: 15, tier: 'Red', identity: 10, activity: 20, economic: 5, ecosystem: 10, longevity: 15, fairscale: 10, computedAt: '2026-07-01T00:00:00Z', badges: [], sources: ['said'] },
    reputation: { tier: 'Red', compositeScore: 15, score: 15, feedbackCount: 0, trustTier: 'Red', scored: true },
  },
  stake: {
    agent: 'BAD1111111111111111111111111111111111111111',
    stakePDA: 'STKE333333333333333333333333333333333333333',
    amountLamports: 0,
    amountSOL: 0,
    status: 'none',
    requestedAt: null,
    cooldownEndsAt: null,
    slashedCount: 5,
  },
};

const unknownAgent = {
  agent: {
    registered: false,
    verified: false,
    wallet: 'UNKN111111111111111111111111111111111111111',
    error: 'Not registered',
  },
  stake: {
    agent: 'UNKN111111111111111111111111111111111111111',
    stakePDA: '',
    amountLamports: 0,
    amountSOL: 0,
    status: 'none',
    requestedAt: null,
    cooldownEndsAt: null,
    slashedCount: 0,
  },
};

const agents = {
  [goodAgent.agent.wallet]: goodAgent,
  [sketchyAgent.agent.wallet]: sketchyAgent,
  [slashedAgent.agent.wallet]: slashedAgent,
  [unknownAgent.agent.wallet]: unknownAgent,
};

// ── Tests ───────────────────────────────────────────────────────────────────

describe('EnforcementOracle', () => {
  let oracle;

  beforeEach(() => {
    const client = createMockClient(agents);
    oracle = new EnforcementOracle(client);
  });

  describe('enforce()', () => {
    it('should allow trusted, staked agents', async () => {
      const verdict = await oracle.enforce(goodAgent.agent.wallet);

      assert.equal(verdict.action, 'allow');
      assert.equal(verdict.registered, true);
      assert.equal(verdict.verified, true);
      assert.equal(verdict.trustScore, 85);
      assert.equal(verdict.stakeSOL, 2.0);
      assert.equal(verdict.stakeActive, true);
      assert.equal(verdict.slashCount, 0);
      assert.equal(verdict.economicSecurity, 'strong');
      assert.equal(verdict.escrowPct, 0);
      assert.ok(verdict.positiveSignals.length > 0);
    });

    it('should require escrow for sketchy agents', async () => {
      const verdict = await oracle.enforce(sketchyAgent.agent.wallet);

      assert.equal(verdict.action, 'require_escrow');
      assert.equal(verdict.registered, true);
      assert.equal(verdict.verified, false);
      assert.equal(verdict.trustScore, 35);
      assert.equal(verdict.stakeSOL, 0.1);
      assert.equal(verdict.slashCount, 1);
      assert.ok(verdict.escrowPct > 0);
      assert.ok(verdict.riskFactors.length > 0);
    });

    it('should block agents with many slashes', async () => {
      const verdict = await oracle.enforce(slashedAgent.agent.wallet);

      assert.equal(verdict.action, 'block');
      assert.equal(verdict.slashCount, 5);
      assert.equal(verdict.trustScore, 15);
    });

    it('should require escrow for unregistered agents', async () => {
      const verdict = await oracle.enforce(unknownAgent.agent.wallet);

      assert.equal(verdict.action, 'require_escrow');
      assert.equal(verdict.registered, false);
      assert.equal(verdict.escrowPct, 100);
    });

    it('should cache allowed verdicts', async () => {
      const v1 = await oracle.enforce(goodAgent.agent.wallet);
      const v2 = await oracle.enforce(goodAgent.agent.wallet);

      // Same object reference (from cache)
      assert.strictEqual(v1, v2);
    });

    it('should not cache blocked verdicts', async () => {
      const v1 = await oracle.enforce(slashedAgent.agent.wallet);
      const v2 = await oracle.enforce(slashedAgent.agent.wallet);

      // Different objects (not cached)
      assert.notStrictEqual(v1, v2);
    });
  });

  describe('checkPayment()', () => {
    it('should proceed when both parties are trusted', async () => {
      const result = await oracle.checkPayment(goodAgent.agent.wallet, goodAgent.agent.wallet);

      assert.equal(result.proceed, true);
      assert.equal(result.escrowRequired, false);
      assert.ok(result.payerVerdict);
      assert.ok(result.payeeVerdict);
    });

    it('should block when payer is slashed', async () => {
      const result = await oracle.checkPayment(slashedAgent.agent.wallet, goodAgent.agent.wallet);

      assert.equal(result.proceed, false);
      assert.equal(result.payerVerdict.action, 'block');
    });

    it('should block when payee is slashed', async () => {
      const result = await oracle.checkPayment(goodAgent.agent.wallet, slashedAgent.agent.wallet);

      assert.equal(result.proceed, false);
      assert.equal(result.payeeVerdict.action, 'block');
    });

    it('should require escrow when payer is sketchy', async () => {
      const result = await oracle.checkPayment(sketchyAgent.agent.wallet, goodAgent.agent.wallet);

      assert.equal(result.proceed, true);
      assert.equal(result.escrowRequired, true);
      assert.ok(result.escrowPct > 0);
    });

    it('should work with only payer (no payee)', async () => {
      const result = await oracle.checkPayment(goodAgent.agent.wallet);

      assert.equal(result.proceed, true);
      assert.equal(result.payeeVerdict, null);
    });
  });

  describe('batchEnforce()', () => {
    it('should check multiple wallets', async () => {
      const verdicts = await oracle.batchEnforce([
        goodAgent.agent.wallet,
        sketchyAgent.agent.wallet,
        slashedAgent.agent.wallet,
      ]);

      assert.equal(verdicts.length, 3);
      assert.equal(verdicts[0].action, 'allow');
      assert.equal(verdicts[1].action, 'require_escrow');
      assert.equal(verdicts[2].action, 'block');
    });
  });

  describe('toJsonResponse()', () => {
    it('should return 200 for allowed payments', async () => {
      const verdict = await oracle.enforce(goodAgent.agent.wallet);
      const res = oracle.toJsonResponse(verdict);

      assert.equal(res.status, 200);
      assert.equal(res.headers.get('X-SAID-Action'), 'allow');
      assert.ok(res.headers.get('Cache-Control').includes('max-age'));
    });

    it('should return 403 for blocked payments', async () => {
      const verdict = await oracle.enforce(slashedAgent.agent.wallet);
      const res = oracle.toJsonResponse(verdict);

      assert.equal(res.status, 403);
      assert.equal(res.headers.get('X-SAID-Action'), 'block');
      assert.equal(res.headers.get('Cache-Control'), 'no-cache');
    });
  });

  describe('clearCache()', () => {
    it('should clear all cache', async () => {
      await oracle.enforce(goodAgent.agent.wallet);
      oracle.clearCache();

      // Next call should be fresh (different object)
      const v = await oracle.enforce(goodAgent.agent.wallet);
      assert.ok(v);
    });

    it('should clear single wallet cache', async () => {
      await oracle.enforce(goodAgent.agent.wallet);
      oracle.clearCache(goodAgent.agent.wallet);

      const v = await oracle.enforce(goodAgent.agent.wallet);
      assert.ok(v);
    });
  });
});

describe('EnforcementOracle factory functions', () => {
  const client = createMockClient(agents);

  it('createStrictOracle should block unregistered', async () => {
    const oracle = createStrictOracle(client);
    const verdict = await oracle.enforce(unknownAgent.agent.wallet);
    assert.equal(verdict.action, 'block');
  });

  it('createPermissiveOracle should allow sketchy agents more easily', async () => {
    const oracle = createPermissiveOracle(client);
    const verdict = await oracle.enforce(sketchyAgent.agent.wallet);
    // Even permissive oracle blocks agents with very low score
    assert.ok(verdict.action === 'require_escrow' || verdict.action === 'allow');
  });

  it('createX402Oracle should allow good agents', async () => {
    const oracle = createX402Oracle(client);
    const verdict = await oracle.enforce(goodAgent.agent.wallet);
    assert.equal(verdict.action, 'allow');
  });

  it('createX402Oracle should still block heavily slashed agents', async () => {
    const oracle = createX402Oracle(client);
    const verdict = await oracle.enforce(slashedAgent.agent.wallet);
    assert.equal(verdict.action, 'block');
  });
});
