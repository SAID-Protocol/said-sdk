/**
 * Example 03 — Risk Assessment & Credit Score
 *
 * Get a comprehensive risk profile including:
 * - Risk tier with recommended transaction parameters
 * - SACRS credit score (300-850, FICO-compatible)
 * - Dual-score (provider trust vs consumer trust)
 *
 * Run: npx tsx examples/03-risk-assessment.ts
 */

import { SAIDClient } from '../src/index.js';

const client = new SAIDClient();

async function main() {
  const wallet = process.argv[2] || 'EkHj6W2fqKkYm8y6mP3oNpQr1sTuVwXyZ1aBcDeFgHi';

  console.log(`=== SAID Risk & Credit Assessment ===`);
  console.log(`Wallet: ${wallet}\n`);

  // 1. Risk Assessment
  console.log('📊 Risk Assessment');
  console.log('─'.repeat(40));
  const risk = await client.getRiskAssessment(wallet);
  console.log(`Tier: ${risk.tier.toUpperCase()}`);
  console.log(`Score: ${risk.score ?? 'N/A'}/100`);
  console.log(`Stake: ${risk.stakeSOL.toFixed(2)} SOL`);

  if (risk.recommendedMaxValueUSDC !== null) {
    console.log(`Max TX: $${risk.recommendedMaxValueUSDC.toLocaleString()} USDC`);
  } else {
    console.log(`Max TX: No limit`);
  }

  console.log(`Escrow: ${risk.recommendedEscrowPct}%`);
  if (risk.recommendedEscrowTimeoutSec) {
    const hours = risk.recommendedEscrowTimeoutSec / 3600;
    console.log(`Escrow timeout: ${hours}h`);
  }

  // 2. SACRS Credit Score
  console.log('\n💰 SACRS Credit Score');
  console.log('─'.repeat(40));
  const credit = await client.getCreditScore(wallet);
  console.log(`Score: ${credit.score}/850 (${credit.rating})`);
  console.log(`PD: ${(credit.probabilityOfDefault * 100).toFixed(1)}%`);
  console.log(`Recommended LTV: ${credit.recommendedLTV}%`);
  console.log(`Max Borrow: $${credit.recommendedMaxBorrowUSDC.toLocaleString()} USDC`);
  console.log(`Rate Premium: +${credit.recommendedRatePremiumBps} bps`);

  if (credit.flags.length > 0) {
    console.log(`Flags: ${credit.flags.join(', ')}`);
  }

  // Factor breakdown
  console.log('\n   Factors:');
  console.log(`   Payment History: ${credit.factors.paymentHistory}/100`);
  console.log(`   Utilization:    ${credit.factors.utilization}/100`);
  console.log(`   History Length: ${credit.factors.historyLength}/100`);
  console.log(`   Credit Mix:     ${credit.factors.creditMix}/100`);
  console.log(`   New Credit:     ${credit.factors.newCredit}/100`);
  console.log(`   Econ Security:  ${credit.factors.economicSecurity}/100`);

  // 3. Dual Score
  console.log('\n🔀 Dual Score (Provider vs Consumer)');
  console.log('─'.repeat(40));
  const dual = await client.getDualScore(wallet);
  console.log(`Provider: ${dual.provider.score}/100 (${dual.provider.confidence} confidence)`);
  console.log(`Consumer: ${dual.consumer.score}/100 (${dual.consumer.confidence} confidence)`);
  console.log(`Overall:  ${dual.overall}/100`);

  if (dual.provider.signals.length > 0) {
    console.log(`\n   Provider signals:`);
    dual.provider.signals.forEach(s => console.log(`   • ${s}`));
  }

  if (dual.consumer.signals.length > 0) {
    console.log(`\n   Consumer signals:`);
    dual.consumer.signals.forEach(s => console.log(`   • ${s}`));
  }

  // 4. Full Trust Summary (one call)
  console.log('\n📋 Full Trust Summary');
  console.log('─'.repeat(40));
  const summary = await client.getTrustSummary(wallet);
  console.log(`Registered: ${summary.registered}`);
  console.log(`Verified: ${summary.verified}`);
  console.log(`Risk Tier: ${summary.risk.tier}`);
  console.log(`Credit: ${summary.credit.score}/850`);
  console.log(`Dual Overall: ${summary.dual.overall}/100`);
}

main().catch(console.error);
