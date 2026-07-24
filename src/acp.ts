/**
 * SAID Protocol — ERC-8183 Agent Commerce Protocol (ACP) Support
 *
 * ERC-8183 is the emerging standard for agent-to-agent commerce (Virtuals Protocol,
 * $4.5M cumulative fees, 18K+ agents). This module adds ACP trust enforcement to SAID:
 *
 * - Check trust before ACP transactions (hire, deliver, evaluate)
 * - Calculate escrow % and spend caps based on SAID Score + staking
 * - Validate ERC-8183 lifecycle state transitions
 * - Gate commerce by enforcement availability (staking/slashing)
 *
 * @example
 * ```ts
 * import { ACPTrustChecker } from '@said-protocol/client/acp';
 * import { SAIDClient } from '@said-protocol/client';
 *
 * const said = new SAIDClient();
 * const checker = new ACPTrustChecker(said);
 *
 * const result = await checker.evaluateTransaction({
 *   buyer: 'BUYER_WALLET',
 *   provider: 'PROVIDER_WALLET',
 *   service: 'code-review',
 *   valueUSDC: 50,
 *   currentState: 'hired',
 * });
 *
 * if (result.decision === 'allow') {
 *   // Proceed with transaction
 * } else if (result.decision === 'review') {
 *   console.log(`Escrow ${result.escrowPct}% recommended`);
 * }
 * ```
 */

import type { SAIDClient, RiskAssessment, TrustScoreBreakdown, StakeInfo } from './index.js';

// ── Types ───────────────────────────────────────────────────────────────────

/**
 * ERC-8183 lifecycle states.
 * See: https://github.com/ethereum/EIPs/blob/master/EIPS/eip-8183.md
 */
export type ACPLifecycleState =
  | 'bookmarked'    // Buyer saved a provider for later
  | 'messaged'      // Buyer initiated contact
  | 'hired'         // Buyer hired the provider
  | 'started'       // Provider started the work
  | 'delivered'     // Provider delivered the work
  | 'evaluated'     // Buyer evaluated the delivered work
  | 'paid'          // Payment was sent
  | 'completed'     // Transaction fully completed
  | 'disputed'      // Either party raised a dispute
  | 'refunded'      // Payment was refunded
  | 'cancelled';    // Transaction was cancelled

/**
 * Valid state transitions in the ERC-8183 lifecycle.
 */
const VALID_TRANSITIONS: Record<ACPLifecycleState, ACPLifecycleState[]> = {
  bookmarked:  ['messaged', 'cancelled'],
  messaged:    ['hired', 'cancelled'],
  hired:       ['started', 'cancelled', 'disputed'],
  started:     ['delivered', 'disputed', 'cancelled'],
  delivered:   ['evaluated', 'disputed', 'cancelled'],
  evaluated:   ['paid', 'disputed'],
  paid:        ['completed', 'disputed', 'refunded'],
  completed:   [],
  disputed:    ['refunded', 'paid', 'cancelled'],
  refunded:    [],
  cancelled:   [],
};

/**
 * Check if a state transition is valid per ERC-8183.
 */
export function isValidTransition(from: ACPLifecycleState, to: ACPLifecycleState): boolean {
  const allowed = VALID_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/**
 * States where a trust check should be performed before proceeding.
 */
export function requiresTrustCheck(state: ACPLifecycleState): boolean {
  return state === 'hired' || state === 'started' || state === 'paid';
}

/**
 * States where enforcement (slashing) is meaningful — i.e., the provider
 * has committed to delivering something and can be penalized for failure.
 */
export function allowsEnforcement(state: ACPLifecycleState): boolean {
  return state === 'hired' || state === 'started' || state === 'delivered' || state === 'evaluated';
}

// ── ACP Transaction ─────────────────────────────────────────────────────────

export interface ACPTransaction {
  /** Buyer (hiring agent) wallet address */
  buyer: string;
  /** Provider (selling agent) wallet address */
  provider: string;
  /** Service or task description */
  service: string;
  /** Agreed value in USDC */
  valueUSDC: number;
  /** Current lifecycle state */
  currentState: ACPLifecycleState;
  /** Optional: next state being proposed */
  nextState?: ACPLifecycleState;
  /** Optional: metadata */
  metadata?: Record<string, unknown>;
}

export interface ACPTransactionInput {
  buyer: string;
  provider: string;
  service: string;
  valueUSDC: number;
  currentState: ACPLifecycleState;
  nextState?: ACPLifecycleState;
  metadata?: Record<string, unknown>;
}

// ── Trust Evaluation ────────────────────────────────────────────────────────

export type ACPDecision = 'allow' | 'deny' | 'review';

export interface ACPTrustResult {
  /** Overall decision */
  decision: ACPDecision;
  /** Buyer risk assessment (if evaluated) */
  buyerRisk: RiskAssessment | null;
  /** Provider risk assessment (if evaluated) */
  providerRisk: RiskAssessment | null;
  /** Buyer trust score (if available) */
  buyerScore: TrustScoreBreakdown | null;
  /** Provider trust score (if available) */
  providerScore: TrustScoreBreakdown | null;
  /** Provider stake info */
  providerStake: StakeInfo | null;
  /** Recommended escrow percentage (0-100) */
  escrowPct: number;
  /** Recommended max spend per transaction in USDC */
  spendCapUSDC: number | null;
  /** Whether the provider can be slashed for non-delivery */
  enforcementAvailable: boolean;
  /** Human-readable explanation */
  reason: string;
  /** Risk factors discovered */
  riskFactors: string[];
  /** Positive signals discovered */
  positiveSignals: string[];
}

// ── Enforcement Presets ─────────────────────────────────────────────────────

export interface ACPConfig {
  /** Minimum trust score required to allow (default: 20) */
  minScore: number;
  /** Score below which transactions are auto-denied (default: 0) */
  denyBelowScore: number;
  /** Require provider to be SAID-verified */
  requireVerified: boolean;
  /** Require provider to have stake (economic skin in the game) */
  requireStake: boolean;
  /** Minimum stake in SOL */
  minStakeSOL: number;
  /** Auto-deny if provider has been slashed N or more times */
  denyIfSlashedCount: number;
  /** Maximum escrow percentage cap (default: 100) */
  maxEscrowPct: number;
  /** Allowlist of wallets that bypass all checks */
  allowlist: string[];
  /** Blocklist of wallets that are always denied */
  blocklist: string[];
  /** Maximum transaction value in USDC, or null for no cap */
  maxTransactionUSDC: number | null;
}

export const ACP_PRESET_DEFAULT: ACPConfig = {
  minScore: 20,
  denyBelowScore: 0,
  requireVerified: false,
  requireStake: false,
  minStakeSOL: 0,
  denyIfSlashedCount: 3,
  maxEscrowPct: 100,
  allowlist: [],
  blocklist: [],
  maxTransactionUSDC: null,
};

export const ACP_PRESET_STRICT: ACPConfig = {
  minScore: 50,
  denyBelowScore: 15,
  requireVerified: true,
  requireStake: true,
  minStakeSOL: 1.0,
  denyIfSlashedCount: 1,
  maxEscrowPct: 100,
  allowlist: [],
  blocklist: [],
  maxTransactionUSDC: 500,
};

export const ACP_PRESET_PERMISSIVE: ACPConfig = {
  minScore: 0,
  denyBelowScore: 0,
  requireVerified: false,
  requireStake: false,
  minStakeSOL: 0,
  denyIfSlashedCount: 10,
  maxEscrowPct: 75,
  allowlist: [],
  blocklist: [],
  maxTransactionUSDC: null,
};

export const ACP_PRESETS: Record<string, ACPConfig> = {
  default: ACP_PRESET_DEFAULT,
  strict: ACP_PRESET_STRICT,
  permissive: ACP_PRESET_PERMISSIVE,
};

/**
 * Create an ACP config from a preset with optional overrides.
 */
export function createACPConfig(
  preset: keyof typeof ACP_PRESETS | ACPConfig = 'default',
  overrides: Partial<ACPConfig> = {},
): ACPConfig {
  const base = typeof preset === 'string' ? ACP_PRESETS[preset] : preset;
  return { ...base, ...overrides };
}

// ── Helper Functions ────────────────────────────────────────────────────────

/**
 * Calculate escrow percentage based on trust score and stake.
 * Higher trust + higher stake → lower escrow.
 */
export function calculateEscrowPercentage(
  score: number | null,
  stakeSOL: number,
  slashed: boolean,
): number {
  // Slashed agents always get max escrow
  if (slashed) return 100;

  // No score → full escrow
  if (score === null) return 100;

  // Base escrow from score (0-100): score 100 → 10%, score 0 → 100%
  const scoreBased = Math.max(10, 100 - score * 0.9);

  // Stake discount: each SOL staked reduces escrow by 2%, floor at 10%
  const stakeDiscount = Math.min(scoreBased - 10, stakeSOL * 2);

  return Math.round(Math.max(10, scoreBased - stakeDiscount));
}

/**
 * Calculate the recommended spend cap based on stake and score.
 * Agents with more stake and higher scores can handle larger transactions.
 */
export function calculateSpendCap(
  score: number | null,
  stakeSOL: number,
  slashed: boolean,
): number | null {
  if (slashed) return 0;
  if (score === null && stakeSOL === 0) return null;

  // Base from score (linear scale: 0→$10, 100→$1000)
  const scoreBase = score !== null ? score * 10 : 10;

  // Stake multiplier: each SOL adds $100 capacity (skin in the game)
  const stakeBase = stakeSOL * 100;

  return Math.round(scoreBase + stakeBase);
}

/**
 * Quick check: can a buyer hire this provider?
 * Returns a simplified result for marketplace listing cards.
 */
export interface CanHireResult {
  allowed: boolean;
  score: number | null;
  escrowPct: number;
  reason: string;
}

// ── ACP Trust Checker ───────────────────────────────────────────────────────

/**
 * Evaluates ACP (ERC-8183) transactions using SAID trust infrastructure.
 *
 * Fetches risk assessments and trust scores for both parties, then applies
 * the configured policy to produce an allow/deny/review decision.
 */
export class ACPTrustChecker {
  constructor(
    private client: SAIDClient,
    private config: ACPConfig = ACP_PRESET_DEFAULT,
  ) {}

  /**
   * Evaluate a transaction and return a trust decision.
   *
   * @param input Transaction details
   * @returns Trust evaluation result with escrow recommendation
   */
  async evaluateTransaction(input: ACPTransactionInput): Promise<ACPTrustResult> {
    const { buyer, provider, valueUSDC, currentState } = input;

    const riskFactors: string[] = [];
    const positiveSignals: string[] = [];

    // ── Blocklist / Allowlist ──
    if (this.config.blocklist.includes(buyer) || this.config.blocklist.includes(provider)) {
      return this.deny('Wallet is on blocklist', riskFactors, positiveSignals, null, null, null, null, null);
    }

    const buyerAllowlisted = this.config.allowlist.includes(buyer);
    const providerAllowlisted = this.config.allowlist.includes(provider);

    // ── Max transaction value ──
    if (this.config.maxTransactionUSDC !== null && valueUSDC > this.config.maxTransactionUSDC) {
      riskFactors.push(`Transaction value $${valueUSDC} exceeds max $${this.config.maxTransactionUSDC}`);
      return this.deny(
        `Transaction exceeds maximum value ($${this.config.maxTransactionUSDC})`,
        riskFactors, positiveSignals, null, null, null, null, null,
      );
    }

    // ── Validate state transition if requested ──
    if (input.nextState && !isValidTransition(currentState, input.nextState)) {
      riskFactors.push(`Invalid state transition: ${currentState} → ${input.nextState}`);
      return this.deny(
        `Invalid lifecycle transition from ${currentState} to ${input.nextState}`,
        riskFactors, positiveSignals, null, null, null, null, null,
      );
    }

    // ── Fetch data in parallel ──
    const [providerRisk, providerScore, providerStake] = providerAllowlisted
      ? [null, null, null]
      : await Promise.all([
          this.client.getRiskAssessment(provider).catch(() => null),
          this.client.getTrustScore(provider).catch(() => null),
          this.client.getStakeInfo(provider).catch(() => null),
        ]);

    const [buyerRisk, buyerScore] = buyerAllowlisted
      ? [null, null]
      : await Promise.all([
          this.client.getRiskAssessment(buyer).catch(() => null),
          this.client.getTrustScore(buyer).catch(() => null),
        ]);

    // ── Allowlist bypass ──
    if (buyerAllowlisted && providerAllowlisted) {
      return this.allow(
        'Both parties allowlisted',
        riskFactors, positiveSignals, buyerRisk, providerRisk,
        buyerScore, providerScore, providerStake, 0,
      );
    }

    // ── Provider checks (skip if allowlisted) ──
    if (!providerAllowlisted) {
      // Must be registered
      if (providerRisk && !providerRisk.registered) {
        return this.deny(
          'Provider not registered with SAID Protocol',
          ['Provider not registered'], positiveSignals,
          buyerRisk, providerRisk, buyerScore, providerScore, providerStake,
        );
      }

      // Score floor
      const pScore = providerScore?.score ?? null;
      if (pScore !== null && pScore < this.config.denyBelowScore) {
        riskFactors.push(`Provider score ${pScore} below deny threshold ${this.config.denyBelowScore}`);
        return this.deny(
          `Provider score too low (${pScore})`,
          riskFactors, positiveSignals, buyerRisk, providerRisk, buyerScore, providerScore, providerStake,
        );
      }

      // Verification requirement
      if (this.config.requireVerified && providerRisk && !providerRisk.verified) {
        riskFactors.push('Provider not SAID-verified (required by policy)');
        return this.deny(
          'Provider not verified (required by policy)',
          riskFactors, positiveSignals, buyerRisk, providerRisk, buyerScore, providerScore, providerStake,
        );
      }

      // Stake requirement
      if (this.config.requireStake) {
        const stake = providerStake?.amountSOL ?? 0;
        if (stake < this.config.minStakeSOL) {
          riskFactors.push(`Provider stake ${stake.toFixed(2)} SOL below required ${this.config.minStakeSOL} SOL`);
          return this.deny(
            `Insufficient stake (${stake.toFixed(2)} SOL < ${this.config.minStakeSOL} SOL required)`,
            riskFactors, positiveSignals, buyerRisk, providerRisk, buyerScore, providerScore, providerStake,
          );
        }
      }

      // Slashing check
      const slashCount = providerStake?.slashedCount ?? 0;
      if (slashCount >= this.config.denyIfSlashedCount) {
        riskFactors.push(`Provider slashed ${slashCount} times (threshold: ${this.config.denyIfSlashedCount})`);
        return this.deny(
          `Provider slashed ${slashCount} times`,
          riskFactors, positiveSignals, buyerRisk, providerRisk, buyerScore, providerScore, providerStake,
        );
      }

      // Collect positive signals
      if (providerRisk?.verified) positiveSignals.push('Provider is SAID-verified');
      if (providerStake && providerStake.amountSOL >= 1.0) {
        positiveSignals.push(`Provider has ${providerStake.amountSOL.toFixed(2)} SOL staked`);
      }
      if (pScore !== null && pScore >= 50) {
        positiveSignals.push(`Provider trust score ${pScore}`);
      }
    }

    // ── Buyer checks (skip if allowlisted) ──
    if (!buyerAllowlisted) {
      if (buyerRisk && !buyerRisk.registered) {
        riskFactors.push('Buyer not registered with SAID Protocol');
      }
    }

    // ── Calculate escrow and spend cap ──
    const pScoreNum = providerScore?.score ?? null;
    const stakeNum = providerStake?.amountSOL ?? 0;
    const slashed = (providerStake?.slashedCount ?? 0) > 0;

    const escrowPct = Math.min(
      this.config.maxEscrowPct,
      calculateEscrowPercentage(pScoreNum, stakeNum, slashed),
    );
    const spendCap = calculateSpendCap(pScoreNum, stakeNum, slashed);

    // ── Final decision ──
    const enforcement = allowsEnforcement(currentState) && stakeNum > 0 && !slashed;
    let decision: ACPDecision;
    let reason: string;

    if (pScoreNum !== null && pScoreNum < this.config.minScore) {
      decision = 'review';
      reason = `Provider score ${pScoreNum} below recommended minimum ${this.config.minScore}`;
      riskFactors.push(`Low provider score (${pScoreNum})`);
    } else if (riskFactors.length > 0 && positiveSignals.length === 0) {
      decision = 'review';
      reason = 'Risk factors identified — manual review recommended';
    } else if (!providerRisk?.verified && !providerAllowlisted) {
      decision = 'review';
      reason = 'Provider not verified — review recommended';
    } else {
      decision = 'allow';
      reason = enforcement
        ? 'Provider trusted and enforcement available'
        : 'Provider meets trust requirements';
    }

    return {
      decision,
      buyerRisk,
      providerRisk,
      buyerScore,
      providerScore,
      providerStake,
      escrowPct,
      spendCapUSDC: spendCap,
      enforcementAvailable: enforcement,
      reason,
      riskFactors,
      positiveSignals,
    };
  }

  /**
   * Quick check: can a buyer hire this provider?
   * Lightweight — fetches only what's needed.
   */
  async canHire(provider: string): Promise<CanHireResult> {
    if (this.config.blocklist.includes(provider)) {
      return { allowed: false, score: null, escrowPct: 100, reason: 'Provider blocklisted' };
    }
    if (this.config.allowlist.includes(provider)) {
      return { allowed: true, score: null, escrowPct: 0, reason: 'Provider allowlisted' };
    }

    const [risk, stake] = await Promise.all([
      this.client.getRiskAssessment(provider).catch(() => null),
      this.client.getStakeInfo(provider).catch(() => null),
    ]);

    if (!risk?.registered) {
      return { allowed: false, score: null, escrowPct: 100, reason: 'Not registered' };
    }

    const score = risk.score;
    const slashed = (stake?.slashedCount ?? 0) > 0;

    if (slashed) {
      return { allowed: false, score, escrowPct: 100, reason: 'Provider has been slashed' };
    }
    if (score !== null && score < this.config.denyBelowScore) {
      return { allowed: false, score, escrowPct: 100, reason: `Score too low (${score})` };
    }

    const escrowPct = calculateEscrowPercentage(score, stake?.amountSOL ?? 0, false);
    return {
      allowed: true,
      score,
      escrowPct,
      reason: risk.verified ? 'Verified provider' : 'Registered provider',
    };
  }

  /**
   * Check whether enforcement (slashing) is available for a provider.
   * Useful before entering a hired state.
   */
  async checkEnforcementAvailable(provider: string): Promise<boolean> {
    const stake = await this.client.getStakeInfo(provider).catch(() => null);
    if (!stake) return false;
    return stake.amountSOL > 0 && stake.slashedCount < this.config.denyIfSlashedCount;
  }

  // ── Internal helpers ──

  private deny(
    reason: string,
    riskFactors: string[],
    positiveSignals: string[],
    buyerRisk: RiskAssessment | null,
    providerRisk: RiskAssessment | null,
    buyerScore: TrustScoreBreakdown | null,
    providerScore: TrustScoreBreakdown | null,
    providerStake: StakeInfo | null,
  ): ACPTrustResult {
    return {
      decision: 'deny',
      buyerRisk,
      providerRisk,
      buyerScore,
      providerScore,
      providerStake,
      escrowPct: 100,
      spendCapUSDC: 0,
      enforcementAvailable: false,
      reason,
      riskFactors,
      positiveSignals,
    };
  }

  private allow(
    reason: string,
    riskFactors: string[],
    positiveSignals: string[],
    buyerRisk: RiskAssessment | null,
    providerRisk: RiskAssessment | null,
    buyerScore: TrustScoreBreakdown | null,
    providerScore: TrustScoreBreakdown | null,
    providerStake: StakeInfo | null,
    escrowPct: number,
  ): ACPTrustResult {
    return {
      decision: 'allow',
      buyerRisk,
      providerRisk,
      buyerScore,
      providerScore,
      providerStake,
      escrowPct,
      spendCapUSDC: null,
      enforcementAvailable: providerStake !== null && providerStake.amountSOL > 0,
      reason,
      riskFactors,
      positiveSignals,
    };
  }
}

// ── ACP Transaction Builder ─────────────────────────────────────────────────

/**
 * Fluent builder for ERC-8183 compatible transaction objects.
 *
 * @example
 * ```ts
 * const tx = new ACPTransactionBuilder()
 *   .buyer('BUYER_WALLET')
 *   .provider('PROVIDER_WALLET')
 *   .service('code-review')
 *   .valueUSDC(50)
 *   .state('hired')
 *   .metadata({ deadline: '2024-12-31' })
 *   .build();
 * ```
 */
export class ACPTransactionBuilder {
  private tx: Partial<ACPTransaction> = {};

  buyer(wallet: string): this {
    this.tx.buyer = wallet;
    return this;
  }

  provider(wallet: string): this {
    this.tx.provider = wallet;
    return this;
  }

  service(desc: string): this {
    this.tx.service = desc;
    return this;
  }

  valueUSDC(amount: number): this {
    if (amount < 0) throw new Error('Value must be non-negative');
    this.tx.valueUSDC = amount;
    return this;
  }

  state(state: ACPLifecycleState): this {
    this.tx.currentState = state;
    return this;
  }

  nextState(state: ACPLifecycleState): this {
    this.tx.nextState = state;
    return this;
  }

  metadata(meta: Record<string, unknown>): this {
    this.tx.metadata = meta;
    return this;
  }

  build(): ACPTransaction {
    if (!this.tx.buyer) throw new Error('buyer is required');
    if (!this.tx.provider) throw new Error('provider is required');
    if (!this.tx.service) throw new Error('service is required');
    if (this.tx.valueUSDC === undefined) throw new Error('valueUSDC is required');
    if (!this.tx.currentState) throw new Error('currentState is required');

    return {
      buyer: this.tx.buyer,
      provider: this.tx.provider,
      service: this.tx.service,
      valueUSDC: this.tx.valueUSDC,
      currentState: this.tx.currentState,
      nextState: this.tx.nextState,
      metadata: this.tx.metadata,
    };
  }
}
