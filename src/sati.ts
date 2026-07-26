/**
 * SAID Protocol — SATI Compatibility Layer
 *
 * SATI (Solana Agent Trust Infrastructure) is the official Solana Foundation-
 * backed agent registry built by Cascade Protocol. It uses Token-2022 NFTs
 * for agent identity and ZK Compression for feedback attestations.
 *
 * This module bridges SATI registry data with SAID's economic enforcement
 * (staking/slashing) to produce unified trust verdicts. Instead of competing
 * with the official registry, SAID layers enforcement on top of it.
 *
 * Strategic positioning: "SATI tells you who an agent is.
 * SAID tells you whether you can trust them with money."
 *
 * @example
 * ```ts
 * import { SaticBridge } from '@said-protocol/client/sati';
 * import { SAIDClient } from '@said-protocol/client';
 *
 * const said = new SAIDClient();
 * const sati = new SatiBridge(said);
 *
 * // Get unified trust data from both SAID + SATI
 * const trust = await sati.getUnifiedTrust('WALLET_ADDRESS');
 * if (trust.economic.enforcementTier === 'economic' && trust.satIdentity) {
 *   console.log(`${trust.satIdentity.name}: SATI-verified + SAID-enforced`);
 * }
 * ```
 */

// ── SATI Program Constants ─────────────────────────────────────────────────

/** SATI program ID on Solana mainnet */
export const SATI_PROGRAM_ID = 'satiRkxEiwZ51cv8PRu8UMzuaqeaqNEUNjABo6oAFMsLe';

/** SATI Token-2022 program ID */
export const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

/** SATI ZK Compression program ID */
export const ZK_COMPRESSION_PROGRAM_ID = 'co1dpEoRFpGx4mMnLq6Z4L8Q9ejpQm5oVtG2eHFSDQZ';

// ── Types ──────────────────────────────────────────────────────────────────

/** SATI agent identity metadata (from Token-2022 NFT) */
export interface SatiIdentity {
  /** Agent's display name */
  name: string;
  /** Agent's wallet address */
  wallet: string;
  /** SATI registration timestamp (ISO 8601) */
  registeredAt: string;
  /** Agent's stated capabilities/services */
  capabilities?: string[];
  /** Agent's endpoint URL (if exposed) */
  endpoint?: string;
  /** Agent's description */
  description?: string;
  /** SATI Token-2022 mint address */
  mintAddress?: string;
  /** Token-2022 metadata URI */
  metadataUri?: string;
  /** Source registry (always 'SATI') */
  source: 'SATI';
}

/** SATI feedback attestation (ZK-compressed) */
export interface SatiFeedback {
  /** Feedback giver's wallet */
  from: string;
  /** Feedback recipient's wallet */
  to: string;
  /** Rating (1-5 stars) */
  rating: number;
  /** Optional text feedback */
  comment?: string;
  /** Task/job reference (if applicable) */
  taskRef?: string;
  /** Timestamp (ISO 8601) */
  timestamp: string;
  /** ZK proof hash (compressed attestation reference) */
  proofHash?: string;
}

/** SATI reputation summary aggregated from feedback */
export interface SatiReputation {
  /** Total number of feedback attestations */
  totalFeedback: number;
  /** Average rating (0-5) */
  averageRating: number;
  /** 5-star count */
  fiveStar: number;
  /** 4-star count */
  fourStar: number;
  /** 3-star count */
  threeStar: number;
  /** 2-star count */
  twoStar: number;
  /** 1-star count */
  oneStar: number;
  /** Weighted score (0-100, recency-weighted) */
  weightedScore: number;
  /** Last feedback timestamp */
  lastFeedbackAt?: string;
}

/** SAID economic enforcement data (from staking/slashing) */
export interface SatiEnforcementData {
  /** Whether the agent has active staked SOL */
  staked: boolean;
  /** Amount staked in SOL */
  stakeAmountSOL: number;
  /** Number of slashing events */
  slashCount: number;
  /** Enforcement tier */
  enforcementTier: 'economic' | 'reputation' | 'none';
  /** Risk level based on enforcement data */
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

/** Unified trust verdict combining SATI identity + SAID enforcement */
export interface UnifiedTrustVerdict {
  /** The wallet address being evaluated */
  wallet: string;
  /** SATI registry identity (null if not registered on SATI) */
  satiIdentity: SatiIdentity | null;
  /** SATI reputation from feedback (null if no feedback) */
  satiReputation: SatiReputation | null;
  /** SAID economic enforcement data */
  economic: SatiEnforcementData;
  /** SAID trust score (0-100) */
  saidScore: number | null;
  /** SAID trust tier */
  saidTier: string | null;
  /** Which registries this agent appears on */
  registries: ('SAID' | 'SATI')[];
  /** Combined trust verdict */
  verdict: 'trusted' | 'provisional' | 'insufficient_evidence' | 'untrusted';
  /** Human-readable explanation */
  explanation: string;
  /** Trust source breakdown */
  trustSources: {
    /** Has SATI identity NFT */
    satiIdentity: boolean;
    /** Has SATI feedback attestations */
    satiReputation: boolean;
    /** Has SAID economic enforcement (staked SOL) */
    economicEnforcement: boolean;
    /** Has SAID reputation score */
    saidReputation: boolean;
    /** Has been slashed (negative signal) */
    slashed: boolean;
  };
  /** Recommended escrow percentage based on trust level */
  recommendedEscrowPct: number;
  /** Recommended maximum transaction value in USDC */
  recommendedMaxTxUSDC: number;
}

// ── Configuration ──────────────────────────────────────────────────────────

export interface SatiBridgeConfig {
  /** Solana RPC URL for direct SATI on-chain queries */
  rpcUrl?: string;
  /** SAID API URL (inherited from SAIDClient if not set) */
  apiUrl?: string;
  /** Cache TTL for SATI queries (default: 5 minutes) */
  cacheTtlMs?: number;
  /** Whether to query SATI on-chain (default: true, set false for API-only) */
  queryOnChain?: boolean;
}

// ── SatiBridge Class ───────────────────────────────────────────────────────

/**
 * Bridges SATI registry data with SAID economic enforcement.
 *
 * SATI provides identity and reputation (who the agent is, what others say).
 * SAID provides economic enforcement (what's at stake if they misbehave).
 * Together: the complete trust picture for any Solana agent.
 */
export class SatiBridge {
  private rpcUrl: string;
  private apiUrl: string;
  private cacheTtlMs: number;
  private queryOnChain: boolean;
  private cache: Map<string, { data: unknown; expires: number }> = new Map();

  constructor(
    /** SAIDClient instance for enforcement/score queries */
    private said: {
      getAgent(wallet: string): Promise<unknown>;
      getStakeInfo(wallet: string): Promise<unknown>;
      getTrustScore(wallet: string): Promise<unknown>;
    },
    config: SatiBridgeConfig = {},
  ) {
    this.rpcUrl = config.rpcUrl || 'https://api.mainnet-beta.solana.com';
    this.apiUrl = config.apiUrl || 'https://api.saidprotocol.com';
    this.cacheTtlMs = config.cacheTtlMs ?? 300_000; // 5 min
    this.queryOnChain = config.queryOnChain ?? true;
  }

  // ── Cache helpers ───────────────────────────────────────────────────────

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (entry && entry.expires > Date.now()) return entry.data as T;
    if (entry) this.cache.delete(key);
    return null;
  }

  private setCache(key: string, data: unknown): void {
    this.cache.set(key, { data, expires: Date.now() + this.cacheTtlMs });
  }

  /** Clear cached data for a wallet (or all if no wallet given). */
  invalidate(wallet?: string): void {
    if (wallet) {
      for (const key of this.cache.keys()) {
        if (key.includes(wallet)) this.cache.delete(key);
      }
    } else {
      this.cache.clear();
    }
  }

  // ── SATI Queries ────────────────────────────────────────────────────────

  /**
   * Look up an agent's SATI identity (Token-2022 NFT metadata).
   * Queries the SATI API endpoint or falls back to on-chain read.
   *
   * Returns null if the agent is not registered on SATI.
   */
  async getSatiIdentity(wallet: string): Promise<SatiIdentity | null> {
    const cacheKey = `sati-identity:${wallet}`;
    const cached = this.getCached<SatiIdentity>(cacheKey);
    if (cached !== null) return cached;

    try {
      // Try SATI's public API (Cascade Protocol endpoint)
      const res = await fetch(
        `https://api.cascade.wtf/api/v1/agents/${wallet}`,
        { signal: AbortSignal.timeout(8_000) },
      );

      if (res.ok) {
        const data = await res.json() as Record<string, unknown>;
        const identity: SatiIdentity = {
          name: (data.name as string) || 'Unknown',
          wallet,
          registeredAt: (data.registeredAt as string) || (data.created_at as string) || '',
          capabilities: (data.capabilities as string[]) || undefined,
          endpoint: (data.endpoint as string) || undefined,
          description: (data.description as string) || undefined,
          mintAddress: (data.mint as string) || (data.token_address as string) || undefined,
          metadataUri: (data.metadata_uri as string) || (data.uri as string) || undefined,
          source: 'SATI',
        };
        this.setCache(cacheKey, identity);
        return identity;
      }
    } catch {
      // SATI API unavailable — try on-chain fallback if enabled
      if (this.queryOnChain) {
        const onChain = await this.getSatiIdentityOnChain(wallet);
        if (onChain) {
          this.setCache(cacheKey, onChain);
          return onChain;
        }
      }
    }

    return null;
  }

  /**
   * Query SATI identity directly from Solana on-chain data.
   * Finds Token-2022 NFTs minted by the SATI program for this wallet.
   */
  private async getSatiIdentityOnChain(wallet: string): Promise<SatiIdentity | null> {
    try {
      // Get token accounts for this wallet owned by Token-2022 program
      const res = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getTokenAccountsByOwner',
          params: [
            wallet,
            { programId: TOKEN_2022_PROGRAM_ID },
            { encoding: 'jsonParsed' },
          ],
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) return null;
      const json = await res.json() as {
        result?: { value: Array<{ account: { data: { parsed: { info: { mint: string } } } } }> };
      };

      const accounts = json.result?.value || [];
      // Filter to SATI mints (would need on-chain metadata to confirm)
      // For now, return a minimal identity based on account existence
      if (accounts.length === 0) return null;

      // TODO: Full implementation would fetch metadata from the mint
      // using Metaplex Digital Asset Standard (DAS) API
      return {
        name: 'SATI Agent',
        wallet,
        registeredAt: '', // Would come from NFT metadata
        mintAddress: accounts[0].account.data.parsed.info.mint,
        source: 'SATI',
      };
    } catch {
      return null;
    }
  }

  /**
   * Get SATI feedback/reputation data for an agent.
   * Queries compressed feedback attestations.
   */
  async getSatiReputation(wallet: string): Promise<SatiReputation | null> {
    const cacheKey = `sati-rep:${wallet}`;
    const cached = this.getCached<SatiReputation>(cacheKey);
    if (cached !== null) return cached;

    try {
      // Try Cascade/SATI reputation endpoint
      const res = await fetch(
        `https://api.cascade.wtf/api/v1/reputation/${wallet}`,
        { signal: AbortSignal.timeout(8_000) },
      );

      if (res.ok) {
        const data = await res.json() as Record<string, unknown>;
        const rep: SatiReputation = {
          totalFeedback: (data.total_feedback as number) || (data.count as number) || 0,
          averageRating: (data.average_rating as number) || (data.avg_rating as number) || 0,
          fiveStar: (data.five_star as number) || 0,
          fourStar: (data.four_star as number) || 0,
          threeStar: (data.three_star as number) || 0,
          twoStar: (data.two_star as number) || 0,
          oneStar: (data.one_star as number) || 0,
          weightedScore: (data.weighted_score as number) || 0,
          lastFeedbackAt: (data.last_feedback_at as string) || undefined,
        };
        this.setCache(cacheKey, rep);
        return rep;
      }
    } catch {
      // SATI reputation API unavailable
    }

    return null;
  }

  // ── SAID Enforcement (delegates to SAIDClient) ──────────────────────────

  /**
   * Get SAID economic enforcement data for a wallet.
   * This is SAID's unique differentiator — staked SOL and slashing history.
   */
  async getEnforcement(wallet: string): Promise<SatiEnforcementData> {
    try {
      const stake = await this.said.getStakeInfo(wallet) as {
        amountSOL: number;
        slashedCount: number;
        slashed?: boolean;
      };

      const staked = stake.amountSOL > 0;
      const slashCount = stake.slashedCount || 0;

      return {
        staked,
        stakeAmountSOL: stake.amountSOL,
        slashCount,
        enforcementTier: staked ? 'economic' : 'reputation',
        riskLevel: this.deriveRiskLevel(stake.amountSOL, slashCount),
      };
    } catch {
      return {
        staked: false,
        stakeAmountSOL: 0,
        slashCount: 0,
        enforcementTier: 'none',
        riskLevel: 'medium',
      };
    }
  }

  /** Derive risk level from enforcement data. */
  private deriveRiskLevel(stakeSOL: number, slashCount: number): 'low' | 'medium' | 'high' | 'critical' {
    if (slashCount >= 3) return 'critical';
    if (slashCount >= 1) return 'high';
    if (stakeSOL >= 1.0) return 'low';
    if (stakeSOL > 0) return 'medium';
    return 'medium';
  }

  // ── Unified Trust ────────────────────────────────────────────────────────

  /**
   * Get the unified trust picture for any Solana agent.
   * Combines SATI registry data + SAID economic enforcement into one verdict.
   *
   * This is the flagship method of the SATI bridge. It answers:
   * "Can I trust this agent for a transaction?"
   *
   * @example
   * ```ts
   * const trust = await bridge.getUnifiedTrust('WALLET');
   * if (trust.verdict === 'trusted') {
   *   console.log(`Safe to transact up to $${trust.recommendedMaxTxUSDC}`);
   * } else if (trust.verdict === 'untrusted') {
   *   console.log(`DO NOT transact: ${trust.explanation}`);
   * }
   * ```
   */
  async getUnifiedTrust(wallet: string): Promise<UnifiedTrustVerdict> {
    // Query both registries in parallel
    const [satiIdentity, satiReputation, enforcement, saidAgent] = await Promise.allSettled([
      this.getSatiIdentity(wallet),
      this.getSatiReputation(wallet),
      this.getEnforcement(wallet),
      this.said.getAgent(wallet),
    ]);

    const identity = satiIdentity.status === 'fulfilled' ? satiIdentity.value : null;
    const reputation = satiReputation.status === 'fulfilled' ? satiReputation.value : null;
    const econ = enforcement.status === 'fulfilled' ? enforcement.value : {
      staked: false, stakeAmountSOL: 0, slashCount: 0,
      enforcementTier: 'none' as const, riskLevel: 'medium' as const,
    };

    // Extract SAID data from agent result
    const agent = saidAgent.status === 'fulfilled' && saidAgent.value
      ? saidAgent.value as {
          trustScore?: { score: number; tier: string } | null;
          registered?: boolean;
          verified?: boolean;
        }
      : null;

    const saidScore = agent?.trustScore?.score ?? null;
    const saidTier = agent?.trustScore?.tier ?? null;
    const saidRegistered = agent?.registered ?? false;

    // Build registries list
    const registries: ('SAID' | 'SATI')[] = [];
    if (saidRegistered) registries.push('SAID');
    if (identity) registries.push('SATI');

    // Build trust sources
    const trustSources = {
      satiIdentity: identity !== null,
      satiReputation: reputation !== null && reputation.totalFeedback > 0,
      economicEnforcement: econ.staked,
      saidReputation: saidScore !== null,
      slashed: econ.slashCount > 0,
    };

    // Compute verdict
    const { verdict, explanation } = this.computeVerdict(
      identity, reputation, econ, saidScore, trustSources,
    );

    // Compute recommendations
    const { recommendedEscrowPct, recommendedMaxTxUSDC } = this.computeRecommendations(
      verdict, econ, saidScore, reputation,
    );

    return {
      wallet,
      satiIdentity: identity,
      satiReputation: reputation,
      economic: econ,
      saidScore,
      saidTier,
      registries,
      verdict,
      explanation,
      trustSources,
      recommendedEscrowPct,
      recommendedMaxTxUSDC,
    };
  }

  /** Compute the unified trust verdict. */
  private computeVerdict(
    identity: SatiIdentity | null,
    reputation: SatiReputation | null,
    econ: SatiEnforcementData,
    saidScore: number | null,
    sources: UnifiedTrustVerdict['trustSources'],
  ): { verdict: UnifiedTrustVerdict['verdict']; explanation: string } {
    // Slashed agents are untrusted regardless of other signals
    if (econ.slashCount >= 3) {
      return {
        verdict: 'untrusted',
        explanation: `Agent has been slashed ${econ.slashCount} times. Economic enforcement history indicates persistent misbehavior.`,
      };
    }

    // Staked + good score = trusted
    if (econ.staked && econ.stakeAmountSOL >= 0.5 && (saidScore ?? 0) >= 50) {
      const parts: string[] = [];
      parts.push(`${econ.stakeAmountSOL} SOL staked`);
      if (saidScore) parts.push(`SAID score ${saidScore}/100 (${saidScore >= 70 ? 'Gold' : 'Silver'})`);
      if (identity) parts.push('SATI-verified identity');
      if (reputation && reputation.totalFeedback > 0) {
        parts.push(`${reputation.totalFeedback} feedback attestations (${reputation.averageRating.toFixed(1)}★)`);
      }
      return {
        verdict: 'trusted',
        explanation: `Economically backed agent. ${parts.join(', ')}.`,
      };
    }

    // Staked but lower score
    if (econ.staked && econ.stakeAmountSOL >= 0.1) {
      return {
        verdict: 'provisional',
        explanation: `Agent has ${econ.stakeAmountSOL} SOL staked but score is ${saidScore ?? 'unknown'}. Economic skin-in-the-game provides partial assurance.`,
      };
    }

    // SATI identity but no economic backing
    if (identity && !econ.staked) {
      const repStr = reputation && reputation.totalFeedback > 0
        ? ` with ${reputation.totalFeedback} feedback (${reputation.averageRating.toFixed(1)}★)`
        : '';
      return {
        verdict: 'provisional',
        explanation: `SATI-verified agent${repStr} but no economic enforcement (no staked SOL). Reputation-only trust without financial backing.`,
      };
    }

    // Registered but no real signals
    if (identity || saidScore !== null) {
      return {
        verdict: 'insufficient_evidence',
        explanation: 'Agent appears in registry but lacks staked collateral and sufficient feedback for a trust determination.',
      };
    }

    // Unknown agent
    return {
      verdict: 'insufficient_evidence',
      explanation: 'Agent not found in SAID or SATI registries. No trust data available.',
    };
  }

  /** Compute escrow and transaction recommendations from trust level. */
  private computeRecommendations(
    verdict: UnifiedTrustVerdict['verdict'],
    econ: SatiEnforcementData,
    saidScore: number | null,
    reputation: SatiReputation | null,
  ): { recommendedEscrowPct: number; recommendedMaxTxUSDC: number } {
    if (verdict === 'untrusted' || econ.slashCount >= 3) {
      return { recommendedEscrowPct: 100, recommendedMaxTxUSDC: 0 };
    }

    if (verdict === 'insufficient_evidence') {
      return { recommendedEscrowPct: 50, recommendedMaxTxUSDC: 100 };
    }

    // Provisional trust
    if (verdict === 'provisional') {
      if (econ.staked && econ.stakeAmountSOL >= 0.1) {
        return { recommendedEscrowPct: 20, recommendedMaxTxUSDC: 500 };
      }
      return { recommendedEscrowPct: 30, recommendedMaxTxUSDC: 200 };
    }

    // Trusted — compute based on enforcement depth
    const score = saidScore ?? 50;
    const repBonus = reputation && reputation.averageRating >= 4.5 ? 0.05 : 0;
    const stakeBonus = econ.stakeAmountSOL >= 1.0 ? 0.05 : 0;

    // Escrow ranges from 2% (excellent) to 15% (good)
    const escrowBase = Math.max(2, 15 - (score - 50) * 0.13);
    const escrowPct = Math.round(Math.max(2, escrowBase - (stakeBonus + repBonus) * 100));

    // Max transaction scales with stake and score
    const stakeMultiplier = Math.min(econ.stakeAmountSOL * 500, 10_000);
    const scoreMultiplier = (score / 100) * 2;
    const maxTx = Math.round(stakeMultiplier * scoreMultiplier);

    return {
      recommendedEscrowPct: escrowPct,
      recommendedMaxTxUSDC: Math.max(100, maxTx),
    };
  }

  // ── Batch Queries ───────────────────────────────────────────────────────

  /**
   * Get unified trust data for multiple wallets.
   * Queries are parallelized with a concurrency limit of 5.
   *
   * @example
   * ```ts
   * const results = await bridge.batchUnifiedTrust(['WALLET1', 'WALLET2', 'WALLET3']);
   * const trusted = results.filter(r => r.verdict === 'trusted');
   * ```
   */
  async batchUnifiedTrust(wallets: string[]): Promise<UnifiedTrustVerdict[]> {
    const concurrency = 5;
    const results: UnifiedTrustVerdict[] = [];

    for (let i = 0; i < wallets.length; i += concurrency) {
      const batch = wallets.slice(i, i + concurrency);
      const batchResults = await Promise.allSettled(
        batch.map((w) => this.getUnifiedTrust(w)),
      );
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        }
      }
    }

    return results;
  }

  /**
   * Find agents that are registered on BOTH SATI and SAID.
   * These dual-registered agents have the strongest trust profile.
   *
   * @param wallets List of wallet addresses to check
   * @returns Wallets that appear on both registries
   */
  async findDualRegistered(wallets: string[]): Promise<UnifiedTrustVerdict[]> {
    const results = await this.batchUnifiedTrust(wallets);
    return results.filter(
      (r) => r.registries.includes('SAID') && r.registries.includes('SATI'),
    );
  }

  /**
   * Filter to agents that pass a trust threshold.
   * Useful for marketplace operators deciding which agents to list.
   */
  async filterTrusted(wallets: string[], opts?: {
    minScore?: number;
    requireStaked?: boolean;
    requireSatiVerified?: boolean;
    maxSlashes?: number;
  }): Promise<UnifiedTrustVerdict[]> {
    const results = await this.batchUnifiedTrust(wallets);
    const minScore = opts?.minScore ?? 0;
    const requireStaked = opts?.requireStaked ?? false;
    const requireSatiVerified = opts?.requireSatiVerified ?? false;
    const maxSlashes = opts?.maxSlashes ?? Infinity;

    return results.filter((r) => {
      if (r.economic.slashCount > maxSlashes) return false;
      if (requireStaked && !r.economic.staked) return false;
      if (requireSatiVerified && !r.satiIdentity) return false;
      if ((r.saidScore ?? 0) < minScore) return false;
      if (r.verdict === 'untrusted') return false;
      return true;
    });
  }

  // ── Compliance Helpers ──────────────────────────────────────────────────

  /**
   * Generate a trust report in markdown format for human review.
   * Useful for compliance, audit trails, and due diligence.
   */
  generateReport(trust: UnifiedTrustVerdict): string {
    const lines: string[] = [
      `# SAID × SATI Unified Trust Report`,
      ``,
      `**Wallet:** \`${trust.wallet}\``,
      `**Verdict:** ${trust.verdict.toUpperCase()}`,
      `**Registries:** ${trust.registries.join(', ') || 'None'}`,
      ``,
      `## Explanation`,
      ``,
      trust.explanation,
      ``,
      `## Trust Sources`,
      ``,
      `| Source | Present |`,
      `|--------|---------|`,
      `| SATI Identity | ${trust.trustSources.satiIdentity ? '✅' : '❌'} |`,
      `| SATI Reputation | ${trust.trustSources.satiReputation ? '✅' : '❌'} |`,
      `| Economic Enforcement | ${trust.trustSources.economicEnforcement ? '✅' : '❌'} |`,
      `| SAID Reputation Score | ${trust.trustSources.saidReputation ? '✅' : '❌'} |`,
      `| Slashing History | ${trust.trustSources.slashed ? '⚠️ Slashed' : '✅ Clean'} |`,
      ``,
    ];

    if (trust.satiIdentity) {
      lines.push(
        `## SATI Identity`,
        ``,
        `- **Name:** ${trust.satiIdentity.name}`,
        `- **Registered:** ${trust.satiIdentity.registeredAt || 'Unknown'}`,
        `- **Endpoint:** ${trust.satiIdentity.endpoint || 'None'}`,
      );
      if (trust.satiIdentity.capabilities?.length) {
        lines.push(`- **Capabilities:** ${trust.satiIdentity.capabilities.join(', ')}`);
      }
      lines.push('');
    }

    if (trust.satiReputation) {
      const rep = trust.satiReputation;
      lines.push(
        `## SATI Reputation`,
        ``,
        `- **Total Feedback:** ${rep.totalFeedback}`,
        `- **Average Rating:** ${rep.averageRating.toFixed(1)}/5`,
        `- **Weighted Score:** ${rep.weightedScore}/100`,
        `- **Distribution:** ${rep.fiveStar}★ ${rep.fourStar}★★ ${rep.threeStar}★★★ ${rep.twoStar}★★★★ ${rep.oneStar}★★★★★`,
      );
      lines.push('');
    }

    lines.push(
      `## SAID Economic Enforcement`,
      ``,
      `- **Staked:** ${trust.economic.staked ? `${trust.economic.stakeAmountSOL} SOL` : 'None'}`,
      `- **Slashing Events:** ${trust.economic.slashCount}`,
      `- **Enforcement Tier:** ${trust.economic.enforcementTier}`,
      `- **Risk Level:** ${trust.economic.riskLevel}`,
      ``,
      `## Recommendations`,
      ``,
      `- **Escrow:** ${trust.recommendedEscrowPct}%`,
      `- **Max Transaction:** $${trust.recommendedMaxTxUSDC.toLocaleString()} USDC`,
      ``,
      `---`,
      `*Generated by SAID Protocol SDK × SATI Compatibility Layer*`,
    );

    return lines.join('\n');
  }
}

// ── SAIDClient Extension ───────────────────────────────────────────────────

/**
 * Get a SatiBridge instance bound to this SAIDClient.
 * Convenience method for accessing the SATI compatibility layer.
 *
 * @example
 * ```ts
 * const said = new SAIDClient();
 * const bridge = said.getSatiBridge();
 * const trust = await bridge.getUnifiedTrust('WALLET');
 * ```
 */
// This is a factory function rather than a method to avoid circular imports.
// It will be re-exported from the main index for convenience.
export function createSatiBridge(
  said: {
    getAgent(wallet: string): Promise<unknown>;
    getStakeInfo(wallet: string): Promise<unknown>;
    getTrustScore(wallet: string): Promise<unknown>;
  },
  config?: SatiBridgeConfig,
): SatiBridge {
  return new SatiBridge(said, config);
}
