/**
 * Example 03 — Risk Assessment
 *
 * Get a comprehensive risk assessment with recommended transaction parameters.
 * Use this to decide HOW to interact with an agent (escrow %, max value, etc.)
 *
 * Run: npx tsx examples/03-risk-assessment.ts
 */

import { SAIDClient } from '@said-protocol/client';

async function main() {
  const client = new SAIDClient();

  const wallet = process.argv[2] || 'EK3mP45iwgDEEts2cEDfhAs2i4PrH63NMG7vHg2d6fas';

  const risk = await client.getRiskAssessment(wallet);

  console.log(`Risk Assessment for ${wallet}\n`);
  console.log(`Tier:     ${risk.tier.toUpperCase()}`);
  console.log(`Score:    ${risk.score ?? 'N/A'}/100`);
  console.log(`Verified: ${risk.verified ? 'Yes' : 'No'}`);
  console.log(`Staked:   ${risk.stakeSOL.toFixed(4)} SOL`);

  console.log(`\nRecommendations:`);
  console.log(`  Max TX Value:  ${risk.recommendedMaxValueUSDC === null ? 'No limit' : `$${risk.recommendedMaxValueUSDC}`}`);
  console.log(`  Escrow:        ${risk.recommendedEscrowPct}%`);

  if (risk.positiveSignals.length > 0) {
    console.log(`\n✅ Positive Signals:`);
    risk.positiveSignals.forEach(s => console.log(`  - ${s}`));
  }

  if (risk.riskFactors.length > 0) {
    console.log(`\n⚠️  Risk Factors:`);
    risk.riskFactors.forEach(s => console.log(`  - ${s}`));
  }

  console.log(`\nSummary: ${risk.summary}`);
}

main().catch(console.error);
