/**
 * Example 07 — Reputation Passport (Cross-Protocol Trust)
 *
 * SAID's flagship product: a portable trust credential that works
 * across MCP, A2A, x402, and AP2 protocols.
 *
 * The passport combines identity, trust score, enforcement data,
 * and economic backing into a single signed credential.
 *
 * Run: npx tsx examples/07-reputation-passport.ts
 */

import {
  SAIDClient,
  buildPassport,
  toMCPMeta,
  toA2ACard,
  toX402Headers,
  toAP2Mandate,
  passportToJSON,
  passportFromJSON,
  isPassportValid,
  type TrustAttestation,
} from '../src/index.js';

async function main() {
  const client = new SAIDClient();

  const wallet = process.argv[2] || 'EkHj6W2fqKkYm8y6mP3oNpQr1sTuVwXyZ1aBcDeFgHi';

  console.log('=== SAID Reputation Passport ===\n');

  // 1. Build a passport for an agent
  console.log(`Building passport for: ${wallet}`);
  const passport = await client.getReputationPassport(wallet);

  console.log(`\n📋 Passport:`);
  console.log(`   Version: ${passport.version}`);
  console.log(`   Wallet: ${passport.wallet}`);
  console.log(`   Name: ${passport.name ?? 'Unknown'}`);
  console.log(`   Verified: ${passport.verified}`);
  console.log(`   Score: ${passport.trustScore ?? 'N/A'}/100`);
  console.log(`   Stake: ${passport.stakeSOL.toFixed(2)} SOL`);
  console.log(`   Slashes: ${passport.slashedCount}`);
  console.log(`   Verdict: ${passport.verdict}`);
  console.log(`   Risk Level: ${passport.riskLevel}`);
  console.log(`   Issued: ${passport.issuedAt}`);
  console.log(`   Expires: ${passport.expiresAt}`);

  // 2. Check if valid
  console.log(`\n✅ Valid: ${isPassportValid(passport)}`);

  // 3. Export to different protocol formats

  // MCP _meta field
  console.log('\n--- MCP Format (_meta) ---');
  const mcpMeta = toMCPMeta(passport);
  console.log(JSON.stringify(mcpMeta, null, 2));

  // A2A Agent Card extension
  console.log('\n--- A2A Agent Card Extension ---');
  const a2aCard = toA2ACard(passport);
  console.log(JSON.stringify(a2aCard, null, 2));

  // x402 trust headers
  console.log('\n--- x402 Trust Headers ---');
  const x402Headers = toX402Headers(passport);
  console.log(x402Headers);

  // AP2 mandate extension
  console.log('\n--- AP2 Mandate Extension ---');
  const ap2Mandate = toAP2Mandate(passport);
  console.log(JSON.stringify(ap2Mandate, null, 2));

  // 4. Serialize/deserialize
  console.log('\n--- Round-trip serialization ---');
  const json = passportToJSON(passport);
  console.log(`JSON size: ${json.length} bytes`);

  const restored = passportFromJSON(json);
  console.log(`Restored valid: ${restored ? isPassportValid(restored) : false}`);

  // 5. With attestations (third-party trust signals)
  console.log('\n--- With Attestations ---');
  const attestations: TrustAttestation[] = [
    {
      source: 'clawpump',
      score: 85,
      weight: 1.0,
      timestamp: new Date().toISOString(),
      comment: 'Verified trading agent with clean history',
    },
    {
      source: 'agentery',
      score: 78,
      weight: 0.8,
      timestamp: new Date().toISOString(),
      comment: 'Reliable API provider',
    },
  ];

  const passportWithAttestations = await client.getReputationPassport(wallet, {
    attestations,
  });

  console.log(`Attestations: ${passportWithAttestations.attestations.length}`);
  console.log(`Attestation score: ${passportWithAttestations.attestations.length > 0 ? 'Available' : 'None'}`);
}

main().catch(console.error);
