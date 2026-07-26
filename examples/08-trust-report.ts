/**
 * Example 08 — Trust Report (Markdown)
 *
 * Generate a human-readable trust report for compliance reviews,
 * partner integrations, or dashboards.
 *
 * Run: npx tsx examples/08-trust-report.ts
 */

import { SAIDClient } from '../src/index.js';

async function main() {
  const client = new SAIDClient();

  const wallet = process.argv[2] || 'EkHj6W2fqKkYm8y6mP3oNpQr1sTuVwXyZ1aBcDeFgHi';

  console.log('Generating trust report...\n');

  const report = await client.createTrustReport(wallet);

  console.log('─'.repeat(60));
  console.log(report.markdown);
  console.log('─'.repeat(60));

  console.log(`\n📋 Recommendation: ${report.recommendation.toUpperCase()}`);
  console.log(`Generated: ${report.generatedAt}`);
}

main().catch(console.error);
