/**
 * SAID Protocol — ERC-8004 Agent Card Generator
 *
 * Generates spec-compliant ERC-8004 agent cards (JSON-LD) from SAID
 * registration data. This enables cross-protocol interoperability —
 * any ERC-8004-compatible registry, marketplace, or framework can
 * consume cards produced here.
 *
 * ERC-8004 spec: https://eips.ethereum.org/EIPS/eip-8004
 *
 * Competitors with card generation: AstraSync (Agent Registration File
 * generator), Tiny.Place (@handle cards), AgentKarma (ERC-8004 reader+writer).
 * SAID previously could only READ cards — this module adds WRITE capability.
 *
 * @example
 * ```ts
 * import { SAIDClient } from '@said-protocol/client';
 * import { buildAgentCard, validateAgentCard } from '@said-protocol/client/agent-card';
 *
 * const client = new SAIDClient();
 * const card = await buildAgentCard(client, {
 *   wallet: 'AGENT_WALLET',
 *   capabilities: [
 *     { name: 'code-review', description: 'Reviews pull requests' },
 *     { name: 'payment', endpoint: 'https://my-agent.com/x402' },
 *   ],
 *   endpoints: {
 *     mcp: 'https://my-agent.com/mcp',
 *     a2a: 'https://my-agent.com/a2a',
 *   },
 * });
 *
 * // Validate before publishing
 * const issues = validateAgentCard(card);
 * if (issues.length === 0) {
 *   console.log(JSON.stringify(card, null, 2));
 * }
 * ```
 */

import type { SAIDClient, AgentCard, AgentCardCapability } from './index.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface BuildAgentCardOptions {
  /** Agent wallet address (must be registered with SAID) */
  wallet: string;
  /** Override or supplement SAID-registered identity */
  name?: string;
  description?: string;
  image?: string;
  twitter?: string;
  website?: string;
  /** Capabilities the agent provides */
  capabilities?: (string | AgentCardCapability)[];
  /** Service endpoints */
  endpoints?: {
    mcp?: string;
    a2a?: string;
    http?: string;
    webhook?: string;
    [key: string]: string | undefined;
  };
  /** Include SAID trust score in the card (default: true) */
  includeTrustScore?: boolean;
  /** Include SAID stake info in the card (default: false — requires extra RPC call) */
  includeStake?: boolean;
  /** Custom metadata to include in the card */
  metadata?: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ── ERC-8004 Required Fields ────────────────────────────────────────────────

const REQUIRED_FIELDS = ['@context', '@type', '@id', 'name'] as const;
const VALID_TYPES = ['Agent', 'AIAgent', 'AutonomousAgent', 'SoftwareAgent'] as const;
const VALID_CONTEXTS = [
  'https://schema.org',
  'https://w3id.org/erc-8004/v1',
  'https://eips.ethereum.org/EIPS/eip-8004',
] as const;

// ── Card Builder ────────────────────────────────────────────────────────────

/**
 * Build an ERC-8004 compliant agent card from SAID Protocol data.
 *
 * This function fetches the agent's SAID registration (name, verification
 * status, trust score) and merges it with your provided overrides to
 * produce a spec-compliant JSON-LD agent card.
 *
 * The card can be:
 * - Published at `/.well-known/agent.json` (standard discovery)
 * - Submitted to ERC-8004 registries across chains
 * - Used with AstraSync, AgentKarma, Tiny.Place, and other ERC-8004 consumers
 * - Served via MCP protocol for agent-to-agent discovery
 *
 * @example Minimal card (pulls name/verification from SAID)
 * ```ts
 * const card = await buildAgentCard(client, { wallet: 'WALLET' });
 * ```
 *
 * @example Full card with capabilities and endpoints
 * ```ts
 * const card = await buildAgentCard(client, {
 *   wallet: 'WALLET',
 *   description: 'Autonomous code reviewer for Solana programs',
 *   capabilities: [
 *     'code-review',
 *     { name: 'audit', description: 'Security audits', endpoint: 'https://audit.agent.com' },
 *   ],
 *   endpoints: {
 *     mcp: 'https://agent.com/mcp',
 *     a2a: 'https://agent.com/a2a',
 *   },
 *   includeStake: true,
 * });
 * ```
 */
export async function buildAgentCard(
  client: SAIDClient,
  options: BuildAgentCardOptions,
): Promise<AgentCard> {
  const {
    wallet,
    includeTrustScore = true,
    includeStake = false,
    metadata,
  } = options;

  // Fetch SAID registration data
  const agent = await client.getAgent(wallet);

  // Merge: SAID data first, explicit overrides second
  const name = options.name ?? agent.identity?.name ?? `Agent ${wallet.slice(0, 8)}`;
  const description = options.description ?? agent.identity?.description ?? undefined;
  const twitter = options.twitter ?? agent.identity?.twitter ?? undefined;
  const website = options.website ?? agent.identity?.website ?? undefined;

  // Build base card
  const card: AgentCard = {
    '@context': 'https://w3id.org/erc-8004/v1',
    '@type': 'AutonomousAgent',
    '@id': `said:solana:${wallet}`,
    name,
  };

  // Optional identity fields
  if (description) card.description = description;
  if (options.image) card.image = options.image;
  else if (agent.identity?.image) card.image = agent.identity.image;
  if (twitter) card.twitter = twitter;
  if (website) card.website = website;

  // Capabilities — normalize to all strings or all objects (ERC-8004 allows either form)
  if (options.capabilities && options.capabilities.length > 0) {
    const allStrings = options.capabilities.every((c) => typeof c === 'string');
    const allObjects = options.capabilities.every((c) => typeof c === 'object' && c !== null);
    if (allStrings) {
      card.capabilities = options.capabilities as string[];
    } else if (allObjects) {
      card.capabilities = options.capabilities as AgentCardCapability[];
    } else {
      // Mixed — normalize to objects
      card.capabilities = options.capabilities.map((c) =>
        typeof c === 'string' ? { name: c } : c as AgentCardCapability,
      );
    }
  }

  // Endpoints
  if (options.endpoints) {
    card.endpoints = Object.fromEntries(
      Object.entries(options.endpoints).filter(([, v]) => v !== undefined),
    );
  }

  // SAID trust signals (these make SAID cards richer than competitors')
  if (includeTrustScore && agent.trustScore) {
    card.verified = agent.verified;
    card.reputationScore = agent.trustScore.score;
    card.trustTier = agent.trustScore.tier;
  }

  card.chain = 'solana';
  if (agent.registeredAt) card.registeredAt = agent.registeredAt;

  // Stake info (optional — requires extra RPC call)
  const cardExt = card as unknown as Record<string, unknown>;
  if (includeStake) {
    try {
      const stake = await client.getStakeInfo(wallet);
      if (stake.amountSOL > 0) {
        cardExt['said:stakeSOL'] = stake.amountSOL;
        cardExt['said:stakeStatus'] = stake.status;
        cardExt['said:slashedCount'] = stake.slashedCount;
      }
    } catch {
      // Stake query failed — don't include, but don't fail card generation
    }
  }

  // Custom metadata
  if (metadata) {
    for (const [key, value] of Object.entries(metadata)) {
      // Don't overwrite spec fields
      if (!(key in cardExt) && !key.startsWith('@')) {
        cardExt[key] = value;
      }
    }
  }

  return card;
}

// ── Validation ──────────────────────────────────────────────────────────────

/**
 * Validate an ERC-8004 agent card for spec compliance.
 *
 * Returns a list of errors (blocking) and warnings (non-blocking).
 * Use this before publishing a card to ensure consumers can parse it.
 *
 * @example
 * ```ts
 * const result = validateAgentCard(card);
 * if (!result.valid) {
 *   console.error('Invalid card:', result.errors);
 * } else if (result.warnings.length > 0) {
 *   console.warn('Warnings:', result.warnings);
 * }
 * ```
 */
export function validateAgentCard(card: AgentCard): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required fields
  for (const field of REQUIRED_FIELDS) {
    if (!card[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate @context
  if (card['@context'] && !VALID_CONTEXTS.includes(card['@context'] as any)) {
    warnings.push(
      `Unknown @context: ${card['@context']}. Recommended: https://w3id.org/erc-8004/v1`,
    );
  }

  // Validate @type
  if (card['@type'] && !VALID_TYPES.includes(card['@type'] as any)) {
    warnings.push(
      `Unknown @type: ${card['@type']}. Valid types: ${VALID_TYPES.join(', ')}`,
    );
  }

  // Validate @id format
  if (card['@id']) {
    const id = card['@id'];
    if (!id.includes(':')) {
      warnings.push(`@id should be a URI (e.g., 'said:solana:WALLET'). Got: ${id}`);
    }
  }

  // Check name length
  if (card.name && card.name.length > 128) {
    warnings.push(`Name is very long (${card.name.length} chars). Consider shortening.`);
  }

  // Check description length
  if (card.description && card.description.length > 1024) {
    warnings.push(
      `Description exceeds 1024 chars (${card.description.length}). Some registries may truncate.`,
    );
  }

  // Validate capabilities format
  if (card.capabilities) {
    if (Array.isArray(card.capabilities)) {
      card.capabilities.forEach((cap, i) => {
        if (typeof cap === 'object' && cap !== null) {
          if (!cap.name) {
            errors.push(`Capability at index ${i} missing 'name' field`);
          }
        }
      });
    } else {
      errors.push('Capabilities must be an array');
    }
  }

  // Check endpoints
  if (card.endpoints) {
    for (const [proto, url] of Object.entries(card.endpoints)) {
      if (url && typeof url === 'string') {
        try {
          new URL(url);
        } catch {
          warnings.push(`Endpoint '${proto}' is not a valid URL: ${url}`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ── Card Helpers ─────────────────────────────────────────────────────────────

/**
 * Convert a SAID trust tier to an ERC-8004 trust badge string.
 *
 * @example
 * ```ts
 * const badge = tierToBadge('Gold'); // 'said:gold'
 * ```
 */
export function tierToBadge(tier: string): string {
  const normalized = tier.toLowerCase().trim();
  const validTiers = ['diamond', 'gold', 'silver', 'bronze', 'unranked'];
  if (validTiers.includes(normalized)) {
    return `said:${normalized}`;
  }
  return `said:custom:${normalized}`;
}

/**
 * Generate a `/.well-known/agent.json` Response object from a SAID agent card.
 *
 * Useful for serving agent cards from Cloudflare Workers, Deno, or any
 * Fetch-compatible runtime.
 *
 * @example
 * ```ts
 * // Cloudflare Workers
 * export default {
 *   async fetch(request: Request) {
 *     if (new URL(request.url).pathname === '/.well-known/agent.json') {
 *       return serveAgentCard(card);
 *     }
 *     return new Response('Not found', { status: 404 });
 *   }
 * };
 * ```
 */
export function serveAgentCard(card: AgentCard): Response {
  return new Response(JSON.stringify(card, null, 2), {
    headers: {
      'Content-Type': 'application/ld+json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300',
    },
  });
}

/**
 * Compare two agent cards to find differences.
 * Useful for detecting when a card needs to be re-published.
 *
 * @returns Array of changed field paths (e.g. ['reputationScore', 'endpoints.mcp'])
 */
export function diffAgentCards(
  oldCard: AgentCard,
  newCard: AgentCard,
): string[] {
  const changes: string[] = [];
  const allKeys = new Set([...Object.keys(oldCard), ...Object.keys(newCard)]);

  for (const key of allKeys) {
    const oldVal = JSON.stringify((oldCard as any)[key]);
    const newVal = JSON.stringify((newCard as any)[key]);
    if (oldVal !== newVal) {
      changes.push(key);
    }
  }

  return changes;
}
