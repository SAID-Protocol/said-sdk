/**
 * Example 06 — Enforcement Oracle for x402 Payments
 *
 * The #1 strategic product: enforce trust before allowing x402 payments.
 * Agents with stake + good reputation proceed freely.
 * Slashed or unknown agents get blocked or forced into escrow.
 *
 * Run: npx tsx examples/06-enforcement-oracle.ts
 */

import {
  SAIDClient,
  EnforcementOracle,
  createX402Oracle,
  createStrictOracle,
} from '../src/index.js';

async function main() {
  const client = new SAIDClient();

  // Create an enforcement oracle tuned for x402 payment flows
  const oracle = createX402Oracle(client);

  // Or create a custom one:
  // const oracle = new EnforcementOracle(client, {
  //   minScore: 50,
  //   requireStaked: true,
  //   maxSlashes: 1,
  //   escrowThreshold: 'moderate',
  // });

  const wallet = process.argv[2] || 'EkHj6W2fqKkYm8y6mP3oNpQr1sTuVwXyZ1aBcDeFgHi';

  console.log('=== SAID Enforcement Oracle ===\n');

  // 1. Single enforcement check
  console.log(`Checking: ${wallet}`);
  const verdict = await oracle.enforce(wallet);

  const emoji = verdict.action === 'allow' ? '✅' :
                verdict.action === 'require_escrow' ? '🔒' : '❌';

  console.log(`${emoji} Action: ${verdict.action}`);
  console.log(`   Score: ${verdict.score ?? 'N/A'}/100`);
  console.log(`   Stake: ${verdict.stakeSOL.toFixed(2)} SOL`);
  console.log(`   Slashes: ${verdict.slashes}`);
  console.log(`   Reason: ${verdict.reason}`);

  if (verdict.escrowAmountUSDC) {
    console.log(`   Escrow: $${verdict.escrowAmountUSDC} USDC`);
  }

  // 2. Two-sided payment check (payer → payee)
  console.log('\n--- Two-sided payment check ---');
  const payWallet = process.argv[3] || 'AnotherWallet...';
  const paymentCheck = await oracle.checkPayment(wallet, payWallet);

  console.log(`Payment: ${paymentCheck.action}`);
  console.log(`Reason: ${paymentCheck.reason}`);

  // 3. Batch enforcement
  console.log('\n--- Batch enforcement ---');
  const wallets = process.argv.slice(2).length >= 2
    ? process.argv.slice(2)
    : [wallet];

  if (wallets.length > 1) {
    const batch = await oracle.batchEnforce(wallets);
    const allowed = batch.filter(b => b.action === 'allow');
    const escrow = batch.filter(b => b.action === 'require_escrow');
    const blocked = batch.filter(b => b.action === 'block');

    console.log(`Results: ${allowed.length} allowed, ${escrow.length} escrow, ${blocked.length} blocked`);

    batch.forEach(b => {
      const e = b.action === 'allow' ? '✅' :
                b.action === 'require_escrow' ? '🔒' : '❌';
      console.log(`  ${e} ${b.wallet.slice(0, 8)}... : ${b.action}`);
    });
  }

  // 4. Deploy as HTTP endpoint
  console.log('\n--- HTTP Response (deploy as API) ---');
  const httpResp = oracle.toJsonResponse(verdict);
  console.log(`Status: ${httpResp.status}`);
  console.log(`Body:`, JSON.stringify(httpResp.body, null, 2));
  if (httpResp.headers) {
    console.log(`Headers:`, httpResp.headers);
  }
}

main().catch(console.error);
