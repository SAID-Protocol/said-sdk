# SAID Protocol SDK — Quick Start

**5-minute guide to agent trust on Solana**

## What is SAID?

SAID Protocol is the largest agent trust infrastructure on Solana with 6,700+ registered agents, on-chain staking/slashing enforcement, and 16+ ecosystem integrations.

This SDK lets you:
- ✅ Verify agent identity and check trust scores
- 🛡️ Gate APIs by trust level (middleware)
- 💰 Get FICO-compatible credit scores (SACRS)
- 🔒 Enforce trust in x402 payment flows
- 📜 Issue portable reputation passports
- 🤖 Expose trust data to AI agents via MCP

## Install

```bash
npm install @said-protocol/client
```

For automatic x402 payments (optional):
```bash
npm install @said-protocol/client @solana/kit
```

## 1. Check if an Agent is Trustworthy (30 seconds)

```typescript
import { SAIDClient } from '@said-protocol/client';

const client = new SAIDClient();

const agent = await client.getAgent('WALLET_ADDRESS');

console.log(agent.verified);           // true/false
console.log(agent.trustScore?.score);  // 0-100
console.log(agent.trustScore?.tier);   // 'Gold', 'Silver', etc.
```

## 2. Gate Your API by Trust Score

```typescript
import express from 'express';
import { SAIDClient, createTrustMiddleware, expressAdapter } from '@said-protocol/client';

const app = express();
const client = new SAIDClient();

const gate = createTrustMiddleware(client, {
  mode: 'block',
  minScore: 50,
  requireVerified: true,
});

app.use('/api/premium', expressAdapter(gate));
```

## 3. Get Risk Assessment with Escrow Recommendations

```typescript
const risk = await client.getRiskAssessment('WALLET_ADDRESS');

if (risk.tier === 'high') {
  // Block transaction
} else if (risk.recommendedEscrowPct > 0) {
  // Use escrow: risk.recommendedEscrowPct% of funds
  // Timeout: risk.recommendedEscrowTimeoutSec
} else {
  // Safe to proceed directly
}
```

## 4. Check Credit Score (SACRS)

SAID's unique advantage — staking/slashing data produces credit scores no competitor can match.

```typescript
const credit = await client.getCreditScore('WALLET_ADDRESS');

console.log(credit.score);        // 300-850 (FICO scale)
console.log(credit.rating);       // 'excellent' | 'good' | 'fair' | etc.
console.log(credit.recommendedLTV);  // Max loan-to-value ratio
console.log(credit.flags);        // ['previously_slashed', 'no_stake', etc.]
```

## 5. Enforce Trust in x402 Payments

```typescript
import { createX402Oracle } from '@said-protocol/client';

const oracle = createX402Oracle(client);

// Check before payment proceeds
const verdict = await oracle.enforce('PAYER_WALLET');

if (verdict.action === 'allow') {
  // Proceed with payment
} else if (verdict.action === 'require_escrow') {
  // Lock funds in escrow first
} else {
  // Block payment
}
```

## 6. Generate a Reputation Passport

Portable trust credential for MCP, A2A, x402, and AP2 protocols.

```typescript
const passport = await client.getReputationPassport('WALLET_ADDRESS');

// Use in MCP _meta field
const mcpMeta = toMCPMeta(passport);

// Use in A2A Agent Card
const a2aExtension = toA2ACard(passport);

// Use in x402 headers
const headers = toX402Headers(passport);
```

## 7. Add SAID to Claude Code / Cursor (MCP)

Add to your MCP config:

```json
{
  "mcpServers": {
    "said": {
      "command": "npx",
      "args": ["-y", "@said-protocol/client", "--mcp"]
    }
  }
}
```

Now Claude/Cursor can verify agents, check trust scores, assess risk, and more — directly from the chat.

## Policy Presets

```typescript
import { POLICIES } from '@said-protocol/client';

// Strict: Score 70+, verified, 0.5+ SOL staked
POLICIES.strict

// Balanced: Score 50+, verified
POLICIES.balanced

// Permissive: Any registered agent
POLICIES.permissive

// x402 payments: Score 40+
POLICIES.x402

// DeFi: Score 60+, verified, 1+ SOL staked
POLICIES.defi
```

## Dual-Score Model

```typescript
const dual = await client.getDualScore('WALLET_ADDRESS');

// Provider trust: 'Will this agent DELIVER quality work?'
console.log(dual.provider.score);  // 0-100

// Consumer trust: 'Will this agent PAY reliably?'
console.log(dual.consumer.score);  // 0-100
```

## Batch Operations

```typescript
// Verify multiple agents at once
const results = await client.verifyMultiple([
  'WALLET_A', 'WALLET_B', 'WALLET_C',
]);

// Filter to only trusted ones
const trusted = await client.filterTrusted(wallets, {
  minScore: 50,
  requireVerified: true,
});

// Batch credit scoring
const scores = await client.getCreditScores(wallets);
```

## Signed Receipts (Non-Repudiable)

```typescript
const client = new SAIDClient({ keypairBytes: yourKeypair });

const assessment = await client.assess(wallet, POLICIES.strict);
const receipt = await client.signReceipt(assessment);

// receipt.signature = Ed25519 signature (base58)
// Counterparty can verify: client.verifyReceipt(receipt, expectedSigner)
```

## Full Examples

| File | What it shows |
|------|---------------|
| `01-verify-agent.ts` | Basic agent verification and trust score |
| `02-trust-gate.ts` | Policy-based allow/deny/review decisions |
| `03-risk-assessment.ts` | Risk tier, SACRS credit score, dual-score |
| `04-mcp-server.ts` | MCP server setup for Claude Code / Cursor |
| `05-express-middleware.ts` | Protect Express API endpoints |
| `06-enforcement-oracle.ts` | x402 payment trust enforcement |
| `07-reputation-passport.ts` | Cross-protocol trust credential |
| `08-trust-report.ts` | Generate markdown trust reports |

Run any example:
```bash
npx tsx examples/01-verify-agent.ts WALLET_ADDRESS
```

## CommonJS (Node.js)

```javascript
const { SAIDClient } = require('@said-protocol/client');

const client = new SAIDClient();
const agent = await client.getAgent('WALLET_ADDRESS');
```

## Links

- [npm](https://www.npmjs.com/package/@said-protocol/client)
- [GitHub](https://github.com/SAID-Protocol/said-sdk)
- [SAID Protocol](https://saidprotocol.com)
- [API Docs](https://api.saidprotocol.com)
- [Twitter](https://twitter.com/saidinfra)
