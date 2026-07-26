/**
 * Tests for SAID Reputation Passport module
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPassport,
  calculateDimensions,
  calculateVerdict,
  calculateTerms,
  toMCPMeta,
  toA2ACard,
  toX402Headers,
  toAP2Mandate,
  toJSON,
  fromJSON,
  isValid,
  addAttestation,
  getAttestationScore,


} from '../passport.js';

// ── Test Fixtures ───────────────────────────────────────────────────────────

const trustedAgent: PassportInput = {
  wallet: 'EK3mP45iwgDEEts2cEDfhAs2i4PrH63NMG7vHg2d6fas',
  name: 'Trusted Agent',
  description: 'A well-established agent',
  verified: true,
  registered: true,
  trustScore: 85,
  stakeSOL: 5.0,
  slashedCount: 0,
  feedbackCount: 42,
  registeredAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days ago
};

const provisionalAgent: PassportInput = {
  wallet: 'ProvAgent11111111111111111111111111111111111',
  name: 'Provisional Agent',
  verified: false,
  registered: true,
  trustScore: 55,
  stakeSOL: 0.1,
  slashedCount: 0,
  feedbackCount: 3,
  registeredAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
};

const untrustedAgent: PassportInput = {
  wallet: 'BadAgent111111111111111111111111111111111111',
  name: 'Bad Actor',
  verified: false,
  registered: true,
  trustScore: 15,
  stakeSOL: 0,
  slashedCount: 4,
  feedbackCount: 1,
  registeredAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
};

const unregisteredAgent: PassportInput = {
  wallet: 'Unknown1111111111111111111111111111111111111',
  registered: false,
  trustScore: null,
  stakeSOL: 0,
  slashedCount: 0,
  feedbackCount: 0,
};

// ── calculateDimensions ───────────────────────────────────────────────────

describe('calculateDimensions', () => {
  it('maps input fields to dimension object', () => {
    const dims = calculateDimensions(trustedAgent);
    assert.equal(dims.reputation, 85);
    assert.equal(dims.economicSecurity, 5.0);
    assert.equal(dims.slashingEvents, 0);
    assert.equal(dims.verified, true);
    assert.equal(dims.feedbackCount, 42);
    assert.ok(dims.longevityDays >= 89 && dims.longevityDays <= 91);
  });

  it('handles null/undefined fields gracefully', () => {
    const dims = calculateDimensions({ wallet: 'Test' });
    assert.equal(dims.reputation, 0);
    assert.equal(dims.economicSecurity, 0);
    assert.equal(dims.slashingEvents, 0);
    assert.equal(dims.verified, false);
    assert.equal(dims.feedbackCount, 0);
    assert.ok(dims.longevityDays >= 0);
  });
});

// ── calculateVerdict ──────────────────────────────────────────────────────

describe('calculateVerdict', () => {
  it('returns trusted for high-score verified staked agent', () => {
    const dims = calculateDimensions(trustedAgent);
    const { verdict, riskLevel } = calculateVerdict(dims, true);
    assert.equal(verdict, 'trusted');
    assert.equal(riskLevel, 'low');
  });

  it('returns provisional for medium-score agent', () => {
    const dims = calculateDimensions(provisionalAgent);
    const { verdict, riskLevel } = calculateVerdict(dims, true);
    assert.equal(verdict, 'provisional');
    assert.equal(riskLevel, 'medium');
  });

  it('returns untrusted for slashed low-score agent', () => {
    const dims = calculateDimensions(untrustedAgent);
    const { verdict, riskLevel } = calculateVerdict(dims, true);
    assert.equal(verdict, 'untrusted');
    assert.equal(riskLevel, 'critical');
  });

  it('returns insufficient_evidence for unregistered agent', () => {
    const dims = calculateDimensions(unregisteredAgent);
    const { verdict, riskLevel } = calculateVerdict(dims, false);
    assert.equal(verdict, 'insufficient_evidence');
    assert.equal(riskLevel, 'unknown');
  });

  it('returns untrusted for 3+ slashing events regardless of score', () => {
    const dims: ReturnType<typeof calculateDimensions> = {
      reputation: 80,
      economicSecurity: 5,
      slashingEvents: 3,
      verified: true,
      feedbackCount: 20,
      longevityDays: 100,
    };
    const { verdict } = calculateVerdict(dims, true);
    assert.equal(verdict, 'untrusted');
  });

  it("follows 'unknown ≠ zero' philosophy", () => {
    const dims: ReturnType<typeof calculateDimensions> = {
      reputation: 0,
      economicSecurity: 0,
      slashingEvents: 0,
      verified: false,
      feedbackCount: 0,
      longevityDays: 0,
    };
    const { verdict, riskLevel } = calculateVerdict(dims, true);
    // Registered but no data → insufficient_evidence, NOT untrusted
    assert.equal(verdict, 'insufficient_evidence');
    assert.equal(riskLevel, 'unknown');
  });
});

// ── calculateTerms ────────────────────────────────────────────────────────

describe('calculateTerms', () => {
  it('gives low escrow and high limits for trusted agents', () => {
    const dims = calculateDimensions(trustedAgent);
    const terms = calculateTerms(dims, 'trusted');
    assert.ok(terms.escrowPct < 30, `escrow should be < 30, got ${terms.escrowPct}`);
    assert.ok(terms.maxTxnUSDC! >= 800, `max txn should be >= 800, got ${terms.maxTxnUSDC}`);
    assert.ok(terms.dailySpendUSDC! >= 4000, `daily should be >= 4000, got ${terms.dailySpendUSDC}`);
  });

  it('gives full escrow for untrusted agents', () => {
    const dims = calculateDimensions(untrustedAgent);
    const terms = calculateTerms(dims, 'untrusted');
    assert.equal(terms.escrowPct, 100);
    assert.equal(terms.maxTxnUSDC, 0);
    assert.equal(terms.dailySpendUSDC, 0);
  });

  it('stake reduces escrow', () => {
    const noStake = calculateTerms(
      { reputation: 50, economicSecurity: 0, slashingEvents: 0, verified: true, feedbackCount: 5, longevityDays: 30 },
      'provisional'
    );
    const withStake = calculateTerms(
      { reputation: 50, economicSecurity: 5, slashingEvents: 0, verified: true, feedbackCount: 5, longevityDays: 30 },
      'provisional'
    );
    assert.ok(withStake.escrowPct < noStake.escrowPct, 'stake should reduce escrow');
  });

  it('slashing increases escrow', () => {
    const clean = calculateTerms(
      { reputation: 60, economicSecurity: 2, slashingEvents: 0, verified: true, feedbackCount: 10, longevityDays: 60 },
      'provisional'
    );
    const slashed = calculateTerms(
      { reputation: 60, economicSecurity: 2, slashingEvents: 2, verified: true, feedbackCount: 10, longevityDays: 60 },
      'provisional'
    );
    assert.ok(slashed.escrowPct > clean.escrowPct, 'slashing should increase escrow');
  });
});

// ── buildPassport ─────────────────────────────────────────────────────────

describe('buildPassport', () => {
  it('creates a valid passport for a trusted agent', () => {
    const passport = buildPassport(trustedAgent);
    assert.equal(passport.version, 1);
    assert.equal(passport.wallet, trustedAgent.wallet);
    assert.equal(passport.verdict, 'trusted');
    assert.equal(passport.riskLevel, 'low');
    assert.ok(passport.issuedAt);
    assert.ok(passport.expiresAt);
    assert.ok(new Date(passport.expiresAt) > new Date());
  });

  it('respects custom TTL', () => {
    const passport = buildPassport(trustedAgent, { ttlSeconds: 60 });
    const expires = new Date(passport.expiresAt).getTime();
    const expected = Date.now() + 60 * 1000;
    assert.ok(Math.abs(expires - expected) < 5000, 'expiry should be ~60s from now');
  });

  it('includes attestations when enabled', () => {
    const attestation = {
      source: 'clawpump',
      type: 'transactional' as const,
      score: 90,
      volume: 15,
      updatedAt: new Date().toISOString(),
    };
    const passport = buildPassport({ ...trustedAgent, attestations: [attestation] });
    assert.equal(passport.attestations.length, 1);
    assert.equal(passport.attestations[0].source, 'clawpump');
  });

  it('excludes attestations when disabled', () => {
    const passport = buildPassport(
      { ...trustedAgent, attestations: [{ source: 'test', type: 'behavioural', score: 90, volume: 1, updatedAt: '' }] },
      { includeAttestations: false }
    );
    assert.equal(passport.attestations.length, 0);
  });

  it('sets correct issuer URL', () => {
    const passport = buildPassport(trustedAgent, { apiUrl: 'https://custom.api.com' });
    assert.equal(passport.issuer, 'https://custom.api.com');
  });
});

// ── Serialisation: toMCPMeta ───────────────────────────────────────────────

describe('toMCPMeta', () => {
  it('produces MCP _meta format', () => {
    const passport = buildPassport(trustedAgent);
    const meta = toMCPMeta(passport);
    assert.equal(meta.wallet, trustedAgent.wallet);
    assert.equal(meta.score, 85);
    assert.equal(meta.tier, 'trusted');
    assert.equal(meta.stakedSOL, 5.0);
    assert.equal(meta.slashed, 0);
    assert.equal(meta.risk, 'low');
    assert.ok(meta.exp);
    assert.equal(meta.jwt, null); // no JWT by default
  });

  it('includes JWT when provided', () => {
    const passport = buildPassport(trustedAgent);
    const meta = toMCPMeta(passport, { jwt: 'eyJhbGciOiJIUzI1NiJ9.test.signature' });
    assert.equal(meta.jwt, 'eyJhbGciOiJIUzI1NiJ9.test.signature');
  });
});

// ── Serialisation: toA2ACard ───────────────────────────────────────────────

describe('toA2ACard', () => {
  it('produces A2A Agent Card extension', () => {
    const passport = buildPassport(trustedAgent);
    const card = toA2ACard(passport);
    assert.equal(card.type, 'said-reputation-passport');
    assert.equal(card.saidScore, 85);
    assert.equal(card.saidTier, 'trusted');
    assert.equal(card.stakedSOL, 5.0);
    assert.equal(card.slashedCount, 0);
    assert.equal(card.riskLevel, 'low');
    assert.equal(card.verified, true);
    assert.ok(card.profileUrl.includes(trustedAgent.wallet));
  });

  it('accepts custom profile URL', () => {
    const passport = buildPassport(trustedAgent);
    const card = toA2ACard(passport, 'https://custom.example.com/agent/123');
    assert.equal(card.profileUrl, 'https://custom.example.com/agent/123');
  });
});

// ── Serialisation: toX402Headers ───────────────────────────────────────────

describe('toX402Headers', () => {
  it('produces x402 trust headers', () => {
    const passport = buildPassport(trustedAgent);
    const headers = toX402Headers(passport);
    assert.ok(headers.length >= 7);
    assert.ok(headers.find(h => h.name === 'X-SAID-Verdict'));
    assert.ok(headers.find(h => h.name === 'X-SAID-Score'));
    assert.ok(headers.find(h => h.name === 'X-SAID-Risk-Level'));
    assert.ok(headers.find(h => h.name === 'X-SAID-Staked-SOL'));
    assert.ok(headers.find(h => h.name === 'X-SAID-Slashed'));
    assert.ok(headers.find(h => h.name === 'X-SAID-Escrow-Pct'));
    assert.ok(headers.find(h => h.name === 'X-SAID-Expires'));
  });

  it('header values are strings', () => {
    const passport = buildPassport(trustedAgent);
    const headers = toX402Headers(passport);
    for (const h of headers) {
      assert.equal(typeof h.value, 'string', `${h.name} value should be string`);
    }
  });
});

// ── Serialisation: toAP2Mandate ────────────────────────────────────────────

describe('toAP2Mandate', () => {
  it('produces AP2 mandate extension', () => {
    const passport = buildPassport(trustedAgent);
    const mandate = toAP2Mandate(passport);
    assert.equal(mandate.type, 'said-trust');
    assert.ok(mandate.agentTrust);
    assert.equal(mandate.agentTrust.wallet, trustedAgent.wallet);
    assert.equal(mandate.agentTrust.score, 85);
    assert.equal(mandate.agentTrust.stakedSOL, 5.0);
    assert.equal(mandate.agentTrust.slashed, 0);
    assert.equal(mandate.agentTrust.riskLevel, 'low');
    assert.equal(typeof mandate.agentTrust.escrowPct, 'number');
  });
});

// ── Serialisation: JSON round-trip ─────────────────────────────────────────

describe('JSON serialisation', () => {
  it('round-trips through toJSON/fromJSON', () => {
    const passport = buildPassport(trustedAgent);
    const json = toJSON(passport);
    const parsed = fromJSON(json);
    assert.ok(parsed);
    assert.equal(parsed!.wallet, trustedAgent.wallet);
    assert.equal(parsed!.verdict, 'trusted');
    assert.equal(parsed!.version, 1);
  });

  it('fromJSON returns null for expired passport', () => {
    const passport = buildPassport(trustedAgent, { ttlSeconds: -1 });
    const json = toJSON(passport);
    const parsed = fromJSON(json);
    assert.equal(parsed, null);
  });

  it('fromJSON returns null for wrong version', () => {
    const passport = buildPassport(trustedAgent);
    const wrong = { ...JSON.parse(toJSON(passport)), version: 99 };
    const parsed = fromJSON(JSON.stringify(wrong));
    assert.equal(parsed, null);
  });

  it('fromJSON returns null for invalid JSON', () => {
    assert.equal(fromJSON('not json'), null);
    assert.equal(fromJSON('{}'), null); // missing required fields
  });
});

// ── isValid ────────────────────────────────────────────────────────────────

describe('isValid', () => {
  it('returns true for fresh passport', () => {
    const passport = buildPassport(trustedAgent);
    assert.ok(isValid(passport));
  });

  it('returns false for expired passport', () => {
    const passport = buildPassport(trustedAgent, { ttlSeconds: -10 });
    assert.ok(!isValid(passport));
  });
});

// ── addAttestation ─────────────────────────────────────────────────────────

describe('addAttestation', () => {
  it('adds new attestation', () => {
    const passport = buildPassport(trustedAgent);
    const updated = addAttestation(passport, {
      source: 'hyre',
      type: 'transactional',
      score: 92,
      volume: 10,
      updatedAt: new Date().toISOString(),
    });
    assert.equal(updated.attestations.length, 1);
    assert.equal(updated.attestations[0].source, 'hyre');
  });

  it('replaces existing attestation from same source', () => {
    const passport = buildPassport({
      ...trustedAgent,
      attestations: [{
        source: 'hyre',
        type: 'transactional',
        score: 50,
        volume: 3,
        updatedAt: '2026-01-01T00:00:00Z',
      }],
    });
    const updated = addAttestation(passport, {
      source: 'hyre',
      type: 'transactional',
      score: 90,
      volume: 20,
      updatedAt: new Date().toISOString(),
    });
    assert.equal(updated.attestations.length, 1);
    assert.equal(updated.attestations[0].score, 90);
    assert.equal(updated.attestations[0].volume, 20);
  });

  it('does not mutate original passport', () => {
    const passport = buildPassport(trustedAgent);
    const originalCount = passport.attestations.length;
    addAttestation(passport, {
      source: 'test',
      type: 'behavioural',
      score: 80,
      volume: 5,
      updatedAt: new Date().toISOString(),
    });
    assert.equal(passport.attestations.length, originalCount);
  });
});

// ── getAttestationScore ───────────────────────────────────────────────────

describe('getAttestationScore', () => {
  it('returns null for no attestations', () => {
    const passport = buildPassport(trustedAgent);
    assert.equal(getAttestationScore(passport), null);
  });

  it('returns weighted average of attestations', () => {
    const passport = buildPassport({
      ...trustedAgent,
      attestations: [
        { source: 'a', type: 'transactional', score: 80, volume: 10, updatedAt: '' },
        { source: 'b', type: 'behavioural', score: 90, volume: 20, updatedAt: '' },
      ],
    });
    // Weighted: (80*10 + 90*20) / (10+20) = (800+1800)/30 = 86.7
    const score = getAttestationScore(passport);
    assert.equal(score, 86.7);
  });
});
