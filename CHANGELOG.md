# Changelog

All notable changes to `@said-protocol/client` are documented in this file.

## [0.20.0] — 2026-07-26

### Added — SAID Enforcement Oracle for x402 Payment Flows

The #1 product from the 90-Day Build Priority research (July 2026). Every x402
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

This is SAID's strategic wedge — being the ENFORCEMENT ORACLE for the
agent commerce stack that Visa, Mastercard, Google, Coinbase are building.

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

Based on arXiv:2607.08084 which empirically disproved ERC-8004 reputation (73.5%
of reviewers show coordinated Sybil behavior). SAID's staking/slashing is now the
only empirically-valid agent trust mechanism on Solana.

- **`SAIDClient.getTrustCrisisReport(wallet)`** — compares economic enforcement
  data against reputation signals with ERC-8004 Sybil research context
- **`TrustCrisisReport` type** — structured report with economic trust (stake,
  slashes, verification), reputation signals (with Sybil vulnerability flag),
  ERC-8004 context (manipulation costs, Sybil rates), and trust verdict
  (recommendation + insight string)
- Fixed trailing comma bug in `test:all` script that was breaking `npm install`

## [0.17.0] — 2026-07-25

### Added — SAID Reputation Passport

**The #1 product from A2A Trust Gap research (July 2026).** Six independent sources
confirmed no protocol supplies inter-agent reputation. SAID's unique advantage:
staking/slashing converts reputation from advisory signal into financial guarantee.

- **`buildPassport()`** — builds a portable cross-protocol trust credential from agent data
- **`SAIDClient.getReputationPassport(wallet)`** — one-call API to generate a passport
- **Four protocol serialisation formats:**
  - `toMCPMeta()` — for MCP `_meta` field (stateless trust checking, zero API calls)
  - `toA2ACard()` — A2A Agent Card extension fields
  - `toX402Headers()` — HTTP headers for x402 payment responses
  - `toAP2Mandate()` — AP2 (Agent Payments Protocol) mandate extension
- **Trust dimensions:** reputation, economic security (stake), slashing events, verification,
  feedback count, longevity — all captured independently
- **Verdict engine:** `trusted` / `provisional` / `insufficient_evidence` / `untrusted`
  - Follows "unknown ≠ zero" philosophy — new agents get `insufficient_evidence`, not penalised
  - Only slashed agents or those with proven bad records get `untrusted`
- **Dynamic terms calculation:** reputation-modulated escrow %, max transaction USDC, daily spend caps
  - Stake reduces escrow (5% per SOL, max 30%)
  - Slashing increases escrow (+20% per event)
- **Third-party attestations:** merge endorsements from multiple platforms
  - Volume-weighted composite score
  - Source deduplication (latest wins)
- **JSON serialisation** with expiry validation and schema versioning
- **35 dedicated tests** (calculateDimensions, calculateVerdict, calculateTerms, buildPassport,
  all 4 serialisation formats, JSON round-trip, attestation management)

### Files Added
- `src/passport.ts` — Reputation Passport module (500+ lines)
- `src/test/passport.test.ts` — Comprehensive test suite

### Added — Trust Report + Batch Verification

- **`SAIDClient.createTrustReport(wallet)`** — generates a human-readable markdown trust report combining identity, trust score, enforcement, risk, credit score, dual-score, and passport verdict. Returns a recommendation (`allow`/`review`/`deny`) plus full data objects. Ideal for compliance dashboards and partner integrations.
- **`SAIDClient.batchVerify(wallets[], opts)`** — verify multiple agents in a single call with configurable criteria (minScore, requireStaked, maxSlashes). Returns per-agent results with failure reasons, plus summary counts. More efficient than looping `verify()`.
- **`./passport` subpath export** added to package.json and tsup config for independent import.
- **`test:all` script** updated to include passport test suite.

## [0.16.0] — 2026-07-24

### Added
- **GitHub Actions CI/CD** — automated test suite on every push/PR (Node 20 + 22 matrix)
- **npm publish workflow** — provenance-enabled auto-publish on tagged releases
- `CHANGELOG.md` for release tracking

### Fixed
- Version comment in `src/index.ts` was stale (said v0.13.0)

## [0.15.0] — 2026-07-24

### Added
- **X402TrustFacilitator** (`@said-protocol/client/x402`) — intercepts HTTP 402 responses and enforces SAID trust checks before payment settlement
- `wrapFetch()` — wraps native fetch with automatic trust enforcement on every 402
- `checkPayment()` — manual trust check for payment flows
- `preflight()` — pre-request trust verification
- `batchCheck()` — check multiple endpoints in parallel
- `pickBestProvider()` — select highest-trust endpoint from alternatives
- `parseTrustHeaders()` — parse SAID trust metadata from response headers
- Two-sided trust enforcement (payer + payee)
- 57 new tests (317 total)

## [0.14.0] — 2026-07-23

### Added
- **ERC-8183 Agent Commerce Protocol (ACP)** support — first SDK to combine ACP with on-chain enforcement
- `ACPTrustChecker` — allow/deny/review decisions with escrow % and spend caps
- `ACPTransactionBuilder` — fluent builder for ERC-8183 transactions
- 3 enforcement presets (default/strict/permissive)
- 11-state lifecycle state machine (`isValidTransition()`)
- `createACPConfig()` factory, `calculateEscrowPercentage()`, `calculateSpendCap()`
- Full README documentation with examples and function reference

## [0.13.0] — 2026-07-23

### Added
- **ERC-8004 Agent Card Builder** — `buildAgentCard()`, `validateAgentCard()`, `serveAgentCard()`, `tierToBadge()`, `diffAgentCards()`
- **Policy Presets** — `POLICY_STRICT`, `POLICY_BALANCED`, `POLICY_PERMISSIVE`, `POLICY_X402`, `POLICY_DEFI`

## [0.12.0] — 2026-07-23

### Added
- **Dual-Score Model** (Provider + Consumer trust, inspired by AgentKarma)
- **Trust Summary** — one-call overview of agent trust data
- **Batch Stake Queries** — fetch staking data for multiple wallets

## [0.11.0] — 2026-07-23

### Added
- **SACRS Credit Score** — FICO-compatible 300-850 agent credit risk score
- 6-factor model: reputation (27%), stake (24%), verification (15%), slashing (18%), activity (9%), longevity (7%)
- Logistic probability-of-default model
- Batch operations for credit scores

## [0.10.0] — 2026-07-22

### Added
- **Risk Assessment API** — 5-tier risk model with escrow % and spend caps
- **Policy-Based Assessment** — `assess()` method with strict/balanced/permissive presets
- **Signed Receipts** — Ed25519 non-repudiation for trust decisions

## [0.9.0] — 2026-07-22

### Added
- **Trust Middleware** — Express and Hono adapters with block/flag/escalate modes
- CLI `card` command — generate ERC-8004 agent cards from the command line
- LICENSE file (MIT)

## [0.8.0] — 2026-07-22

### Changed
- **Dual CJS+ESM builds** via tsup — was ESM-only, now works with `require()` and `import()`
- `createSAIDHooks()` is now async (returns `Promise<SAIDHooks>`)
- React hooks use dynamic import for CJS compatibility

## [0.7.0] — 2026-07-21

### Added
- **ERC-8004 Agent Cards** — `getAgentCard(wallet)` fetches spec-compliant JSON-LD cards
- **Caching** for all read methods (5min TTL default)
- **Retry with exponential backoff** (500ms → 1s → 2s) on 5xx/network errors

## [0.2.0] — 2026-04-25

- Initial npm release. Basic agent queries, cross-chain messaging.
