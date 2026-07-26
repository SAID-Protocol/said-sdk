/**
 * Example 02 — Trust Gate
 *
 * Only allow interactions with agents that meet minimum trust criteria.
 * This is the building block for marketplaces, escrow, any trust-gated product.
 *
 * Run: npx tsx examples/02-trust-gate.ts
 */

import { SAIDClient, SAIDError } from '@said-protocol/client';

async function main() {
  const client = new SAIDClient();

  const wallet = process.argv[2] || 'EK3mP45iwgDEEts2cEDfhAs2i4PrH63NMG7vHg2d6fas';

  try {
    // Require: verified, score >= 50, at least 0.5 SOL staked
    await client.requireTrust(wallet, {
      requireVerified: true,
      minScore: 50,
      minStakeSOL: 0.5,
    });

    console.log(`✅ ${wallet} passed trust gate — safe to interact`);
  } catch (e) {
    if (e instanceof SAIDError) {
      console.log(`❌ ${wallet} failed trust gate:`);
      console.log(`   ${e.message}`);
    } else {
      throw e;
    }
  }
}

main().catch(console.error);
