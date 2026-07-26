/**
 * SAID Protocol — Enforcement Oracle for x402 Payment Flows
 *
 * The #1 product from the 90-Day Build Priority research (July 2026).
 *
 * Sits in x402 payment flows and enforces SAID staking/slashing conditions
 * BEFORE settlement. Every x402 marketplace needs trust enforcement —
 * SAID is the only protocol with on-chain economic enforcement for agents.
 *
 * The flow:
 *   1. Agent A wants to pay Agent B via x402
 *   2. x402 facilitator checks with SAID Enforcement Oracle
 *   3. Oracle returns: stake status, slashing history, risk score, escrow recommendation
 *   4. If agent is slashed/high-risk: payment blocked or escrow enforced
 *   5. If agent is staked/clean: payment proceeds normally
 *
 * Revenue model: $0.01 per enforcement check via x402 pay-per-query.
 * At 165M monthly x402 transactions, capturing 0.1% = 165K checks/month = $1,650/month.
 *
 * @example Deploy as middleware in an Express/Hono app
 * ```ts
 * import { SAIDClient } from '@said-protocol/client';
 * import { EnforcementOracle } from '@said-protocol/client/enforcement-oracle';
 *
 * const said = new SAIDClient();
 * const oracle = new EnforcementOracle(said);
 *
 * // Check before allowing payment
 * app.post('/x402/check', async (req, res) => {
 *   const result = await oracle.enforce(req.body.wallet);
 *   if (result.action === 'block') {
 *     return res.status(403).json(result);
 *   }
 *   res.json(result);
 * });
 * ```
 *
 * @example Use as a fetch wrapper for agent clients
 * ```ts
 * const enforcedFetch = oracle.wrapFetch(fetch);
 * const res = await enforcedFetch('https://api.example.com/data');
 * // If endpoint wallet is untrusted, request is blocked before payment
 * ```
 */

import type { SAIDClient, RiskAssessment, StakeInfo, TrustPolicy } from './index.js';
import { POLICY_X402 } from './index.js';

// ── Types ───────────────────────────────────────────────────────────────────

/**
 * Enforcement action returned by the oracle.
 * - `allow`: Payment proceeds normally
 * - `require_escrow`: Payment must go through escrow with specified terms
 * - `block`: Payment blocked — agent is too risky
 */
export type EnforcementAction = 'allow' | 'require_escrow' | 'block';

/**
 * The enforcement verdict combining all signals.
 */
export interface EnforcementVerdict {
  /** The wallet that was checked */
  wallet: string;
  /** Recommended action */
  action: EnforcementAction;
  /** Whether the agent is registered with SAID */
  registered: boolean;
  /** Whether the agent is verified */
  verified: boolean;
  /** Trust score (0-100), null if unknown */
  trustScore: number | null;
  /** Risk tier from SAID risk assessment */
  riskTier: string;
  /** Stake amount in SOL */
  stakeSOL: number;
  /** Whether stake is active */
  stakeActive: boolean;
  /** Number of slashing events */
  slashCount: number;
  /** Economic security level */
  economicSecurity: 'none' | 'minimal' | 'moderate' | 'strong' | 'whale';
  /** Recommended escrow percentage (0-100) if action is require_escrow */
  escrowPct: number;
  /** Recommended max transaction value in USDC */
  maxTxValueUSDC: number | null;
  /** Risk factors identified */
  riskFactors: string[];
  /** Positive signals */
  positiveSignals: string[];
  /** Human-readable summary */
  summary: string;
  /** Whether this response should be cached */
  cacheable: boolean;
  /** Recommended cache duration in seconds */
  cacheTtlSec: number;
  /** Timestamp */
  timestamp: string;
}

/**
 * Configuration for the Enforcement Oracle.
 */
export interface EnforcementOracleConfig {
  /**
   * Trust policy for enforcement decisions.
   * Default: POLICY_X402 (minScore 40, maxRiskTier moderate).
   * Set stricter for high-value flows.
   */
  policy?: TrustPolicy;

  /**
   * Minimum stake (SOL) required for 'allow' without escrow.
   * Default: 0.5 SOL. Agents below this must use escrow.
   */
  minStakeForAllowSOL?: number;

  /**
   * Maximum slash count before automatic block.
   * Default: 3. Agents with 3+ slashes are always blocked.
   */
  maxSlashesBeforeBlock?: number;

  /**
   * Whether to block unregistered agents entirely.
   * Default: false (they get 'require_escrow' instead).
   */
  blockUnregistered?: boolean;

  /**
   * Cache TTL for enforcement results (ms).
   * Default: 15000 (15s). Set to 0 to disable.
   */
  cacheTtlMs?: number;

  /**
   * Whether to include SACRS credit score in the verdict.
   * Default: false (adds latency). Enable for DeFi use cases.
   */
  includeCreditScore?: boolean;
}

/**
 * Result of checking a payment before settlement.
 */
export interface PaymentCheckResult {
  /** Whether the payment should proceed */
  proceed: boolean;
  /** Enforcement verdict for the payer */
  payerVerdict: EnforcementVerdict;
  /** Enforcement verdict for the payee (if checked) */
  payeeVerdict: EnforcementVerdict | null;
  /** Whether escrow is required for this transaction */
  escrowRequired: boolean;
  /** Escrow percentage if required */
  escrowPct: number;
  /** Overall recommendation */
  recommendation: string;
}

// ── Cache ───────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

// ── Enforcement Oracle ──────────────────────────────────────────────────────

/**
 * SAID Enforcement Oracle for x402 payment flows.
 *
 * Wraps SAIDClient's trust checking + staking/slashing data into a
 * deployable enforcement middleware. Designed to sit between x402
 * payment initiation and settlement.
 *
 * Key insight from research: SAID cannot compete on infrastructure layers
 * that are commoditizing (identity, payments, disputes). SAID's only path
 * to relevance is being the ENFORCEMENT ORACLE for the agent commerce stack.
 * Every x402 marketplace needs trust enforcement — SAID is the only one
 * with on-chain staking/slashing.
 */
export class EnforcementOracle {
  private client: SAIDClient;
  private policy: TrustPolicy;
  private minStakeForAllowSOL: number;
  private maxSlashesBeforeBlock: number;
  private blockUnregistered: boolean;
  private includeCreditScore: boolean;
  private cache: Map<string, CacheEntry<EnforcementVerdict>>;
  private cacheTtlMs: number;

  constructor(client: SAIDClient, config: EnforcementOracleConfig = {}) {
    this.client = client;
    this.policy = config.policy ?? POLICY_X402;
    this.minStakeForAllowSOL = config.minStakeForAllowSOL ?? 0.5;
    this.maxSlashesBeforeBlock = config.maxSlashesBeforeBlock ?? 3;
    this.blockUnregistered = config.blockUnregistered ?? false;
    this.includeCreditScore = config.includeCreditScore ?? false;
    this.cache = new Map();
    this.cacheTtlMs = config.cacheTtlMs ?? 15_000;
  }

  /**
   * Core enforcement check. Evaluates an agent's on-chain trust signals
   * and returns an enforcement verdict.
   *
   * This is the primary method — call it before allowing an x402 payment
   * to proceed.
   *
   * @example
   * ```ts
   * const verdict = await oracle.enforce('AGENT_WALLET');
   * if (verdict.action === 'block') {
   *   throw new Error(`Payment blocked: ${verdict.summary}`);
   * } else if (verdict.action === 'require_escrow') {
   *   await setupEscrow(verdict.escrowPct);
   * }
   * // Proceed with payment...
   * ```
   */
  async enforce(wallet: string): Promise<EnforcementVerdict> {
    // Check cache
    const cacheKey = `enforce:${wallet}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    // Fetch all signals in parallel
    const [agent, stake] = await Promise.all([
      this.client.getAgent(wallet),
      this.client.getStakeInfo(wallet).catch(() => ({
        amountSOL: 0,
        status: 'none' as const,
        slashedCount: 0,
      }) as StakeInfo),
    ]);

    const score = agent.trustScore?.score ?? null;
    const registered = agent.registered;
    const verified = agent.verified;
    const stakeSOL = stake.amountSOL;
    const stakeActive = stake.status === 'active';
    const slashCount = stake.slashedCount;

    // ── Determine economic security level ──
    const economicSecurity = this.calculateEconomicSecurity(stakeSOL, stakeActive);

    // ── Determine action ──
    const riskFactors: string[] = [];
    const positiveSignals: string[] = [];

    if (!registered) {
      riskFactors.push('Agent not registered with SAID Protocol');
    } else {
      if (verified) positiveSignals.push('SAID-verified agent');
      else riskFactors.push('Agent not verified');

      if (stakeActive && stakeSOL >= this.minStakeForAllowSOL) {
        positiveSignals.push(`${stakeSOL.toFixed(2)} SOL actively staked`);
      } else if (stakeSOL > 0) {
        riskFactors.push(`Low stake (${stakeSOL.toFixed(2)} SOL, below ${this.minStakeForAllowSOL} threshold)`);
      } else {
        riskFactors.push('No stake deposited');
      }

      if (slashCount > 0) {
        riskFactors.push(`${slashCount} slashing event(s)`);
      } else if (registered) {
        positiveSignals.push('Clean slashing record');
      }

      if (score !== null) {
        if (score >= 70) positiveSignals.push(`High trust score (${score}/100)`);
        else if (score < 40) riskFactors.push(`Low trust score (${score}/100)`);
      }
    }

    // ── Determine action based on signals ──
    let action: EnforcementAction;
    let escrowPct = 0;
    let maxTxValueUSDC: number | null = null;

    // Hard block conditions
    if (slashCount >= this.maxSlashesBeforeBlock) {
      action = 'block';
    } else if (!registered && this.blockUnregistered) {
      action = 'block';
    } else if (!registered) {
      // Unregistered → require full escrow
      action = 'require_escrow';
      escrowPct = 100;
      maxTxValueUSDC = 100;
    } else if (score !== null && score < 20) {
      // Very low score → block
      action = 'block';
    } else if (score !== null && score < 40) {
      // Low score → require escrow
      action = 'require_escrow';
      escrowPct = 100;
      maxTxValueUSDC = 100;
    } else if (!verified || stakeSOL < this.minStakeForAllowSOL) {
      // Unverified or low stake → require partial escrow
      action = 'require_escrow';
      escrowPct = Math.round(this.calculateEscrowPct(score, stakeSOL, slashCount));
      maxTxValueUSDC = 1000;
    } else if (slashCount > 0) {
      // Has slashes but within tolerance → require reduced escrow
      action = 'require_escrow';
      escrowPct = Math.min(80, slashCount * 20);
      maxTxValueUSDC = 500;
    } else {
      // All clear → allow
      action = 'allow';
      maxTxValueUSDC = stakeSOL >= 1.0 ? null : 5000;
    }

    // ── Build summary ──
    const actionEmoji =
      action === 'allow' ? '🟢' :
      action === 'require_escrow' ? '🟡' :
      '🔴';

    const summary = `${actionEmoji} ${action.toUpperCase()} — Score: ${score ?? 'N/A'}/100, Stake: ${stakeSOL.toFixed(2)} SOL, Slashes: ${slashCount}, Verified: ${verified ? 'Yes' : 'No'}`;

    // ── Determine cacheability ──
    // Don't cache blocks (situation might improve) or unregistered agents
    const cacheable = action !== 'block' && registered;
    const cacheTtlSec = action === 'allow' ? 30 : action === 'require_escrow' ? 15 : 5;

    const verdict: EnforcementVerdict = {
      wallet,
      action,
      registered,
      verified,
      trustScore: score,
      riskTier: this.scoreToRiskTier(score, verified, registered),
      stakeSOL,
      stakeActive,
      slashCount,
      economicSecurity,
      escrowPct,
      maxTxValueUSDC,
      riskFactors,
      positiveSignals,
      summary,
      cacheable,
      cacheTtlSec,
      timestamp: new Date().toISOString(),
    };

    // Cache if appropriate
    if (cacheable && this.cacheTtlMs > 0) {
      this.cache.set(cacheKey, {
        value: verdict,
        expiresAt: Date.now() + Math.min(this.cacheTtlMs, cacheTtlSec * 1000),
      });
    }

    return verdict;
  }

  /**
   * Check both sides of a payment — payer and payee.
   * Use this in marketplace/escrow flows where both parties need trust validation.
   *
   * @example
   * ```ts
   * const result = await oracle.checkPayment(payerWallet, payeeWallet);
   * if (!result.proceed) {
   *   throw new Error(result.recommendation);
   * }
   * if (result.escrowRequired) {
   *   await createEscrow(result.escrowPct);
   * }
   * ```
   */
  async checkPayment(
    payerWallet: string,
    payeeWallet?: string,
  ): Promise<PaymentCheckResult> {
    const payerVerdict = await this.enforce(payerWallet);
    const payeeVerdict = payeeWallet ? await this.enforce(payeeWallet) : null;

    let proceed = true;
    let escrowRequired = false;
    let escrowPct = 0;

    const recommendations: string[] = [];

    if (payerVerdict.action === 'block') {
      proceed = false;
      recommendations.push(`Payer blocked: ${payerVerdict.summary}`);
    } else if (payerVerdict.action === 'require_escrow') {
      escrowRequired = true;
      escrowPct = Math.max(escrowPct, payerVerdict.escrowPct);
      recommendations.push(`Payer requires ${payerVerdict.escrowPct}% escrow`);
    }

    if (payeeVerdict) {
      if (payeeVerdict.action === 'block') {
        proceed = false;
        recommendations.push(`Payee blocked: ${payeeVerdict.summary}`);
      } else if (payeeVerdict.action === 'require_escrow') {
        escrowRequired = true;
        escrowPct = Math.max(escrowPct, payeeVerdict.escrowPct);
        recommendations.push(`Payee requires ${payeeVerdict.escrowPct}% escrow`);
      }
    }

    if (proceed && !escrowRequired) {
      recommendations.push('Payment cleared — both parties meet trust criteria');
    }

    return {
      proceed,
      payerVerdict,
      payeeVerdict,
      escrowRequired,
      escrowPct,
      recommendation: recommendations.join('; '),
    };
  }

  /**
   * Batch enforce — check multiple wallets in parallel.
   * Useful for marketplace-wide trust checks.
   *
   * @example
   * ```ts
   * const verdicts = await oracle.batchEnforce([walletA, walletB, walletC]);
   * const blocked = verdicts.filter(v => v.action === 'block');
   * ```
   */
  async batchEnforce(wallets: string[]): Promise<EnforcementVerdict[]> {
    return Promise.allSettled(
      wallets.map((w) => this.enforce(w)),
    ).then((results) =>
      results.map((r, i) =>
        r.status === 'fulfilled'
          ? r.value
          : {
              wallet: wallets[i],
              action: 'block' as EnforcementAction,
              registered: false,
              verified: false,
              trustScore: null,
              riskTier: 'unknown',
              stakeSOL: 0,
              stakeActive: false,
              slashCount: 0,
              economicSecurity: 'none' as const,
              escrowPct: 100,
              maxTxValueUSDC: 0,
              riskFactors: ['Enforcement check failed'],
              positiveSignals: [],
              summary: 'Enforcement check failed',
              cacheable: false,
              cacheTtlSec: 0,
              timestamp: new Date().toISOString(),
            },
      ),
    );
  }

  /**
   * Wrap a fetch function with enforcement checks.
   * Extracts the payee wallet from x402 response headers and enforces
   * trust before allowing payment to proceed.
   *
   * @example
   * ```ts
   * const enforcedFetch = oracle.wrapFetch(fetch);
   * // If the endpoint's wallet is untrusted, payment won't be sent
   * const res = await enforcedFetch('https://api.example.com/data');
   * ```
   */
  wrapFetch(fetchFn: typeof fetch): typeof fetch {
    return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const res = await fetchFn(input, init);

      // Only intercept 402 responses
      if (res.status !== 402) return res;

      // Try to extract payee wallet from headers
      const payeeHeader =
        res.headers.get('x-said-wallet') ||
        res.headers.get('x-payee-wallet') ||
        this.extractWalletFrom402(res);

      if (!payeeHeader) {
        // Can't determine payee — let payment proceed (fail open, not closed)
        return res;
      }

      const verdict = await this.enforce(payeeHeader);

      if (verdict.action === 'block') {
        // Clone the response so we can return a new one
        const body = await res.text();
        return new Response(
          JSON.stringify({
            error: 'Payment blocked by SAID Enforcement Oracle',
            verdict,
            originalBody: body.substring(0, 500),
          }),
          {
            status: 403,
            headers: {
              'Content-Type': 'application/json',
              'X-SAID-Action': 'block',
              'X-SAID-Score': String(verdict.trustScore ?? 'N/A'),
              'X-SAID-Risk': verdict.riskTier,
            },
          },
        );
      }

      // Attach enforcement metadata to the response
      const newHeaders = new Headers(res.headers);
      newHeaders.set('X-SAID-Action', verdict.action);
      newHeaders.set('X-SAID-Score', String(verdict.trustScore ?? 'N/A'));
      newHeaders.set('X-SAID-Economic-Security', verdict.economicSecurity);
      if (verdict.action === 'require_escrow') {
        newHeaders.set('X-SAID-Escrow-Pct', String(verdict.escrowPct));
      }

      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: newHeaders,
      });
    };
  }

  /**
   * Generate a JSON response for use as an API endpoint.
   * Deploy this as a standalone service (e.g., on Railway/Vercel).
   *
   * @example
   * ```ts
   * // Hono app
   * app.get('/enforce/:wallet', async (c) => {
   *   const verdict = await oracle.enforce(c.req.param('wallet'));
   *   return oracle.toJsonResponse(verdict);
   * });
   * ```
   */
  toJsonResponse(verdict: EnforcementVerdict): Response {
    return new Response(JSON.stringify(verdict), {
      status: verdict.action === 'block' ? 403 : 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': verdict.cacheable
          ? `public, max-age=${verdict.cacheTtlSec}`
          : 'no-cache',
        'X-SAID-Action': verdict.action,
        'X-SAID-Score': String(verdict.trustScore ?? 'N/A'),
        'X-SAID-Stake': String(verdict.stakeSOL),
        'X-SAID-Slashes': String(verdict.slashCount),
      },
    });
  }

  /**
   * Clear the enforcement cache.
   * Pass a wallet to invalidate a single entry.
   */
  clearCache(wallet?: string): void {
    if (wallet) {
      this.cache.delete(`enforce:${wallet}`);
    } else {
      this.cache.clear();
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private getCached(key: string): EnforcementVerdict | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  private calculateEconomicSecurity(
    stakeSOL: number,
    active: boolean,
  ): 'none' | 'minimal' | 'moderate' | 'strong' | 'whale' {
    if (!active || stakeSOL <= 0) return 'none';
    if (stakeSOL >= 10) return 'whale';
    if (stakeSOL >= 2) return 'strong';
    if (stakeSOL >= 0.5) return 'moderate';
    return 'minimal';
  }

  private calculateEscrowPct(
    score: number | null,
    stakeSOL: number,
    slashCount: number,
  ): number {
    let pct = 80; // Base escrow for unverified/low-stake

    // Reduce for high score
    if (score !== null) {
      if (score >= 60) pct -= 20;
      else if (score >= 50) pct -= 10;
      else if (score < 30) pct += 20;
    }

    // Reduce for stake (5% per SOL, max 30% reduction)
    pct -= Math.min(30, stakeSOL * 5);

    // Increase for slashes (+20% each)
    pct += slashCount * 20;

    return Math.max(0, Math.min(100, pct));
  }

  private scoreToRiskTier(
    score: number | null,
    verified: boolean,
    registered: boolean,
  ): string {
    if (!registered) return 'unknown';
    if (!verified || score === null) return 'high';
    if (score >= 80) return 'minimal';
    if (score >= 60) return 'low';
    if (score >= 40) return 'moderate';
    if (score >= 20) return 'elevated';
    return 'high';
  }

  private extractWalletFrom402(res: Response): string | null {
    // Try to parse from the payment challenge body
    // x402 payment challenges may include the payee address
    try {
      const payeeHeader = res.headers.get('www-authenticate');
      if (payeeHeader) {
        // Look for a Solana address (32-44 base58 chars)
        const match = payeeHeader.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/);
        if (match) return match[0];
      }
    } catch {}
    return null;
  }
}

// ── Standalone helper functions ─────────────────────────────────────────────

/**
 * Create an EnforcementOracle with strict defaults.
 * Use for: high-value transactions, DeFi protocols, enterprise integrations.
 */
export function createStrictOracle(client: SAIDClient): EnforcementOracle {
  return new EnforcementOracle(client, {
    policy: {
      minScore: 70,
      requireVerified: true,
      minStakeSOL: 1.0,
      requireActiveStake: true,
      maxRiskTier: 'low',
    },
    minStakeForAllowSOL: 1.0,
    maxSlashesBeforeBlock: 1,
    blockUnregistered: true,
  });
}

/**
 * Create an EnforcementOracle with permissive defaults.
 * Use for: social platforms, discovery, low-value microtransactions.
 */
export function createPermissiveOracle(client: SAIDClient): EnforcementOracle {
  return new EnforcementOracle(client, {
    policy: {
      maxRiskTier: 'elevated',
    },
    minStakeForAllowSOL: 0,
    maxSlashesBeforeBlock: 10,
    blockUnregistered: false,
  });
}

/**
 * Create an EnforcementOracle optimized for x402 payment flows.
 * Balanced enforcement — blocks known bad actors, allows good agents
 * to pay without friction, requires escrow for unknown/risky agents.
 */
export function createX402Oracle(client: SAIDClient): EnforcementOracle {
  return new EnforcementOracle(client, {
    policy: POLICY_X402,
    minStakeForAllowSOL: 0.5,
    maxSlashesBeforeBlock: 3,
    blockUnregistered: false,
    cacheTtlMs: 15_000,
  });
}
