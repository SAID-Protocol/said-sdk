/**
 * CJS Import Test — verifies dual CJS/ESM support
 *
 * This test ensures the SDK can be required() in CommonJS environments.
 * Run: node test/cjs-import.test.cjs
 */

// @ts-ignore - testing CJS require path
const { SAIDClient, SAIDError, verifyWebhookSignature } = require('../dist/index.cjs');

const client = new SAIDClient();

let passed = 0, failed = 0;

function assert(name, cond) {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}`); }
}

console.log('\n  ── CJS Import Tests ──\n');

// Verify exports exist
assert('SAIDClient is a class', typeof SAIDClient === 'function');
assert('SAIDError is a class', typeof SAIDError === 'function');
assert('verifyWebhookSignature is a function', typeof verifyWebhookSignature === 'function');

// Verify client methods exist
const methods = [
  'getAgent', 'getTrustScore', 'getTrustTier', 'isVerified',
  'getFeedback', 'getLeaderboard', 'getProtocolStats', 'getPassport',
  'getAgentCard', 'getStakeInfo', 'verifyMultiple', 'requireTrust',
  'filterTrusted', 'sendMessage', 'getInbox', 'resolveAgent',
  'discover', 'getChains', 'getStats', 'getFreeTier',
  'registerWebhook', 'getWebhook', 'deleteWebhook', 'invalidateCache',
  // v0.10.0 methods
  'getRiskAssessment', 'assess', 'signReceipt', 'verifyReceipt',
];

for (const method of methods) {
  assert(`client.${method} is a function`, typeof client[method] === 'function');
}

// Quick live API test
async function liveTest() {
  try {
    const stats = await client.getProtocolStats();
    assert('CJS client.getProtocolStats works (live API)', stats.totalAgents > 6000);

    const agent = await client.getAgent('6cQkUCsQHJGJZhnJHYYUic5FUCgd64HChe8APYYDLS4i');
    assert('CJS client.getAgent works (live API)', agent.registered === true);
  } catch (e) {
    assert('CJS live API test (network may be unavailable)', false);
    console.error('  ', e.message);
  }

  console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

liveTest();
