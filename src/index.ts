/**
 * SAID Protocol Client SDK v0.8.0
 * Agent identity, reputation, staking, and cross-chain messaging on Solana
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
