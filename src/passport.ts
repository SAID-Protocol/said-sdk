/**
 * SAID Reputation Passport — Portable Cross-Protocol Trust Credential
 *
 * The #1 product recommendation from A2A Trust Gap research (July 2026).
 * Six independent sources confirmed no protocol supplies inter-agent reputation.
 * The Passport combines identity, trust score, enforcement data, and economic
 * backing into a single portable credential that works across MCP, A2A, x402, and AP2.
 *
 * Research sources:
 * - CSA MAESTRO: "a reputation system should be added to track agent behavior"
 * - AgentFide: "reputation cannot live inside any single rail"
 * - Tobira: reputation gets stripped in transit (identity, context, recency)
 * - HackerNoon: "identity per instance, portable across stacks, still doesn't exist"
 * - AgentRisk: only 3.5% of 2.3M tracked agents are trustworthy
 * - arXiv:2607.12575: 99.2% of x402 volume is fictitious/wash
 *
 * SAID's unique advantage: staking/slashing converts reputation from advisory
 * signal into financial guarantee. No competitor has this.
 */

// ── Types ───────────────────────────────────────────────────────────────────

/**
 * The trust dimensions captured in a Passport.
 * Each dimension is independently verifiable and contributes to the overall score.
 */
export interface PassportTrustDimensions {
  /** SAID composite trust score (0-100) */
  reputation: number;
  /** SOL staked as economic skin-in-the-game */
  economicSecurity: number;
  /** Number of times slashed (behavioural history) */
  slashingEvents: number;
  /** Whether SAID has verified the agent's identity */
  verified: boolean;
  /** Total feedback entries received */
  feedbackCount: number;
  /** Days since agent first registered */
  longevityDays: number;
}

/**
 * Risk classification for quick consumption by marketplaces, escrow services, and payment gates.
 */
export type PassportRiskLevel = 'low' | 'medium' | 'high' | 'critical' | 'unknown';

/**
 * The protocol formats this Passport can be serialised into.
 * Each target protocol receives the relevant subset of trust data.
 */
export type ProtocolTarget = 'mcp' | 'a2a' | 'x402' | 'ap2';

/**
 * A single portable trust attestation from a third-party platform.
 * Passports can carry attestations from multiple sources to increase confidence.
 */
export interface TrustAttestation {
  /** Platform that issued this attestation (e.g., 'clawpump', 'daemons', 'hyre') */
  source: string;
  /** Attestation type: behavioural, transactional, identity, economic */
  type: 'behavioural' | 'transactional' | 'identity' | 'economic';
  /** Score or rating from the source (0-100, normalised) */
  score: number;
  /** Number of data points behind this attestation */
  volume: number;
  /** ISO timestamp of last update */
  updatedAt: string;
}

/**
 * The full SAID Reputation Passport.
 *
 * This is the object agents carry across platforms. It contains:
 * - Identity: who the agent is (wallet, chain, name)
 * - Trust Dimensions: multi-dimensional trust signals from SAID's on-chain data
 * - Enforcement: staking/slashing status (SAID's unique differentiator)
 * - Attestations: optional third-party endorsements
 * - Portability: serialisation formats for each major protocol
 */
export interface ReputationPassport {
  /** Schema version for forward compatibility */
  version: 1;
  /** When this passport was generated (ISO timestamp) */
  issuedAt: string;
  /** When this passport expires (default: 5 minutes — trust is ephemeral) */
  expiresAt: string;

  // ── Identity ─────────────────────────────────────────────────────────────
  /** Agent's wallet address (the canonical cross-protocol identifier) */
  wallet: string;
  /** Chain the agent is registered on */
  chain: string;
  /** Agent name (if registered) */
  name: string | null;
  /** Agent description (if registered) */
  description: string | null;

  // ── Trust Dimensions ────────────────────────────────────────────────────
  dimensions: PassportTrustDimensions;

  // ── Enforcement (SAID's Unique Moat) ────────────────────────────────────
  /** Overall verdict: should this agent be trusted? */
  verdict: 'trusted' | 'provisional' | 'insufficient_evidence' | 'untrusted';
  /** Risk level for quick consumption */
  riskLevel: PassportRiskLevel;
  /** Recommended escrow percentage for transactions (0-100) */
  recommendedEscrowPct: number;
  /** Maximum recommended single-transaction value in USDC */
  recommendedMaxTxnUSDC: number | null;
  /** Maximum recommended daily spend in USDC */
  recommendedDailySpendUSDC: number | null;

  // ── Third-Party Attestations ────────────────────────────────────────────
  attestations: TrustAttestation[];

  // ── Provenance ─────────────────────────────────────────────────────────
  /** SAID API URL that produced this passport (for verification) */
  issuer: string;
}

// ── Protocol-Specific Serialisation Formats ────────────────────────────────

/**
 * MCP _meta field format (for the 2026-07-28 stateless revision).
 * Agents carry this in the _meta field of every MCP request.
 * Server-side parsing is stateless — zero API calls needed.
 */
export interface MCPMetaPassport {
  /** JWT compact serialisation (RFC 7515) if signed, null if unsigned */
  jwt: string | null;
  /** Wallet address */
  wallet: string;
  /** Composite score (0-100) */
  score: number;
  /** Trust tier */
  tier: 'trusted' | 'provisional' | 'insufficient_evidence' | 'untrusted';
  /** SOL staked */
  stakedSOL: number;
  /** Slashing count */
  slashed: number;
  /** Risk level */
  risk: PassportRiskLevel;
  /** ISO expiry timestamp */
  exp: string;
}

/**
 * A2A Agent Card extension fields.
 * Added to the standard A2A Agent Card JSON to carry trust data.
 */
export interface A2AAgentCardExtension {
  /** Extension identifier */
  type: 'said-reputation-passport';
  /** SAID score (0-100) */
  saidScore: number;
  /** SAID trust tier */
  saidTier: string;
  /** SOL staked as economic guarantee */
  stakedSOL: number;
  /** Slashing events */
  slashedCount: number;
  /** Risk level */
  riskLevel: PassportRiskLevel;
  /** SAID verification status */
  verified: boolean;
  /** SAID profile URL */
  profileUrl: string;
}

/**
 * x402 payment header format.
 * Included in HTTP 402 responses and payment requests.
 */
export interface X402TrustHeader {
  /** Header name */
  name: string;
  /** Header value */
  value: string;
}

/**
 * AP2 (Agent Payments Protocol) mandate extension.
 * Added to AP2 payment mandates to include agent trust metadata.
 */
export interface AP2MandateExtension {
  /** Extension type */
  type: 'said-trust';
  /** Agent trust data */
  agentTrust: {
    wallet: string;
    score: number;
    tier: string;
    stakedSOL: number;
    slashed: number;
    riskLevel: PassportRiskLevel;
    escrowPct: number;
    maxTxnUSDC: number | null;
  };
}

// ── Passport Builder ────────────────────────────────────────────────────────

/**
 * Configuration for passport generation.
 */
export interface PassportConfig {
  /** SAID API base URL */
  apiUrl?: string;
  /** Solana RPC URL */
  rpcUrl?: string;
  /** Passport TTL in seconds (default: 300 = 5 minutes) */
  ttlSeconds?: number;
  /** Whether to include third-party attestations */
  includeAttestations?: boolean;
}

/**
 * Input data for building a passport.
 * Typically gathered by calling SAIDClient methods in parallel.
 */
export interface PassportInput {
  wallet: string;
  chain?: string;
  name?: string | null;
  description?: string | null;
  verified?: boolean;
  registered?: boolean;
  trustScore?: number | null;
  stakeSOL?: number;
  slashedCount?: number;
  feedbackCount?: number;
  registeredAt?: string;
  attestations?: TrustAttestation[];
}

const DEFAULT_TTL_SECONDS = 300; // 5 minutes
const DEFAULT_API_URL = 'https://api.saidprotocol.com';

/**
 * Calculate trust dimensions from raw input data.
 * Normalises all signals to comparable scales.
 */
export function calculateDimensions(input: PassportInput): PassportTrustDimensions {
  const now = Date.now();
  const registeredAt = input.registeredAt ? new Date(input.registeredAt).getTime() : now;
  const longevityDays = Math.max(0, Math.floor((now - registeredAt) / (1000 * 60 * 60 * 24)));

  return {
    reputation: input.trustScore ?? 0,
    economicSecurity: input.stakeSOL ?? 0,
    slashingEvents: input.slashedCount ?? 0,
    verified: input.verified ?? false,
    feedbackCount: input.feedbackCount ?? 0,
    longevityDays,
  };
}

/**
 * Determine the overall trust verdict from dimensions.
 *
 * Philosophy: "Unknown ≠ zero" — unregistered agents get 'insufficient_evidence',
 * not 'untrusted'. This prevents false positives that block legitimate new agents.
 */
export function calculateVerdict(
  dims: PassportTrustDimensions,
  registered: boolean
): { verdict: ReputationPassport['verdict']; riskLevel: PassportRiskLevel } {
  if (!registered) {
    return { verdict: 'insufficient_evidence', riskLevel: 'unknown' };
  }

  const { reputation, economicSecurity, slashingEvents, verified } = dims;

  // Untrusted: slashed agents with poor scores, or repeat offenders
  if (slashingEvents > 0 && reputation < 40) {
    return { verdict: 'untrusted', riskLevel: 'critical' };
  }
  if (slashingEvents >= 3) {
    return { verdict: 'untrusted', riskLevel: 'critical' };
  }

  // Trusted: verified, good score, staked, no slashing
  if (verified && reputation >= 70 && economicSecurity >= 0.5 && slashingEvents === 0) {
    return { verdict: 'trusted', riskLevel: 'low' };
  }

  // Provisional: registered with some positive signals
  if (reputation >= 40 || economicSecurity > 0) {
    if (slashingEvents > 0) return { verdict: 'provisional', riskLevel: 'high' };
    if (reputation >= 60 && economicSecurity >= 0.1) return { verdict: 'provisional', riskLevel: 'medium' };
    return { verdict: 'provisional', riskLevel: 'medium' };
  }

  // Insufficient evidence: registered but no meaningful trust data.
  // Follows 'unknown ≠ zero' philosophy — don't penalise agents just for being new.
  return { verdict: 'insufficient_evidence', riskLevel: 'unknown' };
}

/**
 * Calculate escrow and spend recommendations based on trust dimensions.
 *
 * Higher trust → lower escrow → higher spend limits.
 * Staked agents get better terms because they have skin in the game.
 */
export function calculateTerms(dims: PassportTrustDimensions, verdict: ReputationPassport['verdict']): {
  escrowPct: number;
  maxTxnUSDC: number | null;
  dailySpendUSDC: number | null;
} {
  const { reputation, economicSecurity, slashingEvents } = dims;

  // Untrusted or insufficient: full escrow, no spending
  if (verdict === 'untrusted') {
    return { escrowPct: 100, maxTxnUSDC: 0, dailySpendUSDC: 0 };
  }
  if (verdict === 'insufficient_evidence') {
    return { escrowPct: 100, maxTxnUSDC: null, dailySpendUSDC: null };
  }

  // Base escrow from reputation score (higher score = lower escrow)
  let escrowPct = Math.max(0, 100 - reputation);

  // Stake bonus: each SOL staked reduces escrow by 5% (capped at 30% reduction)
  const stakeReduction = Math.min(30, economicSecurity * 5);
  escrowPct = Math.max(0, escrowPct - stakeReduction);

  // Slashing penalty: each slash adds 20% escrow
  escrowPct = Math.min(100, escrowPct + slashingEvents * 20);

  // Spend limits from trust + stake
  const baseLimit = reputation * 10; // score 80 → $800
  const stakeBonus = economicSecurity * 100; // 1 SOL → +$100
  const slashPenalty = slashingEvents * 200;
  const maxTxnUSDC = Math.max(0, baseLimit + stakeBonus - slashPenalty);

  const dailyMultiplier = verdict === 'trusted' ? 5 : 3;
  const dailySpendUSDC = Math.max(0, maxTxnUSDC * dailyMultiplier);

  return {
    escrowPct: Math.round(escrowPct),
    maxTxnUSDC: maxTxnUSDC > 0 ? Math.round(maxTxnUSDC) : null,
    dailySpendUSDC: dailySpendUSDC > 0 ? Math.round(dailySpendUSDC) : null,
  };
}

/**
 * Build a complete SAID Reputation Passport from input data.
 *
 * This is the primary entry point. Callers gather data via SAIDClient
 * (getAgent, getStakeInfo, getTrustScore) and pass it here.
 *
 * @example
 * ```ts
 * const client = new SAIDClient();
 * const agent = await client.getAgent(wallet);
 * const stake = await client.getStakeInfo(wallet);
 *
 * const passport = buildPassport({
 *   wallet,
 *   name: agent.name,
 *   verified: agent.verified,
 *   registered: agent.registered,
 *   trustScore: agent.trustScore?.score,
 *   stakeSOL: stake.amountSOL,
 *   slashedCount: stake.slashedCount,
 *   feedbackCount: agent.reputation?.feedbackCount,
 * });
 * ```
 */
export function buildPassport(
  input: PassportInput,
  config: PassportConfig = {}
): ReputationPassport {
  const ttl = config.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const now = Date.now();
  const expires = new Date(now + ttl * 1000);

  const dimensions = calculateDimensions(input);
  const { verdict, riskLevel } = calculateVerdict(dimensions, input.registered ?? false);
  const terms = calculateTerms(dimensions, verdict);

  return {
    version: 1,
    issuedAt: new Date(now).toISOString(),
    expiresAt: expires.toISOString(),

    wallet: input.wallet,
    chain: input.chain ?? 'solana',
    name: input.name ?? null,
    description: input.description ?? null,

    dimensions,
    verdict,
    riskLevel,
    recommendedEscrowPct: terms.escrowPct,
    recommendedMaxTxnUSDC: terms.maxTxnUSDC,
    recommendedDailySpendUSDC: terms.dailySpendUSDC,

    attestations: (config.includeAttestations ?? true) ? (input.attestations ?? []) : [],

    issuer: config.apiUrl ?? DEFAULT_API_URL,
  };
}

// ── Serialisation ───────────────────────────────────────────────────────────

/**
 * Serialise passport to MCP _meta format for stateless trust checking.
 *
 * Agents include this in the _meta field of MCP requests. Servers parse it
 * with zero API calls. Compatible with the KYAPay JWT format.
 *
 * @example
 * ```ts
 * const meta = toMCPMeta(passport, { jwt: signedJwt });
 * // → { wallet, score, tier, stakedSOL, slashed, risk, exp }
 * ```
 */
export function toMCPMeta(
  passport: ReputationPassport,
  opts: { jwt?: string | null } = {}
): MCPMetaPassport {
  return {
    jwt: opts.jwt ?? null,
    wallet: passport.wallet,
    score: passport.dimensions.reputation,
    tier: passport.verdict,
    stakedSOL: passport.dimensions.economicSecurity,
    slashed: passport.dimensions.slashingEvents,
    risk: passport.riskLevel,
    exp: passport.expiresAt,
  };
}

/**
 * Serialise passport to A2A Agent Card extension fields.
 *
 * Added to the standard A2A Agent Card JSON to carry trust data
 * alongside the agent's capabilities and endpoints.
 */
export function toA2ACard(
  passport: ReputationPassport,
  profileUrl = `https://saidprotocol.com/agent/${passport.wallet}`
): A2AAgentCardExtension {
  return {
    type: 'said-reputation-passport',
    saidScore: passport.dimensions.reputation,
    saidTier: passport.verdict,
    stakedSOL: passport.dimensions.economicSecurity,
    slashedCount: passport.dimensions.slashingEvents,
    riskLevel: passport.riskLevel,
    verified: passport.dimensions.verified,
    profileUrl,
  };
}

/**
 * Serialise passport to x402 trust headers.
 *
 * Included in HTTP 402 payment responses so agents can evaluate
 * the counterparty's trustworthiness before paying.
 */
export function toX402Headers(passport: ReputationPassport): X402TrustHeader[] {
  return [
    { name: 'X-SAID-Verdict', value: passport.verdict },
    { name: 'X-SAID-Score', value: String(passport.dimensions.reputation) },
    { name: 'X-SAID-Risk-Level', value: passport.riskLevel },
    { name: 'X-SAID-Staked-SOL', value: passport.dimensions.economicSecurity.toFixed(2) },
    { name: 'X-SAID-Slashed', value: String(passport.dimensions.slashingEvents) },
    { name: 'X-SAID-Escrow-Pct', value: String(passport.recommendedEscrowPct) },
    { name: 'X-SAID-Expires', value: passport.expiresAt },
  ];
}

/**
 * Serialise passport to AP2 mandate extension format.
 *
 * Added to Google's Agent Payments Protocol mandates to include
 * agent trust metadata alongside payment authorisation.
 */
export function toAP2Mandate(passport: ReputationPassport): AP2MandateExtension {
  return {
    type: 'said-trust',
    agentTrust: {
      wallet: passport.wallet,
      score: passport.dimensions.reputation,
      tier: passport.verdict,
      stakedSOL: passport.dimensions.economicSecurity,
      slashed: passport.dimensions.slashingEvents,
      riskLevel: passport.riskLevel,
      escrowPct: passport.recommendedEscrowPct,
      maxTxnUSDC: passport.recommendedMaxTxnUSDC,
    },
  };
}

/**
 * Serialise passport to a compact JSON string for transport.
 * Useful for embedding in JWT payloads or HTTP headers.
 */
export function toJSON(passport: ReputationPassport): string {
  return JSON.stringify(passport);
}

/**
 * Parse a passport from JSON. Validates schema version.
 * Returns null if the passport is expired or invalid.
 */
export function fromJSON(json: string): ReputationPassport | null {
  try {
    const parsed = JSON.parse(json) as ReputationPassport;
    if (parsed.version !== 1) return null;

    // Check expiry
    const expires = new Date(parsed.expiresAt).getTime();
    if (Date.now() > expires) return null;

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Check whether a passport is still valid (not expired).
 */
export function isValid(passport: ReputationPassport): boolean {
  return Date.now() < new Date(passport.expiresAt).getTime();
}

/**
 * Merge multiple trust attestations into a passport.
 * Used when a passport receives new third-party endorsements.
 */
export function addAttestation(
  passport: ReputationPassport,
  attestation: TrustAttestation
): ReputationPassport {
  // Remove existing attestation from same source
  const filtered = passport.attestations.filter(a => a.source !== attestation.source);
  return {
    ...passport,
    attestations: [...filtered, attestation],
  };
}

/**
 * Get a composite score from all attestations.
 * Weighted by data volume — more data points = higher confidence.
 */
export function getAttestationScore(passport: ReputationPassport): number | null {
  if (passport.attestations.length === 0) return null;

  const totalWeight = passport.attestations.reduce((sum, a) => sum + a.volume, 0);
  if (totalWeight === 0) return null;

  const weightedSum = passport.attestations.reduce(
    (sum, a) => sum + a.score * a.volume,
    0
  );

  return Math.round((weightedSum / totalWeight) * 10) / 10;
}
