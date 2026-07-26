/**
 * Example 02 — Trust Gate
 *
 * Use SAID's policy engine to allow/deny/review agents before
 * letting them interact with your application.
 *
 * Run: npx tsx examples/02-trust-gate.ts
 */

import { SAIDClient, POLICIES, type TrustPolicy } from '../src/index.js';

const client = new SAIDClient();

// Use a built-in policy preset, or define your own
const policy: TrustPolicy = {
  minScore: 50,
  requireVerified: true,
  maxRiskTier: 'moderate',
  // minStakeSOL: 0.5,      // Require skin in the game
  // allowlist: ['...'],     // Always-allow these wallets
  // blocklist: ['...'],     // Always-deny these wallets
};

async function checkWallet(wallet: string) {
  console.log(`\nChecking: ${wallet}`);

  const result = await client.assess(wallet, policy);

  const emoji = result.decision === 'allow' ? '✅' :
                result.decision === 'review' ? '⚠️ ' : '❌';

  console.log(`${emoji} Decision: ${result.decision.toUpperCase()}`);
  console.log(`   Reason: ${result.reason}`);
  console.log(`   Risk: ${result.risk.tier} (score: ${result.risk.score ?? 'N/A'})`);
  console.log(`   Stake: ${result.risk.stakeSOL.toFixed(2)} SOL`);

  if (result.risk.riskFactors.length > 0) {
    console.log(`   ⚠️  Risk factors: ${result.risk.riskFactors.join(', ')}`);
  }

  if (result.risk.positiveSignals.length > 0) {
    console.log(`   ✅ Positive: ${result.risk.positiveSignals.join(', ')}`);
  }

  return result;
}

async function main() {
  console.log('=== SAID Trust Gate ===');
  console.log(`Policy: minScore=${policy.minScore}, requireVerified=${policy.requireVerified}`);

  // Check multiple wallets
  const wallets = process.argv.slice(2).length > 0
    ? process.argv.slice(2)
    : [
        'EkHj6W2fqKkYm8y6mP3oNpQr1sTuVwXyZ1aBcDeFgHi',  // Replace with real wallets
      ];

  for (const wallet of wallets) {
    await checkWallet(wallet);
  }

  // Show available policy presets
  console.log('\n=== Available Policy Presets ===');
  console.log('  strict:     Score 70+, verified, 0.5+ SOL staked');
  console.log('  balanced:   Score 50+, verified');
  console.log('  permissive: Any registered agent');
  console.log('  x402:       Score 40+, for payment flows');
  console.log('  defi:       Score 60+, verified, 1+ SOL staked');
  console.log('\nUsage: POLICIES.strict, POLICIES.balanced, etc.');
}

main().catch(console.error);
