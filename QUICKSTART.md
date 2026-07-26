# SAID Protocol SDK — Quick Start

**5-minute guide to agent trust on Solana**

## Install

```bash
npm install @said-protocol/client
```

## 1. Check if an agent is trustworthy (30 seconds)

```typescript
import { SAIDClient } from '@said-protocol/client';

const client = new SAIDClient();

const agent = await client.getAgent('WALLET_ADDRESS');

console.log(agent.verified);           // true/false
console.log(agent.trustScore?.score);  // 0-100
console.log(agent.trustScore?.tier);   // 'Gold', 'Silver', etc.
```

## 2. Get a risk assessment with escrow recommendations

```typescript
const risk = await client.getRiskAssessment('WALLET_ADDRESS');

// risk.tier: 'minimal' | 'low' | 'moderate' | 'elevated' | 'high' | 'unknown'
// risk.recommendedMaxValueUSDC: max safe transaction value
// risk.recommendedEscrowPct: 0-100 (what % to escrow)

if (risk.tier === 'high') {
  // Block transaction
} else if (risk.recommendedEscrowPct > 0) {
  // Use escrow
} else {
  // Safe to proceed directly
}
```

## 3. Gate your API by trust score

```typescript
import { SAIDClient, createTrustMiddleware, expressAdapter } from '@said-protocol/client';
import express from 'express';

const app = express();
const client = new SAIDClient();

// Only verified agents with score >= 50 can access
const mw = createTrustMiddleware(client, {
  mode: 'block',
  minScore: 50,
  requireVerified: true,
});

app.use('/api/premium', expressAdapter(mw));
app.get('/api/premium/data', (req, res) => {
  res.json({ hello: `Agent ${req.said.wallet}` });
});
```

## 4. Add SAID to your AI agent (MCP)

Add to your Claude Code / Cursor / Gemini MCP config:

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

Your AI agent can now query trust scores, verify agents, and assess risk — automatically.

## 5. Check an agent's credit score (SACRS)

```typescript
const credit = await client.getCreditScore('WALLET_ADDRESS');

console.log(credit.score);                    // 300-850 (FICO scale)
console.log(credit.rating);                   // 'excellent' | 'good' | 'fair' | 'poor'
console.log(credit.recommendedMaxBorrowUSDC); // borrowing capacity
console.log(credit.probabilityOfDefault);     // 0-1 (lower is better)
```

---

## Common Patterns

### Only interact with staked agents

```typescript
await client.requireTrust(wallet, {
  requireVerified: true,
  minStakeSOL: 1.0,  // Require 1+ SOL at risk
});
// Throws if agent doesn't meet criteria
```

### Batch verify multiple agents

```typescript
const results = await client.verifyMultiple([walletA, walletB, walletC]);
const trusted = results.filter(r => r.verified && (r.trustScore ?? 0) >= 50);
```

### Get everything in one call

```typescript
const summary = await client.getTrustSummary(wallet);
// summary.trustScore, summary.risk, summary.credit, summary.dual, summary.stake
```

### Pick the most trustworthy provider

```typescript
import { X402TrustFacilitator } from '@said-protocol/client/x402';

const facilitator = new X402TrustFacilitator(new SAIDClient());
const best = await facilitator.pickBestProvider(['WALLET_A', 'WALLET_B', 'WALLET_C']);
console.log(best?.payeeWallet); // highest-scoring trusted provider
```

---

## CLI

```bash
npx @said-protocol/client verify --wallet WALLET_ADDRESS
npx @said-protocol/client trust --wallet WALLET_ADDRESS
npx @said-protocol/client risk --wallet WALLET_ADDRESS
npx @said-protocol/client credit --wallet WALLET_ADDRESS
npx @said-protocol/client leaderboard --limit 10
npx @said-protocol/client stats
npx @said-protocol/client --mcp    # Start MCP server
```

## Examples

See the `examples/` directory for complete, runnable code:

| File | What it shows |
|------|---------------|
| `01-verify-agent.ts` | Basic agent verification + trust score |
| `02-trust-gate.ts` | Require minimum trust thresholds |
| `03-risk-assessment.ts` | Risk tiers + escrow recommendations |
| `04-mcp-server.json` | MCP server config for AI agents |
| `05-express-middleware.ts` | Trust-gated Express API |

## Next Steps

- [Full API Reference](./README.md)
- [npm package](https://www.npmjs.com/package/@said-protocol/client)
- [SAID Protocol](https://saidprotocol.com)

## Why SAID?

- **Staking + Slashing** — Only protocol with economic enforcement (agents have real SOL at risk)
- **6,700+ agents** — Largest agent registry on Solana
- **SACRS Credit Scores** — FICO-compatible 300-850 scores using staking/slashing data
- **16+ integrations** — ClawPump, Daemon, Xona Orbit, Hyre, IDLE
