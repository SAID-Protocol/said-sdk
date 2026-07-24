/**
 * ACP (ERC-8183 Agent Commerce Protocol) Tests
 * Tests against live SAID API + unit tests for helper functions
 */

import assert from 'node:assert/strict';

// ── Unit Tests: Helper Functions ────────────────────────────────────────────

console.log('━'.repeat(60));
console.log('ACP Unit Tests — Helper Functions');
console.log('━'.repeat(60));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ❌ ${name}: ${err.message}`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ❌ ${name}: ${err.message}`);
  }
}

// Import helpers from source
const {
  isValidTransition,
  requiresTrustCheck,
  allowsEnforcement,
  calculateEscrowPercentage,
  calculateSpendCap,
  createACPConfig,
  ACP_PRESET_DEFAULT,
  ACP_PRESET_STRICT,
  ACP_PRESET_PERMISSIVE,
  ACP_PRESETS,
  ACPTransactionBuilder,
} = await import('../dist/acp.js');

// ── isValidTransition ──

console.log('\nisValidTransition:');

test('bookmarked → messaged is valid', () => {
  assert.equal(isValidTransition('bookmarked', 'messaged'), true);
});

test('bookmarked → cancelled is valid', () => {
  assert.equal(isValidTransition('bookmarked', 'cancelled'), true);
});

test('bookmarked → hired is INVALID', () => {
  assert.equal(isValidTransition('bookmarked', 'hired'), false);
});

test('hired → started is valid', () => {
  assert.equal(isValidTransition('hired', 'started'), true);
});

test('hired → disputed is valid', () => {
  assert.equal(isValidTransition('hired', 'disputed'), true);
});

test('started → delivered is valid', () => {
  assert.equal(isValidTransition('started', 'delivered'), true);
});

test('delivered → evaluated is valid', () => {
  assert.equal(isValidTransition('delivered', 'evaluated'), true);
});

test('evaluated → paid is valid', () => {
  assert.equal(isValidTransition('evaluated', 'paid'), true);
});

test('paid → completed is valid', () => {
  assert.equal(isValidTransition('paid', 'completed'), true);
});

test('paid → refunded is valid', () => {
  assert.equal(isValidTransition('paid', 'refunded'), true);
});

test('completed → anything is INVALID (terminal)', () => {
  assert.equal(isValidTransition('completed', 'paid'), false);
  assert.equal(isValidTransition('completed', 'disputed'), false);
});

test('cancelled → anything is INVALID (terminal)', () => {
  assert.equal(isValidTransition('cancelled', 'hired'), false);
});

test('refunded → anything is INVALID (terminal)', () => {
  assert.equal(isValidTransition('refunded', 'paid'), false);
});

test('disputed → refunded is valid', () => {
  assert.equal(isValidTransition('disputed', 'refunded'), true);
});

test('disputed → paid is valid', () => {
  assert.equal(isValidTransition('disputed', 'paid'), true);
});

// ── requiresTrustCheck ──

console.log('\nrequiresTrustCheck:');

test('hired requires trust check', () => {
  assert.equal(requiresTrustCheck('hired'), true);
});

test('started requires trust check', () => {
  assert.equal(requiresTrustCheck('started'), true);
});

test('paid requires trust check', () => {
  assert.equal(requiresTrustCheck('paid'), true);
});

test('bookmarked does NOT require trust check', () => {
  assert.equal(requiresTrustCheck('bookmarked'), false);
});

test('completed does NOT require trust check', () => {
  assert.equal(requiresTrustCheck('completed'), false);
});

// ── allowsEnforcement ──

console.log('\nallowsEnforcement:');

test('hired allows enforcement', () => {
  assert.equal(allowsEnforcement('hired'), true);
});

test('started allows enforcement', () => {
  assert.equal(allowsEnforcement('started'), true);
});

test('delivered allows enforcement', () => {
  assert.equal(allowsEnforcement('delivered'), true);
});

test('evaluated allows enforcement', () => {
  assert.equal(allowsEnforcement('evaluated'), true);
});

test('bookmarked does NOT allow enforcement', () => {
  assert.equal(allowsEnforcement('bookmarked'), false);
});

test('completed does NOT allow enforcement', () => {
  assert.equal(allowsEnforcement('completed'), false);
});

// ── calculateEscrowPercentage ──

console.log('\ncalculateEscrowPercentage:');

test('null score → 100% escrow', () => {
  assert.equal(calculateEscrowPercentage(null, 0, false), 100);
});

test('slashed always → 100% escrow', () => {
  assert.equal(calculateEscrowPercentage(90, 10, true), 100);
});

test('score 100, no stake → 10% (floor)', () => {
  const result = calculateEscrowPercentage(100, 0, false);
  assert.equal(result, 10);
});

test('score 100, 5 SOL stake → 10% (stake discount floors at 10)', () => {
  const result = calculateEscrowPercentage(100, 5, false);
  assert.equal(result, 10);
});

test('score 50, no stake → 55%', () => {
  const result = calculateEscrowPercentage(50, 0, false);
  assert.equal(result, 55);
});

test('score 50, 5 SOL stake → 45% (55 - 10 discount)', () => {
  const result = calculateEscrowPercentage(50, 5, false);
  assert.equal(result, 45);
});

test('score 0, no stake → 100%', () => {
  const result = calculateEscrowPercentage(0, 0, false);
  assert.equal(result, 100);
});

test('score 20, 1 SOL → 80% (82 - 2)', () => {
  const result = calculateEscrowPercentage(20, 1, false);
  assert.equal(result, Math.round(82 - 2));
});

// ── calculateSpendCap ──

console.log('\ncalculateSpendCap:');

test('null score + 0 stake → null (unknown)', () => {
  assert.equal(calculateSpendCap(null, 0, false), null);
});

test('slashed → 0', () => {
  assert.equal(calculateSpendCap(90, 10, true), 0);
});

test('score 100 + 0 stake → $1000', () => {
  assert.equal(calculateSpendCap(100, 0, false), 1000);
});

test('score 50 + 2 SOL → $700', () => {
  assert.equal(calculateSpendCap(50, 2, false), 700);
});

test('score 0 + 0 stake → $0', () => {
  assert.equal(calculateSpendCap(0, 0, false), 0);
});

test('null score + 5 SOL → $510 (base $10 + stake $500)', () => {
  assert.equal(calculateSpendCap(null, 5, false), 510);
});

// ── createACPConfig ──

console.log('\ncreateACPConfig:');

test('default preset has correct values', () => {
  const cfg = createACPConfig('default');
  assert.equal(cfg.minScore, 20);
  assert.equal(cfg.requireStake, false);
});

test('strict preset has correct values', () => {
  const cfg = createACPConfig('strict');
  assert.equal(cfg.minScore, 50);
  assert.equal(cfg.requireVerified, true);
  assert.equal(cfg.requireStake, true);
  assert.equal(cfg.minStakeSOL, 1.0);
});

test('permissive preset has correct values', () => {
  const cfg = createACPConfig('permissive');
  assert.equal(cfg.minScore, 0);
  assert.equal(cfg.denyIfSlashedCount, 10);
});

test('overrides work', () => {
  const cfg = createACPConfig('default', { minScore: 75, maxTransactionUSDC: 250 });
  assert.equal(cfg.minScore, 75);
  assert.equal(cfg.maxTransactionUSDC, 250);
  // Other values stay from preset
  assert.equal(cfg.requireStake, false);
});

test('accepts direct config object', () => {
  const custom = createACPConfig({ ...ACP_PRESET_STRICT, minScore: 99 });
  assert.equal(custom.minScore, 99);
});

test('ACP_PRESETS has all 3 presets', () => {
  assert.ok(ACP_PRESETS.default);
  assert.ok(ACP_PRESETS.strict);
  assert.ok(ACP_PRESETS.permissive);
});

// ── ACPTransactionBuilder ──

console.log('\nACPTransactionBuilder:');

test('builds valid transaction', () => {
  const tx = new ACPTransactionBuilder()
    .buyer('BUYER123')
    .provider('PROVIDER456')
    .service('code-review')
    .valueUSDC(50)
    .state('hired')
    .build();

  assert.equal(tx.buyer, 'BUYER123');
  assert.equal(tx.provider, 'PROVIDER456');
  assert.equal(tx.service, 'code-review');
  assert.equal(tx.valueUSDC, 50);
  assert.equal(tx.currentState, 'hired');
});

test('throws on missing buyer', () => {
  assert.throws(() => {
    new ACPTransactionBuilder()
      .provider('P')
      .service('s')
      .valueUSDC(10)
      .state('hired')
      .build();
  }, /buyer is required/);
});

test('throws on missing provider', () => {
  assert.throws(() => {
    new ACPTransactionBuilder()
      .buyer('B')
      .service('s')
      .valueUSDC(10)
      .state('hired')
      .build();
  }, /provider is required/);
});

test('throws on missing service', () => {
  assert.throws(() => {
    new ACPTransactionBuilder()
      .buyer('B')
      .provider('P')
      .valueUSDC(10)
      .state('hired')
      .build();
  }, /service is required/);
});

test('throws on missing valueUSDC', () => {
  assert.throws(() => {
    new ACPTransactionBuilder()
      .buyer('B')
      .provider('P')
      .service('s')
      .state('hired')
      .build();
  }, /valueUSDC is required/);
});

test('throws on missing state', () => {
  assert.throws(() => {
    new ACPTransactionBuilder()
      .buyer('B')
      .provider('P')
      .service('s')
      .valueUSDC(10)
      .build();
  }, /currentState is required/);
});

test('throws on negative valueUSDC', () => {
  assert.throws(() => {
    new ACPTransactionBuilder()
      .valueUSDC(-5);
  }, /non-negative/);
});

test('supports metadata and nextState', () => {
  const tx = new ACPTransactionBuilder()
    .buyer('B')
    .provider('P')
    .service('audit')
    .valueUSDC(100)
    .state('hired')
    .nextState('started')
    .metadata({ priority: 'high' })
    .build();

  assert.equal(tx.nextState, 'started');
  assert.deepEqual(tx.metadata, { priority: 'high' });
});

// ── Integration Tests: Live API ─────────────────────────────────────────────

console.log('\n' + '━'.repeat(60));
console.log('ACP Integration Tests — Live SAID API');
console.log('━'.repeat(60));

const { SAIDClient } = await import('../dist/index.js');
const { ACPTrustChecker } = await import('../dist/acp.js');

const client = new SAIDClient();

// Use a known verified agent from the leaderboard
let knownAgent = null;
try {
  const leaderboard = await client.getLeaderboard();
  if (leaderboard && leaderboard.length > 0) {
    knownAgent = leaderboard[0];
  }
} catch (e) {
  console.log('  ⚠️  Could not fetch leaderboard, using fallback wallet');
}

const knownWallet = knownAgent?.wallet || 'H8nKbwHTTmnjgnsvqxRDpoEcTkU6uoqs4DcLm4kY55Wp';
const unknownWallet = '11111111111111111111111111111111'; // System program — no agent

await testAsync('ACPTrustChecker.evaluateTransaction — unregistered provider → deny', async () => {
  const checker = new ACPTrustChecker(client, createACPConfig('default'));
  const result = await checker.evaluateTransaction({
    buyer: knownWallet,
    provider: unknownWallet,
    service: 'test-service',
    valueUSDC: 10,
    currentState: 'hired',
  });

  assert.equal(result.decision, 'deny');
  assert.ok(result.reason.length > 0);
  assert.equal(result.escrowPct, 100);
});

await testAsync('ACPTrustChecker.canHire — unregistered provider → not allowed', async () => {
  const checker = new ACPTrustChecker(client);
  const result = await checker.canHire(unknownWallet);

  assert.equal(result.allowed, false);
});

await testAsync('ACPTrustChecker.canHire — allowlisted wallet → allowed', async () => {
  const checker = new ACPTrustChecker(client, createACPConfig('default', {
    allowlist: [knownWallet],
  }));
  const result = await checker.canHire(knownWallet);

  assert.equal(result.allowed, true);
  assert.equal(result.escrowPct, 0);
});

await testAsync('ACPTrustChecker.canHire — blocklisted wallet → denied', async () => {
  const checker = new ACPTrustChecker(client, createACPConfig('default', {
    blocklist: [knownWallet],
  }));
  const result = await checker.canHire(knownWallet);

  assert.equal(result.allowed, false);
  assert.ok(result.reason.includes('blocklist'));
});

await testAsync('ACPTrustChecker — max transaction value enforced', async () => {
  const checker = new ACPTrustChecker(client, createACPConfig('default', {
    maxTransactionUSDC: 50,
  }));
  const result = await checker.evaluateTransaction({
    buyer: knownWallet,
    provider: knownWallet,
    service: 'expensive',
    valueUSDC: 100,
    currentState: 'hired',
  });

  assert.equal(result.decision, 'deny');
  assert.ok(result.reason.includes('maximum value'));
});

await testAsync('ACPTrustChecker — invalid state transition → deny', async () => {
  const checker = new ACPTrustChecker(client);
  const result = await checker.evaluateTransaction({
    buyer: knownWallet,
    provider: knownWallet,
    service: 'test',
    valueUSDC: 10,
    currentState: 'completed',
    nextState: 'hired',
  });

  assert.equal(result.decision, 'deny');
  assert.ok(result.reason.includes('Invalid lifecycle transition'));
});

await testAsync('ACPTrustChecker.checkEnforcementAvailable — unknown wallet', async () => {
  const checker = new ACPTrustChecker(client);
  const result = await checker.checkEnforcementAvailable(unknownWallet);

  // Should be false (no stake or error)
  assert.equal(result, false);
});

await testAsync('ACPTrustChecker — both allowlisted → allow', async () => {
  const checker = new ACPTrustChecker(client, createACPConfig('default', {
    allowlist: [knownWallet, knownWallet],
  }));
  const result = await checker.evaluateTransaction({
    buyer: knownWallet,
    provider: knownWallet,
    service: 'test',
    valueUSDC: 10,
    currentState: 'hired',
  });

  assert.equal(result.decision, 'allow');
});

// ── Summary ──

console.log('\n' + '━'.repeat(60));
console.log(`ACP Tests: ${passed} passed, ${failed} failed`);
console.log('━'.repeat(60));

if (failed > 0) {
  process.exit(1);
}
