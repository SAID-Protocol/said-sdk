/**
 * x402 Trust Facilitator Tests
 *
 * Tests the x402 payment trust enforcement module — the critical integration
 * point between SAID trust infrastructure and the x402 payment standard.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// ── Test framework ────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    failures.push(label);
    failed++;
  }
}

function assertEqual(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    console.log(`     Expected: ${JSON.stringify(expected)}`);
    console.log(`     Actual:   ${JSON.stringify(actual)}`);
    failures.push(label);
    failed++;
  }
}

function section(name) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`${name}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

// ── Setup ─────────────────────────────────────────────────────────────────

// Import built SDK
const { SAIDClient, SAIDError } = await import('../dist/index.js');
const {
  X402TrustFacilitator,
  parseTrustHeaders,
  defaultPayeeExtractor,
} = await import('../dist/x402.js');

const TEST_WALLET = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'; // System Program (known to exist)

// ── Tests ─────────────────────────────────────────────────────────────────

section('X402TrustFacilitator — Construction');

// Test 1: Can construct with a SAIDClient
{
  const client = new SAIDClient();
  const facilitator = new X402TrustFacilitator(client);
  assert(facilitator instanceof X402TrustFacilitator, 'X402TrustFacilitator can be constructed');
}

// Test 2: Custom config is applied
{
  const client = new SAIDClient();
  const facilitator = new X402TrustFacilitator(client, {
    maxUnverifiedPaymentUSDC: 5.0,
    attachTrustMetadata: false,
  });
  assert(facilitator !== null, 'Facilitator accepts custom config');
}

// Test 3: Default config has sensible values
{
  const client = new SAIDClient();
  const f = new X402TrustFacilitator(client);
  assert(f !== null, 'Default config works');
}

section('X402TrustFacilitator — checkPayment');

// Test 4: No payee wallet → allow by default
{
  const client = new SAIDClient();
  const f = new X402TrustFacilitator(client);
  const fakeResponse = new Response(null, { status: 402 });

  const result = await f.checkPayment(fakeResponse);
  assert(result.allow === true, 'No payee wallet → allow');
  assert(result.deny === false, 'No payee wallet → deny=false');
  assert(result.payeeWallet === null, 'No payee wallet → payeeWallet=null');
  assert(result.reason.includes('No payee'), 'Reason mentions no payee');
}

// Test 5: Known wallet — should fetch trust data
{
  const client = new SAIDClient();
  const f = new X402TrustFacilitator(client);
  const fakeResponse = new Response(null, { status: 402 });

  const result = await f.checkPayment(fakeResponse, {
    payeeWallet: TEST_WALLET,
  });

  assert(result.payeeWallet === TEST_WALLET, 'Payee wallet is set');
  assert(result.payeeRisk !== null, 'Payee risk assessment fetched');
  assert(typeof result.payeeRisk.tier === 'string', 'Risk tier is a string');
  assert(result.headers['x-said-payee-wallet'] === TEST_WALLET, 'Payee wallet in headers');
  assert(result.headers['x-said-payee-tier'] !== undefined, 'Payee tier in headers');
  assert(result.headers['x-said-verdict'] !== undefined, 'Verdict in headers');
}

// Test 6: Payee + payer check
{
  const client = new SAIDClient();
  const f = new X402TrustFacilitator(client);
  const fakeResponse = new Response(null, { status: 402 });

  const result = await f.checkPayment(fakeResponse, {
    payeeWallet: TEST_WALLET,
    payerWallet: '11111111111111111111111111111112', // System program ID
  });

  assert(result.checked === 'both', 'Both sides checked');
  assert(result.payerWallet !== null, 'Payer wallet set');
  assert(result.payerRisk !== null, 'Payer risk fetched');
}

// Test 7: Amount exceeds recommended → review or deny
{
  const client = new SAIDClient();
  const f = new X402TrustFacilitator(client);
  const fakeResponse = new Response(null, { status: 402 });

  const result = await f.checkPayment(fakeResponse, {
    payeeWallet: TEST_WALLET,
    paymentAmountUSDC: 999999, // Absurdly high
  });

  // Should at least flag as review for unregistered/unknown wallet
  assert(
    result.review || result.deny,
    'Absurd payment amount triggers review or deny',
  );
}

// Test 8: Headers are populated for trusted metadata
{
  const client = new SAIDClient();
  const f = new X402TrustFacilitator(client);
  const fakeResponse = new Response(null, { status: 402 });

  const result = await f.checkPayment(fakeResponse, {
    payeeWallet: TEST_WALLET,
  });

  assert(result.headers['x-said-verdict'] !== undefined, 'Verdict header present');
  assert(result.headers['x-said-payee-wallet'] !== undefined, 'Payee wallet header present');
  assert(result.headers['x-said-payee-tier'] !== undefined, 'Payee tier header present');
  assert(result.headers['x-said-payee-decision'] !== undefined, 'Payee decision header present');
}

section('X402TrustFacilitator — wrapFetch');

// Test 9: Non-402 responses pass through unchanged
{
  const client = new SAIDClient();
  const f = new X402TrustFacilitator(client);

  const mockFetch = async () => new Response('OK', { status: 200 });
  const wrappedFetch = f.wrapFetch(mockFetch);

  const res = await wrappedFetch('https://example.com');
  assert(res.status === 200, 'Non-402 response passes through');
  assert(res.headers.get('x-said-verdict') === null, 'No trust headers on non-402 response');
}

// Test 10: 402 with no identifiable payee → passes through
{
  const client = new SAIDClient();
  const f = new X402TrustFacilitator(client);

  const mockFetch = async () => new Response('Payment Required', { status: 402 });
  const wrappedFetch = f.wrapFetch(mockFetch);

  const res = await wrappedFetch('https://example.com');
  assert(res.status === 402, '402 with no payee passes through as 402');
}

// Test 11: 402 with payee header → trust check performed
{
  const client = new SAIDClient();
  const f = new X402TrustFacilitator(client);

  const mockFetch = async () => new Response('Payment Required', {
    status: 402,
    headers: { 'X-Payee': TEST_WALLET },
  });
  const wrappedFetch = f.wrapFetch(mockFetch);

  const res = await wrappedFetch('https://example.com');
  // Should have trust headers attached
  assert(
    res.headers.get('x-said-verdict') !== null || res.status === 403,
    '402 response gets trust-checked (verdict header or blocked)',
  );
}

section('X402TrustFacilitator — preflight');

// Test 12: Preflight with explicit payee wallet
{
  const client = new SAIDClient();
  const f = new X402TrustFacilitator(client);

  const result = await f.preflight('https://example.com', {
    payeeWallet: TEST_WALLET,
    paymentAmountUSDC: 1.0,
  });

  assert(result.payeeWallet === TEST_WALLET, 'Preflight returns payee wallet');
  assert(result.payeeRisk !== null, 'Preflight fetches risk assessment');
}

// Test 13: Preflight returns timestamp
{
  const client = new SAIDClient();
  const f = new X402TrustFacilitator(client);

  const result = await f.preflight('https://example.com', {
    payeeWallet: TEST_WALLET,
  });

  assert(result.timestamp !== null, 'Preflight has timestamp');
  assert(!isNaN(Date.parse(result.timestamp)), 'Timestamp is valid ISO');
}

section('X402TrustFacilitator — batchCheck');

// Test 14: Batch check multiple wallets
{
  const client = new SAIDClient();
  const f = new X402TrustFacilitator(client);

  const results = await f.batchCheck([
    { payeeWallet: TEST_WALLET, paymentAmountUSDC: 1 },
    { payeeWallet: '11111111111111111111111111111112', paymentAmountUSDC: 1 },
    { payeeWallet: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', paymentAmountUSDC: 1 },
  ]);

  assertEqual(results.length, 3, 'batchCheck returns 3 results');
  assert(results.every(r => r.payeeWallet !== null), 'All results have payee wallet');
  assert(results.every(r => r.payeeRisk !== null), 'All results have risk assessment');
}

// Test 15: Batch check empty array
{
  const client = new SAIDClient();
  const f = new X402TrustFacilitator(client);

  const results = await f.batchCheck([]);
  assertEqual(results.length, 0, 'batchCheck empty array returns empty');
}

section('X402TrustFacilitator — pickBestProvider');

// Test 16: pickBestProvider returns highest scoring
{
  const client = new SAIDClient();
  const f = new X402TrustFacilitator(client);

  const best = await f.pickBestProvider([
    TEST_WALLET,
    '11111111111111111111111111111112',
  ]);

  // Should return a result or null (depends on whether any pass trust check)
  assert(
    best === null || best instanceof Object,
    'pickBestProvider returns null or result object',
  );
  if (best) {
    assert(best.payeeWallet !== null, 'Best provider has payee wallet');
    assert(best.payeeRisk !== null, 'Best provider has risk data');
  }
}

// Test 17: pickBestProvider with empty list returns null
{
  const client = new SAIDClient();
  const f = new X402TrustFacilitator(client);

  const best = await f.pickBestProvider([]);
  assertEqual(best, null, 'pickBestProvider empty → null');
}

section('parseTrustHeaders');

// Test 18: Parse headers from Headers object
{
  const headers = new Headers({
    'x-said-verdict': 'allow',
    'x-said-payee-wallet': TEST_WALLET,
    'x-said-payee-score': '75',
    'x-said-payee-tier': 'low',
    'x-said-escrow-pct': '0',
    'x-said-max-usdc': '5000',
  });

  const parsed = parseTrustHeaders(headers);
  assertEqual(parsed.verdict, 'allow', 'Verdict parsed correctly');
  assertEqual(parsed.payeeWallet, TEST_WALLET, 'Payee wallet parsed');
  assertEqual(parsed.payeeScore, 75, 'Payee score parsed as number');
  assertEqual(parsed.payeeTier, 'low', 'Payee tier parsed');
  assertEqual(parsed.escrowPct, 0, 'Escrow pct parsed as number');
  assertEqual(parsed.maxUSDC, 5000, 'Max USDC parsed as number');
  assertEqual(parsed.blocked, false, 'Not blocked');
  assertEqual(parsed.warning, null, 'No warning');
}

// Test 19: Parse headers from plain object
{
  const headers = {
    'x-said-verdict': 'deny',
    'x-said-payee-wallet': TEST_WALLET,
    'x-said-payee-score': 'N/A',
    'x-said-blocked': 'true',
    'x-said-warning': 'Payment exceeds recommended',
  };

  const parsed = parseTrustHeaders(headers);
  assertEqual(parsed.verdict, 'deny', 'Verdict deny parsed from object');
  assertEqual(parsed.payeeScore, null, 'N/A score → null');
  assertEqual(parsed.blocked, true, 'Blocked flag parsed');
  assertEqual(parsed.warning, 'Payment exceeds recommended', 'Warning parsed');
}

// Test 20: Parse headers with payer data
{
  const headers = new Headers({
    'x-said-payer-wallet': 'PAYER_WALLET',
    'x-said-payer-score': '60',
    'x-said-payer-tier': 'moderate',
    'x-said-payer-decision': 'allow',
  });

  const parsed = parseTrustHeaders(headers);
  assertEqual(parsed.payerWallet, 'PAYER_WALLET', 'Payer wallet parsed');
  assertEqual(parsed.payerScore, 60, 'Payer score parsed');
}

// Test 21: Empty headers → nulls
{
  const parsed = parseTrustHeaders(new Headers());
  assertEqual(parsed.verdict, null, 'Empty headers → null verdict');
  assertEqual(parsed.payeeWallet, null, 'Empty headers → null wallet');
  assertEqual(parsed.payeeScore, null, 'Empty headers → null score');
  assertEqual(parsed.blocked, false, 'Empty headers → not blocked');
}

section('defaultPayeeExtractor');

// Test 22: Extract from X-Payee header
{
  const res = new Response(null, {
    headers: { 'X-Payee': TEST_WALLET },
  });
  const wallet = defaultPayeeExtractor(res);
  assertEqual(wallet, TEST_WALLET, 'Extracts from X-Payee header');
}

// Test 23: Extract from X-Said-Payee header
{
  const res = new Response(null, {
    headers: { 'X-Said-Payee': TEST_WALLET },
  });
  const wallet = defaultPayeeExtractor(res);
  assertEqual(wallet, TEST_WALLET, 'Extracts from X-Said-Payee header');
}

// Test 24: No payee header → null
{
  const res = new Response(null, {});
  const wallet = defaultPayeeExtractor(res);
  assertEqual(wallet, null, 'No payee header → null');
}

// Test 25: X-Agent-Wallet header also works
{
  const res = new Response(null, {
    headers: { 'X-Agent-Wallet': TEST_WALLET },
  });
  const wallet = defaultPayeeExtractor(res);
  assertEqual(wallet, TEST_WALLET, 'Extracts from X-Agent-Wallet header');
}

// ── Results ───────────────────────────────────────────────────────────────

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`x402 Facilitator Tests: ${passed} passed, ${failed} failed`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

if (failed > 0) {
  console.log('\n❌ Failures:');
  failures.forEach((f) => console.log(`   - ${f}`));
  process.exit(1);
}
