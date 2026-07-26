/**
 * Example 01 — Verify an Agent
 *
 * The most common SAID SDK operation: check if a wallet is a registered,
 * verified SAID agent and get its trust score.
 *
 * Run: npx tsx examples/01-verify-agent.ts
 */

import { SAIDClient } from '@said-protocol/client';

async function main() {
  const client = new SAIDClient();

  // Check any Solana wallet
  const wallet = process.argv[2] || 'EK3mP45iwgDEEts2cEDfhAs2i4PrH63NMG7vHg2d6fas';

  console.log(`Checking agent: ${wallet}\n`);

  const agent = await client.getAgent(wallet);

  if (!agent.registered) {
    console.log('❌ Not registered with SAID Protocol');
    console.log(`   Error: ${agent.error || 'Unknown'}\n`);
    return;
  }

  console.log(`Name: ${agent.identity?.name ?? 'Unknown'}`);
  console.log(`Verified: ${agent.verified ? '✅ Yes' : '❌ No'}`);

  if (agent.trustScore) {
    const ts = agent.trustScore;
    console.log(`\nTrust Score: ${ts.score}/100 (${ts.tier})`);
    console.log('  Dimensions:');
    console.log(`    Identity:  ${ts.identity}`);
    console.log(`    Activity:  ${ts.activity}`);
    console.log(`    Economic:  ${ts.economic}`);
    console.log(`    Ecosystem: ${ts.ecosystem}`);
    console.log(`    Longevity: ${ts.longevity}`);
    console.log(`    FairScale: ${ts.fairscale}`);

    if (ts.badges.length > 0) {
      console.log(`\n  Badges: ${ts.badges.join(', ')}`);
    }
  }

  if (agent.reputation) {
    console.log(`\nReputation: ${agent.reputation.score} (${agent.reputation.feedbackCount} reviews)`);
  }

  console.log('');
}

main().catch(console.error);
