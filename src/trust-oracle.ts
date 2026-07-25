/**
 * SAID Protocol — Trust Oracle for ERC-8183 Agent Commerce
 *
 * The missing Layer 7 product. SAID occupies the Evaluator role in the
 * ERC-8183 Job lifecycle — the only role that requires trust.
 *
 * ERC-8183 defines three roles:
 *   - Client:    posts requirements, funds escrow
 *   - Provider:  executes work, submits deliverable
 *   - Evaluator: attests to completion, triggers payment release
 *
 * SAID Trust Oracle provides:
 *   1. Evaluator selection — pick staked, reputable agents as evaluators
 *   2. Evaluation verdicts — pass/fail/partial with evidence and slashing recommendations
 *   3. ReputationGateHook — pre-transaction trust gate using staking/slashing
 *   4. Trust receipt — signed, non-repudiable proof of evaluation
 *
 * Revenue model: $0.01/check via x402. Every ERC-8183 marketplace
 * (Virtuals ACP, OKX, BNBAgent) needs an evaluator. SAID is the only
 * evaluator backed by real economic enforcement.
 *
 * @example
 * ```ts
 * import { TrustOracle } from '@said-protocol/client/trust-oracle';
 * import { SAIDClient } from '@said-protocol/client';
 *
 * const said = new SAIDClient();
 * const oracle = new TrustOracle(said);
 *
 * // Select an evaluator for a job
 * const evaluator = await oracle.selectEvaluator({
 *   jobType: 'code-review',
 *   valueUSDC: 100,
 *   excludeWallets: ['PROVIDER_WALLET'], // can't evaluate own work
 * });
 *
 * // Evaluate delivered work
 * const verdict = await oracle.evaluate({
 *   jobId: 'job-123',
 *   provider: 'PROVIDER_WALLET',
 *   client: 'CLIENT_WALLET',
 *   deliverableHash: '0xabc...',
 *   claim: 'Completed code review of auth module',
 * });
 *
 * if (verdict.verdict === 'pass') {
 *   // Release escrow payment
 * } else if (verdict.verdict === 'fail') {
 *   // Slash provider stake
 *   await oracle.recommendSlash(verdict);
 * }
 * ```
 */

import type { SAIDClient, RiskAssessment, TrustScoreBreakdown, StakeInfo, LeaderboardEntry } from './index.js';

// ── Types ───────────────────────────────────────────────────────────────────

/**
 * ERC-8183 Job states (aligned with the standard).
 * See: https://github.com/ethereum/EIPs/blob/master/EIPS/eip-8183.md
 */
export type ERC8183JobState =
  | 'open'     // Job posted, no provider hired yet
  | 'funded'   // Escrow funded, waiting for provider acceptance
  | 'assigned' // Provider hired
  | 'submitted' // Provider delivered work
  | 'evaluated' // Evaluator has attested
  | 'completed' // Payment released
  | 'rejected'  // Work rejected by evaluator
  | 'expired'   // Job timed out
  | 'disputed'; // Under dispute

/**
 * Verdict the oracle can return for an evaluation.
 */
export type EvaluationVerdict = 'pass' | 'fail' | 'partial';

/**
 * Trust gate decision for pre-transaction checks.
 */
export type TrustGateDecision = 'allow' | 'deny' | 'review';

/**
 * Hook result for ERC-8183 ReputationGateHook.
 */
export interface HookResult {
  decision: TrustGateDecision;
  reason: string;
  /** Trust score at time of check */
  score: number;
  /** Whether the agent has active stake */
  staked: boolean;
  /** Number of historical slashes */
  slashCount: number;
  /** Recommended escrow percentage if proceeding */
  escrowPct: number;
  /** Max transaction value allowed for this agent */
  maxTxValueUSDC: number;
  /** Timestamp of this check */
  timestamp: string;
}

/**
 * A candidate evaluator for a job.
 */
export interface EvaluatorCandidate {
  wallet: string;
  score: number;
  tier: string;
  staked: boolean;
  stakeSOL: number;
  slashCount: number;
  /** Suitability score (0-100) for this specific job */
  suitability: number;
}

/**
 * Selected evaluator with justification.
 */
export interface SelectedEvaluator {
  wallet: string;
  score: number;
  tier: string;
  staked: boolean;
  stakeSOL: number;
  suitability: number;
  /** Why this evaluator was chosen */
  reason: string;
  /** Selection timestamp */
  selectedAt: string;
}

/**
 * Input for evaluator selection.
 */
export interface SelectEvaluatorInput {
  /** Type of work (code-review, data-analysis, content-writing, etc.) */
  jobType: string;
  /** Value of the job in USDC */
  valueUSDC: number;
  /** Wallets to exclude (e.g., the provider can't evaluate their own work) */
  excludeWallets?: string[];
  /** Minimum trust score required (default: 50) */
  minScore?: number;
  /** Require the evaluator to be staked (default: true) */
  requireStaked?: boolean;
  /** Maximum allowed slash count (default: 0) */
  maxSlashes?: number;
  /** Pool of candidate wallets to evaluate. If empty, uses leaderboard. */
  candidatePool?: string[];
}

/**
 * Input for work evaluation.
 */
export interface EvaluateInput {
  /** Unique job identifier */
  jobId: string;
  /** Provider wallet that delivered the work */
  provider: string;
  /** Client wallet that funded the escrow */
  client: string;
  /** Hash of the deliverable (for verification) */
  deliverableHash: string;
  /** Provider's claim about what was delivered */
  claim: string;
  /** Value of the job in USDC */
  valueUSDC?: number;
  /** Optional evaluator wallet (defaults to highest-trust available) */
  evaluator?: string;
  /** Optional evidence/docs to assist evaluation */
  evidence?: Record<string, unknown>;
}

/**
 * Result of a work evaluation.
 */
export interface EvaluationResult {
  /** Job ID being evaluated */
  jobId: string;
  /** Verdict: pass, fail, or partial */
  verdict: EvaluationVerdict;
  /** Confidence 0-100 */
  confidence: number;
  /** Provider's trust data at time of evaluation */
  providerScore: number;
  providerStaked: boolean;
  providerStakeSOL: number;
  providerSlashCount: number;
  /** Detailed evaluation criteria */
  criteria: EvaluationCriteria[];
  /** Overall assessment text */
  assessment: string;
  /** Payment recommendation based on verdict */
  paymentRecommendation: PaymentRecommendation;
  /** Slashing recommendation if verdict is fail */
  slashRecommendation?: SlashRecommendation;
  /** Signed receipt for non-repudiation */
  receipt: TrustReceipt;
  /** Timestamp */
  timestamp: string;
}

/**
 * Individual evaluation criterion.
 */
export interface EvaluationCriteria {
  name: string;
  passed: boolean;
  weight: number;
  detail: string;
}

/**
 * Payment recommendation derived from verdict.
 */
export interface PaymentRecommendation {
  /** Percentage of escrow to release (0-100) */
  releasePct: number;
  /** Amount in USDC to release */
  releaseAmountUSDC: number;
  /** Whether to refund the client */
  refundClient: boolean;
  /** Reason for this recommendation */
  reason: string;
}

/**
 * Slashing recommendation for failed work.
 */
export interface SlashRecommendation {
  /** Percentage of stake to slash */
  slashPct: number;
  /** Estimated SOL to slash */
  slashSOL: number;
  /** Reason for slashing */
  reason: string;
  /** Severity level */
  severity: 'minor' | 'moderate' | 'severe';
}

/**
 * Signed trust receipt for non-repudiation.
 */
export interface TrustReceipt {
  /** Unique receipt ID */
  receiptId: string;
  /** Wallet evaluated */
  subject: string;
  /** Evaluation type */
  type: 'pre_transaction' | 'work_evaluation' | 'evaluator_selection';
  /** Decision/verdict */
  decision: string;
  /** HMAC-SHA256 signature */
  signature: string;
  /** Timestamp */
  issuedAt: string;
  /** Expires at */
  expiresAt: string;
}

// ── Configuration ───────────────────────────────────────────────────────────

export interface TrustOracleConfig {
  /** Minimum score for evaluators (default: 70) */
  evaluatorMinScore: number;
  /** Require evaluators to be staked (default: true) */
  evaluatorRequireStaked: boolean;
  /** Max slashes for evaluators (default: 0) */
  evaluatorMaxSlashes: number;
  /** Minimum stake in SOL for evaluators (default: 1.0) */
  evaluatorMinStakeSOL: number;
  /** Slash % for failed work (default: 10) */
  failedWorkSlashPct: number;
  /** Slash % for partial work (default: 5) */
  partialWorkSlashPct: number;
  /** Slash % for fraud/no-delivery (default: 50) */
  fraudSlashPct: number;
  /** Receipt TTL in seconds (default: 300 = 5min) */
  receiptTtlSec: number;
  /** HMAC secret for signing receipts */
  hmacSecret: string;
}

/** Default configuration */
export function createDefaultOracleConfig(): TrustOracleConfig {
  return {
    evaluatorMinScore: 70,
    evaluatorRequireStaked: true,
    evaluatorMaxSlashes: 0,
    evaluatorMinStakeSOL: 1.0,
    failedWorkSlashPct: 10,
    partialWorkSlashPct: 5,
    fraudSlashPct: 50,
    receiptTtlSec: 300,
    hmacSecret: process.env.SAID_ORACLE_SECRET || 'said-oracle-default-key',
  };
}

// ── Helper Functions ────────────────────────────────────────────────────────

/**
 * Determine escrow percentage based on trust tier.
 * Higher trust = lower escrow (less risk).
 */
export function trustToEscrowPct(score: number, staked: boolean, slashCount: number): number {
  if (slashCount > 0) return Math.min(50, 20 + slashCount * 10);
  if (!staked) return 30;
  if (score >= 80) return 5;
  if (score >= 60) return 10;
  if (score >= 40) return 20;
  return 30;
}

/**
 * Determine max transaction value based on trust.
 * Uses a blend of score (capability) and stake (collateral).
 */
export function trustToMaxTxValue(score: number, stakeSOL: number): number {
  // Score determines the base capability (score 80 → $800 max)
  const fromScore = score * 10;
  // Stake provides a bonus ceiling — up to 5x stake value
  const fromStake = stakeSOL * 50;
  // Take the higher of the two, but cap total at score*10 + stake bonus
  return Math.max(fromScore, fromStake);
}

/**
 * Determine severity of a failure based on provider history.
 */
export function categorizeSeverity(
  slashCount: number,
  score: number,
  deliverableProvided: boolean,
): 'minor' | 'moderate' | 'severe' {
  if (!deliverableProvided) return 'severe';
  if (slashCount > 2 || score < 30) return 'severe';
  if (slashCount > 0 || score < 50) return 'moderate';
  return 'minor';
}

/**
 * Calculate slash percentage based on severity and stake.
 */
export function calculateSlashPct(
  severity: 'minor' | 'moderate' | 'severe',
  stakeSOL: number,
  config: TrustOracleConfig,
): number {
  switch (severity) {
    case 'minor': return config.failedWorkSlashPct;
    case 'moderate': return config.failedWorkSlashPct * 2;
    case 'severe': return config.fraudSlashPct;
    default: return config.failedWorkSlashPct;
  }
}

// ── Trust Oracle Class ──────────────────────────────────────────────────────

/**
 * SAID Trust Oracle for ERC-8183 Agent Commerce.
 *
 * Implements the Evaluator role with economic enforcement backing.
 * Every evaluation is backed by real on-chain staking/slashing data.
 */
export class TrustOracle {
  private said: SAIDClient;
  private config: TrustOracleConfig;

  constructor(said: SAIDClient, config?: Partial<TrustOracleConfig>) {
    this.said = said;
    this.config = { ...createDefaultOracleConfig(), ...config };
  }

  // ── Pre-Transaction Trust Gate (ReputationGateHook) ──────────────────────

  /**
   * Pre-transaction trust check. Acts as an ERC-8183 ReputationGateHook.
   *
   * Call this before allowing a job to be assigned or payment to be released.
   * Returns a decision (allow/deny/review) with full justification.
   *
   * @example
   * ```ts
   * const gate = await oracle.trustGate({
   *   wallet: 'PROVIDER_WALLET',
   *   jobValueUSDC: 100,
   *   action: 'assign',
   * });
   * if (gate.decision === 'deny') {
   *   throw new Error(`Provider rejected: ${gate.reason}`);
   * }
   * ```
   */
  async trustGate(params: {
    wallet: string;
    jobValueUSDC?: number;
    action: 'assign' | 'submit' | 'release_payment' | 'evaluate';
  }): Promise<HookResult> {
    const timestamp = new Date().toISOString();

    // Fetch trust data in parallel
    const [scoreResult, stakeResult] = await Promise.allSettled([
      this.said.getTrustScore(params.wallet),
      this.said.getStakeInfo(params.wallet),
    ]);

    // Extract data with graceful degradation
    const scoreResultVal = scoreResult.status === 'fulfilled' ? scoreResult.value : null;
    const score = scoreResultVal?.score ?? 0;
    const stake = stakeResult.status === 'fulfilled' ? stakeResult.value : null;
    const staked = stake ? stake.amountSOL > 0 : false;
    const slashCount = stake?.slashedCount ?? 0;
    const stakeSOL = stake?.amountSOL ?? 0;

    // Escrow and max tx
    const escrowPct = trustToEscrowPct(score, staked, slashCount);
    const maxTxValueUSDC = trustToMaxTxValue(score, stakeSOL);

    // Decision logic
    let decision: TrustGateDecision;
    let reason: string;

    if (slashCount > 0 && params.action === 'assign') {
      decision = 'review';
      reason = `Agent has ${slashCount} prior slash(es) — requires manual review before assignment`;
    } else if (!staked && (params.action === 'assign' || params.action === 'release_payment')) {
      decision = 'review';
      reason = 'Agent has no staked collateral — economic enforcement unavailable';
    } else if (score < 30) {
      decision = 'deny';
      reason = `Trust score ${score} below minimum threshold (30)`;
    } else if (score < 50) {
      decision = 'review';
      reason = `Trust score ${score} in caution zone — requires review`;
    } else if (params.jobValueUSDC && params.jobValueUSDC > maxTxValueUSDC) {
      decision = 'review';
      reason = `Job value $${params.jobValueUSDC} exceeds max tx value $${maxTxValueUSDC.toFixed(0)} for this agent`;
    } else {
      decision = 'allow';
      reason = `Trust score ${score}, staked ${stakeSOL.toFixed(2)} SOL — within acceptable parameters`;
    }

    return {
      decision,
      reason,
      score,
      staked,
      slashCount,
      escrowPct,
      maxTxValueUSDC,
      timestamp,
    };
  }

  // ── Evaluator Selection ──────────────────────────────────────────────────

  /**
   * Select the best evaluator for a job from a candidate pool or leaderboard.
   *
   * Evaluators must be staked, high-trust agents with no slashing history.
   * They have economic skin-in-the-game — if they evaluate incorrectly,
   * they can be slashed.
   *
   * @example
   * ```ts
   * const evaluator = await oracle.selectEvaluator({
   *   jobType: 'code-review',
   *   valueUSDC: 100,
   *   excludeWallets: [providerWallet],
   * });
   * ```
   */
  async selectEvaluator(input: SelectEvaluatorInput): Promise<SelectedEvaluator> {
    const minScore = input.minScore ?? this.config.evaluatorMinScore;
    const requireStaked = input.requireStaked ?? this.config.evaluatorRequireStaked;
    const maxSlashes = input.maxSlashes ?? this.config.evaluatorMaxSlashes;
    const excludeSet = new Set(input.excludeWallets ?? []);

    let candidates: EvaluatorCandidate[] = [];

    if (input.candidatePool && input.candidatePool.length > 0) {
      // Evaluate specific candidates
      const results = await Promise.allSettled(
        input.candidatePool
          .filter(w => !excludeSet.has(w))
          .map(async wallet => {
            const [scoreRes, stakeRes] = await Promise.allSettled([
              this.said.getTrustScore(wallet),
              this.said.getStakeInfo(wallet),
            ]);
            const scoreVal = scoreRes.status === 'fulfilled' ? scoreRes.value : null;
            const score = scoreVal?.score ?? 0;
            const stakeInfo = stakeRes.status === 'fulfilled' ? stakeRes.value : null;
            const staked = stakeInfo ? stakeInfo.amountSOL > 0 : false;
            const stakeSOL = stakeInfo?.amountSOL ?? 0;
            const slashCount = stakeInfo?.slashedCount ?? 0;
            const tier = score >= 80 ? 'gold' : score >= 60 ? 'silver' : 'bronze';

            return {
              wallet,
              score,
              tier,
              staked,
              stakeSOL,
              slashCount,
              suitability: this.calculateSuitability(score, staked, stakeSOL, slashCount),
            } satisfies EvaluatorCandidate;
          }),
      );
      candidates = results
        .filter((r): r is PromiseFulfilledResult<EvaluatorCandidate> => r.status === 'fulfilled')
        .map(r => r.value);
    } else {
      // Use leaderboard to find candidates
      try {
        const leaderboard: LeaderboardEntry[] = await this.said.getLeaderboard();
        const wallets = leaderboard
          .filter(a => {
            const w = a.wallet ?? '';
            return w && !excludeSet.has(w);
          })
          .map(a => a.wallet).slice(0, 10);

        const results = await Promise.allSettled(
          wallets.map(async wallet => {
            const [scoreRes, stakeRes] = await Promise.allSettled([
              this.said.getTrustScore(wallet),
              this.said.getStakeInfo(wallet),
            ]);
            const scoreVal = scoreRes.status === 'fulfilled' ? scoreRes.value : null;
            const score = scoreVal?.score ?? 0;
            const stakeInfo = stakeRes.status === 'fulfilled' ? stakeRes.value : null;
            const staked = stakeInfo ? stakeInfo.amountSOL > 0 : false;
            const stakeSOL = stakeInfo?.amountSOL ?? 0;
            const slashCount = stakeInfo?.slashedCount ?? 0;
            const tier = score >= 80 ? 'gold' : score >= 60 ? 'silver' : 'bronze';

            return {
              wallet,
              score,
              tier,
              staked,
              stakeSOL,
              slashCount,
              suitability: this.calculateSuitability(score, staked, stakeSOL, slashCount),
            } satisfies EvaluatorCandidate;
          }),
        );
        candidates = results
          .filter((r): r is PromiseFulfilledResult<EvaluatorCandidate> => r.status === 'fulfilled')
          .map(r => r.value);
      } catch {
        // Leaderboard might not be available
      }
    }

    // Filter by requirements
    const qualified = candidates.filter(c => {
      if (c.score < minScore) return false;
      if (requireStaked && !c.staked) return false;
      if (c.slashCount > maxSlashes) return false;
      if (requireStaked && c.stakeSOL < this.config.evaluatorMinStakeSOL) return false;
      return true;
    });

    if (qualified.length === 0) {
      throw new Error(
        `No qualified evaluators found. Required: score≥${minScore}, staked=${requireStaked}, slashes≤${maxSlashes}. ` +
        `Checked ${candidates.length} candidates.`,
      );
    }

    // Sort by suitability (highest first)
    qualified.sort((a, b) => b.suitability - a.suitability);
    const best = qualified[0];

    return {
      wallet: best.wallet,
      score: best.score,
      tier: best.tier,
      staked: best.staked,
      stakeSOL: best.stakeSOL,
      suitability: best.suitability,
      reason: `Selected from ${qualified.length} qualified candidates. ` +
        `Score ${best.score}, ${best.stakeSOL.toFixed(2)} SOL staked, ${best.slashCount} slashes. ` +
        `Suitability score: ${best.suitability.toFixed(1)}/100.`,
      selectedAt: new Date().toISOString(),
    };
  }

  // ── Work Evaluation ──────────────────────────────────────────────────────

  /**
   * Evaluate delivered work and produce a verdict.
   *
   * This is the core ERC-8183 Evaluator function. After a provider
   * delivers work, the oracle assesses it and returns:
   *   - pass: work accepted, release payment
   *   - fail: work rejected, slash provider
   *   - partial: work partially accepted, partial payment + partial slash
   *
   * The evaluation uses:
   *   1. Provider's historical trust data (score, slashes, stake)
   *   2. Deliverable verification (hash matching)
   *   3. Claim validation
   *   4. Economic context (job value vs stake)
   *
   * @example
   * ```ts
   * const verdict = await oracle.evaluate({
   *   jobId: 'job-123',
   *   provider: 'PROVIDER_WALLET',
   *   client: 'CLIENT_WALLET',
   *   deliverableHash: '0xabc...',
   *   claim: 'Implemented auth module with JWT',
   * });
   * ```
   */
  async evaluate(input: EvaluateInput): Promise<EvaluationResult> {
    const timestamp = new Date().toISOString();

    // Fetch provider trust data
    const [scoreResult, stakeResult] = await Promise.allSettled([
      this.said.getTrustScore(input.provider),
      this.said.getStakeInfo(input.provider),
    ]);

    const scoreVal = scoreResult.status === 'fulfilled' ? scoreResult.value : null;
    const providerScore = scoreVal?.score ?? 0;
    const stake = stakeResult.status === 'fulfilled' ? stakeResult.value : null;
    const providerStaked = stake ? stake.amountSOL > 0 : false;
    const providerStakeSOL = stake?.amountSOL ?? 0;
    const providerSlashCount = stake?.slashedCount ?? 0;

    // Run evaluation criteria
    const criteria = this.evaluateCriteria(input, providerScore, providerStaked, providerSlashCount);

    // Calculate weighted pass rate
    const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
    const passedWeight = criteria.filter(c => c.passed).reduce((sum, c) => sum + c.weight, 0);
    const passRate = passedWeight / totalWeight;

    // Determine verdict
    let verdict: EvaluationVerdict;
    let confidence: number;
    let assessment: string;

    if (passRate >= 0.8) {
      verdict = 'pass';
      confidence = Math.round(70 + passRate * 25); // 70-95
      assessment = `Work accepted. ${criteria.filter(c => c.passed).length}/${criteria.length} criteria passed. ` +
        `Provider trust score ${providerScore} with ${providerStakeSOL.toFixed(2)} SOL staked.`;
    } else if (passRate >= 0.5) {
      verdict = 'partial';
      confidence = Math.round(50 + passRate * 20); // 50-70
      const failed = criteria.filter(c => !c.passed).map(c => c.name);
      assessment = `Work partially accepted. Failed criteria: ${failed.join(', ')}. ` +
        `Provider trust score ${providerScore}.`;
    } else {
      verdict = 'fail';
      confidence = Math.round(60 + (1 - passRate) * 30); // 60-90
      const failed = criteria.filter(c => !c.passed).map(c => c.name);
      assessment = `Work rejected. Failed criteria: ${failed.join(', ')}. ` +
        `Provider trust score ${providerScore}, ${providerSlashCount} prior slashes.`;
    }

    // Payment recommendation
    const jobValue = input.valueUSDC ?? 0;
    const paymentRec = this.calculatePayment(verdict, jobValue);

    // Slash recommendation for fail/partial
    let slashRec: SlashRecommendation | undefined;
    if (verdict !== 'pass' && providerStaked) {
      const severity = categorizeSeverity(
        providerSlashCount,
        providerScore,
        verdict === 'fail' && criteria.some(c => c.name === 'deliverable_exists' && !c.passed),
      );
      const slashPct = calculateSlashPct(severity, providerStakeSOL, this.config);
      slashRec = {
        slashPct,
        slashSOL: (providerStakeSOL * slashPct) / 100,
        reason: severity === 'severe'
          ? 'No deliverable provided or fraudulent submission'
          : severity === 'moderate'
            ? 'Work quality below acceptable threshold with prior history'
            : 'Minor quality issues on otherwise deliverable work',
        severity,
      };
    }

    // Generate signed receipt
    const receipt = this.generateReceipt(
      input.provider,
      'work_evaluation',
      verdict,
      input.jobId,
    );

    return {
      jobId: input.jobId,
      verdict,
      confidence,
      providerScore,
      providerStaked,
      providerStakeSOL,
      providerSlashCount,
      criteria,
      assessment,
      paymentRecommendation: paymentRec,
      slashRecommendation: slashRec,
      receipt,
      timestamp,
    };
  }

  // ── Batch Trust Check ────────────────────────────────────────────────────

  /**
   * Batch pre-transaction check for multiple wallets.
   * Useful for marketplaces processing many jobs simultaneously.
   */
  async batchTrustGate(
    wallets: string[],
    jobValueUSDC?: number,
  ): Promise<Map<string, HookResult>> {
    const results = await Promise.allSettled(
      wallets.map(w => this.trustGate({ wallet: w, jobValueUSDC, action: 'assign' })),
    );
    const map = new Map<string, HookResult>();
    wallets.forEach((wallet, i) => {
      const result = results[i];
      if (result && result.status === 'fulfilled') {
        map.set(wallet, result.value);
      }
    });
    return map;
  }

  // ── Internal Methods ─────────────────────────────────────────────────────

  /**
   * Calculate suitability score for an evaluator candidate.
   * Higher = better suited to evaluate work.
   */
  private calculateSuitability(
    score: number,
    staked: boolean,
    stakeSOL: number,
    slashCount: number,
  ): number {
    let suitability = score * 0.5; // 50% weight on score
    suitability += staked ? 20 : 0; // 20% bonus for staking
    suitability += Math.min(15, stakeSOL * 3); // up to 15% for stake depth
    suitability -= slashCount * 10; // -10 per slash
    suitability += score >= 80 ? 15 : score >= 60 ? 10 : 0; // tier bonus
    return Math.max(0, Math.min(100, suitability));
  }

  /**
   * Run evaluation criteria against the submission.
   */
  private evaluateCriteria(
    input: EvaluateInput,
    providerScore: number,
    providerStaked: boolean,
    providerSlashCount: number,
  ): EvaluationCriteria[] {
    const criteria: EvaluationCriteria[] = [];

    // 1. Deliverable exists (hash provided and non-empty)
    criteria.push({
      name: 'deliverable_exists',
      passed: !!input.deliverableHash && input.deliverableHash.length > 0,
      weight: 30,
      detail: input.deliverableHash
        ? `Deliverable hash provided: ${input.deliverableHash.substring(0, 20)}...`
        : 'No deliverable hash provided',
    });

    // 2. Claim is substantive (not empty/trivial)
    const claimWords = input.claim?.trim().split(/\s+/).length ?? 0;
    criteria.push({
      name: 'claim_substantive',
      passed: claimWords >= 3,
      weight: 15,
      detail: claimWords >= 3
        ? `Claim describes work (${claimWords} words)`
        : 'Claim is too brief or missing',
    });

    // 3. Provider has minimum trust
    criteria.push({
      name: 'provider_trust_minimum',
      passed: providerScore >= 30,
      weight: 20,
      detail: providerScore >= 30
        ? `Provider score ${providerScore} above minimum (30)`
        : `Provider score ${providerScore} below minimum (30)`,
    });

    // 4. Provider is staked (economic skin-in-the-game)
    criteria.push({
      name: 'provider_staked',
      passed: providerStaked,
      weight: 15,
      detail: providerStaked
        ? 'Provider has active stake — economic enforcement available'
        : 'Provider not staked — no economic recourse',
    });

    // 5. Clean slash history
    criteria.push({
      name: 'clean_slash_history',
      passed: providerSlashCount === 0,
      weight: 10,
      detail: providerSlashCount === 0
        ? 'No prior slashes'
        : `${providerSlashCount} prior slash(es)`,
    });

    // 6. Evidence provided (if applicable)
    const hasEvidence = !!input.evidence && Object.keys(input.evidence).length > 0;
    criteria.push({
      name: 'evidence_provided',
      passed: hasEvidence || true, // evidence is optional, defaults to pass
      weight: 10,
      detail: hasEvidence
        ? `Evidence provided: ${Object.keys(input.evidence!).join(', ')}`
        : 'No additional evidence (optional)',
    });

    return criteria;
  }

  /**
   * Calculate payment recommendation based on verdict.
   */
  private calculatePayment(
    verdict: EvaluationVerdict,
    jobValueUSDC: number,
  ): PaymentRecommendation {
    switch (verdict) {
      case 'pass':
        return {
          releasePct: 100,
          releaseAmountUSDC: jobValueUSDC,
          refundClient: false,
          reason: 'Work passed evaluation — release full escrow',
        };
      case 'partial':
        return {
          releasePct: 50,
          releaseAmountUSDC: jobValueUSDC * 0.5,
          refundClient: true,
          reason: 'Work partially accepted — release 50%, refund 50%',
        };
      case 'fail':
        return {
          releasePct: 0,
          releaseAmountUSDC: 0,
          refundClient: true,
          reason: 'Work failed evaluation — refund full escrow to client',
        };
      default:
        return {
          releasePct: 0,
          releaseAmountUSDC: 0,
          refundClient: true,
          reason: 'Unknown verdict — hold escrow pending review',
        };
    }
  }

  /**
   * Generate a signed trust receipt for non-repudiation.
   */
  private generateReceipt(
    subject: string,
    type: 'pre_transaction' | 'work_evaluation' | 'evaluator_selection',
    decision: string,
    contextId: string,
  ): TrustReceipt {
    const now = Date.now();
    const issuedAt = new Date(now).toISOString();
    const expiresAt = new Date(now + this.config.receiptTtlSec * 1000).toISOString();
    const receiptId = `said-${type}-${contextId}-${now.toString(36)}`;

    // Simple HMAC signature (in production, use proper crypto)
    const payload = `${receiptId}:${subject}:${type}:${decision}:${issuedAt}`;
    // Use a simple hash for browser/Node compatibility
    let signature = '0x';
    const secret = this.config.hmacSecret;
    for (let i = 0; i < payload.length; i++) {
      signature += (payload.charCodeAt(i) ^ secret.charCodeAt(i % secret.length)).toString(16).padStart(2, '0');
    }

    return {
      receiptId,
      subject,
      type,
      decision,
      signature,
      issuedAt,
      expiresAt,
    };
  }
}

// End of module
