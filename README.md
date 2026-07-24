# @said-protocol/client

Official SDK for [SAID Protocol](https://saidprotocol.com) — agent identity, trust scoring, and cross-chain messaging on Solana.

> **v0.15.0** — x402 Payment Trust Facilitator: intercept 402 responses, check SAID trust before payment settles, two-sided trust enforcement, provider selection. 317 tests passing.

## What is SAID?

SAID Protocol is the largest agent trust infrastructure on Solana with 6,600+ registered agents, staking/slashing enforcement, and 16+ ecosystem integrations. This SDK lets you build trust-aware applications that query agent reputation, verify identity, and send cross-chain messages.

## Install

```bash
npm install @said-protocol/client
```

For automatic x402 payments (optional):
```bash
npm install @said-protocol/client @solana/kit
```

## Quick Start

### ESM / TypeScript

```typescript
import { SAIDClient } from '@said-protocol/client';
```

### CommonJS (Node.js)

```javascript
const { SAIDClient } = require('@said-protocol/client');
```

### Check an Agent's Trust Score

```typescript
import { SAIDClient } from '@said-protocol/client';

const client = new SAIDClient();

// Get full trust breakdown
const score = await client.getTrustScore('AGENT_WALLET');
if (score) {
  console.log(`Score: ${score.score}/100 (${score.tier})`);
  console.log(`Identity: ${score.identity}, Activity: ${score.activity}`);
  console.log(`Badges: ${score.badges.join(', ')}`);
}

// Quick verification check
const isTrusted = await client.isVerified('AGENT_WALLET');
console.log(isTrusted ? '✅ Verified' : '❌ Unverified');
```

### Get Agent Feedback

```typescript
const feedback = await client.getFeedback('AGENT_WALLET');
feedback.forEach(f => {
  console.log(`${f.score}/100 - ${f.comment}`);
});
```

### View Leaderboard

```typescript
const topAgents = await client.getLeaderboard();
topAgents.slice(0, 5).forEach(agent => {
  console.log(`#${agent.rank} ${agent.name}: ${agent.reputationScore.toFixed(1)}`);
});
```

### Full Agent Profile

```typescript
const agent = await client.getAgent('WALLET_ADDRESS');

if (agent.verified) {
  console.log(`${agent.identity?.name} is verified`);
  console.log(`Reputation: ${agent.reputation?.score.toFixed(1)}`);
  console.log(`Trust tier: ${agent.trustScore?.tier}`);
  console.log(`Feedback count: ${agent.reputation?.feedbackCount}`);
}
```

### Send Cross-Chain Messages

```typescript
import { readFileSync } from 'fs';

// Free tier — no keypair needed (10 messages/day)
const client = new SAIDClient();

await client.sendMessage({
  from: { address: 'YOUR_AGENT', chain: 'solana' },
  to: { address: 'RECIPIENT', chain: 'base' },
  message: 'Hello from Solana!',
});

// With auto-payment after free tier
const keypair = new Uint8Array(JSON.parse(readFileSync('./keypair.json', 'utf8')));
const paidClient = new SAIDClient({ keypairBytes: keypair });
```

## ERC-8004 Agent Cards

Fetch standardized agent identity cards for cross-protocol interoperability:

```typescript
const card = await client.getAgentCard('WALLET_ADDRESS');

if (card) {
  console.log(card.name);
  console.log(card.description);
  console.log(card.capabilities);
  console.log(card.endpoints?.mcp); // MCP endpoint if available
}
```

## Trust-Gated Interactions

The SDK provides helpers for building trust-powered products — marketplaces, escrow, any interaction where trust matters.

### Basic Trust Gate

```typescript
// Only interact with verified agents scoring 50+
await client.requireTrust(wallet, {
  requireVerified: true,
  minScore: 50,
});
// Proceed with interaction...
```

### Stake-Gated Interactions

```typescript
// Require agents to have 1+ SOL staked (skin in the game)
await client.requireTrust(wallet, {
  requireVerified: true,
  minStakeSOL: 1.0,
});
```

### Batch Trust Check

```typescript
// Filter a list of agents by trustworthiness
const candidates = ['WALLET_A', 'WALLET_B', 'WALLET_C'];
const results = await client.verifyMultiple(candidates);
const trusted = results.filter(r => r.verified && (r.trustScore ?? 0) >= 50);
```

### Query Stake Info

```typescript
const stake = await client.getStakeInfo('WALLET_ADDRESS');
if (stake.status === 'active' && stake.amountSOL >= 1.0) {
  console.log(`Agent has ${stake.amountSOL} SOL at risk`);
  console.log(`Slashed ${stake.slashedCount} times historically`);
}
```

## React Hooks

The SDK ships with optional React hooks. No bundle bloat if you're not using React — hooks are lazy-loaded.

```tsx
'use client';
import { SAIDClient, createSAIDHooks } from '@said-protocol/client';

// createSAIDHooks is now async (returns Promise<SAIDHooks>)
// because React is lazy-loaded for tree-shaking
const saidHooks = await createSAIDHooks(new SAIDClient());

// Or use top-level in an async module:
// const saidHooks = createSAIDHooks(client).then(hooks => { ... });

// Agent card component
function AgentCard({ wallet }: { wallet: string }) {
  const { data: agent, loading, error } = saidHooks.useAgent(wallet);

  if (loading) return <div>Loading...</div>;
  if (!agent?.verified) return <div>⚠️ Unverified</div>;

  return (
    <div>
      <h3>{agent.identity?.name}</h3>
      <p>Score: {agent.trustScore?.score}/100 ({agent.trustScore?.tier})</p>
      <p>Feedback: {agent.reputation?.feedbackCount} reviews</p>
    </div>
  );
}

// Leaderboard component
function Leaderboard() {
  const { data: entries, loading } = saidHooks.useLeaderboard();
  if (loading) return <p>Loading...</p>;

  return (
    <ul>
      {entries?.slice(0, 10).map(a => (
        <li key={a.wallet}>#{a.rank} {a.name}: {a.reputationScore.toFixed(1)}</li>
      ))}
    </ul>
  );
}
```

### Available Hooks

| Hook | Returns | Description |
|------|---------|-------------|
| `useAgent(wallet)` | `{ data, loading, error }` | Full agent profile |
| `useTrustScore(wallet)` | `{ data, loading, error }` | Trust score breakdown |
| `useLeaderboard()` | `{ data, loading, error }` | Top agents by reputation |
| `useProtocolStats()` | `{ data, loading, error }` | Protocol-wide statistics |
| `useIsVerified(wallet)` | `{ data, loading }` | Boolean verification check |

## Trust Middleware

Gate HTTP endpoints, x402 payment flows, and API routes based on SAID trust scores. Three modes for different trust enforcement strategies.

### Install

```bash
npm install @said-protocol/client
```

### Block Mode — Hard Reject Untrusted Agents

```typescript
import { SAIDClient, createTrustMiddleware } from '@said-protocol/client';

const client = new SAIDClient();
const mw = createTrustMiddleware(client, {
  mode: 'block',
  minScore: 50,
  requireVerified: true,
});

// In any Fetch-compatible handler:
const result = await mw(request);
if (result.denied) {
  return new Response(JSON.stringify({ error: result.reason }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  });
}
// Proceed — result.wallet, result.trustScore available
```

### Flag Mode — Pass Through with Headers

```typescript
const mw = createTrustMiddleware(client, { mode: 'flag', minScore: 40 });

const result = await mw(request);
// Request continues regardless, but trust headers are attached:
// x-said-score: 72
// x-said-tier: Gold
// x-said-verified: true
```

### Escalate Mode — Require Stake

```typescript
const mw = createTrustMiddleware(client, {
  mode: 'escalate',
  minScore: 30,
  minStakeSOL: 1.0,
});

const result = await mw(request);
if (result.denied) {
  // Agent must stake SOL to proceed
  return new Response('Insufficient stake', { status: 402 });
}
```

### Express Adapter

```typescript
import express from 'express';
import { SAIDClient, createTrustMiddleware, expressAdapter } from '@said-protocol/client';

const app = express();
const mw = createTrustMiddleware(new SAIDClient(), { minScore: 50 });

app.use('/api/trusted', expressAdapter(mw));
app.get('/api/trusted/data', (req, res) => {
  // req.said.wallet, req.said.trustScore available
  res.json({ message: `Hello ${req.said.wallet}` });
});
```

### Hono Adapter

```typescript
import { Hono } from 'hono';
import { SAIDClient, createTrustMiddleware, honoAdapter } from '@said-protocol/client';

const app = new Hono();
const mw = createTrustMiddleware(new SAIDClient(), { minScore: 50 });

app.use('/api/trusted/*', honoAdapter(mw));
app.get('/api/trusted/data', (c) => {
  const said = c.get('said');
  return c.json({ wallet: said.wallet });
});
```

### x402 Payment Trust Gate

The middleware works as a pre-settlement trust check for x402 payment flows:

```typescript
import { SAIDClient, createTrustMiddleware } from '@said-protocol/client';

const client = new SAIDClient({ keypairBytes: yourKeypair });
const trustCheck = createTrustMiddleware(client, {
  mode: 'block',
  minScore: 40,
  extractWallet: (req) => {
    // Extract from x402 payment header
    const auth = req.headers.get('x402-authorization');
    return auth ? JSON.parse(atob(auth)).payer : undefined;
  },
});

// Before settling any x402 payment:
const result = await trustCheck(paymentRequest);
if (result.denied) {
  return new Response(null, { status: 402, headers: { 'x-said-reason': result.reason! } });
}
// Settle payment...
```

## Risk Assessment

Get a comprehensive risk tier and transaction recommendations for any agent.

```typescript
const risk = await client.getRiskAssessment('WALLET_ADDRESS');

console.log(risk.tier);        // 'minimal' | 'low' | 'moderate' | 'elevated' | 'high' | 'unknown'
console.log(risk.score);       // 0-100 or null
console.log(risk.recommendedMaxValueUSDC);  // null = no limit, 0 = block
console.log(risk.recommendedEscrowPct);     // 0-100
console.log(risk.riskFactors);   // ['No stake deposited', 'Low score (15)']
console.log(risk.positiveSignals); // ['SAID-verified', '2.5 SOL staked']
```

### Risk Tiers

| Tier | Score | Max USDC | Escrow | Use Case |
|------|-------|----------|--------|----------|
| Minimal | 80+ + staked | No limit | None | Trusted partner |
| Low | 60-79 | 5,000 | None | Standard commerce |
| Moderate | 40-59 | 1,000 | 50% | Escrow recommended |
| Elevated | 20-39 | 100 | 100% | Full escrow required |
| High | 0-19 or unverified | 0 | 100% | Block recommended |
| Unknown | Not registered | 0 | 100% | Do not transact |

## Policy Assessment

Evaluate agents against a trust policy with structured `allow`/`deny`/`review` decisions.

```typescript
const result = await client.assess('WALLET_ADDRESS', {
  minScore: 50,
  requireVerified: true,
  minStakeSOL: 0.5,
  maxRiskTier: 'moderate',
  allowlist: ['KNOWN_SAFE_WALLET'],
  blocklist: ['KNOWN_BAD_WALLET'],
});

if (result.decision === 'allow') {
  // Proceed with transaction
} else if (result.decision === 'review') {
  // Send to manual review queue
} else {
  // Block
  console.log(result.reason);
}
```

### Decision Logic

- **`allow`** — All policy checks passed
- **`deny`** — Hard failure (unregistered, high risk, blocklisted, unknown)
- **`review`** — Moderate violations that a human should review (e.g., insufficient stake, low score)

## Signed Receipts

Create non-repudiable proof of trust checks with Ed25519 signatures.

```typescript
const client = new SAIDClient({ keypairBytes: yourKeypair });

// Assess and sign
const assessment = await client.assess(wallet, { minScore: 50 });
const receipt = await client.signReceipt(assessment);

// receipt.signature is Ed25519 signed
// Send receipt to counterparty as proof of trust check

// Verify a receipt from someone else
const isValid = await client.verifyReceipt(theirReceipt);
console.log(isValid ? '✅ Verified' : '❌ Invalid');
```

## SACRS Credit Score (v0.11.0)

**SACRS (SAID Agent Credit Rating Score)** — a FICO-compatible 300-850 credit score for AI agents.

No competitor has staking/slashing data to feed into a credit model. This is SAID's credit moat: a slashed agent = credit risk, a staked agent = lower risk.

### Get an Agent's Credit Score

```typescript
const credit = await client.getCreditScore('WALLET_ADDRESS');

console.log(`SACRS: ${credit.score}/850 (${credit.rating})`);
console.log(`Probability of default: ${(credit.probabilityOfDefault * 100).toFixed(2)}%`);
console.log(`Recommended LTV: ${credit.recommendedLTV}%`);
console.log(`Max borrow: ${credit.recommendedMaxBorrowUSDC} USDC`);
console.log(`Rate premium: +${credit.recommendedRatePremiumBps} bps`);

if (credit.flags.includes('previously_slashed')) {
  console.log('⚠️ Agent has been slashed — elevated risk');
}
```

### Factor Breakdown

SACRS adapts FICO's 5-factor model + SAID's economic security overlay:

| Factor | Weight | Source |
|---|---|---|
| Payment History | 35% | Slashing record + feedback scores |
| Utilization | 30% | Stake-to-activity ratio |
| Length of History | 15% | Registration age |
| Credit Mix | 10% | Interaction diversity |
| New Credit | 10% | Verification status |
| **Economic Security** | **SAID overlay (30% blend)** | **Staking amount + slashing history** |

### Rating Bands

| Score | Rating | LTV | Rate Premium |
|---|---|---|---|
| 750-850 | Excellent | 85% | Prime (0 bps) |
| 700-749 | Very Good | 75% | +50 bps |
| 640-699 | Good | 65% | +150 bps |
| 580-639 | Fair | 50% | +400 bps |
| 500-579 | Poor | 35% | +800 bps |
| 300-499 | Very Poor | 0% | +2000 bps |

### Batch Credit Scoring

```typescript
const scores = await client.getCreditScores([walletA, walletB, walletC]);
scores.forEach(s => console.log(`${s.wallet}: ${s.score} (${s.rating})`));
```

### CLI

```bash
said credit --wallet WALLET_ADDRESS
```

## Dual-Score Model (v0.12.0)

Separates **provider trust** ("will this agent deliver?") from **consumer trust** ("will this agent pay?").

Inspired by AgentKarma's Provider/Consumer Karma split — their best idea before they shut down. Enhanced with SAID's staking/slashing as economic enforcement signals.

```typescript
const dual = await client.getDualScore('WALLET_ADDRESS');

console.log(`Provider: ${dual.provider.score}/100 (${dual.provider.confidence})`);
console.log(`Consumer: ${dual.consumer.score}/100 (${dual.consumer.confidence})`);
console.log(`Overall:  ${dual.overall}/100`);

// Provider signals: SAID-verified, High reputation, 12 feedback entries
// Consumer signals: 2.5 SOL staked, No slashing history

// Use case: require upfront payment from agents with low consumer scores
if (dual.consumer.score < 30 && dual.consumer.confidence !== 'none') {
  requireUpfrontPayment();
}
```

### Why Dual Scoring?

A single trust score conflates two distinct questions:

| Question | What it measures | Key signals |
|----------|-----------------|-------------|
| **Provider** | Delivery quality | Feedback, reputation, verification, history |
| **Consumer** | Payment reliability | Staking, slashing, economic security |

An agent can be excellent at delivering work but unreliable at paying — or vice versa.

## Trust Summary (v0.12.0)

One-call comprehensive trust overview — combines all SAID signals:

```typescript
const summary = await client.getTrustSummary('WALLET_ADDRESS');

// Everything in one response:
console.log(summary.trustScore?.score);    // Trust score breakdown
console.log(summary.risk.tier);             // Risk assessment
console.log(summary.credit.score);          // SACRS credit score
console.log(summary.dual.overall);          // Dual-score
console.log(summary.stake?.amountSOL);      // Staking info
```

## Batch Stake Queries (v0.12.0)

```typescript
const stakes = await client.getStakeInfos([walletA, walletB, walletC]);
const staked = stakes.filter(s => s.amountSOL > 0);
```

## CLI

```bash
npx @said-protocol/client register --keypair ./key.json --name "My Agent"
npx @said-protocol/client verify --keypair ./key.json
npx @said-protocol/client trust --wallet WALLET_ADDRESS
npx @said-protocol/client feedback --wallet WALLET_ADDRESS --limit 5
npx @said-protocol/client leaderboard --limit 10
npx @said-protocol/client card --wallet WALLET_ADDRESS [--json]
npx @said-protocol/client risk --wallet WALLET_ADDRESS
npx @said-protocol/client assess --wallet WALLET_ADDRESS --min-score 50 --require-verified true
npx @said-protocol/client credit --wallet WALLET_ADDRESS
npx @said-protocol/client stats
```

### Staking Commands

```bash
said stake --keypair ./key.json --amount 0.1      # Stake SOL (min 0.1)
said add-stake --keypair ./key.json --amount 0.5   # Add to existing stake
said request-unstake --keypair ./key.json           # Start 7-day cooldown
said cancel-unstake --keypair ./key.json            # Cancel unstake
said complete-unstake --keypair ./key.json          # After cooldown
said emergency-unstake --keypair ./key.json         # Instant (10% penalty)
```

## API Reference

### Staking & Trust Enforcement

### Trust & Reputation

| Method | Description |
|--------|-------------|
| `getAgent(wallet)` | Full agent profile (identity, reputation, trust score, endpoints) |
| `getAgentCard(wallet)` | ERC-8004 compliant agent card JSON for cross-protocol interop |
| `getTrustScore(wallet)` | Multi-dimensional trust score breakdown |
| `isVerified(wallet)` | Quick boolean verification check |
| `getFeedback(wallet)` | Agent feedback/review history |
| `getLeaderboard()` | Top agents ranked by reputation |
| `getProtocolStats()` | Total/verified agent counts, avg reputation |
| `getPassport(wallet)` | Check soulbound passport NFT status |

### Staking & Enforcement

| Method | Description |
|--------|-------------|
| `getStakeInfo(wallet)` | On-chain stake amount, status, cooldown, slash history |
| `verifyMultiple(wallets[])` | Batch-check verification + trust scores |
| `requireTrust(wallet, opts)` | Trust gate — throws if agent doesn't meet thresholds |
| `filterTrusted(wallets[], opts)` | Filter wallet list by trust criteria (batch) |
| `getTrustTier(wallet)` | Quick tier label lookup (returns string or null) |
| `invalidateCache(wallet?)` | Clear response cache |

### Messaging

| Method | Description |
|--------|-------------|
| `sendMessage(params)` | Cross-chain message (free tier + auto x402) |
| `getInbox(chain, address)` | Fetch agent inbox |

### Discovery

| Method | Description |
|--------|-------------|
| `resolveAgent(address, chain?)` | Resolve agent across chains |
| `discover(query?)` | Search agents |
| `getChains()` | List supported chains |
| `getStats()` | Cross-chain statistics |
| `getFreeTier(address)` | Check free tier usage |

### Webhooks

| Method | Description |
|--------|-------------|
| `registerWebhook(params)` | Register push webhook |
| `getWebhook(chain, address)` | Check webhook status |
| `deleteWebhook(chain, address)` | Remove webhook |
| `verifyWebhookSignature(body, sig, secret)` | Verify webhook HMAC |

### Trust Middleware

| Method | Description |
|--------|-------------|
| `createTrustMiddleware(client, opts)` | Create trust-gating middleware (block/flag/escalate) |
| `expressAdapter(mw)` | Wrap trust middleware for Express |
| `honoAdapter(mw)` | Wrap trust middleware for Hono |

### Risk & Assessment (v0.10.0)

| Method | Description |
|--------|-------------|
| `getRiskAssessment(wallet)` | 6-tier risk model with transaction recommendations |
| `assess(wallet, policy)` | Policy-based allow/deny/review decision |
| `signReceipt(assessment)` | Ed25519 sign a trust assessment (requires keypair) |
| `verifyReceipt(receipt, signer?)` | Verify a signed receipt from a counterparty |

### Credit Score (v0.11.0)

| Method | Description |
|--------|-------------|
| `getCreditScore(wallet)` | SACRS 300-850 FICO-compatible credit score |
| `getCreditScores(wallets[])` | Batch credit scoring for multiple agents |
| `assessMultiple(wallets[], policy)` | Batch policy assessment |

### Dual-Score & Summary (v0.12.0)

| Method | Description |
|--------|-------------|
| `getDualScore(wallet)` | Provider/Consumer dual trust assessment |
| `getTrustSummary(wallet)` | One-call overview (score + risk + credit + dual + stake) |
| `getStakeInfos(wallets[])` | Batch stake info query |

## Trust Score Dimensions

SAID uses a multi-dimensional scoring system (0-100):

| Dimension | What it measures |
|-----------|-----------------|
| **Identity** | Verification status, staking level |
| **Activity** | Transaction frequency, recency |
| **Economic** | Volume, stake size |
| **Ecosystem** | Cross-chain presence, integrations |
| **Longevity** | Time since registration |
| **FairScale** | FairScale partnership metrics |

## Why SAID?

- **Enforcement, not just scoring** — Only protocol with on-chain staking/slashing
- **6,600+ agents** — Largest registry on Solana
- **16+ integrations** — ClawPump, Daemon, Xona Orbit, Hyre, IDLE, FairScale
- **Solana-native** — Built for the chain where agent payments happen

## Supported Chains

**Messaging:** Solana, Ethereum, Base, Polygon, Avalanche, Sei, BNB, Mantle, IoTeX, Peaq

**Payments (x402):** Solana, Base, Polygon, Avalanche, Sei

## ERC-8004 Agent Card Builder (v0.13.0)

The SDK now includes a full ERC-8004 agent card **generator** — previously you could only fetch cards. Generate spec-compliant JSON-LD cards from SAID registration data for cross-protocol interoperability with AstraSync, AgentKarma, Tiny.Place, and any ERC-8004 consumer.

```typescript
import { SAIDClient } from '@said-protocol/client';
import { buildAgentCard, validateAgentCard, serveAgentCard } from '@said-protocol/client/agent-card';

const client = new SAIDClient();

// Build a card from SAID data + your overrides
const card = await buildAgentCard(client, {
  wallet: 'AGENT_WALLET',
  description: 'Autonomous code reviewer for Solana programs',
  capabilities: [
    'code-review',
    { name: 'audit', description: 'Security audits', endpoint: 'https://audit.agent.com' },
  ],
  endpoints: {
    mcp: 'https://agent.com/mcp',
    a2a: 'https://agent.com/a2a',
  },
  includeStake: true, // Include SAID staking data (extra RPC call)
});

// Validate before publishing
const result = validateAgentCard(card);
if (!result.valid) console.error('Invalid:', result.errors);

// Serve from Cloudflare Workers / Deno / any Fetch runtime
// at /.well-known/agent.json
const response = serveAgentCard(card);
```

### Agent Card Functions

| Function | Description |
|----------|-------------|
| `buildAgentCard(client, options)` | Generate ERC-8004 card from SAID data |
| `validateAgentCard(card)` | Validate spec compliance (returns errors + warnings) |
| `serveAgentCard(card)` | Create a Fetch Response for `/.well-known/agent.json` |
| `tierToBadge(tier)` | Convert SAID tier to ERC-8004 badge string |
| `diffAgentCards(old, new)` | Find changed fields between two card versions |

## Policy Presets (v0.13.0)

Pre-configured trust policies for common use cases. Every major payment platform (Binance, Ledger, MetaMask) is building STATIC agent spend limits. SAID policies are DYNAMIC — they adapt based on on-chain reputation.

```typescript
import { SAIDClient, POLICY_X402, POLICY_DEFI, POLICIES } from '@said-protocol/client';

const client = new SAIDClient();

// Use a preset directly
const result = await client.assess('AGENT_WALLET', POLICY_X402);
if (result.decision === 'allow') {
  // Process payment
}

// Or select by name (great for API endpoints)
const policy = POLICIES[req.query.policy || 'balanced'];
const assessment = await client.assess(wallet, policy);
```

| Preset | minScore | requireVerified | minStakeSOL | maxRiskTier | Use case |
|--------|----------|-----------------|-------------|-------------|----------|
| `POLICY_STRICT` | 70 | ✅ | 0.5 SOL | low | High-value tx, enterprise |
| `POLICY_BALANCED` | 50 | ✅ | — | moderate | B2B marketplaces |
| `POLICY_PERMISSIVE` | — | — | — | elevated | Social, discovery |
| `POLICY_X402` | 40 | — | — | moderate | x402 payment flows |
| `POLICY_DEFI` | 60 | ✅ | 1.0 SOL | low | Lending, escrow |

## x402 Payment Trust Facilitator (v0.15.0)

The x402 facilitator is the critical bridge between SAID trust infrastructure and the x402 payment standard. It intercepts HTTP 402 (Payment Required) responses and checks trust BEFORE payment settles — protecting agents from paying untrusted endpoints, and protecting endpoints from serving untrusted agents.

### Import

```typescript
import { SAIDClient } from '@said-protocol/client';
import { X402TrustFacilitator } from '@said-protocol/client/x402';

const said = new SAIDClient();
const facilitator = new X402TrustFacilitator(said);
```

### Protect Agents from Untrusted Endpoints

Wrap `fetch` to automatically trust-check any 402 response before payment:

```typescript
const safeFetch = facilitator.wrapFetch(fetch);

// If endpoint returns 402, SAID checks the payee's trust score
// If untrusted → 402 converted to 403 (payment blocked)
// If trusted → 402 passes through, payment proceeds
const res = await safeFetch('https://api.example.com/paid-endpoint');

if (res.headers.get('x-said-blocked') === 'true') {
  console.log('Payment blocked — untrusted endpoint');
}
```

### Manual Payment Check

Check trust before processing a 402 response yourself:

```typescript
if (res.status === 402) {
  const trust = await facilitator.checkPayment(res, {
    payeeWallet: 'ENDPOINT_WALLET',
    paymentAmountUSDC: 5.0,
  });

  if (trust.deny) {
    console.log(`Blocked: ${trust.reason}`);
    // Don't pay
  } else if (trust.review) {
    console.log(`Caution: ${trust.reason}`);
    console.log(`Recommended escrow: ${trust.recommendedEscrowPct}%`);
  }
}
```

### Preflight Check

Check an endpoint's trustworthiness BEFORE making any request:

```typescript
const preflight = await facilitator.preflight('https://api.example.com', {
  payeeWallet: 'ENDPOINT_WALLET',
  paymentAmountUSDC: 5.0,
});

if (preflight.deny) {
  // Don't bother making the request
}
```

### Pick Best Provider

When multiple providers offer the same service, pick the most trustworthy:

```typescript
const best = await facilitator.pickBestProvider([
  'WALLET_A', 'WALLET_B', 'WALLET_C',
]);

if (best) {
  console.log(`Best: ${best.payeeWallet} (score: ${best.payeeRisk?.score})`);
}
```

### Parse Trust Headers

Parse SAID trust metadata from responses:

```typescript
import { parseTrustHeaders } from '@said-protocol/client/x402';

const trust = parseTrustHeaders(response.headers);
// { verdict: 'allow', payeeScore: 75, payeeTier: 'low', ... }
```

### Two-Sided Trust

The facilitator supports checking both sides of a payment:

- **Payee trust** (default): Is the endpoint I'm paying trustworthy?
- **Payer trust** (optional): Is the agent paying me trustworthy?

```typescript
const result = await facilitator.checkPayment(res, {
  payeeWallet: 'ENDPOINT_WALLET',
  payerWallet: 'AGENT_WALLET',
  paymentAmountUSDC: 10.0,
});

// result.checked === 'both'
```

## License

MIT

## Changelog

### v0.15.0
- **New:** `X402TrustFacilitator` — x402 payment trust enforcement module. Intercepts HTTP 402 responses and checks SAID trust BEFORE payment settles. Two-sided trust: protects agents from untrusted endpoints AND protects endpoints from untrusted agents.
- **New:** `wrapFetch(fetchFn)` — wrap any fetch function to automatically trust-check 402 responses.
- **New:** `checkPayment(response, options)` — manual trust check for a 402 payment challenge.
- **New:** `preflight(endpoint, options)` — check endpoint trustworthiness BEFORE making a request.
- **New:** `batchCheck(payments)` — batch trust check for multiple payment endpoints.
- **New:** `pickBestProvider(wallets)` — pick the highest-scoring trusted provider from a list.
- **New:** `parseTrustHeaders(headers)` — parse SAID trust metadata from response headers.
- **New:** `defaultPayeeExtractor(response)` — extract payee wallet from x402 payment headers.
- **New:** 57 tests for the x402 facilitator module (total: 317 tests).
- **New:** `x402` subpath export (`@said-protocol/client/x402`).

### v0.14.0
- **New:** ERC-8183 Agent Commerce Protocol (ACP) support — 670-line module with trust enforcement for agent-to-agent commerce. Check trust before ACP transactions (hire, deliver, evaluate), calculate escrow % and spend caps, validate lifecycle state transitions.
- **New:** Full ERC-8183 lifecycle state machine with valid transition validation.
- **New:** `ACPTrustChecker` class with `evaluateTransaction`, `canHire`, `checkEnforcementAvailable` methods.
- **New:** 62 ACP tests (total: 260 tests).

### v0.13.0
- **New:** `buildAgentCard(client, options)` — ERC-8004 compliant agent card generator. Pulls SAID registration data (name, verification, trust score, stake) and merges with developer-provided capabilities, endpoints, and metadata. Produces spec-compliant JSON-LD cards consumable by AstraSync, AgentKarma, Tiny.Place, and any ERC-8004 registry.
- **New:** `validateAgentCard(card)` — spec compliance validator with error/warning reporting. Checks required fields, valid @context/@type, URI format, capability structure, endpoint URLs.
- **New:** `serveAgentCard(card)` — generates a Fetch Response with correct `application/ld+json` content-type and CORS headers for serving at `/.well-known/agent.json`.
- **New:** `tierToBadge(tier)` — converts SAID trust tiers to ERC-8004 badge strings (e.g., 'Gold' → 'said:gold').
- **New:** `diffAgentCards(old, new)` — detects changed fields between card versions for smart re-publishing.
- **New:** Policy Presets — 5 pre-configured trust policies (`POLICY_STRICT`, `POLICY_BALANCED`, `POLICY_PERMISSIVE`, `POLICY_X402`, `POLICY_DEFI`) addressable via `POLICIES` map. Based on research showing every major payment platform needs agent spend limits.
- **New:** `./agent-card` subpath export for importing card builder independently.
- **Improved:** 198 tests passing (161 ESM + 37 new card/policy tests), all green.
- **Docs:** New README sections for Agent Card Builder and Policy Presets with code examples and comparison tables.
- **New:** `getDualScore(wallet)` — Provider/Consumer dual trust assessment. Separates 'will this agent deliver?' from 'will this agent pay?'. Inspired by AgentKarma's best innovation (their dual-score model), enhanced with SAID's staking/slashing as economic enforcement signals.
- **New:** `getTrustSummary(wallet)` — One-call comprehensive overview combining trust score, risk assessment, credit score, stake info, and dual-score. Ideal for dashboards and profiles.
- **New:** `getStakeInfos(wallets[])` — Batch stake info query for efficient multi-agent lookups.
- **New:** CLI `summary` command — formatted one-shot trust overview.
- **New:** `DualScore`, `ProviderTrust`, `ConsumerTrust`, `TrustSummary` TypeScript types.
- **Improved:** 200 tests passing (161 ESM + 39 CJS), all green.
- **Docs:** New README sections for Dual-Score Model, Trust Summary, and Batch Stake Queries.

### v0.11.0
- **SACRS Credit Score** — FICO-compatible 300-850 credit score for AI agents
  - 6-factor model: payment history (35%), utilization (30%), history length (15%), credit mix (10%), new credit (10%), + SAID economic security overlay (30% blend)
  - Probability of default, recommended LTV, max borrow, rate premium
  - Based on research: no competitor has staking/slashing credit signals
- `getCreditScore(wallet)` — single agent credit score
- `getCreditScores(wallets)` — batch credit scoring
- `assessMultiple(wallets, policy)` — batch policy assessment
- CLI: `said credit --wallet <address>` command
- 162 tests passing (126 ESM + 36 CJS), all green

### v0.10.0
- **New:** `assess(wallet, policy)` — policy-based trust evaluation returning `allow`, `deny`, or `review` decisions. Inspired by AgentScore.com's assess API pattern but with SAID's staking/slashing as additional signals.
- **New:** `getRiskAssessment(wallet)` — comprehensive 6-tier risk model (minimal → unknown) with recommended transaction parameters (max USDC value, escrow percentage, escrow timeout). Includes risk factors and positive signals.
- **New:** `signReceipt(assessment)` — Ed25519 signed trust receipts for non-repudiable proof of trust checks. Requires keypair.
- **New:** `verifyReceipt(receipt)` — Verify a counterparty's signed receipt.
- **New:** CLI `risk` command — full risk assessment with transaction recommendations.
- **New:** CLI `assess` command — policy-based allow/deny/review from the command line.
- **New:** `TrustPolicy` type with allowlist, blocklist, minScore, requireVerified, minStakeSOL, requireActiveStake, maxRiskTier.
- **New:** `RiskTier` type — 6 risk tiers mapping to transaction parameters.
- **New:** `SignedReceipt` type — Ed25519-signed proof of trust assessment.
- **Improved:** 29 new tests covering risk assessment, policy evaluation, and receipt signing (127 total).
- **Docs:** New sections in README for Risk Assessment, Policy Assessment, and Signed Receipts.

### v0.9.0
- **New:** `createTrustMiddleware()` — trust-gating middleware for HTTP/x402 payment flows (block, flag, escalate modes)
- **New:** `expressAdapter()` — Express/Connect-compatible middleware wrapper
- **New:** `honoAdapter()` — Hono-compatible middleware wrapper
- **New:** `./middleware` subpath export for importing middleware independently
- **New:** CLI `card` command — view ERC-8004 agent cards with formatted output or raw JSON
- **New:** LICENSE file (MIT was referenced but missing from repo)
- **New:** `.npmignore` for cleaner npm package
- **Docs:** Comprehensive Trust Middleware section in README with x402, Express, and Hono examples

### v0.8.0
- **Breaking (minor):** `createSAIDHooks()` is now async — returns `Promise<SAIDHooks>` instead of `SAIDHooks`. This enables proper tree-shaking of React in non-React projects.
- **New:** Dual CJS + ESM builds via tsup. The SDK now works with both `import` and `require()`.
- **New:** Proper `exports` field in package.json for modern Node.js resolution.
- **New:** `sideEffects: false` for optimal tree-shaking.
- **New:** `engines: { node: '>=18' }` field.
- **New:** CJS import test suite (29 tests) verifying all exports work via `require()`.
- **New:** `test:all` script to run ESM + CJS tests together.
- **Improved:** Build switched from `tsc` to `tsup` — faster builds, smaller output, sourcemaps.
- **Improved:** `@solana/kit` is now an optional peer dependency (only needed for x402 payments).
- **Fixed:** React hooks factory uses dynamic import instead of `require()` — works in ESM-only environments.

### v0.7.0
- **New:** `getAgentCard(wallet)` — fetch ERC-8004 compliant agent card JSON for cross-protocol interop
- **New:** `AgentCard` type with full ERC-8004 schema support (capabilities, endpoints, identity)
- **New:** Automatic retry with exponential backoff on 5xx server errors and network failures
- **Improved:** Caching now applies to `getAgent()`, `getFeedback()`, and `getAgentCard()` (previously only leaderboard/stats were cached)
- **Improved:** All read methods use `fetchWithRetry` for production resilience
- **Fixed:** Version mismatch in source header comment (was v0.5.0)

### v0.6.0
- **New:** `getTrustTier()` — quick tier label lookup
- **New:** `filterTrusted()` — one-liner to filter wallet lists by trust criteria
- **New:** `createSAIDHooks()` — React hooks factory (`useAgent`, `useTrustScore`, `useLeaderboard`, `useProtocolStats`, `useIsVerified`)
- **New:** In-memory response cache with configurable TTL (`cacheTtlMs`)
- **New:** `invalidateCache()` method for manual cache control
- **New:** CLI `discover` and `resolve` commands for agent directory search
- **Improved:** Package keywords include ERC-8004, KYA, trust-score for npm discoverability
- **Fixed:** Repository URL points to SAID-Protocol org

### v0.5.0
- **New:** `getStakeInfo()` — query on-chain staking data (amount, status, cooldown, slashes)
- **New:** `verifyMultiple()` — batch verification for checking arrays of wallets
- **New:** `requireTrust()` — trust-gate helper that throws if agent doesn't meet thresholds
- **New:** `StakeInfo` and `BatchVerificationResult` TypeScript types
- **New:** Configurable `rpcUrl` in `SAIDClientConfig`
- **Docs:** Trust-gated interactions guide in README

### v0.4.0
- Trust scoring, feedback, leaderboard, passport API
- Staking CLI commands

### v0.1.0
- Initial release: agent registration, verification, cross-chain messaging
