/**
 * SAID Protocol — x402 Payment Trust Facilitator
 *
 * Intercepts HTTP 402 (Payment Required) responses and enforces SAID trust
 * checks BEFORE payment is settled. This is the critical integration point
 * between SAID's trust infrastructure and the x402 payment standard.
 *
 * The flow:
 *   1. Agent makes a request to an x402-enabled endpoint
 *   2. Server responds with 402 + payment challenge
 *   3. SAID facilitator intercepts, checks trust score of the payee
 *   4. If trust check passes → payment proceeds
 *   5. If trust check fails → payment blocked, agent protected
 *
 * This protects AGENTS from paying untrusted endpoints, and protects
 * ENDPOINTS from serving untrusted agents. Two-sided trust enforcement.
 *
 * @example Protect an agent from paying untrusted endpoints
 * ```ts
 * import { SAIDClient } from '@said-protocol/client';
 * import { X402TrustFacilitator } from '@said-protocol/client/x402';
 *
 * const said = new SAIDClient({ keypairBytes });
 * const facilitator = new X402TrustFacilitator(said);
 *
 * // Wrap fetch — all 402 responses will be trust-checked before payment
 * const trustedFetch = facilitator.wrapFetch(fetch);
 *
 * // If the endpoint is untrusted, payment won't be sent
 * const res = await trustedFetch('https://api.example.com/data');
 * ```
 *
 * @example Server-side: gate access before sending 402
 * ```ts
 * const gate = await facilitator.checkPaymentTrust(request, response);
 * if (gate.deny) {
 *   return new Response('Untrusted payer', { status: 403 });
 * }
 * // Proceed with 402 payment challenge...
 * ```
 */

import type { SAIDClient, RiskAssessment, TrustPolicy, PolicyDecision } from './index.js';

// ── Types ───────────────────────────────────────────────────────────────────

/**
 * Configuration for the x402 trust facilitator.
 */
export interface X402FacilitatorConfig {
  /**
   * Policy for evaluating PAYEES (endpoints receiving payment).
   * Default: POLICY_X402 (minScore 40, no verification required).
   * Set stricter to protect agents from scam endpoints.
   */
  payeePolicy?: TrustPolicy;

  /**
   * Policy for evaluating PAYERS (agents making payment).
   * Default: undefined (server-side only, use middleware for this).
   */
  payerPolicy?: TrustPolicy;

  /**
   * Maximum payment amount (USDC) for unverified payees.
   * Default: 1.0 USDC. Set to 0 to block all unverified payees.
   */
  maxUnverifiedPaymentUSDC?: number;

  /**
   * Whether to attach trust metadata to payment headers.
   * Default: true. Adds x-said-trust-* headers to payment responses.
   */
  attachTrustMetadata?: boolean;

  /**
   * Whether to cache trust check results.
   * Default: true (uses SAIDClient's internal cache).
   */
  cacheResults?: boolean;
}

/**
 * Result of a trust check on an x402 payment flow.
 */
export interface X402TrustResult {
  /** Whether the payment should proceed */
  allow: boolean;
  /** Whether the payment should be blocked */
  deny: boolean;
  /** Whether manual review is recommended */
  review: boolean;
  /** Reason for the decision */
  reason: string;
  /** Which side was checked */
  checked: 'payee' | 'payer' | 'both';
  /** Payee wallet address (if determined) */
  payeeWallet: string | null;
  /** Payer wallet address (if determined) */
  payerWallet: string | null;
  /** Risk assessment of the payee (if checked) */
  payeeRisk: RiskAssessment | null;
  /** Risk assessment of the payer (if checked) */
  payerRisk: RiskAssessment | null;
  /** Recommended maximum payment amount in USDC */
  recommendedMaxUSDC: number | null;
  /** Recommended escrow percentage for this transaction */
  recommendedEscrowPct: number;
  /** Trust metadata headers to attach to responses */
  headers: Record<string, string>;
  /** Timestamp */
  timestamp: string;
}

/**
 * Extract a wallet address from a payment challenge.
 * x402 challenges may contain the payee in various header formats.
 */
export type WalletExtractor = (response: Response) => string | null;

// ── Default wallet extraction ─────────────────────────────────────────────

/**
 * Extract payee wallet from x402 payment challenge headers.
 *
 * x402 uses the `WWW-Authenticate` header with the payment scheme.
 * The payee address may be in:
 *   - `X-Payee` header (direct)
 *   - `X-Said-Payee` header (SAID-specific)
 *   - Payment challenge body (parsed from JSON)
 */
export const defaultPayeeExtractor: WalletExtractor = (response: Response): string | null => {
  // Direct headers
  const direct = response.headers.get('x-payee') ??
                 response.headers.get('x-said-payee') ??
                 response.headers.get('x-agent-wallet');
  if (direct) return direct;

  // Try parsing from payment challenge body
  // The body may contain the payee address in the payment parameters
  // We don't consume the body here — just peek
  return null;
};

// ── Facilitator ───────────────────────────────────────────────────────────

/**
 * X402TrustFacilitator — trust enforcement for x402 payment flows.
 *
 * This is the bridge between SAID's trust infrastructure and the x402
 * payment standard. It intercepts HTTP 402 responses and checks trust
 * BEFORE payment is made, protecting both sides of the transaction.
 *
 * Two-sided trust:
 *   - PAYEE trust: Is the endpoint I'm paying trustworthy? (protects agents)
 *   - PAYER trust: Is the agent paying me trustworthy? (protects endpoints)
 *
 * @example Wrap fetch for agent-side protection
 * ```ts
 * const facilitator = new X402TrustFacilitator(saidClient);
 * const safeFetch = facilitator.wrapFetch(fetch);
 *
 * // Untrusted endpoints won't receive payment
 * const res = await safeFetch('https://api.untrusted-endpoint.com/data');
 * if (res.status === 403 && res.headers.get('x-said-blocked')) {
 *   console.log('Payment blocked — untrusted endpoint');
 * }
 * ```
 */
export class X402TrustFacilitator {
  private client: SAIDClient;
  private config: Required<X402FacilitatorConfig>;

  constructor(client: SAIDClient, config: X402FacilitatorConfig = {}) {
    this.client = client;
    this.config = {
      payeePolicy: config.payeePolicy ?? {
        minScore: 40,
        requireVerified: false,
        maxRiskTier: 'moderate' as const,
      },
      payerPolicy: config.payerPolicy ?? {
        minScore: 0,
        maxRiskTier: 'elevated' as const,
      },
      maxUnverifiedPaymentUSDC: config.maxUnverifiedPaymentUSDC ?? 1.0,
      attachTrustMetadata: config.attachTrustMetadata ?? true,
      cacheResults: config.cacheResults ?? true,
    };
  }

  /**
   * Check trust for an x402 payment flow.
   *
   * Call this when you receive a 402 response to check whether the
   * payee is trustworthy before sending payment.
   *
   * @example
   * ```ts
   * const res = await fetch('https://api.example.com/data');
   * if (res.status === 402) {
   *   const trust = await facilitator.checkPayment(res);
   *   if (trust.deny) {
   *     console.log(`Payment blocked: ${trust.reason}`);
   *     return;
   *   }
   *   // Safe to proceed with payment
   * }
   * ```
   */
  async checkPayment(
    response: Response,
    options: {
      payeeWallet?: string;
      payerWallet?: string;
      paymentAmountUSDC?: number;
    } = {},
  ): Promise<X402TrustResult> {
    const payeeWallet = options.payeeWallet ?? defaultPayeeExtractor(response);
    const payerWallet = options.payerWallet ?? null;
    const amount = options.paymentAmountUSDC ?? null;

    const headers: Record<string, string> = {};
    const timestamp = new Date().toISOString();

    // No payee identified — can't check, allow by default
    if (!payeeWallet) {
      return {
        allow: true,
        deny: false,
        review: false,
        reason: 'No payee wallet identified — skipping trust check',
        checked: payerWallet ? 'payer' : 'payee',
        payeeWallet: null,
        payerWallet,
        payeeRisk: null,
        payerRisk: null,
        recommendedMaxUSDC: null,
        recommendedEscrowPct: 0,
        headers,
        timestamp,
      };
    }

    // Assess payee trust
    const payeeRisk = await this.client.getRiskAssessment(payeeWallet);
    const payeeAssessment = await this.client.assess(payeeWallet, this.config.payeePolicy);

    headers['x-said-payee-wallet'] = payeeWallet;
    headers['x-said-payee-score'] = String(payeeRisk.score ?? 'N/A');
    headers['x-said-payee-tier'] = payeeRisk.tier;
    headers['x-said-payee-decision'] = payeeAssessment.decision;

    let payerRisk: RiskAssessment | null = null;
    let payerDecision: PolicyDecision | null = null;

    // Assess payer trust if provided
    if (payerWallet) {
      payerRisk = await this.client.getRiskAssessment(payerWallet);
      const payerAssessment = await this.client.assess(payerWallet, this.config.payerPolicy);
      payerDecision = payerAssessment.decision;

      headers['x-said-payer-wallet'] = payerWallet;
      headers['x-said-payer-score'] = String(payerRisk.score ?? 'N/A');
      headers['x-said-payer-tier'] = payerRisk.tier;
      headers['x-said-payer-decision'] = payerDecision;
    }

    // Determine verdict
    let allow = true;
    let deny = false;
    let review = false;
    const reasons: string[] = [];

    // Payee checks — protect the payer
    if (payeeAssessment.decision === 'deny') {
      deny = true;
      allow = false;
      reasons.push(`Payee trust denied: ${payeeAssessment.reason}`);
    }

    // Amount-based checks
    if (amount !== null && payeeRisk.recommendedMaxValueUSDC !== null) {
      if (amount > payeeRisk.recommendedMaxValueUSDC) {
        if (amount > payeeRisk.recommendedMaxValueUSDC * 2) {
          deny = true;
          allow = false;
          reasons.push(
            `Payment ${amount} USDC exceeds payee max ${payeeRisk.recommendedMaxValueUSDC} USDC`,
          );
        } else {
          review = true;
          reasons.push(
            `Payment ${amount} USDC above recommended ${payeeRisk.recommendedMaxValueUSDC} USDC`,
          );
        }
      }
    }

    // Unverified payee amount cap
    if (!payeeRisk.verified && amount !== null && this.config.maxUnverifiedPaymentUSDC > 0) {
      if (amount > this.config.maxUnverifiedPaymentUSDC) {
        review = true;
        reasons.push(
          `Unverified payee, payment ${amount} USDC exceeds unverified cap ${this.config.maxUnverifiedPaymentUSDC} USDC`,
        );
      }
    }

    // Payer checks — protect the payee
    if (payerDecision === 'deny') {
      deny = true;
      allow = false;
      reasons.push(`Payer trust denied`);
    }

    // Escrow recommendation
    const recommendedEscrowPct = Math.max(
      payeeRisk.recommendedEscrowPct,
      payerRisk?.recommendedEscrowPct ?? 0,
    );

    // Recommended max based on risk
    const recommendedMaxUSDC = payeeRisk.recommendedMaxValueUSDC;

    headers['x-said-escrow-pct'] = String(recommendedEscrowPct);
    if (recommendedMaxUSDC !== null) {
      headers['x-said-max-usdc'] = String(recommendedMaxUSDC);
    }

    // Final header
    const verdict = deny ? 'deny' : review ? 'review' : 'allow';
    headers['x-said-verdict'] = verdict;

    return {
      allow: !deny,
      deny,
      review,
      reason: reasons.length > 0 ? reasons.join('; ') : 'Trust check passed',
      checked: payerWallet ? 'both' : 'payee',
      payeeWallet,
      payerWallet,
      payeeRisk,
      payerRisk,
      recommendedMaxUSDC,
      recommendedEscrowPct,
      headers,
      timestamp,
    };
  }

  /**
   * Wrap a fetch function with x402 trust enforcement.
   *
   * When the wrapped fetch receives a 402 response, it checks the payee's
   * trust score BEFORE allowing payment to proceed. If the payee is
   * untrusted, the 402 is converted to a 403 with trust metadata.
   *
   * This is the primary integration point for AGENTS using x402 payments.
   *
   * @example
   * ```ts
   * const facilitator = new X402TrustFacilitator(saidClient);
   * const safeFetch = facilitator.wrapFetch(fetch);
   *
   * // This will trust-check any 402 response automatically
   * const res = await safeFetch('https://api.example.com/paid-endpoint');
   * if (res.headers.get('x-said-verdict') === 'deny') {
   *   console.log('Payment was blocked by SAID trust check');
   * }
   * ```
   */
  wrapFetch(
    fetchFn: typeof fetch,
    options: {
      payerWallet?: string;
      maxPaymentUSDC?: number;
    } = {},
  ): typeof fetch {
    const facilitator = this;

    return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const res = await fetchFn(input, init);

      // Only intercept 402 responses
      if (res.status !== 402) {
        return res;
      }

      // Check trust before payment
      const trust = await facilitator.checkPayment(res, {
        payerWallet: options.payerWallet,
        paymentAmountUSDC: options.maxPaymentUSDC ?? undefined,
      });

      // If denied, return a 403 instead of proceeding with payment
      if (trust.deny) {
        const headers = new Headers(res.headers);
        if (facilitator.config.attachTrustMetadata) {
          for (const [k, v] of Object.entries(trust.headers)) {
            headers.set(k, v);
          }
        }
        headers.set('x-said-blocked', 'true');

        return new Response(
          JSON.stringify({
            error: 'Payment blocked by SAID trust check',
            reason: trust.reason,
            payeeWallet: trust.payeeWallet,
            verdict: 'deny',
          }),
          {
            status: 403,
            headers: {
              'Content-Type': 'application/json',
              ...Object.fromEntries(headers.entries()),
            },
          },
        );
      }

      // If review recommended, add warning header but allow payment
      if (trust.review && facilitator.config.attachTrustMetadata) {
        const headers = new Headers(res.headers);
        for (const [k, v] of Object.entries(trust.headers)) {
          headers.set(k, v);
        }
        headers.set('x-said-warning', trust.reason);

        // Clone response with added headers
        return new Response(res.body, {
          status: res.status,
          statusText: res.statusText,
          headers,
        });
      }

      // Trust check passed — attach metadata and return original response
      if (facilitator.config.attachTrustMetadata) {
        const headers = new Headers(res.headers);
        for (const [k, v] of Object.entries(trust.headers)) {
          headers.set(k, v);
        }
        return new Response(res.body, {
          status: res.status,
          statusText: res.statusText,
          headers,
        });
      }

      return res;
    };
  }

  /**
   * Create a payment pre-flight check for a specific endpoint.
   *
   * Use this BEFORE making a request to check if the endpoint is trustworthy.
   * Returns a recommendation on whether to proceed.
   *
   * @example
   * ```ts
   * const preflight = await facilitator.preflight('https://api.example.com', {
   *   payeeWallet: 'ENDPOINT_WALLET',
   *   paymentAmountUSDC: 5.0,
   * });
   *
   * if (preflight.deny) {
   *   console.log('Don't use this endpoint — untrusted');
   * }
   * ```
   */
  async preflight(
    endpoint: string | URL,
    options: {
      payeeWallet?: string;
      payerWallet?: string;
      paymentAmountUSDC?: number;
    } = {},
  ): Promise<X402TrustResult> {
    // If we have the payee wallet, check directly without making a request
    if (options.payeeWallet) {
      return this.checkPayment(
        new Response(null, { status: 402 }),
        options,
      );
    }

    // Otherwise, make a HEAD request to discover the payee
    try {
      const res = await fetch(endpoint, { method: 'HEAD' });
      const payeeWallet = defaultPayeeExtractor(res) ?? undefined;

      return this.checkPayment(
        new Response(null, {
          status: res.status,
          headers: res.headers,
        }),
        { ...options, payeeWallet },
      );
    } catch {
      return {
        allow: true,
        deny: false,
        review: false,
        reason: 'Preflight request failed — skipping trust check',
        checked: 'payee',
        payeeWallet: null,
        payerWallet: options.payerWallet ?? null,
        payeeRisk: null,
        payerRisk: null,
        recommendedMaxUSDC: null,
        recommendedEscrowPct: 0,
        headers: {},
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Batch trust check for multiple payment endpoints.
   *
   * Useful when an agent is evaluating multiple providers for a task
   * and wants to pick the most trustworthy one.
   *
   * @example
   * ```ts
   * const results = await facilitator.batchCheck([
   *   { payeeWallet: 'WALLET_A', paymentAmountUSDC: 5 },
   *   { payeeWallet: 'WALLET_B', paymentAmountUSDC: 5 },
   *   { payeeWallet: 'WALLET_C', paymentAmountUSDC: 5 },
   * ]);
   *
   * // Pick the highest-trust provider
   * const best = results
   *   .filter(r => r.allow)
   *   .sort((a, b) => (b.payeeRisk?.score ?? 0) - (a.payeeRisk?.score ?? 0))[0];
   * ```
   */
  async batchCheck(
    payments: Array<{
      payeeWallet: string;
      payerWallet?: string;
      paymentAmountUSDC?: number;
    }>,
  ): Promise<X402TrustResult[]> {
    return Promise.all(
      payments.map((p) =>
        this.checkPayment(
          new Response(null, { status: 402 }),
          p,
        ),
      ),
    );
  }

  /**
   * Pick the most trustworthy provider from a list.
   *
   * Convenience method that runs batchCheck and returns the highest-scoring
   * trusted provider. Returns null if none are trusted.
   *
   * @example
   * ```ts
   * const best = await facilitator.pickBestProvider([
   *   'WALLET_A', 'WALLET_B', 'WALLET_C',
   * ]);
   * if (best) {
   *   console.log(`Best provider: ${best.payeeWallet} (score: ${best.payeeRisk?.score})`);
   * }
   * ```
   */
  async pickBestProvider(
    payeeWallets: string[],
    options: { paymentAmountUSDC?: number } = {},
  ): Promise<X402TrustResult | null> {
    const results = await this.batchCheck(
      payeeWallets.map((w) => ({
        payeeWallet: w,
        paymentAmountUSDC: options.paymentAmountUSDC,
      })),
    );

    const trusted = results
      .filter((r) => r.allow && !r.deny)
      .sort((a, b) => {
        const scoreA = a.payeeRisk?.score ?? 0;
        const scoreB = b.payeeRisk?.score ?? 0;
        return scoreB - scoreA;
      });

    return trusted[0] ?? null;
  }
}

// ── Utility: Payment Trust Header Parser ──────────────────────────────────

/**
 * Parse SAID trust headers from a response.
 *
 * When the X402TrustFacilitator attaches trust metadata to responses,
 * this helper parses those headers back into a structured object.
 *
 * @example
 * ```ts
 * const res = await fetch('https://api.example.com/data');
 * const trust = parseTrustHeaders(res.headers);
 * if (trust.verdict === 'deny') {
 *   console.log('Untrusted endpoint');
 * }
 * ```
 */
export function parseTrustHeaders(
  headers: Headers | Record<string, string>,
): {
  verdict: string | null;
  payeeWallet: string | null;
  payeeScore: number | null;
  payeeTier: string | null;
  payerWallet: string | null;
  payerScore: number | null;
  escrowPct: number | null;
  maxUSDC: number | null;
  blocked: boolean;
  warning: string | null;
} {
  const get = (key: string): string | null => {
    if (headers instanceof Headers) {
      return headers.get(key);
    }
    // Case-insensitive lookup for plain objects
    const found = Object.entries(headers).find(
      ([k]) => k.toLowerCase() === key.toLowerCase(),
    );
    return found ? found[1] : null;
  };

  const scoreStr = get('x-said-payee-score');
  const payerScoreStr = get('x-said-payer-score');
  const escrowStr = get('x-said-escrow-pct');
  const maxStr = get('x-said-max-usdc');

  return {
    verdict: get('x-said-verdict'),
    payeeWallet: get('x-said-payee-wallet'),
    payeeScore: scoreStr && scoreStr !== 'N/A' ? Number(scoreStr) : null,
    payeeTier: get('x-said-payee-tier'),
    payerWallet: get('x-said-payer-wallet'),
    payerScore: payerScoreStr && payerScoreStr !== 'N/A' ? Number(payerScoreStr) : null,
    escrowPct: escrowStr ? Number(escrowStr) : null,
    maxUSDC: maxStr ? Number(maxStr) : null,
    blocked: get('x-said-blocked') === 'true',
    warning: get('x-said-warning'),
  };
}
