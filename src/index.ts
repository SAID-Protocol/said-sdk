/**
 * SAID Protocol Client SDK
 * Cross-chain agent messaging with x402 micropayments
 *
 * @example
 * ```ts
 * import { SAIDClient } from '@said-protocol/client';
 *
 * const client = new SAIDClient({
 *   keypairBytes: myKeypairBytes, // Uint8Array of 64-byte Solana keypair
 * });
 *
 * // Send a free message (10/day)
 * await client.sendMessage({
 *   from: { address: 'SENDER_ADDRESS', chain: 'solana' },
 *   to: { address: 'RECIPIENT_ADDRESS', chain: 'base' },
 *   message: 'Hello from Solana!',
 * });
 *
 * // After free tier exhausted, payments happen automatically
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

export interface SAIDClientConfig {
  /** 64-byte Solana keypair for signing x402 payments */
  keypairBytes?: Uint8Array;
  /** API base URL (default: https://api.saidprotocol.com) */
  apiUrl?: string;
}

// ── Client ─────────────────────────────────────────────────────────────────

export class SAIDClient {
  private apiUrl: string;
  private x402Fetch: typeof fetch | null = null;
  private keypairBytes?: Uint8Array;
  private initPromise: Promise<void> | null = null;

  constructor(config: SAIDClientConfig = {}) {
    this.apiUrl = config.apiUrl || 'https://api.saidprotocol.com';
    this.keypairBytes = config.keypairBytes;

    if (this.keypairBytes) {
      this.initPromise = this.initX402();
    }
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
    const res = await fetch(url.toString());
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
    const res = await fetch(url.toString());
    if (!res.ok) throw new SAIDError(`Discover failed`, res.status);
    const data = await res.json();
    return data.agents || [];
  }

  /**
   * Get supported chains.
   */
  async getChains(): Promise<Record<string, ChainInfo>> {
    const res = await fetch(`${this.apiUrl}/xchain/chains`);
    if (!res.ok) throw new SAIDError(`Chains fetch failed`, res.status);
    return res.json();
  }

  /**
   * Get cross-chain stats.
   */
  async getStats(): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.apiUrl}/xchain/stats`);
    if (!res.ok) throw new SAIDError(`Stats fetch failed`, res.status);
    return res.json();
  }

  // ── Free Tier ──────────────────────────────────────────────────────────

  /**
   * Check free tier usage for an agent.
   */
  async getFreeTier(address: string): Promise<FreeTierInfo> {
    const res = await fetch(`${this.apiUrl}/xchain/free-tier/${address}`);
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
