# Changelog

All notable changes to `@said-protocol/client` are documented in this file.

## [0.21.0] — 2026-07-26

### Combined Release — MCP Server + Enforcement Oracle

Merges the two v0.20.0 feature branches into a single unified release. The SDK
now exports 12 entry points with full MCP server support and x402 enforcement
oracle capabilities.

**Entry points:** `./mcp-server` + `./enforcement-oracle` (11 total subpath exports)

---

### Added — MCP Server (Model Context Protocol)

The #1 competitive gap identified across all market intelligence scans: competitors
(ChainAware, Mnemom, MINT Protocol) all expose MCP servers for AI agents to query
trust data. SAID now does too — with richer data and staking/slashing signals
they can't match.

New `./mcp-server` entry point:

- **`createSaidMcpServer()`** — Factory returning MCP-compatible handlers
- **`startStdioServer()`** — Standalone stdio JSON-RPC server (zero dependencies)
- **12 MCP tools** exposing the full SDK:
  - `said_verify_agent` — Full agent verification + identity + trust score
  - `said_trust_score` — Multi-dimensional score breakdown (6 pillars)
  - `said_risk_assessment` — Risk tier + recommended tx params + escrow
  - `said_credit_score` — SACRS 300-850 FICO-compatible credit score
  - `said_dual_score` — Provider trust vs consumer trust separation
  - `said_trust_summary` — One-call comprehensive trust overview
  - `said_stake_info` — Staking amount, status, slashing history
  - `said_batch_verify` — Batch verify up to 25 wallets
  - `said_feedback` — Agent reviews and feedback entries
  - `said_leaderboard` — Top agents by reputation
  - `said_agent_card` — ERC-8004 Agent Card (JSON-LD)
  - `said_protocol_stats` — Protocol-wide statistics
- **CLI integration** — `npx @said-protocol/client --mcp` starts MCP server
- **Claude Code / Cursor compatible** — add to `mcp.json` config
- **Zero external MCP SDK dependency** — minimal stdio JSON-RPC built-in
- **10 new tests** — tool listing, schema validation, error handling, live API

### Added — SAID Enforcement Oracle for x402 Payment Flows

The #1 product from the 90-Day Build Priority research. Every x402
marketplace needs trust enforcement — SAID is the only protocol with on-chain
staking/slashing for AI agents. This module wraps that into a deployable middleware.

New `./enforcement-oracle` entry point:

- **`EnforcementOracle` class** — x402 trust enforcement middleware
- **`enforce(wallet)`** — Core check: returns allow/require_escrow/block verdict
- **`checkPayment(payer, payee?)`** — Two-sided trust check for marketplace flows
- **`batchEnforce(wallets[])`** — Parallel enforcement checks
- **`wrapFetch(fetchFn)`** — Intercept x402 402 responses with trust enforcement
- **`toJsonResponse(verdict)`** — Deploy as API endpoint with proper HTTP semantics
- **Three factory presets:** `createStrictOracle`, `createPermissiveOracle`, `createX402Oracle`
- Economic security levels: none/minimal/moderate/strong/whale
- Dynamic escrow calculation based on score, stake, and slash history
- Smart caching (allowed=30s, escrow=15s, blocked=not cached)
- Trust metadata headers (X-SAID-Action, X-SAID-Score, X-SAID-Stake, etc.)

Revenue model: $0.01/check via x402. At 165M monthly x402 transactions,
capturing 0.1% = $1,650/month. Capturing 1% = $16,500/month.

## [0.19.0] — 2026-07-25

### Added — SAID Trust Oracle for ERC-8183 Agent Commerce

The flagship Layer 7 product. SAID now implements the **Evaluator role** in the
ERC-8183 Job lifecycle — the role that requires trust. Every ERC-8183 marketplace
(Virtuals ACP, OKX, BNBAgent) needs an evaluator. SAID is the only evaluator
backed by real economic enforcement (staking/slashing).

New `./trust-oracle` entry point:

- **`TrustOracle` class** — Evaluator-as-a-Service for ERC-8183 marketplaces
- **`trustGate()`** — Pre-transaction trust check (ReputationGateHook)
- **`selectEvaluator()`** — Pick staked, reputable agents as evaluators
- **`evaluate()`** — Verdict on delivered work (pass/fail/partial) with slashing recommendations
- **`batchTrustGate()`** — Batch trust checks for multiple wallets
- **Helper functions** — `trustToEscrowPct`, `trustToMaxTxValue`, `categorizeSeverity`, `calculateSlashPct`
- **Signed receipts** — HMAC-signed non-repudiation for every evaluation
- **6 evaluation criteria** — deliverable_exists, claim_substantive, provider_trust_minimum, provider_staked, clean_slash_history, evidence_provided
- **3 verdicts** — pass (release 100%), partial (release 50%), fail (refund + slash)

Revenue model: $0.01/check via x402. Y1 estimate: $100-400K.

34 new tests (helper functions + mock client + live API). All passing.

## [0.17.1] — 2026-07-25

### Added — Trust Crisis Report
