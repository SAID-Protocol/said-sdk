/**
 * Example 01 — Verify an Agent
 *
 * The most basic SAID operation: check if a Solana wallet belongs to
 * a verified SAID agent and get its trust score.
 *
 * Run: npx tsx examples/01-verify-agent.ts
 */

import { SAIDClient } from '../src/index.js';

const client = new SAIDClient();

// Replace with a real wallet address
const wallet = process.argv[2] || 'EkHj6W2fqKkYm8y6mP3oNpQr1sTuVwXyZ1aBcDeFgHi';

async function main() {
  console.log(`Checking agent: ${wallet}\n`);

  // 1. Get full agent profile
  const agent = await client.getAgent(wallet);

  if (!agent.registered) {
    console.log('❌ Not registered with SAID Protocol');
    console.log(`   Error: ${agent.error ?? 'Unknown wallet'}`);
    process.exit(0);
  }

  console.log(`Status: ${agent.verified ? '✅ Verified' : '⚠️  Registered (unverified)'}`);
  console.log(`Name: ${agent.identity?.name ?? 'Unknown'}`);

  if (agent.identity?.description) {
    console.log(`Description: ${agent.identity.description}`);
  }

  if (agent.identity?.twitter) {
    console.log(`Twitter: @${agent.identity.twitter}`);
  }

  // 2. Trust score breakdown
  if (agent.trustScore) {
    console.log(`\n📊 Trust Score: ${agent.trustScore.score}/100 (${agent.trustScore.tier})`);
    console.log(`   Identity:    ${agent.trustScore.identity}/100`);
    console.log(`   Activity:    ${agent.trustScore.activity}/100`);
    console.log(`   Economic:    ${agent.trustScore.economic}/100`);
    console.log(`   Ecosystem:   ${agent.trustScore.ecosystem}/100`);
    console.log(`   Longevity:   ${agent.trustScore.longevity}/100`);
    console.log(`   Fair Scale:  ${agent.trustScore.fairscale}/100`);

    if (agent.trustScore.badges.length > 0) {
      console.log(`   Badges: ${agent.trustScore.badges.join(', ')}`);
    }
  }

  // 3. Reputation info
  if (agent.reputation) {
    console.log(`\n💬 Reputation: ${agent.reputation.score.toFixed(1)} (${agent.reputation.feedbackCount} reviews)`);
  }

  console.log('');
}

main().catch(console.error);
