/**
 * SATI Compatibility Layer Tests
 *
 * Tests the SATI bridge module that combines SATI registry data
 * (official Solana Agent Trust Infrastructure) with SAID economic
 * enforcement (staking/slashing) for unified trust verdicts.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  SatiBridge,
  createSatiBridge,
  SATI_PROGRAM_ID,
} from '../../dist/sati.js';

// ── Mock SAIDClient ────────────────────────────────────────────────────────

function createMockSaid(overrides: Record<string, (wallet: string) => Promise<unknown>> = {}) {
  return {
    getAgent: overrides.getAgent || (async (wallet: string) => ({
      registered: true,
      verified: true,
      wallet,
      trustScore: { score: 72, tier: 'Gold' },
    })),
    getStakeInfo: overrides.getStakeInfo || (async () => ({
      amountSOL: 1.5,
      slashedCount: 0,
    })),
    getTrustScore: overrides.getTrustScore || (async () => ({
      score: 72,
      tier: 'Gold',
    })),
  };
}

// Mock fetch for SATI API calls
const originalFetch = globalThis.fetch;

function mockFetch(satiIdentity: unknown, satiReputation: unknown) {
  const calls: string[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    calls.push(urlStr);

    // SATI identity endpoint
    if (urlStr.includes('/api/v1/agents/')) {
      if (satiIdentity === null) {
        return new Response('{}', { status: 404 });
      }
      return new Response(JSON.stringify(satiIdentity), { status: 200 });
    }

    // SATI reputation endpoint
    if (urlStr.includes('/api/v1/reputation/')) {
      if (satiReputation === null) {
        return new Response('{}', { status: 404 });
      }
      return new Response(JSON.stringify(satiReputation), { status: 200 });
    }

    // RPC endpoint (Solana)
    if (init?.method === 'POST') {
      return new Response(JSON.stringify({
        jsonrpc: '2.0', id: 1,
        result: { value: [] },
      }), { status: 200 });
    }

    return new Response('{}', { status: 404 });
  }) as typeof fetch;

  return calls;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('SATI Compatibility Layer', () => {
  before(() => {
    // Ensure fetch is original before tests start
    globalThis.fetch = originalFetch as typeof fetch;
  });

  describe('constants', () => {
    it('exposes SATI_PROGRAM_ID', () => {
      assert.equal(SATI_PROGRAM_ID, 'satiRkxEiwZ51cv8PRu8UMzuaqeaqNEUNjABo6oAFMsLe');
    });
  });

  describe('getSatiIdentity', () => {
    it('returns parsed SATI identity from API', async () => {
      mockFetch({
        name: 'Test Agent',
        registeredAt: '2026-03-15T00:00:00Z',
        endpoint: 'https://agent.example.com',
        description: 'A test agent',
        capabilities: ['trading', 'analysis'],
      }, null);

      const bridge = new SatiBridge(createMockSaid(), { queryOnChain: false });
      const identity = await bridge.getSatiIdentity('TEST_WALLET');

      assert.ok(identity);
      assert.equal(identity!.name, 'Test Agent');
      assert.equal(identity!.source, 'SATI');
      assert.deepEqual(identity!.capabilities, ['trading', 'analysis']);
      assert.equal(identity!.endpoint, 'https://agent.example.com');
    });

    it('returns null when agent not found on SATI', async () => {
      mockFetch(null, null);

      const bridge = new SatiBridge(createMockSaid(), { queryOnChain: false });
      const identity = await bridge.getSatiIdentity('UNKNOWN_WALLET');

      assert.equal(identity, null);
    });

    it('caches identity results', async () => {
      const calls = mockFetch({ name: 'Cached Agent' }, null);

      const bridge = new SatiBridge(createMockSaid(), {
        queryOnChain: false,
        cacheTtlMs: 60_000,
      });

      await bridge.getSatiIdentity('WALLET1');
      await bridge.getSatiIdentity('WALLET1');

      const satiCalls = calls.filter(c => c.includes('/api/v1/agents/'));
      assert.equal(satiCalls.length, 1, 'Should only make 1 network call due to caching');
    });

    it('invalidates cache on demand', async () => {
      const calls = mockFetch({ name: 'Agent X' }, null);

      const bridge = new SatiBridge(createMockSaid(), {
        queryOnChain: false,
        cacheTtlMs: 60_000,
      });

      await bridge.getSatiIdentity('WALLET1');
      bridge.invalidate('WALLET1');
      await bridge.getSatiIdentity('WALLET1');

      const satiCalls = calls.filter(c => c.includes('/api/v1/agents/'));
      assert.equal(satiCalls.length, 2, 'Should make 2 calls after cache invalidation');
    });
  });

  describe('getSatiReputation', () => {
    it('returns parsed reputation data', async () => {
      mockFetch(null, {
        total_feedback: 15,
        average_rating: 4.5,
        five_star: 8,
        four_star: 5,
        three_star: 2,
        two_star: 0,
        one_star: 0,
        weighted_score: 88,
      });

      const bridge = new SatiBridge(createMockSaid(), { queryOnChain: false });
      const rep = await bridge.getSatiReputation('WALLET');

      assert.ok(rep);
      assert.equal(rep!.totalFeedback, 15);
      assert.equal(rep!.averageRating, 4.5);
      assert.equal(rep!.weightedScore, 88);
    });

    it('returns null when no reputation data', async () => {
      mockFetch(null, null);

      const bridge = new SatiBridge(createMockSaid(), { queryOnChain: false });
      const rep = await bridge.getSatiReputation('WALLET');

      assert.equal(rep, null);
    });
  });

  describe('getEnforcement', () => {
    it('returns enforcement data from SAID staking', async () => {
      mockFetch(null, null);

      const said = createMockSaid({
        getStakeInfo: async () => ({ amountSOL: 2.5, slashedCount: 0 }),
      });

      const bridge = new SatiBridge(said, { queryOnChain: false });
      const enforcement = await bridge.getEnforcement('WALLET');

      assert.equal(enforcement.staked, true);
      assert.equal(enforcement.stakeAmountSOL, 2.5);
      assert.equal(enforcement.slashCount, 0);
      assert.equal(enforcement.enforcementTier, 'economic');
      assert.equal(enforcement.riskLevel, 'low');
    });

    it('returns correct risk level for slashed agents', async () => {
      mockFetch(null, null);

      const said = createMockSaid({
        getStakeInfo: async () => ({ amountSOL: 1.0, slashedCount: 2 }),
      });

      const bridge = new SatiBridge(said, { queryOnChain: false });
      const enforcement = await bridge.getEnforcement('WALLET');

      assert.equal(enforcement.slashCount, 2);
      assert.equal(enforcement.riskLevel, 'high');
    });

    it('returns critical for agents with 3+ slashes', async () => {
      mockFetch(null, null);

      const said = createMockSaid({
        getStakeInfo: async () => ({ amountSOL: 0.5, slashedCount: 5 }),
      });

      const bridge = new SatiBridge(said, { queryOnChain: false });
      const enforcement = await bridge.getEnforcement('WALLET');

      assert.equal(enforcement.riskLevel, 'critical');
    });

    it('returns none tier when not staked', async () => {
      mockFetch(null, null);

      const said = createMockSaid({
        getStakeInfo: async () => ({ amountSOL: 0, slashedCount: 0 }),
        getAgent: async () => ({ registered: false, verified: false }),
      });

      const bridge = new SatiBridge(said, { queryOnChain: false });
      const enforcement = await bridge.getEnforcement('WALLET');

      assert.equal(enforcement.staked, false);
      assert.equal(enforcement.enforcementTier, 'reputation');
      assert.equal(enforcement.riskLevel, 'medium');
    });

    it('handles SAID API errors gracefully', async () => {
      mockFetch(null, null);

      const said = createMockSaid({
        getStakeInfo: async () => { throw new Error('API down'); },
      });

      const bridge = new SatiBridge(said, { queryOnChain: false });
      const enforcement = await bridge.getEnforcement('WALLET');

      assert.equal(enforcement.staked, false);
      assert.equal(enforcement.enforcementTier, 'none');
    });
  });

  describe('getUnifiedTrust', () => {
    it('returns trusted verdict for staked high-score agent', async () => {
      mockFetch(
        { name: 'Top Agent', registeredAt: '2026-01-01T00:00:00Z' },
        {
          total_feedback: 20,
          average_rating: 4.8,
          five_star: 15,
          four_star: 5,
          three_star: 0,
          two_star: 0,
          one_star: 0,
          weighted_score: 95,
        },
      );

      const said = createMockSaid({
        getStakeInfo: async () => ({ amountSOL: 2.0, slashedCount: 0 }),
        getAgent: async (wallet: string) => ({
          registered: true,
          verified: true,
          wallet,
          trustScore: { score: 85, tier: 'Gold' },
        }),
      });

      const bridge = new SatiBridge(said, { queryOnChain: false });
      const trust = await bridge.getUnifiedTrust('WALLET');

      assert.equal(trust.verdict, 'trusted');
      assert.ok(trust.registries.includes('SAID'));
      assert.ok(trust.registries.includes('SATI'));
      assert.equal(trust.trustSources.economicEnforcement, true);
      assert.equal(trust.trustSources.satiIdentity, true);
      assert.equal(trust.trustSources.satiReputation, true);
      assert.equal(trust.saidScore, 85);
      assert.equal(trust.economic.stakeAmountSOL, 2.0);
      assert.ok(trust.recommendedEscrowPct <= 15);
      assert.ok(trust.recommendedMaxTxUSDC > 500);
    });

    it('returns untrusted for heavily slashed agents', async () => {
      mockFetch({ name: 'Bad Agent' }, null);

      const said = createMockSaid({
        getStakeInfo: async () => ({ amountSOL: 0.5, slashedCount: 4 }),
        getAgent: async (wallet: string) => ({
          registered: true,
          verified: true,
          wallet,
          trustScore: { score: 15, tier: 'Bronze' },
        }),
      });

      const bridge = new SatiBridge(said, { queryOnChain: false });
      const trust = await bridge.getUnifiedTrust('WALLET');

      assert.equal(trust.verdict, 'untrusted');
      assert.equal(trust.recommendedMaxTxUSDC, 0);
      assert.equal(trust.recommendedEscrowPct, 100);
    });

    it('returns provisional for SATI-verified but unstaked agent', async () => {
      mockFetch(
        { name: 'New Agent', registeredAt: '2026-06-01T00:00:00Z' },
        null,
      );

      const said = createMockSaid({
        getStakeInfo: async () => ({ amountSOL: 0, slashedCount: 0 }),
        getAgent: async (wallet: string) => ({
          registered: false,
          verified: false,
          wallet,
        }),
      });

      const bridge = new SatiBridge(said, { queryOnChain: false });
      const trust = await bridge.getUnifiedTrust('WALLET');

      assert.equal(trust.verdict, 'provisional');
      assert.equal(trust.trustSources.satiIdentity, true);
      assert.equal(trust.trustSources.economicEnforcement, false);
      assert.deepEqual(trust.registries, ['SATI']);
    });

    it('returns insufficient_evidence for completely unknown agent', async () => {
      mockFetch(null, null);

      const said = createMockSaid({
        getStakeInfo: async () => ({ amountSOL: 0, slashedCount: 0 }),
        getAgent: async () => ({ registered: false, verified: false }),
      });

      const bridge = new SatiBridge(said, { queryOnChain: false });
      const trust = await bridge.getUnifiedTrust('UNKNOWN');

      assert.equal(trust.verdict, 'insufficient_evidence');
      assert.deepEqual(trust.registries, []);
      assert.equal(trust.trustSources.satiIdentity, false);
    });

    it('returns provisional for low-stake agent with decent score', async () => {
      mockFetch(null, null);

      const said = createMockSaid({
        getStakeInfo: async () => ({ amountSOL: 0.2, slashedCount: 0 }),
        getAgent: async (wallet: string) => ({
          registered: true,
          verified: true,
          wallet,
          trustScore: { score: 35, tier: 'Bronze' },
        }),
      });

      const bridge = new SatiBridge(said, { queryOnChain: false });
      const trust = await bridge.getUnifiedTrust('WALLET');

      assert.equal(trust.verdict, 'provisional');
    });
  });

  describe('batchUnifiedTrust', () => {
    it('processes multiple wallets', async () => {
      mockFetch({ name: 'Agent 1' }, null);

      const bridge = new SatiBridge(createMockSaid(), { queryOnChain: false });
      const results = await bridge.batchUnifiedTrust(['W1', 'W2', 'W3']);

      assert.equal(results.length, 3);
      for (const r of results) {
        assert.ok(r.wallet);
        assert.ok(r.verdict);
      }
    });
  });

  describe('filterTrusted', () => {
    it('filters based on trust criteria', async () => {
      mockFetch({ name: 'Verified Agent' }, {
        total_feedback: 10,
        average_rating: 4.5,
        five_star: 8,
        four_star: 2,
        three_star: 0,
        two_star: 0,
        one_star: 0,
        weighted_score: 90,
      });

      const bridge = new SatiBridge(createMockSaid(), { queryOnChain: false });
      const trusted = await bridge.filterTrusted(
        ['GOOD_AGENT', 'BAD_AGENT'],
        { minScore: 50, requireStaked: true },
      );

      assert.ok(trusted.length >= 1);
      for (const t of trusted) {
        assert.notEqual(t.verdict, 'untrusted');
      }
    });
  });

  describe('findDualRegistered', () => {
    it('finds agents on both registries', async () => {
      mockFetch({ name: 'Dual Agent' }, null);

      const bridge = new SatiBridge(createMockSaid(), { queryOnChain: false });
      const dual = await bridge.findDualRegistered(['WALLET1']);

      assert.equal(dual.length, 1);
      assert.ok(dual[0].registries.includes('SAID'));
      assert.ok(dual[0].registries.includes('SATI'));
    });
  });

  describe('generateReport', () => {
    it('generates a human-readable markdown report', () => {
      const trust = {
        wallet: 'TEST123',
        satiIdentity: {
          name: 'Test Agent',
          wallet: 'TEST123',
          registeredAt: '2026-01-01',
          source: 'SATI' as const,
        },
        satiReputation: {
          totalFeedback: 10,
          averageRating: 4.5,
          fiveStar: 7,
          fourStar: 3,
          threeStar: 0,
          twoStar: 0,
          oneStar: 0,
          weightedScore: 85,
        },
        economic: {
          staked: true,
          stakeAmountSOL: 1.5,
          slashCount: 0,
          enforcementTier: 'economic' as const,
          riskLevel: 'low' as const,
        },
        saidScore: 75,
        saidTier: 'Gold',
        registries: ['SAID', 'SATI'] as ('SAID' | 'SATI')[],
        verdict: 'trusted' as const,
        explanation: 'Economically backed agent.',
        trustSources: {
          satiIdentity: true,
          satiReputation: true,
          economicEnforcement: true,
          saidReputation: true,
          slashed: false,
        },
        recommendedEscrowPct: 5,
        recommendedMaxTxUSDC: 1500,
      };

      const bridge = new SatiBridge(createMockSaid(), { queryOnChain: false });
      const report = bridge.generateReport(trust);

      assert.ok(report.includes('# SAID × SATI Unified Trust Report'));
      assert.ok(report.includes('TEST123'));
      assert.ok(report.includes('TRUSTED'));
      assert.ok(report.includes('1.5 SOL'));
    });

    it('generates report for unknown agent', () => {
      const trust = {
        wallet: 'UNKNOWN',
        satiIdentity: null,
        satiReputation: null,
        economic: {
          staked: false,
          stakeAmountSOL: 0,
          slashCount: 0,
          enforcementTier: 'none' as const,
          riskLevel: 'medium' as const,
        },
        saidScore: null,
        saidTier: null,
        registries: [] as ('SAID' | 'SATI')[],
        verdict: 'insufficient_evidence' as const,
        explanation: 'Agent not found.',
        trustSources: {
          satiIdentity: false,
          satiReputation: false,
          economicEnforcement: false,
          saidReputation: false,
          slashed: false,
        },
        recommendedEscrowPct: 50,
        recommendedMaxTxUSDC: 100,
      };

      const bridge = new SatiBridge(createMockSaid(), { queryOnChain: false });
      const report = bridge.generateReport(trust);

      assert.ok(report.includes('INSUFFICIENT_EVIDENCE'));
    });
  });

  describe('createSatiBridge factory', () => {
    it('creates a bridge instance', () => {
      const bridge = createSatiBridge(createMockSaid());
      assert.ok(bridge instanceof SatiBridge);
    });

    it('accepts custom config', () => {
      const bridge = createSatiBridge(createMockSaid(), {
        rpcUrl: 'https://custom.rpc',
        cacheTtlMs: 10_000,
      });
      assert.ok(bridge);
    });
  });

  describe('recommendations scale correctly', () => {
    it('low escrow for highly trusted agents', async () => {
      mockFetch({ name: 'Elite Agent' }, {
        total_feedback: 50,
        average_rating: 4.9,
        five_star: 45,
        four_star: 5,
        three_star: 0,
        two_star: 0,
        one_star: 0,
        weighted_score: 98,
      });

      const said = createMockSaid({
        getStakeInfo: async () => ({ amountSOL: 5.0, slashedCount: 0 }),
        getAgent: async (wallet: string) => ({
          registered: true,
          verified: true,
          wallet,
          trustScore: { score: 92, tier: 'Gold' },
        }),
      });

      const bridge = new SatiBridge(said, { queryOnChain: false });
      const trust = await bridge.getUnifiedTrust('ELITE');

      assert.equal(trust.verdict, 'trusted');
      assert.ok(trust.recommendedEscrowPct <= 10, `Expected <=10, got ${trust.recommendedEscrowPct}`);
      assert.ok(trust.recommendedMaxTxUSDC > 1000, `Expected >1000, got ${trust.recommendedMaxTxUSDC}`);
    });

    it('higher escrow for moderately trusted agents', async () => {
      mockFetch(null, null);

      const said = createMockSaid({
        getStakeInfo: async () => ({ amountSOL: 0.5, slashedCount: 0 }),
        getAgent: async (wallet: string) => ({
          registered: true,
          verified: true,
          wallet,
          trustScore: { score: 55, tier: 'Silver' },
        }),
      });

      const bridge = new SatiBridge(said, { queryOnChain: false });
      const trust = await bridge.getUnifiedTrust('MODERATE');

      assert.equal(trust.verdict, 'trusted');
      assert.ok(trust.recommendedEscrowPct >= 5, `Expected >=5, got ${trust.recommendedEscrowPct}`);
    });
  });
});
