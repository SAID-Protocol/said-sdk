/**
 * SAID Protocol Client SDK v0.13.0
 * Agent identity, reputation, enforcement, and cross-chain messaging on Solana
 *
 * @example
 * ```ts
 * import { SAIDClient } from '@said-protocol/client';
 *
 * const client = new SAIDClient();
 *
 * // Check an agent's trust score
 * const score = await client.getTrustScore('AGENT_WALLET');
 * console.log(score.score, score.tier);
 *
 * // Send a cross-chain message
 * await client.sendMessage({
 *   from: { address: 'SENDER', chain: 'solana' },
 *   to: { address: 'RECIPIENT', chain: 'base' },
 *   message: 'Hello!',
 * });
 * ```
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface AgentRef {
  address: string;
  chain: string;
}

export interface SendMessageParams {
  from: AgentRef;
  to: AgentRef;
  message: string;
  context?: Record<string, unknown>;
}

export interface MessageResponse {
  success: boolean;
  messageId: string;
  status: 'delivered' | 'stored';
  paid: boolean;
  deliveredVia: string[];
  from: AgentRef & { name?: string; source?: string; verified?: boolean };
  to: AgentRef & { name?: string; source?: string; verified?: boolean };
  inboxUrl: string;
}

export interface SettlementInfo {
  success: boolean;
  transaction: string;
  network: string;
  payer: string;
}

export interface SendResult {
  message: MessageResponse;
  settlement?: SettlementInfo;
}

export interface InboxMessage {
  messageId: string;
  from: AgentRef & { name?: string; verified?: boolean };
  message: string;
  timestamp: string;
  paid?: boolean;
}

export interface AgentInfo {
  address: string;
  chain: string;
  name?: string;
  source: string;
  verified: boolean;
  endpoint?: string;
  reputationScore?: number;
  registeredAt?: string;
  description?: string;
  capabilities?: string[];
}

export interface FreeTierInfo {
  address: string;
  used: number;
  remaining: number;
  limit: number;
  paidPrice: string;
  paymentChains: Array<{ name: string; network: string }>;
}

export interface ChainInfo {
  name: string;
  type: string;
  registryType: string;
}

export interface WebhookParams {
  chain: string;
  address: string;
  url: string;
  secret?: string;
}

// ── ERC-8004 Agent Card Types ───────────────────────────────────────────────

export interface AgentCardCapability {
  name: string;
  description?: string;
  endpoint?: string;
}

export interface AgentCard {
  '@context': string;
  '@type': string;
  '@id': string;
  name: string;
  description?: string;
  image?: string;
  twitter?: string;
  website?: string;
  capabilities?: string[] | AgentCardCapability[];
  endpoints?: {
    mcp?: string;
    a2a?: string;
    [key: string]: string | undefined;
  };
  verified?: boolean;
  reputationScore?: number;
  trustTier?: string;
  chain?: string;
  registeredAt?: string;
}

// ── Trust & Reputation Types ───────────────────────────────────────────────

export interface TrustScoreBreakdown {
  score: number;
  tier: string;
  badges: string[];
  sources: string[];
  identity: number;
  activity: number;
  economic: number;
  ecosystem: number;
  longevity: number;
  fairscale: number;
  computedAt: string;
}

// ── Risk Assessment Types (v0.10.0) ────────────────────────────────────────

/**
 * Risk tier for an agent based on trust score and stake.
 * Maps to recommended transaction parameters.
 */
export type RiskTier =
  | 'minimal'    // Score 80+, verified, active stake — minimal risk
  | 'low'        // Score 60-79, verified — low risk
  | 'moderate'   // Score 40-59 — moderate risk, escrow recommended
  | 'elevated'   // Score 20-39 — elevated risk, full escrow required
  | 'high'       // Score 0-19 or unverified — high risk, block recommended
  | 'unknown';   // Not registered — cannot assess

export interface RiskAssessment {
  /** Overall risk tier */
  tier: RiskTier;
  /** Trust score (0-100), or null if unknown */
  score: number | null;
  /** Whether the agent is verified */
  verified: boolean;
  /** Whether the agent is registered at all */
  registered: boolean;
  /** Stake in SOL (0 if no stake) */
  stakeSOL: number;
  /** Recommended maximum transaction value in USDC, or null for no recommendation */
  recommendedMaxValueUSDC: number | null;
  /** Recommended escrow percentage (0 = no escrow, 100 = full escrow) */
  recommendedEscrowPct: number;
  /** Recommended escrow timeout in seconds */
  recommendedEscrowTimeoutSec: number | null;
  /** Summary of risk factors */
  riskFactors: string[];
  /** Summary of positive signals */
  positiveSignals: string[];
  /** Human-readable summary */
  summary: string;
}

// ── Policy Assessment Types (v0.10.0) ──────────────────────────────────────

/**
 * A trust policy that defines what's allowed.
 * Used by the assess() method for policy-based allow/deny decisions.
 */
export interface TrustPolicy {
  /** Minimum trust score required (0-100) */
  minScore?: number;
  /** Require SAID verification */
  requireVerified?: boolean;
  /** Minimum stake in SOL */
  minStakeSOL?: number;
  /** Require active stake status */
  requireActiveStake?: boolean;
  /** Maximum allowed risk tier */
  maxRiskTier?: RiskTier;
  /** Allowlist of wallet addresses that always pass */
  allowlist?: string[];
  /** Blocklist of wallet addresses that always fail */
  blocklist?: string[];
}

export type PolicyDecision = 'allow' | 'deny' | 'review';

export interface AssessmentResult {
  /** The policy decision */
  decision: PolicyDecision;
  /** Why this decision was made */
  reason: string;
  /** The wallet that was assessed */
  wallet: string;
  /** Risk assessment data */
  risk: RiskAssessment;
  /** The policy that was evaluated */
  policy: TrustPolicy;
  /** Timestamp of assessment */
  assessedAt: string;
}

// ── SACRS Credit Score Types (v0.11.0) ─────────────────────────────────────

/**
 * SACRS (SAID Agent Credit Rating Score) — FICO-compatible 300-850 score.
 *
 * Derived from SAID Protocol's unique on-chain data: trust score,
 * staking commitment, slashing history, verification status, feedback.
 *
 * No competitor has staking/slashing signals — this is SAID's credit moat.
 */
export type SACRSRating =
  | 'excellent'    // 750-850
  | 'very-good'    // 700-749
  | 'good'         // 640-699
   | 'fair'         // 580-639
  | 'poor'         // 500-579
  | 'very-poor'    // 300-499
  | 'unrated';     // Not enough data

export interface SACRSFactors {
  /** Payment history component (0-100): based on slashing record + feedback */
  paymentHistory: number;
  /** Credit utilization component (0-100): based on stake relative to activity */
  utilization: number;
  /** Length of history component (0-100): based on registration age */
  historyLength: number;
  /** Credit mix component (0-100): based on diversity of on-chain interactions */
  creditMix: number;
  /** New credit component (0-100): based on recent registration/verification */
  newCredit: number;
  /** SAID-specific: economic security component (0-100): staking + slashing */
  economicSecurity: number;
}

export interface SACRSResult {
  /** The wallet that was scored */
  wallet: string;
  /** SACRS score (300-850, FICO-compatible scale) */
  score: number;
  /** Human-readable rating band */
  rating: SACRSRating;
  /** Score probability of default (0-1, lower is better) */
  probabilityOfDefault: number;
  /** Factor breakdown (each 0-100) */
  factors: SACRSFactors;
  /** Risk flags (e.g. 'previously_slashed', 'unverified', 'no_stake') */
  flags: string[];
  /** Recommended maximum borrow capacity in USDC */
  recommendedMaxBorrowUSDC: number;
  /** Recommended loan-to-value ratio (0-100%) */
  recommendedLTV: number;
  /** Recommended interest rate premium in basis points (0 = prime, 500 = +5%) */
  recommendedRatePremiumBps: number;
  /** Human-readable summary */
  summary: string;
  /** Whether sufficient data exists for reliable scoring */
  scored: boolean;
  /** Timestamp of score computation */
  computedAt: string;
}

// ── Dual-Score Model (v0.12.0) ─────────────────────────────────────────────
// Inspired by AgentKarma's dual-score innovation (Provider Karma + Consumer Karma).
// AgentKarma died but this pattern was their best idea — separates
// 'Will this agent deliver?' (provider) from 'Will this agent pay?' (consumer).
// SAID enhances with staking/slashing as economic enforcement signal.

/**
 * Provider trust assessment — 'Can I trust this agent to DO work?'
 * Based on: reputation score, feedback from those who hired them,
 * verification status, stake at risk.
 */
export interface ProviderTrust {
  /** Trust score for delivering work (0-100) */
  score: number;
  /** Confidence level in the score */
  confidence: 'high' | 'medium' | 'low' | 'none';
  /** Number of data points feeding this score */
  dataPoints: number;
  /** Key signals */
  signals: string[];
}

/**
 * Consumer trust assessment — 'Can I trust this agent to PAY?'
 * Based on: stake amount (skin in the game), slashing history,
 * payment track record, economic security.
 */
export interface ConsumerTrust {
  /** Trust score for paying reliably (0-100) */
  score: number;
  /** Confidence level in the score */
  confidence: 'high' | 'medium' | 'low' | 'none';
  /** Number of data points feeding this score */
  dataPoints: number;
  /** Key signals */
  signals: string[];
}

/**
 * Dual-score result combining provider + consumer trust.
 *
 * AgentKarma's key insight: an agent can be great at delivering work
 * but terrible at paying, or vice versa. A single score conflates these.
 *
 * SAID enhancement: staking/slashing data gives economic accountability
 * signal that pure feedback systems lack.
 */
export interface DualScore {
  /** The wallet that was scored */
  wallet: string;
  /** Provider trust — 'Will this agent deliver?' */
  provider: ProviderTrust;
  /** Consumer trust — 'Will this agent pay?' */
  consumer: ConsumerTrust;
  /** Overall blended score (0-100) */
  overall: number;
  /** Whether sufficient data exists */
  scored: boolean;
  /** Timestamp */
  computedAt: string;
}

// ── Trust Summary Types (v0.12.0) ──────────────────────────────────────────

/**
 * One-call trust overview combining all SAID signals.
 * Returns trust score, risk assessment, credit score, stake info,
 * and dual-score in a single response — ideal for dashboards/profiles.
 */
export interface TrustSummary {
  wallet: string;
  /** Agent registration status */
  registered: boolean;
  /** Verification status */
  verified: boolean;
  /** Agent identity */
  identity: AgentIdentity | null;
  /** Trust score breakdown */
  trustScore: TrustScoreBreakdown | null;
  /** Stake info */
  stake: StakeInfo | null;
  /** Risk assessment */
  risk: RiskAssessment;
  /** SACRS credit score */
  credit: SACRSResult;
  /** Dual-score (provider + consumer) */
  dual: DualScore;
  /** Summary timestamp */
  computedAt: string;
}

// ── Signed Receipt Types (v0.10.0) ─────────────────────────────────────────

/**
 * A cryptographically signed trust check receipt.
 * Non-repudiable proof that a trust check was performed at a specific time.
 */
export interface SignedReceipt {
  /** The wallet that was checked */
  wallet: string;
  /** Trust score at time of check */
  score: number | null;
  /** Risk tier */
  tier: RiskTier;
  /** Decision made */
  decision: PolicyDecision;
  /** ISO timestamp */
  timestamp: string;
  /** Ed25519 signature (base58 encoded) */
  signature: string;
  /** Signer public key (base58 encoded) */
  signer: string;
  /** Original payload that was signed (JSON) */
  payload: string;
}

export interface ReputationInfo {
  tier: string;
  compositeScore: number;
  score: number;
  feedbackCount: number;
  trustTier: string;
  scored: boolean;
}

export interface AgentIdentity {
  name: string;
  description: string | null;
  twitter: string | null;
  website: string | null;
  image: string | null;
}

export interface AgentVerification {
  registered: boolean;
  verified: boolean;
  wallet: string;
  pda?: string;
  registeredAt?: string;
  identity?: AgentIdentity;
  reputation?: ReputationInfo;
  trustScore?: TrustScoreBreakdown;
  endpoints?: {
    mcp: string | null;
    a2a: string | null;
    [key: string]: string | null;
  };
  error?: string;
}

export interface FeedbackEntry {
  id: string;
  fromWallet: string;
  toWallet: string;
  score: number;
  comment: string;
  weight: number;
  signature: string;
  fromIsVerified: boolean;
  txHash: string | null;
  sourceKey: string | null;
  createdAt: string;
}

export interface LeaderboardEntry {
  wallet: string;
  pda: string;
  name: string;
  twitter: string | null;
  reputationScore: number;
  feedbackCount: number;
  isVerified: boolean;
  rank: number;
}

export interface PassportInfo {
  hasPassport: boolean;
  canMint: boolean;
  reason?: string;
  mintAddress?: string;
}

export interface ProtocolStats {
  totalAgents: number;
  verifiedAgents: number;
  averageReputation: number;
}

// ── Staking Types ───────────────────────────────────────────────────────────

export interface StakeInfo {
  agent: string;
  stakePDA: string;
  amountLamports: number;
  amountSOL: number;
  status: 'active' | 'unstake_requested' | 'unstake_complete' | 'none';
  requestedAt: number | null;
  cooldownEndsAt: number | null;
  slashedCount: number;
}

export interface BatchVerificationResult {
  wallet: string;
  verified: boolean;
  registered: boolean;
  trustScore: number | null;
  tier: string | null;
}

// ── Cache ──────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class SimpleCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private ttlMs: number;

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs;
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T): void {
    if (this.ttlMs <= 0) return;
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  invalidate(key?: string): void {
    if (key) this.store.delete(key);
    else this.store.clear();
  }
}

// ── Client ─────────────────────────────────────────────────────────────────

export interface SAIDClientConfig {
  /** 64-byte Solana keypair for signing x402 payments */
  keypairBytes?: Uint8Array;
  /** API base URL (default: https://api.saidprotocol.com) */
  apiUrl?: string;
  /** Solana RPC URL (default: https://api.mainnet-beta.solana.com) */
  rpcUrl?: string;
  /** Cache TTL in milliseconds (default: 30000 = 30s, 0 = disabled) */
  cacheTtlMs?: number;
}

export class SAIDClient {
  private apiUrl: string;
  private rpcUrl: string;
  private x402Fetch: typeof fetch | null = null;
  private keypairBytes?: Uint8Array;
  private initPromise: Promise<void> | null = null;
  private cache: SimpleCache;

  constructor(config: SAIDClientConfig = {}) {
    this.apiUrl = config.apiUrl || 'https://api.saidprotocol.com';
    this.rpcUrl = config.rpcUrl || 'https://api.mainnet-beta.solana.com';
    this.keypairBytes = config.keypairBytes;
    this.cache = new SimpleCache(config.cacheTtlMs ?? 30_000);

    if (this.keypairBytes) {
      this.initPromise = this.initX402();
    }
  }

  /** Clear the response cache. Pass a wallet to invalidate a single agent. */
  invalidateCache(wallet?: string): void {
    if (wallet) this.cache.invalidate(`agent:${wallet}`);
    else this.cache.invalidate();
  }

  private async initX402(): Promise<void> {
    if (!this.keypairBytes) return;

    const { wrapFetchWithPayment, x402Client } = await import('@x402/fetch');
    const { registerExactSvmScheme } = await import('@x402/svm/exact/client');
    const { createKeyPairSignerFromBytes } = await import('@solana/kit');

    const signer = await createKeyPairSignerFromBytes(this.keypairBytes);
    const client = new x402Client();
    registerExactSvmScheme(client, { signer });
    this.x402Fetch = wrapFetchWithPayment(fetch, client);
  }

  private async getFetch(): Promise<typeof fetch> {
    if (this.initPromise) {
      await this.initPromise;
      this.initPromise = null;
    }
    return this.x402Fetch || fetch;
  }

  /**
   * Fetch with automatic retry on transient failures (5xx, network errors).
   * Exponential backoff: 500ms, 1000ms, 2000ms.
   */
  private async fetchWithRetry(
    url: string,
    options?: RequestInit,
    maxRetries = 2,
  ): Promise<Response> {
    const f = await this.getFetch();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await f(url, options);
        // Don't retry on 4xx (client errors) — only 5xx
        if (res.status < 500 || attempt === maxRetries) {
          return res;
        }
        lastError = new SAIDError(`Server error: HTTP ${res.status}`, res.status);
      } catch (e: any) {
        lastError = e;
        if (attempt === maxRetries) break;
      }
      // Exponential backoff
      const delayMs = 500 * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delayMs));
    }

    throw lastError || new SAIDError('Request failed after retries', 500);
  }

  // ── PDA Helpers ─────────────────────────────────────────────────────────

  private static PROGRAM_ID_HEX = '5dpw6KEQPn248pnkkaYyWfHwu2nfb3LUMbTucb6LaA8G';

  private async getAgentPDA(ownerStr: string): Promise<{ PublicKey: any; Connection: any; agentPDA: any }> {
    const { PublicKey, Connection } = await import('@solana/web3.js');
    const owner = new PublicKey(ownerStr);
    const programId = new PublicKey(SAIDClient.PROGRAM_ID_HEX);
    const [agentPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('agent'), owner.toBuffer()],
      programId,
    );
    return { PublicKey, Connection, agentPDA };
  }

  private async getStakePDAFromAgent(agentPDA: any): Promise<any> {
    const { PublicKey } = await import('@solana/web3.js');
    const programId = new PublicKey(SAIDClient.PROGRAM_ID_HEX);
    const [stakePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('stake'), agentPDA.toBuffer()],
      programId,
    );
    return stakePDA;
  }

  // ── Trust & Reputation ─────────────────────────────────────────────────
  // These are the methods developers actually need. Score queries, feedback,
  // leaderboards — the building blocks of trust-aware applications.

  /**
   * Get full verification and trust data for an agent.
   * This is the primary method for checking if an agent is trustworthy.
   * Results are cached (respecting cacheTtlMs config).
   *
   * @example
   * ```ts
   * const agent = await client.getAgent('WALLET_ADDRESS');
   * if (agent.verified && agent.trustScore && agent.trustScore.score > 50) {
   *   console.log(`${agent.identity?.name} is trustworthy (score: ${agent.trustScore.score})`);
   * }
   * ```
   */
  async getAgent(wallet: string): Promise<AgentVerification> {
    const cacheKey = `agent:${wallet}`;
    const cached = this.cache.get<AgentVerification>(cacheKey);
    if (cached) return cached;

    const res = await this.fetchWithRetry(`${this.apiUrl}/api/verify/${wallet}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return {
        registered: false,
        verified: false,
        wallet,
        error: err.error || `HTTP ${res.status}`,
      };
    }
    const data = await res.json();
    this.cache.set(cacheKey, data);
    return data;
  }

  /**
   * Get a trust score breakdown for an agent.
   * Returns multi-dimensional scoring (identity, activity, economic, etc.)
   *
   * @example
   * ```ts
   * const score = await client.getTrustScore('WALLET_ADDRESS');
   * console.log(`Score: ${score.score}/100 (${score.tier})`);
   * console.log(`Identity: ${score.identity}, Activity: ${score.activity}`);
   * ```
   */
  async getTrustScore(wallet: string): Promise<TrustScoreBreakdown | null> {
    const agent = await this.getAgent(wallet);
    return agent.trustScore || null;
  }

  /**
   * Quick helper: returns just the trust tier label (e.g. 'Gold', 'Silver').
   * Returns null if the agent has no trust score.
   *
   * @example
   * ```ts
   * const tier = await client.getTrustTier('WALLET');
   * if (tier === 'Gold') allowDiscount();
   * ```
   */
  async getTrustTier(wallet: string): Promise<string | null> {
    const score = await this.getTrustScore(wallet);
    return score?.tier ?? null;
  }

  /**
   * Filter a list of wallets, returning only those that meet trust criteria.
   * Uses batch verification internally for efficiency.
   *
   * @example
   * ```ts
   * const trusted = await client.filterTrusted(wallets, { minScore: 50 });
   * ```
   */
  async filterTrusted(
    wallets: string[],
    options: { minScore?: number; requireVerified?: boolean } = {},
  ): Promise<BatchVerificationResult[]> {
    const results = await this.verifyMultiple(wallets);
    const { minScore = 0, requireVerified = false } = options;
    return results.filter((r) => {
      if (requireVerified && !r.verified) return false;
      if ((r.trustScore ?? 0) < minScore) return false;
      return true;
    });
  }

  /**
   * Quick boolean check if a wallet is a verified SAID agent.
   */
  async isVerified(wallet: string): Promise<boolean> {
    const agent = await this.getAgent(wallet);
    return agent.verified;
  }

  /**
   * Get feedback/reviews for an agent.
   *
   * @example
   * ```ts
   * const feedback = await client.getFeedback('WALLET_ADDRESS');
   * feedback.forEach(f => console.log(`${f.score}/100: ${f.comment}`));
   * ```
   */
  async getFeedback(wallet: string): Promise<FeedbackEntry[]> {
    const cacheKey = `feedback:${wallet}`;
    const cached = this.cache.get<FeedbackEntry[]>(cacheKey);
    if (cached) return cached;

    const res = await this.fetchWithRetry(`${this.apiUrl}/api/agents/${wallet}/feedback`);
    if (!res.ok) throw new SAIDError(`Feedback fetch failed`, res.status);
    const data = await res.json();
    const feedback = data.feedback || [];
    this.cache.set(cacheKey, feedback);
    return feedback;
  }

  /**
   * Get the agent leaderboard ranked by reputation score.
   *
   * @example
   * ```ts
   * const top = await client.getLeaderboard();
   * top.slice(0, 5).forEach(a => console.log(`#${a.rank} ${a.name}: ${a.reputationScore.toFixed(1)}`));
   * ```
   */
  async getLeaderboard(): Promise<LeaderboardEntry[]> {
    const cached = this.cache.get<LeaderboardEntry[]>('leaderboard');
    if (cached) return cached;

    const res = await this.fetchWithRetry(`${this.apiUrl}/api/leaderboard`);
    if (!res.ok) throw new SAIDError(`Leaderboard fetch failed`, res.status);
    const data = await res.json();
    const leaderboard = data.leaderboard || [];
    this.cache.set('leaderboard', leaderboard);
    return leaderboard;
  }

  /**
   * Get protocol-wide statistics.
   */
  async getProtocolStats(): Promise<ProtocolStats> {
    const cached = this.cache.get<ProtocolStats>('stats');
    if (cached) return cached;

    const res = await this.fetchWithRetry(`${this.apiUrl}/api/stats`);
    if (!res.ok) throw new SAIDError(`Stats fetch failed`, res.status);
    const data = await res.json();
    this.cache.set('stats', data);
    return data;
  }

  /**
   * Check if an agent has minted their soulbound passport NFT.
   */
  async getPassport(wallet: string): Promise<PassportInfo> {
    const res = await this.fetchWithRetry(`${this.apiUrl}/api/agents/${wallet}/passport`);
    if (!res.ok) throw new SAIDError(`Passport check failed`, res.status);
    return res.json();
  }

  /**
   * Fetch the ERC-8004 compliant agent card (JSON-LD) for an agent.
   * This is the standardized agent identity format that other protocols
   * and registries can consume.
   *
   * @example
   * ```ts
   * const card = await client.getAgentCard('WALLET_ADDRESS');
   * console.log(card.name, card.description);
   * console.log(card.capabilities);
   * ```
   */
  async getAgentCard(wallet: string): Promise<AgentCard | null> {
    const cacheKey = `card:${wallet}`;
    const cached = this.cache.get<AgentCard>(cacheKey);
    if (cached) return cached;

    const res = await this.fetchWithRetry(`${this.apiUrl}/api/cards/${wallet}.json`);
    if (!res.ok) return null;
    const data = await res.json();
    this.cache.set(cacheKey, data);
    return data;
  }

  // ── Staking ─────────────────────────────────────────────────────────────

  /**
   * Get staking information for an agent.
   * Returns stake amount, status, cooldown info, and slash history.
   *
   * This is SAID's key differentiator — agents with stake have skin in the game.
   * Use this to gate high-value interactions.
   *
   * @example
   * ```ts
   * const stake = await client.getStakeInfo('WALLET_ADDRESS');
   * if (stake.amountSOL >= 1.0 && stake.status === 'active') {
   *   console.log('Agent has sufficient active stake');
   * }
   * ```
   */
  async getStakeInfo(wallet: string): Promise<StakeInfo> {
    const { Connection } = await import('@solana/web3.js');
    const { agentPDA } = await this.getAgentPDA(wallet);
    const stakePDA = await this.getStakePDAFromAgent(agentPDA);

    const connection = new Connection(this.rpcUrl, 'confirmed');
    const accountInfo = await connection.getAccountInfo(stakePDA);

    if (!accountInfo || !accountInfo.data) {
      return {
        agent: wallet,
        stakePDA: stakePDA.toBase58(),
        amountLamports: 0,
        amountSOL: 0,
        status: 'none',
        requestedAt: null,
        cooldownEndsAt: null,
        slashedCount: 0,
      };
    }

    // Parse stake account data
    // Layout (36 bytes min):
    //   discriminator: 8 bytes
    //   agent_pubkey: 32 bytes
    //   amount: 8 bytes (u64 lamports)
    //   status: 1 byte (0=active, 1=unstake_requested, 2=unstake_complete)
    //   requested_at: 8 bytes (i64 unix timestamp, 0 if not requested)
    //   slashed_count: 8 bytes (u64)
    const data = accountInfo.data;
    const COOLDOWN_SECONDS = 7 * 24 * 60 * 60; // 7 days

    let offset = 8; // skip discriminator
    offset += 32; // skip agent pubkey
    const amountLamports = Number(data.readBigUInt64LE(offset));
    offset += 8;
    const statusByte = data[offset];
    offset += 1;
    const requestedAt = Number(data.readBigInt64LE(offset));
    offset += 8;
    const slashedCount = Number(data.readBigUInt64LE(offset));

    const status = statusByte === 0 ? 'active' :
                   statusByte === 1 ? 'unstake_requested' :
                   statusByte === 2 ? 'unstake_complete' : 'none';

    const cooldownEndsAt = requestedAt > 0
      ? (requestedAt + COOLDOWN_SECONDS) * 1000
      : null;

    return {
      agent: wallet,
      stakePDA: stakePDA.toBase58(),
      amountLamports,
      amountSOL: amountLamports / 1_000_000_000,
      status,
      requestedAt: requestedAt > 0 ? requestedAt * 1000 : null,
      cooldownEndsAt,
      slashedCount,
    };
  }

  // ── Batch Operations ────────────────────────────────────────────────────

  /**
   * Verify multiple agents in a single batch.
   * More efficient than calling getAgent() in a loop for trust checks.
   *
   * @example
   * ```ts
   * const results = await client.verifyMultiple([
   *   'WALLET_A', 'WALLET_B', 'WALLET_C',
   * ]);
   * const trusted = results.filter(r => r.verified && (r.trustScore ?? 0) >= 50);
   * ```
   */
  async verifyMultiple(wallets: string[]): Promise<BatchVerificationResult[]> {
    // Fire all requests concurrently
    const results = await Promise.allSettled(
      wallets.map(w => this.getAgent(w))
    );

    return results.map((result, i) => {
      const wallet = wallets[i];
      if (result.status === 'fulfilled') {
        return {
          wallet,
          verified: result.value.verified,
          registered: result.value.registered,
          trustScore: result.value.trustScore?.score ?? null,
          tier: result.value.trustScore?.tier ?? null,
        };
      }
      return {
        wallet,
        verified: false,
        registered: false,
        trustScore: null,
        tier: null,
      };
    });
  }

  // ── Trust-Gated Helpers ─────────────────────────────────────────────────

  /**
   * Require an agent to meet a minimum trust threshold.
   * Throws SAIDError if the agent doesn't meet criteria.
   *
   * This is the building block for trust-powered products — marketplaces,
   * escrow, any interaction where you need to enforce trust.
   *
   * @example
   * ```ts
   * // Only allow verified agents with 50+ score and 0.5 SOL staked
   * await client.requireTrust(wallet, {
   *   minScore: 50,
   *   requireVerified: true,
   *   minStakeSOL: 0.5,
   * });
   * // Proceed with interaction...
   * ```
   */
  async requireTrust(
    wallet: string,
    options: {
      minScore?: number;
      requireVerified?: boolean;
      minStakeSOL?: number;
    },
  ): Promise<void> {
    const { minScore = 0, requireVerified = false, minStakeSOL = 0 } = options;

    // Fetch agent and stake info concurrently
    const [agent, stake] = await Promise.all([
      this.getAgent(wallet),
      minStakeSOL > 0 ? this.getStakeInfo(wallet) : Promise.resolve(null),
    ]);
    if (!agent.registered) {
      throw new SAIDError(`Agent not registered: ${wallet}`, 404);
    }

    if (requireVerified && !agent.verified) {
      throw new SAIDError(`Agent not verified: ${wallet}`, 403);
    }

    const score = agent.trustScore?.score ?? 0;
    if (score < minScore) {
      throw new SAIDError(
        `Trust score ${score} below minimum ${minScore}: ${wallet}`,
        403,
      );
    }

    if (stake && stake.amountSOL < minStakeSOL) {
      throw new SAIDError(
        `Stake ${stake.amountSOL.toFixed(4)} SOL below minimum ${minStakeSOL} SOL: ${wallet}`,
        403,
      );
    }

    if (stake && stake.status !== 'active' && stake.status !== 'none') {
      throw new SAIDError(
        `Agent stake not active (status: ${stake.status}): ${wallet}`,
        403,
      );
    }
  }

  // ── Risk Assessment (v0.10.0) ──────────────────────────────────────────

  /**
   * Get a comprehensive risk assessment for an agent.
   *
   * Returns risk tier, recommended transaction parameters (max value,
   * escrow percentage, escrow timeout), and lists of risk factors and
   * positive signals.
   *
   * This is the primary method for determining HOW to interact with an
   * agent, not just WHETHER to interact.
   *
   * @example
   * ```ts
   * const risk = await client.getRiskAssessment('WALLET_ADDRESS');
   * if (risk.tier === 'high') {
   *   console.log('Do not transact');
   * } else {
   *   console.log(`Max: ${risk.recommendedMaxValueUSDC} USDC`);
   *   console.log(`Escrow: ${risk.recommendedEscrowPct}%`);
   * }
   * ```
   */
  async getRiskAssessment(wallet: string): Promise<RiskAssessment> {
    const [agent, stake] = await Promise.all([
      this.getAgent(wallet),
      this.getStakeInfo(wallet),
    ]);

    const score = agent.trustScore?.score ?? null;
    const verified = agent.verified;
    const registered = agent.registered;
    const stakeSOL = stake.amountSOL;
    const riskFactors: string[] = [];
    const positiveSignals: string[] = [];

    if (!registered) {
      return {
        tier: 'unknown',
        score: null,
        verified: false,
        registered: false,
        stakeSOL: 0,
        recommendedMaxValueUSDC: 0,
        recommendedEscrowPct: 100,
        recommendedEscrowTimeoutSec: null,
        riskFactors: ['Agent not registered with SAID Protocol'],
        positiveSignals: [],
        summary: 'Unknown agent — no trust data available. Do not transact without full escrow.',
      };
    }

    // Collect signals
    if (verified) positiveSignals.push('SAID-verified agent');
    else riskFactors.push('Agent not verified');

    if (stakeSOL >= 1.0) positiveSignals.push(`${stakeSOL.toFixed(2)} SOL staked (skin in the game)`);
    else if (stakeSOL > 0) riskFactors.push(`Low stake (${stakeSOL.toFixed(2)} SOL)`);
    else riskFactors.push('No stake deposited');

    if (stake.slashedCount > 0) riskFactors.push(`${stake.slashedCount} slashing event(s)`);

    if (score !== null) {
      if (score >= 80) positiveSignals.push(`High trust score (${score}/100)`);
      else if (score >= 60) positiveSignals.push(`Good trust score (${score}/100)`);
      else if (score < 40) riskFactors.push(`Low trust score (${score}/100)`);
    }

    if (agent.reputation && agent.reputation.feedbackCount > 5) {
      positiveSignals.push(`${agent.reputation.feedbackCount} feedback entries`);
    }

    // Determine tier and recommendations
    let tier: RiskTier;
    let recommendedMaxValueUSDC: number | null;
    let recommendedEscrowPct: number;
    let recommendedEscrowTimeoutSec: number | null;

    const effectiveScore = score ?? 0;

    if (!verified || effectiveScore < 20) {
      tier = 'high';
      recommendedMaxValueUSDC = 0;
      recommendedEscrowPct = 100;
      recommendedEscrowTimeoutSec = 7 * 24 * 3600; // 7 days
    } else if (effectiveScore < 40) {
      tier = 'elevated';
      recommendedMaxValueUSDC = 100;
      recommendedEscrowPct = 100;
      recommendedEscrowTimeoutSec = 3 * 24 * 3600; // 3 days
    } else if (effectiveScore < 60) {
      tier = 'moderate';
      recommendedMaxValueUSDC = 1000;
      recommendedEscrowPct = 50;
      recommendedEscrowTimeoutSec = 24 * 3600; // 1 day
    } else if (effectiveScore < 80) {
      tier = 'low';
      recommendedMaxValueUSDC = 5000;
      recommendedEscrowPct = 0;
      recommendedEscrowTimeoutSec = null;
    } else {
      // Score 80+ — but only 'minimal' if staked
      tier = stakeSOL >= 0.5 ? 'minimal' : 'low';
      recommendedMaxValueUSDC = stakeSOL >= 0.5 ? null : 5000; // null = no limit
      recommendedEscrowPct = 0;
      recommendedEscrowTimeoutSec = null;
    }

    // Build summary
    const tierEmoji = tier === 'minimal' ? '🟢' : tier === 'low' ? '🟢' :
      tier === 'moderate' ? '🟡' : tier === 'elevated' ? '🟠' :
      tier === 'high' ? '🔴' : '⚫';

    const summary = `${tierEmoji} ${tier.toUpperCase()} risk — Score: ${score ?? 'N/A'}/100, Staked: ${stakeSOL.toFixed(2)} SOL, Verified: ${verified ? 'Yes' : 'No'}`;

    return {
      tier,
      score,
      verified,
      registered,
      stakeSOL,
      recommendedMaxValueUSDC,
      recommendedEscrowPct,
      recommendedEscrowTimeoutSec,
      riskFactors,
      positiveSignals,
      summary,
    };
  }

  // ── Policy Assessment (v0.10.0) ────────────────────────────────────────

  /**
   * Evaluate an agent against a trust policy.
   *
   * Returns a structured decision: 'allow', 'deny', or 'review'.
   * This is the primary method for building trust-gated applications.
   *
   * Inspired by AgentScore.com's assess API pattern — but with SAID's
   * staking/slashing enforcement as an additional signal.
   *
   * @example
   * ```ts
   * const result = await client.assess('WALLET_ADDRESS', {
   *   minScore: 50,
   *   requireVerified: true,
   *   minStakeSOL: 0.5,
   *   maxRiskTier: 'moderate',
   * });
   *
   * if (result.decision === 'allow') {
   *   // Proceed with transaction
   * } else if (result.decision === 'review') {
   *   // Send to manual review
   * } else {
   *   // Block
   * }
   * ```
   */
  async assess(
    wallet: string,
    policy: TrustPolicy,
  ): Promise<AssessmentResult> {
    // Check allowlist/blocklist first
    if (policy.blocklist?.includes(wallet)) {
      const risk = await this.getRiskAssessment(wallet);
      return {
        decision: 'deny',
        reason: 'Wallet is on blocklist',
        wallet,
        risk,
        policy,
        assessedAt: new Date().toISOString(),
      };
    }

    if (policy.allowlist?.includes(wallet)) {
      const risk = await this.getRiskAssessment(wallet);
      return {
        decision: 'allow',
        reason: 'Wallet is on allowlist',
        wallet,
        risk,
        policy,
        assessedAt: new Date().toISOString(),
      };
    }

    const risk = await this.getRiskAssessment(wallet);
    const reasons: string[] = [];
    let shouldReview = false;

    // Check each policy condition
    if (policy.requireVerified && !risk.verified) {
      reasons.push('Agent not verified');
    }

    if (policy.minScore !== undefined && (risk.score ?? 0) < policy.minScore) {
      reasons.push(`Score ${risk.score ?? 0} below minimum ${policy.minScore}`);
    }

    if (policy.minStakeSOL !== undefined && risk.stakeSOL < policy.minStakeSOL) {
      reasons.push(`Stake ${risk.stakeSOL.toFixed(4)} SOL below minimum ${policy.minStakeSOL} SOL`);
    }

    if (policy.requireActiveStake && risk.stakeSOL <= 0) {
      reasons.push('No active stake');
    }

    if (policy.maxRiskTier) {
      const tierOrder: RiskTier[] = ['minimal', 'low', 'moderate', 'elevated', 'high', 'unknown'];
      const maxIdx = tierOrder.indexOf(policy.maxRiskTier);
      const actualIdx = tierOrder.indexOf(risk.tier);
      if (actualIdx > maxIdx) {
        reasons.push(`Risk tier '${risk.tier}' exceeds maximum '${policy.maxRiskTier}'`);
      }
    }

    // Determine decision
    let decision: PolicyDecision;
    let reason: string;

    if (reasons.length === 0) {
      decision = 'allow';
      reason = risk.positiveSignals.length > 0
        ? `Approved: ${risk.positiveSignals.join(', ')}`
        : 'Approved';
    } else {
      // Hard denials: unregistered, high risk, blocklisted conditions
      if (!risk.registered || risk.tier === 'high' || risk.tier === 'unknown') {
        decision = 'deny';
      } else {
        // Moderate violations → review instead of hard deny
        decision = 'review';
        shouldReview = true;
      }
      reason = reasons.join('; ');
    }

    return {
      decision,
      reason,
      wallet,
      risk,
      policy,
      assessedAt: new Date().toISOString(),
    };
  }

  // ── SACRS Credit Score (v0.11.0) ─────────────────────────────────────

  /**
   * Get a SACRS (SAID Agent Credit Rating Score) for an agent.
   *
   * Returns a FICO-compatible 300-850 credit score derived from
   * SAID Protocol's unique data: on-chain trust score, staking
   * commitment, slashing history, verification status, and feedback.
   *
   * This is SAID's key differentiator — no competitor has staking/slashing
   * data to feed into a credit model. A slashed agent = credit risk.
   * A staked agent = lower risk.
   *
   * Based on research: Kojiru (Base, FICO-scale), Bond.Credit (TEE),
   * Tessera (USDC credit) — ALL on Base/Ethereum, NONE on Solana.
   * SAID is the ONLY protocol with staking/slashing enforcement signals.
   *
   * @example
   * ```ts
   * const credit = await client.getCreditScore('WALLET_ADDRESS');
   * console.log(`SACRS: ${credit.score}/850 (${credit.rating})`);
   * console.log(`Recommended LTV: ${credit.recommendedLTV}%`);
   * if (credit.flags.includes('previously_slashed')) {
   *   console.log('Warning: Agent has been slashed');
   * }
   * ```
   */
  async getCreditScore(wallet: string): Promise<SACRSResult> {
    const [agent, stake] = await Promise.all([
      this.getAgent(wallet),
      this.getStakeInfo(wallet),
    ]);

    return computeSACRS(agent, stake);
  }

  /**
   * Batch credit scoring — get SACRS scores for multiple agents.
   *
   * @example
   * ```ts
   * const scores = await client.getCreditScores([
   *   'WALLET_A', 'WALLET_B', 'WALLET_C',
   * ]);
   * scores.forEach(s => console.log(`${s.wallet}: ${s.score} (${s.rating})`));
   * ```
   */
  async getCreditScores(wallets: string[]): Promise<SACRSResult[]> {
    const results = await Promise.allSettled(
      wallets.map((w) => this.getCreditScore(w)),
    );
    return results.map((r, i) =>
      r.status === 'fulfilled'
        ? r.value
        : {
            wallet: wallets[i],
            score: 300,
            rating: 'unrated' as const,
            probabilityOfDefault: 1.0,
            factors: {
              paymentHistory: 0,
              utilization: 0,
              historyLength: 0,
              creditMix: 0,
              newCredit: 0,
              economicSecurity: 0,
            },
            flags: ['computation_failed'],
            recommendedMaxBorrowUSDC: 0,
            recommendedLTV: 0,
            recommendedRatePremiumBps: 2000,
            summary: 'Credit score computation failed',
            scored: false,
            computedAt: new Date().toISOString(),
          },
    );
  }

  /**
   * Batch policy assessment — evaluate multiple agents against a policy.
   *
   * @example
   * ```ts
   * const results = await client.assessMultiple([walletA, walletB], {
   *   minScore: 50,
   *   requireVerified: true,
   * });
   * const allowed = results.filter(r => r.decision === 'allow');
   * ```
   */
  async assessMultiple(
    wallets: string[],
    policy: TrustPolicy,
  ): Promise<AssessmentResult[]> {
    const results = await Promise.allSettled(
      wallets.map((w) => this.assess(w, policy)),
    );
    return results.map((r) =>
      r.status === 'fulfilled'
        ? r.value
        : {
            decision: 'deny' as PolicyDecision,
            reason: 'Assessment failed',
            wallet: wallets[results.indexOf(r)],
            risk: {
              tier: 'unknown' as RiskTier,
              score: null,
              verified: false,
              registered: false,
              stakeSOL: 0,
              recommendedMaxValueUSDC: 0,
              recommendedEscrowPct: 100,
              recommendedEscrowTimeoutSec: null,
              riskFactors: ['Assessment error'],
              positiveSignals: [],
              summary: 'Assessment failed',
            },
            policy,
            assessedAt: new Date().toISOString(),
          },
    );
  }

  /**
   * Sign a trust check result as a non-repudiable receipt.
   *
   * Requires keypairBytes to be set in client config.
   * Produces an Ed25519 signature over the assessment payload.
   *
   * @example
   * ```ts
   * const client = new SAIDClient({ keypairBytes: yourKeypair });
   * const assessment = await client.assess(wallet, policy);
   * const receipt = await client.signReceipt(assessment);
   * // receipt.signature can be verified by counterparty
   * ```
   */
  async signReceipt(assessment: AssessmentResult): Promise<SignedReceipt> {
    if (!this.keypairBytes) {
      throw new SAIDError('Keypair required for signing receipts. Pass keypairBytes in config.', 400);
    }

    const nacl: any = await import('tweetnacl');
    const sign = nacl.default?.sign || nacl.sign;
    const bs58mod: any = await import('bs58');
    const encodeBase58 = bs58mod.default?.encode || bs58mod.encode;
    const { PublicKey } = await import('@solana/web3.js');

    const payload = JSON.stringify({
      wallet: assessment.wallet,
      score: assessment.risk.score,
      tier: assessment.risk.tier,
      decision: assessment.decision,
      timestamp: assessment.assessedAt,
    });

    const messageBytes = new TextEncoder().encode(payload);
    const signature = sign.detached(messageBytes, this.keypairBytes);
    const signer = new PublicKey(this.keypairBytes.slice(32, 64));

    return {
      wallet: assessment.wallet,
      score: assessment.risk.score,
      tier: assessment.risk.tier,
      decision: assessment.decision,
      timestamp: assessment.assessedAt,
      signature: encodeBase58(signature),
      signer: signer.toBase58(),
      payload,
    };
  }

  /**
   * Verify a signed receipt from a counterparty.
   *
   * @example
   * ```ts
   * const isValid = await client.verifyReceipt(receipt, signerPublicKey);
   * ```
   */
  async verifyReceipt(
    receipt: SignedReceipt,
    expectedSigner?: string,
  ): Promise<boolean> {
    const nacl: any = await import('tweetnacl');
    const sign = nacl.default?.sign || nacl.sign;
    const bs58mod: any = await import('bs58');
    const decodeBase58 = bs58mod.default?.decode || bs58mod.decode;

    if (expectedSigner && receipt.signer !== expectedSigner) {
      return false;
    }

    const messageBytes = new TextEncoder().encode(receipt.payload);

    try {
      const signature = decodeBase58(receipt.signature);
      const publicKey = decodeBase58(receipt.signer);
      return sign.detached.verify(messageBytes, signature, publicKey);
    } catch {
      return false;
    }
  }


  // ── Dual-Score (v0.12.0) ────────────────────────────────────────────────

  /**
   * Get a dual-score assessment separating provider trust from consumer trust.
   *
   * Inspired by AgentKarma's Provider/Consumer Karma split (their best idea
   * before they died). Enhanced with SAID's staking/slashing signals.
   *
   * - Provider score answers: 'Will this agent deliver quality work?'
   * - Consumer score answers: 'Will this agent pay reliably?'
   *
   * An agent can be excellent at delivering but unreliable at paying
   * (or vice versa). A single score conflates these dimensions.
   *
   * @example
   * ```ts
   * const dual = await client.getDualScore('WALLET');
   * console.log(`Provider: ${dual.provider.score}/100`);
   * console.log(`Consumer: ${dual.consumer.score}/100`);
   * if (dual.consumer.score < 30) requireUpfrontPayment();
   * ```
   */
  async getDualScore(wallet: string): Promise<DualScore> {
    const [agent, stake] = await Promise.all([
      this.getAgent(wallet),
      this.getStakeInfo(wallet),
    ]);

    return computeDualScore(agent, stake);
  }

  /**
   * Get a comprehensive trust summary in a single call.
   *
   * Combines: agent verification, trust score, stake info, risk assessment,
   * SACRS credit score, and dual-score. Ideal for dashboards, profiles,
   * and one-shot lookups.
   *
   * @example
   * ```ts
   * const summary = await client.getTrustSummary('WALLET');
   * console.log(`Score: ${summary.trustScore?.score}`);
   * console.log(`Risk: ${summary.risk.tier}`);
   * console.log(`Credit: ${summary.credit.score}/850`);
   * console.log(`Provider: ${summary.dual.provider.score}, Consumer: ${summary.dual.consumer.score}`);
   * ```
   */
  async getTrustSummary(wallet: string): Promise<TrustSummary> {
    const [agent, stake] = await Promise.all([
      this.getAgent(wallet),
      this.getStakeInfo(wallet),
    ]);

    const risk = await this.getRiskAssessment(wallet);
    const credit = computeSACRS(agent, stake);
    const dual = computeDualScore(agent, stake);

    return {
      wallet,
      registered: agent.registered,
      verified: agent.verified,
      identity: agent.identity ?? null,
      trustScore: agent.trustScore ?? null,
      stake,
      risk,
      credit,
      dual,
      computedAt: new Date().toISOString(),
    };
  }

  // ── Batch Stake Queries (v0.12.0) ─────────────────────────────────────

  /**
   * Get staking info for multiple agents in a single call.
   * More efficient than calling getStakeInfo() in a loop.
   *
   * @example
   * ```ts
   * const stakes = await client.getStakeInfos([walletA, walletB, walletC]);
   * const staked = stakes.filter(s => s.amountSOL > 0);
   * ```
   */
  async getStakeInfos(wallets: string[]): Promise<StakeInfo[]> {
    return Promise.allSettled(
      wallets.map((w) => this.getStakeInfo(w)),
    ).then((results) =>
      results.map((r, i) =>
        r.status === 'fulfilled'
          ? r.value
          : {
              agent: wallets[i],
              stakePDA: '',
              amountLamports: 0,
              amountSOL: 0,
              status: 'none' as const,
              requestedAt: null,
              cooldownEndsAt: null,
              slashedCount: 0,
            },
      ),
    );
  }

  // ── Messaging ──────────────────────────────────────────────────────────

  /**
   * Send a cross-chain message between agents.
   * Uses free tier first (10/day), then auto-pays $0.01 USDC via x402.
   */
  async sendMessage(params: SendMessageParams): Promise<SendResult> {
    const f = await this.getFetch();

    const res = await f(`${this.apiUrl}/xchain/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!res.ok && res.status !== 402) {
      const err = await res.json().catch(() => ({}));
      throw new SAIDError(`Message failed (HTTP ${res.status})`, res.status, err);
    }

    if (res.status === 402) {
      throw new SAIDError(
        'Payment required — provide keypairBytes in config for auto-payment',
        402,
      );
    }

    const message: MessageResponse = await res.json();

    // Parse settlement info from PAYMENT-RESPONSE header
    let settlement: SettlementInfo | undefined;
    const paymentResponse = res.headers.get('payment-response');
    if (paymentResponse) {
      try {
        settlement = JSON.parse(
          typeof atob === 'function'
            ? atob(paymentResponse)
            : Buffer.from(paymentResponse, 'base64').toString(),
        );
      } catch {}
    }

    return { message, settlement };
  }

  /**
   * Get messages from an agent's inbox.
   */
  async getInbox(chain: string, address: string): Promise<InboxMessage[]> {
    const res = await fetch(`${this.apiUrl}/xchain/inbox/${chain}/${address}`);
    if (!res.ok) throw new SAIDError(`Inbox fetch failed`, res.status);
    const data = await res.json();
    return data.messages || [];
  }

  // ── Discovery ──────────────────────────────────────────────────────────

  /**
   * Resolve an agent by address across all chains.
   */
  async resolveAgent(address: string, chain?: string): Promise<AgentInfo[]> {
    const url = new URL(`${this.apiUrl}/xchain/resolve/${address}`);
    if (chain) url.searchParams.set('chain', chain);
    const res = await this.fetchWithRetry(url.toString());
    if (!res.ok) throw new SAIDError(`Resolve failed`, res.status);
    const data = await res.json();
    return data.agents || [];
  }

  /**
   * Discover agents across chains.
   */
  async discover(query?: string): Promise<AgentInfo[]> {
    const url = new URL(`${this.apiUrl}/xchain/discover`);
    if (query) url.searchParams.set('q', query);
    const res = await this.fetchWithRetry(url.toString());
    if (!res.ok) throw new SAIDError(`Discover failed`, res.status);
    const data = await res.json();
    return data.agents || [];
  }

  /**
   * Get supported chains.
   */
  async getChains(): Promise<Record<string, ChainInfo>> {
    const res = await this.fetchWithRetry(`${this.apiUrl}/xchain/chains`);
    if (!res.ok) throw new SAIDError(`Chains fetch failed`, res.status);
    return res.json();
  }

  /**
   * Get cross-chain stats.
   */
  async getStats(): Promise<Record<string, unknown>> {
    const res = await this.fetchWithRetry(`${this.apiUrl}/xchain/stats`);
    if (!res.ok) throw new SAIDError(`Stats fetch failed`, res.status);
    return res.json();
  }

  // ── Free Tier ──────────────────────────────────────────────────────────

  /**
   * Check free tier usage for an agent.
   */
  async getFreeTier(address: string): Promise<FreeTierInfo> {
    const res = await this.fetchWithRetry(`${this.apiUrl}/xchain/free-tier/${address}`);
    if (!res.ok) throw new SAIDError(`Free tier check failed`, res.status);
    return res.json();
  }

  // ── Webhooks ───────────────────────────────────────────────────────────

  /**
   * Register a webhook to receive messages via push delivery.
   */
  async registerWebhook(params: WebhookParams): Promise<{ message: string; secret: string }> {
    const res = await fetch(`${this.apiUrl}/xchain/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new SAIDError(`Webhook registration failed`, res.status);
    return res.json();
  }

  /**
   * Check webhook registration for an agent.
   */
  async getWebhook(chain: string, address: string): Promise<{ registered: boolean; url?: string }> {
    const res = await fetch(`${this.apiUrl}/xchain/webhook/${chain}/${address}`);
    if (!res.ok) throw new SAIDError(`Webhook check failed`, res.status);
    return res.json();
  }

  /**
   * Remove a webhook registration.
   */
  async deleteWebhook(chain: string, address: string): Promise<void> {
    const res = await fetch(`${this.apiUrl}/xchain/webhook/${chain}/${address}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new SAIDError(`Webhook deletion failed`, res.status);
  }
}

// ── SACRS Scoring Engine ───────────────────────────────────────────────────
//
// SACRS (SAID Agent Credit Rating Score) maps SAID Protocol's unique
// on-chain trust data onto a FICO-compatible 300-850 scale.
//
// The model adapts insights from:
//   - LFG protocol (40% collateral reduction, 99.9% repayment)
//   - Byzantic (30% reduction for top 10%)
//   - RociFi (85% of users prefer higher LTV)
//   - Kojiru (FICO-scale 300-850 ACS on Base)
//
// SAID's unique advantage: staking/slashing data is unavailable to ANY
// competitor. A slashed agent = credit risk. A staked agent = lower risk.

function computeSACRS(
  agent: AgentVerification,
  stake: StakeInfo,
): SACRSResult {
  const now = Date.now();
  const flags: string[] = [];

  // ── Not registered → unrated ──
  if (!agent.registered) {
    return {
      wallet: agent.wallet,
      score: 300,
      rating: 'unrated',
      probabilityOfDefault: 1.0,
      factors: {
        paymentHistory: 0,
        utilization: 0,
        historyLength: 0,
        creditMix: 0,
        newCredit: 0,
        economicSecurity: 0,
      },
      flags: ['not_registered'],
      recommendedMaxBorrowUSDC: 0,
      recommendedLTV: 0,
      recommendedRatePremiumBps: 2000,
      summary: 'Unrated — agent not registered with SAID Protocol',
      scored: false,
      computedAt: new Date(now).toISOString(),
    };
  }

  // ── Factor 1: Payment History (35% of FICO) ──
  // Based on slashing record + feedback scores
  let paymentHistory = 100; // Start perfect, deduct for issues

  if (stake.slashedCount > 0) {
    flags.push('previously_slashed');
    // Each slash is a major derogatory mark
    paymentHistory -= Math.min(60, stake.slashedCount * 25);
  }

  const feedbackCount = agent.reputation?.feedbackCount ?? 0;
  const reputationScore = agent.reputation?.score ?? agent.trustScore?.score ?? 0;

  // Low reputation feedback = missed payments equivalent
  if (reputationScore > 0 && reputationScore < 40) {
    paymentHistory -= 30;
  } else if (reputationScore >= 40 && reputationScore < 60) {
    paymentHistory -= 15;
  }

  paymentHistory = Math.max(0, Math.min(100, paymentHistory));

  // ── Factor 2: Utilization (30% of FICO) ──
  // Stake-to-activity ratio. High stake relative to feedback count = good.
  const stakeSOL = stake.amountSOL;
  const utilization = Math.min(
    100,
    stakeSOL >= 5 ? 100 :
    stakeSOL >= 2 ? 85 :
    stakeSOL >= 1 ? 70 :
    stakeSOL >= 0.5 ? 50 :
    stakeSOL > 0 ? 25 :
    0,
  );

  if (stakeSOL === 0) flags.push('no_stake');

  // ── Factor 3: Length of History (15% of FICO) ──
  // Based on registration age (if available)
  let historyLength = 50; // Default for unknown age
  if (agent.registeredAt) {
    const ageMs = now - new Date(agent.registeredAt).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    historyLength = Math.min(100, Math.max(10, ageDays / 3)); // 300 days = 100
  }

  // ── Factor 4: Credit Mix (10% of FICO) ──
  // Diversity of on-chain interactions (feedback count as proxy)
  const creditMix = Math.min(
    100,
    feedbackCount >= 20 ? 100 :
    feedbackCount >= 10 ? 80 :
    feedbackCount >= 5 ? 60 :
    feedbackCount >= 1 ? 30 :
    0,
  );

  // ── Factor 5: New Credit (10% of FICO) ──
  // Recently registered = slightly riskier. Verified = better.
  let newCredit = 50;
  if (agent.verified) {
    newCredit = 80;
    if (stake.status === 'active') newCredit = 90;
  } else {
    flags.push('unverified');
    newCredit = 20;
  }

  // ── Factor 6: Economic Security (SAID-specific, weighted heavily) ──
  // This is SAID's moat — staking/slashing is unique signal
  let economicSecurity = 0;
  if (stakeSOL > 0 && stake.status === 'active') {
    economicSecurity += Math.min(50, stakeSOL * 10); // Up to 50 points from stake amount
  }
  if (stake.slashedCount === 0) economicSecurity += 30; // Clean record bonus
  if (agent.verified) economicSecurity += 20; // Verified bonus
  economicSecurity = Math.min(100, economicSecurity);

  // ── Weighted Score Computation ──
  // Adapted FICO weights + SAID economic security overlay
  const ficoBase =
    paymentHistory * 0.35 +
    utilization * 0.30 +
    historyLength * 0.15 +
    creditMix * 0.10 +
    newCredit * 0.10;

  // Blend: 70% FICO base + 30% SAID economic security
  // SAID's economic security is weighted heavily because it's the unique moat
  const blended = ficoBase * 0.70 + economicSecurity * 0.30;

  // Map 0-100 → 300-850 (FICO scale)
  const score = Math.round(300 + (blended / 100) * 550);

  // ── Rating Band ──
  const rating: SACRSRating =
    score >= 750 ? 'excellent' :
    score >= 700 ? 'very-good' :
    score >= 640 ? 'good' :
    score >= 580 ? 'fair' :
    score >= 500 ? 'poor' :
    'very-poor';

  // ── Probability of Default (logistic approximation) ──
  // Lower score = higher PD. Calibrated to match LFG/Byzantic findings.
  const pd = Math.min(0.99, Math.max(0.001, 1 / (1 + Math.exp((score - 600) / 80))));

  // ── DeFi Recommendations ──
  // Based on research: LFG achieved 40% collateral reduction at 99.9% repayment
  // Byzantic: 30% reduction for top 10%
  // RociFi: 85% prefer higher LTV
  const recommendedLTV =
    score >= 750 ? 85 :
    score >= 700 ? 75 :
    score >= 640 ? 65 :
    score >= 580 ? 50 :
    score >= 500 ? 35 :
    0;

  // Max borrow scales with stake (stake = skin in the game)
  const recommendedMaxBorrowUSDC = Math.round(
    Math.min(stakeSOL * 500, score >= 700 ? 50000 : score >= 640 ? 10000 : score >= 580 ? 1000 : 0),
  );

  // Rate premium: lower score = higher premium
  const recommendedRatePremiumBps =
    score >= 750 ? 0 :
    score >= 700 ? 50 :
    score >= 640 ? 150 :
    score >= 580 ? 400 :
    score >= 500 ? 800 :
    2000;

  // ── Summary ──
  const emoji = score >= 750 ? '🟢' : score >= 640 ? '🔵' : score >= 580 ? '🟡' : '🔴';
  const summary = `${emoji} SACRS ${score}/850 (${rating.replace('-', ' ')}) — PD: ${(pd * 100).toFixed(1)}%, LTV: ${recommendedLTV}%, Stake: ${stakeSOL.toFixed(2)} SOL${flags.length > 0 ? ', Flags: ' + flags.join(', ') : ''}`;

  return {
    wallet: agent.wallet,
    score,
    rating,
    probabilityOfDefault: Math.round(pd * 10000) / 10000,
    factors: {
      paymentHistory: Math.round(paymentHistory),
      utilization: Math.round(utilization),
      historyLength: Math.round(historyLength),
      creditMix: Math.round(creditMix),
      newCredit: Math.round(newCredit),
      economicSecurity: Math.round(economicSecurity),
    },
    flags,
    recommendedMaxBorrowUSDC,
    recommendedLTV,
    recommendedRatePremiumBps,
    summary,
    scored: true,
    computedAt: new Date(now).toISOString(),
  };
}

// ── Dual-Score Computation Engine (v0.12.0) ───────────────────────────────
//
// Inspired by AgentKarma's Provider Karma + Consumer Karma split.
// AgentKarma died ($0 revenue, archived June 2026) but their dual-score
// model was genuinely innovative. We steal the best ideas.
//
// Provider Trust: 'Will this agent DELIVER quality work?'
//   - Based on reputation scores, feedback from those who hired them,
//     verification status, and time registered.
//
// Consumer Trust: 'Will this agent PAY reliably?'
//   - Based on staking (skin in the game), slashing history,
//     and economic security signals unique to SAID.

function computeDualScore(
  agent: AgentVerification,
  stake: StakeInfo,
): DualScore {
  const now = Date.now();

  if (!agent.registered) {
    return {
      wallet: agent.wallet,
      provider: { score: 0, confidence: 'none', dataPoints: 0, signals: ['Not registered'] },
      consumer: { score: 0, confidence: 'none', dataPoints: 0, signals: ['Not registered'] },
      overall: 0,
      scored: false,
      computedAt: new Date(now).toISOString(),
    };
  }

  const score = agent.trustScore?.score ?? null;
  const feedbackCount = agent.reputation?.feedbackCount ?? 0;
  const verified = agent.verified;
  const stakeSOL = stake.amountSOL;
  const slashedCount = stake.slashedCount;

  // ── Provider Trust Score ──
  // 'Will this agent deliver quality work?'
  // Weighted toward feedback, reputation score, and verification.
  const providerSignals: string[] = [];
  let providerRaw = 0;
  let providerDataPoints = 0;

  // Verification contributes 25 points max
  if (verified) {
    providerRaw += 25;
    providerSignals.push('SAID-verified');
  }
  providerDataPoints += 1;

  // Trust score contributes 40 points max (scaled from 0-100)
  if (score !== null) {
    providerRaw += (score / 100) * 40;
    providerDataPoints += 1;
    if (score >= 70) providerSignals.push(`High reputation (${score}/100)`);
    else if (score < 30) providerSignals.push(`Low reputation (${score}/100)`);
  }

  // Feedback count contributes 20 points max (log scale)
  if (feedbackCount > 0) {
    const feedbackScore = Math.min(20, Math.log2(feedbackCount + 1) * 4);
    providerRaw += feedbackScore;
    providerDataPoints += 1;
    providerSignals.push(`${feedbackCount} feedback entries`);
  }

  // Registration age contributes 15 points max
  if (agent.registeredAt) {
    const ageDays = (now - new Date(agent.registeredAt).getTime()) / (1000 * 60 * 60 * 24);
    providerRaw += Math.min(15, ageDays / 20); // 300 days = 15 points
    providerDataPoints += 1;
    if (ageDays > 90) providerSignals.push(`Established (${Math.round(ageDays)}d)`);
  }

  const providerScore = Math.round(Math.min(100, providerRaw));
  const providerConfidence =
    providerDataPoints >= 4 ? 'high' :
    providerDataPoints >= 3 ? 'medium' :
    providerDataPoints >= 1 ? 'low' : 'none';

  // ── Consumer Trust Score ──
  // 'Will this agent pay reliably?'
  // Weighted toward staking, slashing history, and economic security.
  // This is SAID's unique advantage — no competitor has these signals.
  const consumerSignals: string[] = [];
  let consumerRaw = 0;
  let consumerDataPoints = 0;

  // Staking contributes up to 50 points (skin in the game)
  if (stakeSOL > 0 && (stake.status === 'active' || stake.status === 'none')) {
    const stakeScore = Math.min(50, stakeSOL * 10);
    consumerRaw += stakeScore;
    consumerDataPoints += 1;
    consumerSignals.push(`${stakeSOL.toFixed(2)} SOL staked`);
  } else {
    consumerSignals.push('No stake deposited');
  }

  // Clean slashing record contributes 25 points
  if (slashedCount === 0) {
    consumerRaw += 25;
    consumerDataPoints += 1;
    if (stakeSOL > 0) consumerSignals.push('No slashing history');
  } else {
    // Each slash removes 12 points
    consumerRaw -= Math.min(50, slashedCount * 12);
    consumerSignals.push(`${slashedCount} slash event(s)`);
  }
  consumerDataPoints += 1;

  // Verification contributes 15 points (verified agents are more accountable)
  if (verified) {
    consumerRaw += 15;
    consumerDataPoints += 1;
  }

  // Reputation score contributes 10 points (agents that deliver tend to pay)
  if (score !== null && score > 50) {
    consumerRaw += Math.min(10, (score - 50) / 5);
    consumerDataPoints += 1;
  }

  const consumerScore = Math.round(Math.max(0, Math.min(100, consumerRaw)));
  const consumerConfidence =
    consumerDataPoints >= 4 ? 'high' :
    consumerDataPoints >= 3 ? 'medium' :
    consumerDataPoints >= 1 ? 'low' : 'none';

  // ── Overall ──
  // Weighted blend: provider 45%, consumer 55%
  // Consumer weighted higher because economic enforcement is SAID's moat
  const overall = Math.round(providerScore * 0.45 + consumerScore * 0.55);

  return {
    wallet: agent.wallet,
    provider: {
      score: providerScore,
      confidence: providerConfidence,
      dataPoints: providerDataPoints,
      signals: providerSignals,
    },
    consumer: {
      score: consumerScore,
      confidence: consumerConfidence,
      dataPoints: consumerDataPoints,
      signals: consumerSignals,
    },
    overall,
    scored: true,
    computedAt: new Date(now).toISOString(),
  };
}

// ── Error ──────────────────────────────────────────────────────────────────

export class SAIDError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'SAIDError';
    this.status = status;
    this.details = details;
  }
}

// ── Policy Presets (v0.13.0) ──────────────────────────────────────────────
//
// Pre-configured TrustPolicy objects for common use cases.
// Research shows every major payment platform (Binance, Ledger, MetaMask)
// is building spend limits for agents — but STATIC. SAID's DYNAMIC presets
// adapt based on on-chain reputation, which is the unique advantage.

/**
 * Strict policy: only verified, high-score, staked agents.
 * Use for: high-value transactions, enterprise integrations, DeFi protocols.
 */
export const POLICY_STRICT: TrustPolicy = {
  minScore: 70,
  requireVerified: true,
  minStakeSOL: 0.5,
  requireActiveStake: true,
  maxRiskTier: 'low',
};

/**
 * Balanced policy: verified agents with decent scores.
 * Use for: B2B marketplaces, paid API calls, premium agent services.
 */
export const POLICY_BALANCED: TrustPolicy = {
  minScore: 50,
  requireVerified: true,
  maxRiskTier: 'moderate',
};

/**
 * Permissive policy: any registered agent, no minimum score.
 * Use for: social platforms, discovery, low-value transactions.
 */
export const POLICY_PERMISSIVE: TrustPolicy = {
  maxRiskTier: 'elevated',
};

/**
 * x402 payment policy: designed for x402 payment flows.
 * Requires registration + decent score, blocks high-risk agents.
 * Optimized for payment trust — the killer use case per research.
 */
export const POLICY_X402: TrustPolicy = {
  minScore: 40,
  requireVerified: false,
  maxRiskTier: 'moderate',
};

/**
 * DeFi protocol policy: for lending/borrowing/escrow.
 * Strictest stake requirements — skin in the game is mandatory.
 */
export const POLICY_DEFI: TrustPolicy = {
  minScore: 60,
  requireVerified: true,
  minStakeSOL: 1.0,
  requireActiveStake: true,
  maxRiskTier: 'low',
};

/**
 * All available policy presets keyed by name.
 * Use for runtime policy selection: `const policy = POLICIES[req.query.policy]`;
 */
export const POLICIES: Record<string, TrustPolicy> = {
  strict: POLICY_STRICT,
  balanced: POLICY_BALANCED,
  permissive: POLICY_PERMISSIVE,
  x402: POLICY_X402,
  defi: POLICY_DEFI,
};

// ── Trust Middleware (re-exported) ─────────────────────────────────────────

export {
  createTrustMiddleware,
  expressAdapter,
  honoAdapter,
} from './middleware.js';

export type {
  TrustMiddlewareOptions,
  TrustCheckResult,
  TrustMiddlewareFn,
  MiddlewareMode,
} from './middleware.js';

// ── Agent Card Builder (re-exported) ─────────────────────────────────────────

export {
  buildAgentCard,
  validateAgentCard,
  serveAgentCard,
  tierToBadge,
  diffAgentCards,
} from './agent-card.js';

export type {
  BuildAgentCardOptions,
  ValidationResult as CardValidationResult,
} from './agent-card.js';

// ── Webhook Signature Verification Helper ──────────────────────────────────

/**
 * Verify an incoming webhook signature (HMAC-SHA256).
 *
 * @example
 * ```ts
 * import { verifyWebhookSignature } from '@said-protocol/client';
 *
 * app.post('/webhook', (req) => {
 *   const signature = req.headers['x-said-signature'];
 *   const isValid = await verifyWebhookSignature(req.body, signature, webhookSecret);
 * });
 * ```
 */
export async function verifyWebhookSignature(
  body: string | object,
  signature: string,
  secret: string,
): Promise<boolean> {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);

  // Node.js environment
  if (typeof globalThis.process !== 'undefined') {
    const { createHmac } = await import('crypto');
    const expected = createHmac('sha256', secret).update(payload).digest('hex');
    return `sha256=${expected}` === signature;
  }

  // Browser/edge environment
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret) as any,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload) as any);
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `sha256=${expected}` === signature;
}

// ── React Hooks (Optional) ───────────────────────────────────────────────────
//
// Framework-free hooks factory. Works with React, Preact, or any framework
// that supports the useCallback/useEffect/useState pattern.
// Import { createSAIDHooks } only in client-side code.
//
// USAGE (Next.js / React):
//   'use client';
//   import { SAIDClient, createSAIDHooks } from '@said-protocol/client';
//   const hooks = createSAIDHooks(new SAIDClient());
//   const { data: agent, loading } = hooks.useAgent('WALLET');

export interface SAIDHooks {
  useAgent: (wallet: string | null) => { data: AgentVerification | null; loading: boolean; error: Error | null };
  useTrustScore: (wallet: string | null) => { data: TrustScoreBreakdown | null; loading: boolean; error: Error | null };
  useLeaderboard: () => { data: LeaderboardEntry[] | null; loading: boolean; error: Error | null };
  useProtocolStats: () => { data: ProtocolStats | null; loading: boolean; error: Error | null };
  useIsVerified: (wallet: string | null) => { data: boolean; loading: boolean };
}

/**
 * Create React-compatible hooks bound to a SAIDClient instance.
 *
 * NOTE: This function uses dynamic imports for React, so it won't
 * bloat your bundle if you're not using React. It throws at runtime
 * if React is not installed.
 *
 * @example
 * ```tsx
 * 'use client';
 * import { SAIDClient, createSAIDHooks } from '@said-protocol/client';
 *
 * const saidHooks = createSAIDHooks(new SAIDClient());
 *
 * function AgentCard({ wallet }: { wallet: string }) {
 *   const { data: agent, loading } = saidHooks.useAgent(wallet);
 *   if (loading) return <p>Loading...</p>;
 *   if (!agent?.verified) return <p>Unverified</p>;
 *   return <p>{agent.identity?.name} (Score: {agent.trustScore?.score})</p>;
 * }
 * ```
 */
export async function createSAIDHooks(client: SAIDClient): Promise<SAIDHooks> {
  // Lazy-load React — works in both ESM and CJS environments
  let react: any;
  try {
    react = await import('react');
  } catch {
    try {
      const { createRequire } = await import('module');
      const require = createRequire(import.meta.url);
      react = require('react');
    } catch {
      throw new Error(
        'createSAIDHooks requires React. Install it: npm install react',
      );
    }
  }

  const { useState, useEffect, useCallback } = react as {
    useState: <T>(initial: T) => [T, (v: T | ((prev: T) => T)) => void];
    useEffect: (fn: () => void | (() => void), deps: unknown[]) => void;
    useCallback: <T extends (...args: any[]) => any>(fn: T, deps: unknown[]) => T;
  };

  function useAsync<T>(
    fn: () => Promise<T>,
    deps: unknown[],
  ): { data: T | null; loading: boolean; error: Error | null } {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const run = useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fn();
        setData(result);
      } catch (e: any) {
        setError(e);
      } finally {
        setLoading(false);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);

    useEffect(() => {
      run();
    }, [run]);

    return { data, loading, error };
  }

  return {
    useAgent(wallet: string | null) {
      return useAsync(
        () => (wallet ? client.getAgent(wallet) : Promise.resolve(null as AgentVerification | null)),
        [wallet],
      );
    },

    useTrustScore(wallet: string | null) {
      return useAsync(
        () => (wallet ? client.getTrustScore(wallet) : Promise.resolve(null as TrustScoreBreakdown | null)),
        [wallet],
      );
    },

    useLeaderboard() {
      return useAsync(() => client.getLeaderboard(), []);
    },

    useProtocolStats() {
      return useAsync(() => client.getProtocolStats(), []);
    },

    useIsVerified(wallet: string | null) {
      const { data, loading } = useAsync(
        () => (wallet ? client.isVerified(wallet) : Promise.resolve(false)),
        [wallet],
      );
      return { data: data ?? false, loading };
    },
  };
}
