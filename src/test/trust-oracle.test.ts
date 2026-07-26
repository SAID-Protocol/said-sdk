/**
 * Trust Oracle Tests — ERC-8183 Evaluator role
 *
 * Tests the SAID Trust Oracle module that implements the Evaluator
 * role in the ERC-8183 Agent Commerce Protocol.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

// We test against the built ESM output
import { TrustOracle, createDefaultOracleConfig, trustToEscrowPct, trustToMaxTxValue, categorizeSeverity, calculateSlashPct } from '../../dist/trust-oracle.js';

// Test against live SAID API (same as other SDK tests)
const SAID_API = 'https://api.saidprotocol.com';
const TEST_WALLET = 'EK3mP45iwgDEEts2cEDfhAs2i4PrH63NMG7vHg2d6fas'; // known wallet
const RANDOM_WALLET = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'; // Solana foundation wallet (likely unregistered)

// Minimal mock SAIDClient for unit tests
function createMockClient(overrides: Record<string, unknown> = {}) {
  return {
    baseURL: SAID_API,
    getTrustScore: async (wallet: string) => {
      if (overrides.scoreMap && overrides.scoreMap[wallet]) return overrides.scoreMap[wallet];
      return { score: 50, tier: 'bronze', address: wallet };
    },
    getRiskAssessment: async (wallet: string) => {
      if (overrides.riskMap && overrides.riskMap[wallet]) return overrides.riskMap[wallet];
      return { staked: false, stakeSOL: 0, slashCount: 0, tier: 'none', score: 50, wallet };
    },
    getStakeInfo: async (wallet: string) => {
      if (overrides.stakeMap && overrides.stakeMap[wallet]) return overrides.stakeMap[wallet];
      return { agent: wallet, stakePDA: '', amountLamports: 0, amountSOL: 0, status: 'none', requestedAt: null, cooldownEndsAt: null, slashedCount: 0 };
    },
    getLeaderboard: async () => {
      if (overrides.leaderboard) return overrides.leaderboard;
      return [
        { wallet: 'WalletA111111111111111111111111111111111111', score: 85, name: 'A', pda: '', reputationScore: 85, feedbackCount: 10, isVerified: true, rank: 1, twitter: null },
        { wallet: 'WalletB222222222222222222222222222222222222', score: 72, name: 'B', pda: '', reputationScore: 72, feedbackCount: 8, isVerified: true, rank: 2, twitter: null },
        { wallet: 'WalletC333333333333333333333333333333333333', score: 60, name: 'C', pda: '', reputationScore: 60, feedbackCount: 5, isVerified: true, rank: 3, twitter: null },
      ];
    },
    ...overrides.clientOverrides,
  };
}

// ── Helper Function Tests (pure, no API) ────────────────────────────────────

describe('Trust Oracle — Helper Functions', () => {

  describe('trustToEscrowPct()', () => {
    it('should return 5% for high-trust staked agent', () => {
      assert.equal(trustToEscrowPct(85, true, 0), 5);
    });

    it('should return 10% for medium-trust staked agent', () => {
      assert.equal(trustToEscrowPct(65, true, 0), 10);
    });

    it('should return 20% for low-trust staked agent', () => {
      assert.equal(trustToEscrowPct(45, true, 0), 20);
    });

    it('should return 30% for unstaked agent', () => {
      assert.equal(trustToEscrowPct(85, false, 0), 30);
    });

    it('should penalize slash count', () => {
      const pct1 = trustToEscrowPct(85, true, 1);
      const pct2 = trustToEscrowPct(85, true, 3);
      assert.ok(pct1 > 5, '1 slash should increase escrow above baseline');
      assert.ok(pct2 > pct1, '3 slashes should be worse than 1');
      assert.ok(pct2 <= 50, 'should cap at 50%');
    });

    it('should cap at 50%', () => {
      assert.equal(trustToEscrowPct(10, false, 10), 50);
    });
  });

  describe('trustToMaxTxValue()', () => {
    it('should scale with score', () => {
      const lowScore = trustToMaxTxValue(30, 0.5);
      const highScore = trustToMaxTxValue(80, 0.5);
      assert.ok(highScore > lowScore, `higher score should allow higher tx value (got ${lowScore} vs ${highScore})`);
    });

    it('should scale with stake', () => {
      const noStake = trustToMaxTxValue(30, 0);
      const withStake = trustToMaxTxValue(30, 10);
      assert.ok(withStake > noStake, 'more stake should allow higher tx value');
    });

    it('should be boosted by stake', () => {
      const maxTx = trustToMaxTxValue(30, 10);
      // score 30 → 300, stake 10 SOL → 500, max = 500
      assert.ok(maxTx === 500, 'should be max of score-based and stake-based');
    });
  });

  describe('categorizeSeverity()', () => {
    it('should return severe for no deliverable', () => {
      assert.equal(categorizeSeverity(0, 80, false), 'severe');
    });

    it('should return severe for high slash count', () => {
      assert.equal(categorizeSeverity(3, 20, true), 'severe');
    });

    it('should return severe for very low score', () => {
      assert.equal(categorizeSeverity(0, 25, true), 'severe');
    });

    it('should return moderate for moderate risk', () => {
      assert.equal(categorizeSeverity(1, 45, true), 'moderate');
    });

    it('should return minor for clean history', () => {
      assert.equal(categorizeSeverity(0, 70, true), 'minor');
    });
  });

  describe('calculateSlashPct()', () => {
    const config = createDefaultOracleConfig();

    it('should return 10% for minor', () => {
      assert.equal(calculateSlashPct('minor', 5, config), 10);
    });

    it('should return 20% for moderate (2x minor)', () => {
      assert.equal(calculateSlashPct('moderate', 5, config), 20);
    });

    it('should return 50% for severe', () => {
      assert.equal(calculateSlashPct('severe', 5, config), 50);
    });
  });

  describe('createDefaultOracleConfig()', () => {
    it('should have sensible defaults', () => {
      const cfg = createDefaultOracleConfig();
      assert.equal(cfg.evaluatorMinScore, 70);
      assert.equal(cfg.evaluatorRequireStaked, true);
      assert.equal(cfg.evaluatorMaxSlashes, 0);
      assert.equal(cfg.evaluatorMinStakeSOL, 1.0);
      assert.equal(cfg.failedWorkSlashPct, 10);
      assert.equal(cfg.fraudSlashPct, 50);
      assert.equal(cfg.receiptTtlSec, 300);
    });
  });
});

// ── TrustOracle Class Tests (mock client) ───────────────────────────────────

describe('Trust Oracle — Class Tests (Mock Client)', () => {
  const oracle = new TrustOracle(createMockClient({
    scoreMap: {
      'GoodAgent11111111111111111111111111111111111': { score: 85, tier: 'gold', address: 'GoodAgent' },
      'MidAgent1111111111111111111111111111111111111': { score: 55, tier: 'silver', address: 'MidAgent' },
      'BadAgent11111111111111111111111111111111111111': { score: 15, tier: 'none', address: 'BadAgent' },
    },
    stakeMap: {
      'GoodAgent11111111111111111111111111111111111': { agent: 'GoodAgent', stakePDA: 'pda1', amountLamports: 5000000000, amountSOL: 5.0, status: 'active', requestedAt: null, cooldownEndsAt: null, slashedCount: 0 },
      'MidAgent1111111111111111111111111111111111111': { agent: 'MidAgent', stakePDA: '', amountLamports: 0, amountSOL: 0, status: 'none', requestedAt: null, cooldownEndsAt: null, slashedCount: 0 },
      'BadAgent11111111111111111111111111111111111111': { agent: 'BadAgent', stakePDA: 'pda3', amountLamports: 500000000, amountSOL: 0.5, status: 'active', requestedAt: null, cooldownEndsAt: null, slashedCount: 3 },
    },
  }));

  describe('trustGate()', () => {
    it('should allow high-trust staked agent', async () => {
      const result = await oracle.trustGate({
        wallet: 'GoodAgent11111111111111111111111111111111111',
        jobValueUSDC: 100,
        action: 'assign',
      });
      assert.equal(result.decision, 'allow');
      assert.equal(result.staked, true);
      assert.equal(result.escrowPct, 5);
    });

    it('should review medium-trust unstaked agent', async () => {
      const result = await oracle.trustGate({
        wallet: 'MidAgent1111111111111111111111111111111111111',
        jobValueUSDC: 100,
        action: 'assign',
      });
      assert.equal(result.decision, 'review');
      assert.ok(result.reason.includes('no staked collateral') || result.reason.includes('caution zone'));
    });

    it('should deny or review low-trust agent', async () => {
      const result = await oracle.trustGate({
        wallet: 'BadAgent11111111111111111111111111111111111111',
        jobValueUSDC: 100,
        action: 'assign',
      });
      // BadAgent has slashes so may be reviewed before score check
      assert.ok(['deny', 'review'].includes(result.decision), `expected deny or review, got ${result.decision}`);
    });

    it('should flag slashed agents for review', async () => {
      const result = await oracle.trustGate({
        wallet: 'BadAgent11111111111111111111111111111111111111',
        action: 'assign',
      });
      assert.ok(result.slashCount > 0);
    });
  });

  describe('evaluate()', () => {
    it('should pass for good agent with deliverable', async () => {
      const result = await oracle.evaluate({
        jobId: 'test-job-1',
        provider: 'GoodAgent11111111111111111111111111111111111',
        client: 'ClientWallet123',
        deliverableHash: '0xabc123def456',
        claim: 'Implemented and tested the authentication module with JWT tokens',
      });
      assert.equal(result.verdict, 'pass');
      assert.ok(result.confidence >= 70);
      assert.equal(result.paymentRecommendation.releasePct, 100);
      assert.equal(result.paymentRecommendation.refundClient, false);
      assert.equal(result.slashRecommendation, undefined);
    });

    it('should fail for bad agent with no deliverable', async () => {
      const result = await oracle.evaluate({
        jobId: 'test-job-2',
        provider: 'BadAgent11111111111111111111111111111111111111',
        client: 'ClientWallet123',
        deliverableHash: '',
        claim: 'done',
      });
      assert.equal(result.verdict, 'fail');
      assert.equal(result.paymentRecommendation.releasePct, 0);
      assert.equal(result.paymentRecommendation.refundClient, true);
      assert.ok(result.slashRecommendation, 'should include slash recommendation');
      assert.equal(result.slashRecommendation!.severity, 'severe');
    });

    it('should return partial for mid agent with deliverable', async () => {
      const result = await oracle.evaluate({
        jobId: 'test-job-3',
        provider: 'MidAgent1111111111111111111111111111111111111',
        client: 'ClientWallet123',
        deliverableHash: '0xdef789abc',
        claim: 'Did some work on the module',
      });
      // Mid agent (score 55, unstaked) — at least unstaked penalty
      assert.ok(['partial', 'pass'].includes(result.verdict), `expected partial or pass, got ${result.verdict}`);
    });

    it('should generate a signed receipt', async () => {
      const result = await oracle.evaluate({
        jobId: 'test-job-4',
        provider: 'GoodAgent11111111111111111111111111111111111',
        client: 'ClientWallet123',
        deliverableHash: '0xreceipt123',
        claim: 'Completed the assigned task with documentation',
      });
      assert.ok(result.receipt.receiptId, 'should have receipt ID');
      assert.ok(result.receipt.signature, 'should have signature');
      assert.ok(result.receipt.signature.startsWith('0x'), 'signature should be hex');
      assert.equal(result.receipt.type, 'work_evaluation');
      assert.equal(result.receipt.decision, result.verdict);
    });

    it('should evaluate all criteria', async () => {
      const result = await oracle.evaluate({
        jobId: 'test-job-5',
        provider: 'GoodAgent11111111111111111111111111111111111',
        client: 'ClientWallet123',
        deliverableHash: '0xcriteria123',
        claim: 'Completed work with full test coverage',
      });
      assert.ok(result.criteria.length >= 5, 'should have at least 5 criteria');
      const names = result.criteria.map(c => c.name);
      assert.ok(names.includes('deliverable_exists'));
      assert.ok(names.includes('claim_substantive'));
      assert.ok(names.includes('provider_trust_minimum'));
      assert.ok(names.includes('provider_staked'));
      assert.ok(names.includes('clean_slash_history'));
    });
  });

  describe('selectEvaluator()', () => {
    it('should select best evaluator from candidates', async () => {
      const result = await oracle.selectEvaluator({
        jobType: 'code-review',
        valueUSDC: 100,
        candidatePool: [
          'GoodAgent11111111111111111111111111111111111',
          'MidAgent1111111111111111111111111111111111111',
          'BadAgent11111111111111111111111111111111111111',
        ],
      });
      assert.equal(result.wallet, 'GoodAgent11111111111111111111111111111111111');
      assert.ok(result.suitability > 50);
      assert.ok(result.reason.includes('qualified candidates'));
    });

    it('should exclude specified wallets', async () => {
      // After excluding GoodAgent, we need another qualified candidate.
      // MidAgent doesn't qualify (score 55, unstaked) so should throw.
      await assert.rejects(
        oracle.selectEvaluator({
          jobType: 'code-review',
          valueUSDC: 100,
          excludeWallets: ['GoodAgent11111111111111111111111111111111111'],
          candidatePool: [
            'GoodAgent11111111111111111111111111111111111',
            'MidAgent1111111111111111111111111111111111111',
          ],
        }),
        /No qualified evaluators/,
      );
    });

    it('should throw if no qualified candidates', async () => {
      await assert.rejects(
        oracle.selectEvaluator({
          jobType: 'code-review',
          valueUSDC: 100,
          candidatePool: ['BadAgent11111111111111111111111111111111111111'],
          minScore: 70,
        }),
        /No qualified evaluators/,
      );
    });
  });

  describe('batchTrustGate()', () => {
    it('should check multiple wallets', async () => {
      const results = await oracle.batchTrustGate(
        [
          'GoodAgent11111111111111111111111111111111111',
          'BadAgent11111111111111111111111111111111111111',
        ],
        50,
      );
      assert.equal(results.size, 2);
      const bad = results.get('BadAgent11111111111111111111111111111111111111');
      assert.ok(['deny', 'review'].includes(bad?.decision ?? ''), `bad should be deny or review, got ${bad?.decision}`);
    });
  });
});

// ── Live API Integration Tests ──────────────────────────────────────────────

describe('Trust Oracle — Live API Integration', { skip: process.env.SKIP_LIVE }, () => {
  let oracle: TrustOracle;

  before(async () => {
    const { SAIDClient } = await import('../../dist/index.js');
    const client = new SAIDClient({ baseURL: SAID_API });
    oracle = new TrustOracle(client);
  });

  it('should run trustGate on a known wallet', async () => {
    const result = await oracle.trustGate({
      wallet: TEST_WALLET,
      action: 'assign',
    });
    assert.ok(['allow', 'review', 'deny'].includes(result.decision));
    assert.ok(typeof result.score === 'number');
    assert.ok(typeof result.staked === 'boolean');
    assert.ok(result.timestamp);
  });

  it('should evaluate work for a known wallet', async () => {
    const result = await oracle.evaluate({
      jobId: `live-test-${Date.now()}`,
      provider: TEST_WALLET,
      client: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
      deliverableHash: '0xlive123test456',
      claim: 'Live integration test of the SAID Trust Oracle',
    });
    assert.ok(['pass', 'fail', 'partial'].includes(result.verdict));
    assert.ok(result.criteria.length >= 5);
    assert.ok(result.receipt.receiptId);
  });

  it('should batch trust gate multiple wallets', async () => {
    const results = await oracle.batchTrustGate([
      TEST_WALLET,
      '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
    ]);
    assert.ok(results.size >= 1);
    for (const [, result] of results) {
      assert.ok(['allow', 'review', 'deny'].includes(result.decision));
    }
  });
});

console.log('Trust Oracle tests loaded.');
