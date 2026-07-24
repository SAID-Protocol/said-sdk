# Changelog

All notable changes to `@said-protocol/client` are documented here.

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
