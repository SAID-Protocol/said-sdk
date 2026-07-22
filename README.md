# @said-protocol/client

Official SDK for [SAID Protocol](https://saidprotocol.com) — agent identity, trust scoring, and cross-chain messaging on Solana.

> **v0.9.0** — Now ships trust middleware for HTTP/x402 payment gating. Works with Express, Hono, Cloudflare Workers, and any Fetch-compatible runtime.

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

## CLI

```bash
npx @said-protocol/client register --keypair ./key.json --name "My Agent"
npx @said-protocol/client verify --keypair ./key.json
npx @said-protocol/client trust --wallet WALLET_ADDRESS
npx @said-protocol/client feedback --wallet WALLET_ADDRESS --limit 5
npx @said-protocol/client leaderboard --limit 10
npx @said-protocol/client card --wallet WALLET_ADDRESS [--json]
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

## License

MIT

## Changelog

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
