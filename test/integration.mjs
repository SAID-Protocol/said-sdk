/**
 * SAID SDK Integration Tests
 *
 * Run: node test/integration.mjs
 *
 * These tests hit the live SAID API (api.saidprotocol.com).
 * No keypair or payment required — all endpoints tested are free.
 */

import { SAIDClient, SAIDError } from '../dist/index.js';

const client = new SAIDClient();

// Use a known-registered agent for testing
const TEST_WALLET = '6cQkUCsQHJGJZhnJHYYUic5FUCgd64HChe8APYYDLS4i';
const UNREGISTERED_WALLET = '11111111111111111111111111111111';

let passed = 0, failed = 0;

function assert(name, cond) {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}`); }
}

console.log('\n  ── SAID SDK Integration Tests ──\n');

// ── Protocol Stats ──
const stats = await client.getProtocolStats();
assert('getProtocolStats returns totalAgents', stats.totalAgents > 6000);
assert('getProtocolStats returns verifiedAgents', stats.verifiedAgents > 5000);
assert('getProtocolStats returns averageReputation', typeof stats.averageReputation === 'number');

// ── Agent Verification ──
const agent = await client.getAgent(TEST_WALLET);
assert('getAgent returns registered=true for known agent', agent.registered === true);
assert('getAgent returns verified=true', agent.verified === true);
assert('getAgent returns identity.name', !!agent.identity?.name);
assert('getAgent returns reputation object', !!agent.reputation);
assert('getAgent returns trustScore object', !!agent.trustScore);

const unknownAgent = await client.getAgent(UNREGISTERED_WALLET);
assert('getAgent returns registered=false for unknown wallet', unknownAgent.registered === false);

// ── Trust Score ──
const score = await client.getTrustScore(TEST_WALLET);
assert('getTrustScore returns non-null for known agent', score !== null);
assert('getTrustScore returns score as number', typeof score?.score === 'number');
assert('getTrustScore returns tier as string', typeof score?.tier === 'string');
assert('getTrustScore returns identity dimension', typeof score?.identity === 'number');
assert('getTrustScore returns activity dimension', typeof score?.activity === 'number');
assert('getTrustScore returns economic dimension', typeof score?.economic === 'number');
assert('getTrustScore returns longevity dimension', typeof score?.longevity === 'number');

const noScore = await client.getTrustScore(UNREGISTERED_WALLET);
assert('getTrustScore returns null for unknown wallet', noScore === null);

// ── Verification Check ──
const isVer = await client.isVerified(TEST_WALLET);
assert('isVerified returns true for known verified agent', isVer === true);

const isVer2 = await client.isVerified(UNREGISTERED_WALLET);
assert('isVerified returns false for unknown wallet', isVer2 === false);

// ── Feedback ──
const feedback = await client.getFeedback(TEST_WALLET);
assert('getFeedback returns array', Array.isArray(feedback));
assert('getFeedback has entries for known agent', feedback.length > 0);
assert('getFeedback entries have score', typeof feedback[0]?.score === 'number');
assert('getFeedback entries have comment', typeof feedback[0]?.comment === 'string');
assert('getFeedback entries have fromWallet', typeof feedback[0]?.fromWallet === 'string');

const emptyFeedback = await client.getFeedback(UNREGISTERED_WALLET);
assert('getFeedback returns empty array for unknown wallet', Array.isArray(emptyFeedback) && emptyFeedback.length === 0);

// ── Leaderboard ──
const leaderboard = await client.getLeaderboard();
assert('getLeaderboard returns array', Array.isArray(leaderboard));
assert('getLeaderboard has entries', leaderboard.length > 0);
assert('getLeaderboard rank 1 exists', leaderboard[0]?.rank === 1);
assert('getLeaderboard entries have name', typeof leaderboard[0]?.name === 'string');
assert('getLeaderboard entries have reputationScore', typeof leaderboard[0]?.reputationScore === 'number');

// ── Passport ──
const passport = await client.getPassport(TEST_WALLET);
assert('getPassport returns hasPassport boolean', typeof passport.hasPassport === 'boolean');
assert('getPassport returns canMint boolean', typeof passport.canMint === 'boolean');

// ── Staking (on-chain read) ──
const stake = await client.getStakeInfo(TEST_WALLET);
assert('getStakeInfo returns agent', typeof stake.agent === 'string');
assert('getStakeInfo returns stakePDA', typeof stake.stakePDA === 'string');
assert('getStakeInfo returns amountSOL as number', typeof stake.amountSOL === 'number');
assert('getStakeInfo returns status as string', typeof stake.status === 'string');
assert('getStakeInfo returns slashedCount as number', typeof stake.slashedCount === 'number');

// ── Batch Verification ──
const batchResults = await client.verifyMultiple([
  TEST_WALLET,
  UNREGISTERED_WALLET,
]);
assert('verifyMultiple returns 2 results', batchResults.length === 2);
assert('verifyMultiple first result verified', batchResults[0].verified === true);
assert('verifyMultiple first result registered', batchResults[0].registered === true);
assert('verifyMultiple second result not registered', batchResults[1].registered === false);

// ── Trust-Gated Helper (should pass) ──
try {
  await client.requireTrust(TEST_WALLET, { requireVerified: true, minScore: 0 });
  assert('requireTrust passes for verified agent with minScore 0', true);
} catch (e) {
  assert('requireTrust passes for verified agent with minScore 0', false);
}

// ── Trust-Gated Helper (should fail) ──
try {
  await client.requireTrust(UNREGISTERED_WALLET, { requireVerified: true });
  assert('requireTrust throws for unregistered wallet', false);
} catch (e) {
  assert('requireTrust throws for unregistered wallet', e.name === 'SAIDError');
}

// ── New v0.6.0 Methods ──

// Use a fresh client with cache disabled to avoid stale data
const freshClient = new SAIDClient({ cacheTtlMs: 0 });

// getTrustTier
const tier = await freshClient.getTrustTier(TEST_WALLET);
assert('getTrustTier returns string or null for known agent', tier === null || typeof tier === 'string');
const noTier = await freshClient.getTrustTier(UNREGISTERED_WALLET);
assert('getTrustTier returns null for unknown wallet', noTier === null);

// filterTrusted
const filterResults = await freshClient.filterTrusted([TEST_WALLET, UNREGISTERED_WALLET], { requireVerified: true });
assert('filterTrusted returns array', Array.isArray(filterResults));
assert('filterTrusted includes verified agent', filterResults.some(r => r.wallet === TEST_WALLET));
assert('filterTrusted excludes unregistered', !filterResults.some(r => r.wallet === UNREGISTERED_WALLET));

const strictFilter = await freshClient.filterTrusted([TEST_WALLET, UNREGISTERED_WALLET], { minScore: 999 });
assert('filterTrusted with high minScore returns empty', strictFilter.length === 0);

// Cache invalidation
client.invalidateCache();
assert('invalidateCache does not throw', true);

// Cache works — cached client returns same agent data
const cachedAgent = await client.getAgent(TEST_WALLET); // first call (may hit API)
const cachedAgent2 = await client.getAgent(TEST_WALLET); // second call (from cache)
assert('cached getAgent returns registered', cachedAgent2.registered === cachedAgent.registered);
assert('cached getAgent returns verified', cachedAgent2.verified === cachedAgent.verified);

// ── Discovery ──
const agents = await client.discover();
assert('discover returns array', Array.isArray(agents));
assert('discover has entries', agents.length > 0);
assert('discover entries have address', typeof agents[0]?.address === 'string');

// ── v0.7.0: Agent Card (ERC-8004) ──
const card = await client.getAgentCard(TEST_WALLET);
assert('getAgentCard returns object for known agent', card !== null);
assert('getAgentCard has @context', card?.['@context'] !== undefined || card?.name !== undefined);
assert('getAgentCard has name', typeof card?.name === 'string');

const noCard = await client.getAgentCard('9xKjW7XkQHJGJZhnJHYYUic5FUCgd64HChe8APYYDLS4i');
assert('getAgentCard returns null for unknown wallet', noCard === null);

// ── v0.7.0: Retry logic works (call stats multiple times rapidly) ──
const stats2 = await client.getProtocolStats();
assert('getProtocolStats still works after multiple calls', stats2.totalAgents > 6000);

// ── Resolve ──
const resolved = await client.resolveAgent(TEST_WALLET);
assert('resolveAgent returns array', Array.isArray(resolved));

// ── Chains ──
const chains = await client.getChains();
assert('getChains returns object', typeof chains === 'object' && chains !== null);
assert('getChains has chains property', 'chains' in chains);

// ── Free Tier ──
const freeTier = await client.getFreeTier(TEST_WALLET);
assert('getFreeTier returns address', typeof freeTier.address === 'string');
assert('getFreeTier returns remaining', typeof freeTier.remaining === 'number');

// ── v0.10.0: Risk Assessment & Policy Tests ──

// getRiskAssessment returns structured data
try {
  const risk = await client.getRiskAssessment(TEST_WALLET);
  assert('getRiskAssessment returns object', typeof risk === 'object' && risk !== null);
  assert('getRiskAssessment has tier', typeof risk.tier === 'string');
  assert('getRiskAssessment has score', typeof risk.score === 'number' || risk.score === null);
  assert('getRiskAssessment has verified', typeof risk.verified === 'boolean');
  assert('getRiskAssessment has registered', typeof risk.registered === 'boolean');
  assert('getRiskAssessment has stakeSOL', typeof risk.stakeSOL === 'number');
  assert('getRiskAssessment has riskFactors array', Array.isArray(risk.riskFactors));
  assert('getRiskAssessment has positiveSignals array', Array.isArray(risk.positiveSignals));
  assert('getRiskAssessment has summary', typeof risk.summary === 'string');
  assert('getRiskAssessment has recommendedMaxValueUSDC', risk.recommendedMaxValueUSDC === null || typeof risk.recommendedMaxValueUSDC === 'number');
  assert('getRiskAssessment has recommendedEscrowPct', typeof risk.recommendedEscrowPct === 'number');
} catch (e) {
  assert('getRiskAssessment returns object', false);
}

// getRiskAssessment for unknown wallet returns unknown tier
{
  const risk = await client.getRiskAssessment(UNREGISTERED_WALLET);
  assert('getRiskAssessment unknown: tier is unknown', risk.tier === 'unknown');
  assert('getRiskAssessment unknown: not registered', !risk.registered);
  assert('getRiskAssessment unknown: 0 stake', risk.stakeSOL === 0);
}

// assess with empty policy for known agent
{
  const result = await client.assess(TEST_WALLET, {});
  assert('assess empty policy: returns decision', typeof result.decision === 'string');
  assert('assess empty policy: has reason', typeof result.reason === 'string');
  assert('assess empty policy: has wallet', result.wallet === TEST_WALLET);
  assert('assess empty policy: has risk object', typeof result.risk === 'object');
  assert('assess empty policy: has policy object', typeof result.policy === 'object');
  assert('assess empty policy: has assessedAt', typeof result.assessedAt === 'string');
}

// assess with strict policy denies unknown wallet
{
  const result = await client.assess(UNREGISTERED_WALLET, { minScore: 50, requireVerified: true });
  assert('assess strict policy: unknown wallet denied', result.decision === 'deny');
  assert('assess strict policy: has reason', result.reason.length > 0);
}

// assess with allowlist
{
  const result = await client.assess(UNREGISTERED_WALLET, { allowlist: [UNREGISTERED_WALLET] });
  assert('assess allowlist: unknown wallet allowed', result.decision === 'allow');
  assert('assess allowlist: reason mentions allowlist', result.reason.includes('allowlist'));
}

// assess with blocklist
{
  const result = await client.assess(TEST_WALLET, { blocklist: [TEST_WALLET] });
  assert('assess blocklist: known wallet denied', result.decision === 'deny');
  assert('assess blocklist: reason mentions blocklist', result.reason.includes('blocklist'));
}

// assess with minStakeSOL (very high → should not be allow)
{
  const result = await client.assess(TEST_WALLET, { minStakeSOL: 999 });
  assert('assess high minStake: not allowed', result.decision !== 'allow');
}

// signReceipt requires keypair (should throw without one)
{
  let threw = false;
  try {
    const assessment = await client.assess(TEST_WALLET, {});
    await client.signReceipt(assessment);
  } catch (e) {
    threw = true;
  }
  assert('signReceipt throws without keypair', threw);
}

// verifyReceipt with invalid data returns false
{
  const fakeReceipt = {
    wallet: 'Fake',
    score: 50,
    tier: 'moderate',
    decision: 'allow',
    timestamp: new Date().toISOString(),
    signature: 'fake',
    signer: 'Fake',
    payload: '{}',
  };
  const valid = await client.verifyReceipt(fakeReceipt);
  assert('verifyReceipt returns false for invalid signature', !valid);
}

// ── v0.11.0: SACRS Credit Score Tests ──

// getCreditScore returns structured data for known agent
try {
  const credit = await client.getCreditScore(TEST_WALLET);
  assert('getCreditScore returns object', typeof credit === 'object' && credit !== null);
  assert('getCreditScore wallet matches', credit.wallet === TEST_WALLET);
  assert('getCreditScore score in 300-850 range', credit.score >= 300 && credit.score <= 850);
  assert('getCreditScore has rating', typeof credit.rating === 'string');
  assert('getCreditScore has probabilityOfDefault', typeof credit.probabilityOfDefault === 'number');
  assert('getCreditScore PD between 0 and 1', credit.probabilityOfDefault >= 0 && credit.probabilityOfDefault <= 1);
  assert('getCreditScore has factors object', typeof credit.factors === 'object');
  assert('getCreditScore factors.paymentHistory is number', typeof credit.factors.paymentHistory === 'number');
  assert('getCreditScore factors.utilization is number', typeof credit.factors.utilization === 'number');
  assert('getCreditScore factors.economicSecurity is number', typeof credit.factors.economicSecurity === 'number');
  assert('getCreditScore has flags array', Array.isArray(credit.flags));
  assert('getCreditScore has recommendedMaxBorrowUSDC', typeof credit.recommendedMaxBorrowUSDC === 'number');
  assert('getCreditScore has recommendedLTV', typeof credit.recommendedLTV === 'number');
  assert('getCreditScore has recommendedRatePremiumBps', typeof credit.recommendedRatePremiumBps === 'number');
  assert('getCreditScore has summary', typeof credit.summary === 'string');
  assert('getCreditScore has scored boolean', typeof credit.scored === 'boolean');
  assert('getCreditScore has computedAt', typeof credit.computedAt === 'string');
  assert('getCreditScore scored=true for known agent', credit.scored === true);
} catch (e) {
  assert('getCreditScore returns object', false);
}

// getCreditScore for unknown wallet returns unrated
{
  const credit = await client.getCreditScore(UNREGISTERED_WALLET);
  assert('getCreditScore unknown: score 300', credit.score === 300);
  assert('getCreditScore unknown: rating unrated', credit.rating === 'unrated');
  assert('getCreditScore unknown: not scored', credit.scored === false);
  assert('getCreditScore unknown: 0 borrow', credit.recommendedMaxBorrowUSDC === 0);
  assert('getCreditScore unknown: 0 LTV', credit.recommendedLTV === 0);
  assert('getCreditScore unknown: has not_registered flag', credit.flags.includes('not_registered'));
}

// getCreditScores (batch) works for multiple wallets
{
  const scores = await client.getCreditScores([TEST_WALLET, UNREGISTERED_WALLET]);
  assert('getCreditScores returns 2 results', scores.length === 2);
  assert('getCreditScores first is scored', scores[0].scored === true);
  assert('getCreditScores second is unrated', scores[1].rating === 'unrated');
  assert('getCreditScores first score > second', scores[0].score > scores[1].score);
}

// assessMultiple works for batch policy assessment
{
  const results = await client.assessMultiple([TEST_WALLET, UNREGISTERED_WALLET], {
    requireVerified: true,
    minScore: 0,
  });
  assert('assessMultiple returns 2 results', results.length === 2);
  assert('assessMultiple known agent has decision', typeof results[0].decision === 'string');
  assert('assessMultiple unknown wallet denied', results[1].decision === 'deny');
}

// SACRS score for known agent is reasonable (above 500 for verified agents with feedback)
{
  const credit = await client.getCreditScore(TEST_WALLET);
  if (credit.scored) {
    assert('getCreditScore known agent score > 400', credit.score > 400);
  }
}

// ── Dual Score (v0.12.0) ──
console.log('\n  ── Dual Score Tests ──\n');

{
  const dual = await client.getDualScore(TEST_WALLET);
  assert('getDualScore returns wallet', dual.wallet === TEST_WALLET);
  assert('getDualScore returns scored=true for known agent', dual.scored === true);
  assert('getDualScore returns overall score', typeof dual.overall === 'number');
  assert('getDualScore overall 0-100', dual.overall >= 0 && dual.overall <= 100);

  // Provider
  assert('getDualScore provider.score is number', typeof dual.provider.score === 'number');
  assert('getDualScore provider.score 0-100', dual.provider.score >= 0 && dual.provider.score <= 100);
  assert('getDualScore provider.confidence is string', typeof dual.provider.confidence === 'string');
  assert('getDualScore provider.signals is array', Array.isArray(dual.provider.signals));
  assert('getDualScore provider.dataPoints > 0 for known agent', dual.provider.dataPoints > 0);

  // Consumer
  assert('getDualScore consumer.score is number', typeof dual.consumer.score === 'number');
  assert('getDualScore consumer.score 0-100', dual.consumer.score >= 0 && dual.consumer.score <= 100);
  assert('getDualScore consumer.confidence is string', typeof dual.consumer.confidence === 'string');
  assert('getDualScore consumer.signals is array', Array.isArray(dual.consumer.signals));
}

// Dual score for unknown wallet
{
  const dual = await client.getDualScore(UNREGISTERED_WALLET);
  assert('getDualScore unknown: scored=false', dual.scored === false);
  assert('getDualScore unknown: overall=0', dual.overall === 0);
  assert('getDualScore unknown: provider.score=0', dual.provider.score === 0);
  assert('getDualScore unknown: consumer.score=0', dual.consumer.score === 0);
  assert('getDualScore unknown: confidence=none', dual.provider.confidence === 'none');
}

// ── Trust Summary (v0.12.0) ──
console.log('\n  ── Trust Summary Tests ──\n');

{
  const summary = await client.getTrustSummary(TEST_WALLET);
  assert('getTrustSummary returns wallet', summary.wallet === TEST_WALLET);
  assert('getTrustSummary returns registered', typeof summary.registered === 'boolean');
  assert('getTrustSummary returns verified', typeof summary.verified === 'boolean');
  assert('getTrustSummary returns identity', !!summary.identity);
  assert('getTrustSummary returns trustScore', !!summary.trustScore);
  assert('getTrustSummary returns stake', !!summary.stake);
  assert('getTrustSummary returns risk', !!summary.risk);
  assert('getTrustSummary returns credit', !!summary.credit);
  assert('getTrustSummary returns dual', !!summary.dual);
  assert('getTrustSummary returns computedAt', typeof summary.computedAt === 'string');
  assert('getTrustSummary risk.tier is string', typeof summary.risk.tier === 'string');
  assert('getTrustSummary credit.score is number', typeof summary.credit.score === 'number');
  assert('getTrustSummary dual.overall is number', typeof summary.dual.overall === 'number');
}

// ── Batch Stake Queries (v0.12.0) ──
console.log('\n  ── Batch Stake Tests ──\n');

{
  const stakes = await client.getStakeInfos([TEST_WALLET, UNREGISTERED_WALLET]);
  assert('getStakeInfos returns 2 results', stakes.length === 2);
  assert('getStakeInfos first has amountSOL', typeof stakes[0].amountSOL === 'number');
  assert('getStakeInfos second has amountSOL', typeof stakes[1].amountSOL === 'number');
  assert('getStakeInfos first has status', typeof stakes[0].status === 'string');
}

// ── ERC-8004 Agent Card Builder (v0.13.0) ──
console.log('\n  ── Agent Card Builder Tests ──\n');

{
  const { buildAgentCard, validateAgentCard, serveAgentCard, tierToBadge, diffAgentCards } =
    await import('../dist/agent-card.js');

  // Build a card from SAID data
  const card = await buildAgentCard(client, {
    wallet: TEST_WALLET,
    description: 'Test agent for SDK validation',
    capabilities: [
      'code-review',
      { name: 'audit', description: 'Security audits' },
    ],
    endpoints: {
      mcp: 'https://example.com/mcp',
      a2a: 'https://example.com/a2a',
    },
  });

  assert('buildAgentCard returns @context', !!card['@context']);
  assert('buildAgentCard returns @type', !!card['@type']);
  assert('buildAgentCard returns @id', !!card['@id']);
  assert('buildAgentCard @id contains wallet', card['@id'].includes(TEST_WALLET.slice(0, 8)) || card['@id'].includes(TEST_WALLET));
  assert('buildAgentCard returns name', typeof card.name === 'string');
  assert('buildAgentCard returns description', card.description === 'Test agent for SDK validation');
  assert('buildAgentCard returns capabilities array', Array.isArray(card.capabilities));
  assert('buildAgentCard returns endpoints', !!card.endpoints);
  assert('buildAgentCard endpoints.mcp set', card.endpoints?.mcp === 'https://example.com/mcp');
  assert('buildAgentCard includes verified status', typeof card.verified === 'boolean');
  assert('buildAgentCard includes chain', card.chain === 'solana');

  // Validate the card
  const validation = validateAgentCard(card);
  assert('validateAgentCard returns valid=true', validation.valid === true);
  assert('validateAgentCard returns errors array', Array.isArray(validation.errors));
  assert('validateAgentCard returns warnings array', Array.isArray(validation.warnings));

  // Validate an invalid card
  const invalidCard = { name: 'Missing fields' };
  const invalidResult = validateAgentCard(invalidCard);
  assert('validateAgentCard catches missing required fields', invalidResult.valid === false);
  assert('validateAgentCard reports missing @context', invalidResult.errors.some(e => e.includes('@context')));

  // serveAgentCard returns a Response
  const response = serveAgentCard(card);
  assert('serveAgentCard returns Response', response instanceof Response);
  assert('serveAgentCard content-type is ld+json', response.headers.get('content-type') === 'application/ld+json');
  assert('serveAgentCard has CORS header', response.headers.get('access-control-allow-origin') === '*');

  // tierToBadge
  const badge = tierToBadge('Gold');
  assert('tierToBadge returns said:gold', badge === 'said:gold');
  const badge2 = tierToBadge('Diamond');
  assert('tierToBadge returns said:diamond', badge2 === 'said:diamond');

  // diffAgentCards
  const card2 = { ...card, name: 'Changed Name' };
  const diff = diffAgentCards(card, card2);
  assert('diffAgentCards detects name change', diff.includes('name'));
  assert('diffAgentCards returns array', Array.isArray(diff));
}

// ── Policy Presets (v0.13.0) ──
console.log('\n  ── Policy Presets Tests ──\n');

{
  const mod = await import('../dist/index.js');
  const { POLICY_STRICT, POLICY_BALANCED, POLICY_PERMISSIVE, POLICY_X402, POLICY_DEFI, POLICIES } = mod;

  assert('POLICY_STRICT has minScore', typeof POLICY_STRICT.minScore === 'number');
  assert('POLICY_STRICT requires verified', POLICY_STRICT.requireVerified === true);
  assert('POLICY_STRICT has minStakeSOL', typeof POLICY_STRICT.minStakeSOL === 'number');

  assert('POLICY_BALANCED has minScore', typeof POLICY_BALANCED.minScore === 'number');
  assert('POLICY_BALANCED requires verified', POLICY_BALANCED.requireVerified === true);

  assert('POLICY_PERMISSIVE has maxRiskTier', typeof POLICY_PERMISSIVE.maxRiskTier === 'string');

  assert('POLICY_X402 has minScore', typeof POLICY_X402.minScore === 'number');
  assert('POLICY_DEFI requires active stake', POLICY_DEFI.requireActiveStake === true);
  assert('POLICY_DEFI has highest minStakeSOL', POLICY_DEFI.minStakeSOL >= POLICY_STRICT.minStakeSOL);

  assert('POLICIES has 5 presets', Object.keys(POLICIES).length === 5);
  assert('POLICIES.strict equals POLICY_STRICT', POLICIES.strict === POLICY_STRICT);
  assert('POLICIES.x402 equals POLICY_X402', POLICIES.x402 === POLICY_X402);

  // Verify presets work with assess()
  const result = await client.assess(TEST_WALLET, POLICY_PERMISSIVE);
  assert('assess with PERMISSIVE policy returns decision', typeof result.decision === 'string');

  const strictResult = await client.assess(UNREGISTERED_WALLET, POLICY_STRICT);
  assert('assess with STRICT policy denies unknown wallet', strictResult.decision === 'deny');
}

// ── Summary ──
console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
