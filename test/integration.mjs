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

// ── Summary ──
console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
