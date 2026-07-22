/**
 * SAID Trust Middleware — Trust-gating for HTTP and x402 payment flows
 *
 * Creates middleware that checks SAID trust scores BEFORE requests settle.
 * Three modes: block (hard reject), flag (add headers, allow), escalate (require stake).
 *
 * @example Fetch middleware (works with any Request/Response handler)
 * ```ts
 * import { SAIDClient, createTrustMiddleware } from '@said-protocol/client';
 *
 * const client = new SAIDClient();
 * const middleware = createTrustMiddleware(client, {
 *   mode: 'block',
 *   minScore: 40,
 *   requireVerified: true,
 *   extractWallet: (req) => req.headers.get('x-agent-wallet') ?? undefined,
 * });
 *
 * // In your handler:
 * const result = await middleware(request);
 * if (result.denied) return new Response('Trust check failed', { status: 403 });
 * // Proceed with result.wallet, result.trustScore
 * ```
 */

import type { SAIDClient } from './index.js';
import type { TrustScoreBreakdown, AgentVerification, StakeInfo } from './index.js';

// ── Types ──────────────────────────────────────────────────────────────────

export type MiddlewareMode = 'block' | 'flag' | 'escalate';

export interface TrustMiddlewareOptions {
  /** How to handle untrusted agents */
  mode?: MiddlewareMode;
  /** Minimum trust score (0-100). Agents below are denied/flagged. */
  minScore?: number;
  /** Require SAID verification (on-chain verified status) */
  requireVerified?: boolean;
  /** Minimum required stake in SOL (only checked in 'escalate' mode) */
  minStakeSOL?: number;
  /**
   * Extract the wallet address from the request.
   * Default: reads `x-agent-wallet` header, then `x-said-wallet`.
   * Return undefined to skip trust check for this request.
   */
  extractWallet?: (request: Request) => string | undefined;
  /** Skip trust check for these wallet addresses (e.g., platform admin) */
  allowlist?: string[];
  /** Custom denial response status code (default: 403) */
  denialStatus?: number;
}

export interface TrustCheckResult {
  /** Whether the request was denied by the trust middleware */
  denied: boolean;
  /** Reason for denial, if denied */
  reason?: string;
  /** The wallet that was checked */
  wallet: string | null;
  /** Agent verification data (if available) */
  agent: AgentVerification | null;
  /** Trust score breakdown (if available) */
  trustScore: TrustScoreBreakdown | null;
  /** Stake info (if fetched) */
  stake: StakeInfo | null;
  /** Mode that was applied */
  mode: MiddlewareMode;
  /** Headers to attach to the response (for 'flag' mode) */
  headers: Record<string, string>;
}

/**
 * Minimal handler interface — works with Fetch API, Express (via adapter),
 * Hono, Next.js Route Handlers, Cloudflare Workers, etc.
 */
export type TrustMiddlewareFn = (request: Request) => Promise<TrustCheckResult>;

// ── Default wallet extractor ────────────────────────────────────────────────

function defaultExtractWallet(request: Request): string | undefined {
  return request.headers.get('x-agent-wallet') ??
         request.headers.get('x-said-wallet') ??
         undefined;
}

// ── Factory ────────────────────────────────────────────────────────────────

/**
 * Create a trust middleware function bound to a SAIDClient instance.
 *
 * The returned function takes a standard Request and returns a TrustCheckResult.
 * It does NOT modify the request or send a response — the caller decides what
 * to do based on `result.denied`.
 *
 * This is the building block for:
 * - x402 payment trust gating (check before settlement)
 * - API endpoint protection (check before processing)
 * - Marketplace trust enforcement (check before matching)
 * - Escrow term determination (check before creating)
 *
 * @example Block mode — hard reject untrusted agents
 * ```ts
 * const mw = createTrustMiddleware(client, { mode: 'block', minScore: 50 });
 * const result = await mw(request);
 * if (result.denied) return new Response('Untrusted', { status: 403 });
 * // Continue processing...
 * ```
 *
 * @example Flag mode — add headers but allow through
 * ```ts
 * const mw = createTrustMiddleware(client, { mode: 'flag', minScore: 40 });
 * const result = await mw(request);
 * const response = handler(request);
 * // Attach trust headers
 * result.headers.forEach((v, k) => response.headers.set(k, v));
 * return response;
 * ```
 *
 * @example Escalate mode — require stake for low-score agents
 * ```ts
 * const mw = createTrustMiddleware(client, {
 *   mode: 'escalate', minScore: 30, minStakeSOL: 1.0,
 * });
 * const result = await mw(request);
 * if (result.denied) return new Response('Insufficient stake', { status: 402 });
 * ```
 */
export function createTrustMiddleware(
  client: SAIDClient,
  options: TrustMiddlewareOptions = {},
): TrustMiddlewareFn {
  const {
    mode = 'block',
    minScore = 0,
    requireVerified = false,
    minStakeSOL = 0,
    extractWallet = defaultExtractWallet,
    allowlist = [],
    denialStatus = 403,
  } = options;

  return async (request: Request): Promise<TrustCheckResult> => {
    const wallet = extractWallet(request);

    // No wallet found — allow by default (middleware is opt-in per request)
    if (!wallet) {
      return {
        denied: false,
        wallet: null,
        agent: null,
        trustScore: null,
        stake: null,
        mode,
        headers: {},
      };
    }

    // Allowlist bypass
    if (allowlist.includes(wallet)) {
      return {
        denied: false,
        wallet,
        agent: null,
        trustScore: null,
        stake: null,
        mode,
        headers: { 'x-said-allowlisted': 'true' },
      };
    }

    // Fetch agent data (and stake if escalate mode)
    const [agent, stake] = await Promise.all([
      client.getAgent(wallet),
      mode === 'escalate' || minStakeSOL > 0
        ? client.getStakeInfo(wallet)
        : Promise.resolve(null),
    ]);

    const trustScore = agent.trustScore ?? null;
    const headers: Record<string, string> = {
      'x-said-wallet': wallet,
      'x-said-verified': String(agent.verified),
    };

    if (trustScore) {
      headers['x-said-score'] = String(trustScore.score);
      headers['x-said-tier'] = trustScore.tier;
    }

    if (stake) {
      headers['x-said-stake-sol'] = stake.amountSOL.toFixed(4);
      headers['x-said-stake-status'] = stake.status;
    }

    // ── Determine trust verdict ──

    const reasons: string[] = [];

    if (!agent.registered) {
      reasons.push('Agent not registered with SAID Protocol');
    }

    if (requireVerified && !agent.verified) {
      reasons.push('Agent not verified');
    }

    const score = trustScore?.score ?? 0;
    if (agent.registered && score < minScore) {
      reasons.push(`Trust score ${score} below minimum ${minScore}`);
    }

    // Escalate mode: require stake
    if (mode === 'escalate' && stake) {
      if (stake.amountSOL < minStakeSOL) {
        reasons.push(`Stake ${stake.amountSOL.toFixed(4)} SOL below minimum ${minStakeSOL} SOL`);
      }
      if (stake.status !== 'active' && stake.status !== 'none') {
        reasons.push(`Stake not active (status: ${stake.status})`);
      }
    }

    const denied = reasons.length > 0 && mode === 'block'
      ? true
      : reasons.length > 0 && mode === 'escalate'
        ? true
        : false; // 'flag' mode never denies

    return {
      denied,
      reason: denied ? reasons.join('; ') : undefined,
      wallet,
      agent,
      trustScore,
      stake,
      mode,
      headers,
    };
  };
}

// ── Express/Connect Adapter ─────────────────────────────────────────────────

/**
 * Express-compatible middleware adapter.
 *
 * NOTE: This dynamically imports Express types if available.
 * If Express is not installed, the adapter still works at runtime
 * with any (req, res, next) signature.
 *
 * @example
 * ```ts
 * import express from 'express';
 * import { SAIDClient, createTrustMiddleware, expressAdapter } from '@said-protocol/client';
 *
 * const app = express();
 * const mw = createTrustMiddleware(new SAIDClient(), { minScore: 50 });
 * app.use('/api/trusted', expressAdapter(mw));
 * ```
 */
export function expressAdapter(
  mw: TrustMiddlewareFn,
  opts: { denialStatus?: number; denialMessage?: string } = {},
): (req: any, res: any, next: any) => Promise<void> {
  const { denialStatus = 403, denialMessage = 'Trust check failed' } = opts;

  return async (req: any, res: any, next: any) => {
    // Convert Express request to Fetch API Request
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl || req.url}`;
    const headers = new Headers(req.headers);
    const request = new Request(url, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : req,
    });

    try {
      const result = await mw(request);

      // Attach trust data to request for downstream handlers
      req.said = result;

      // Attach headers to response
      for (const [k, v] of Object.entries(result.headers)) {
        res.setHeader(k, v);
      }

      if (result.denied) {
        res.status(denialStatus).json({
          error: denialMessage,
          reason: result.reason,
          wallet: result.wallet,
        });
        return;
      }

      next();
    } catch (e: any) {
      // On trust check errors, fail open (don't block legitimate traffic)
      // but attach the error for observability
      req.said = { error: e.message, denied: false };
      next();
    }
  };
}

// ── Hono Adapter ────────────────────────────────────────────────────────────

/**
 * Hono-compatible middleware adapter.
 * Works with Hono's c.set()/c.get() context pattern.
 *
 * @example
 * ```ts
 * import { Hono } from 'hono';
 * import { SAIDClient, createTrustMiddleware, honoAdapter } from '@said-protocol/client';
 *
 * const app = new Hono();
 * const mw = createTrustMiddleware(new SAIDClient(), { minScore: 50 });
 * app.use('/api/trusted/*', honoAdapter(mw));
 * ```
 */
export function honoAdapter(
  mw: TrustMiddlewareFn,
  opts: { denialStatus?: number } = {},
): (c: any, next: any) => Promise<any> {
  const { denialStatus = 403 } = opts;

  return async (c: any, next: any) => {
    const request = c.req.raw as Request;

    try {
      const result = await mw(request);
      c.set('said', result);

      if (result.denied) {
        return c.json(
          { error: 'Trust check failed', reason: result.reason, wallet: result.wallet },
          denialStatus,
        );
      }

      await next();
    } catch (e: any) {
      c.set('said', { error: e.message, denied: false });
      await next();
    }
  };
}
