/**
 * SAID Protocol MCP Server — Model Context Protocol interface for agent trust
 *
 * Exposes SAID's trust scoring, verification, risk assessment, credit scoring,
 * and passport capabilities as MCP tools that any AI agent can use.
 *
 * Competitors (ChainAware, Mnemom) already have MCP servers. SAID's advantage:
 * staking/slashing enforcement signals that pure reputation systems lack.
 *
 * @example
 * ```ts
 * import { createSaidMcpServer } from '@said-protocol/client/mcp-server';
 *
 * const server = createSaidMcpServer({
 *   apiUrl: 'https://api.saidprotocol.com',
 * });
 *
 * // Connect via stdio (Claude Code, Cursor, etc.)
 * await server.connect(transport);
 * ```
 *
 * @example Using with Claude Code (mcp.json)
 * ```json
 * {
 *   "mcpServers": {
 *     "said": {
 *       "command": "npx",
 *       "args": ["-y", "@said-protocol/client", "--mcp"]
 *     }
 *   }
 * }
 * ```
 */

import { SAIDClient } from './index.js';
import type {
  AgentVerification,
  TrustScoreBreakdown,
  RiskAssessment,
  SACRSResult,
  DualScore,
  TrustSummary,
  BatchVerificationResult,
  LeaderboardEntry,
  FeedbackEntry,
  StakeInfo,
  AgentCard,
} from './index.js';

// ── MCP Protocol Types (minimal, no external dependency) ───────────────────

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface McpToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface McpToolResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

export interface McpServerHandlers {
  listTools: () => McpTool[] | Promise<McpTool[]>;
  callTool: (call: McpToolCall) => McpToolResult | Promise<McpToolResult>;
}

export interface SaidMcpServerOptions {
  /** API URL (default: https://api.saidprotocol.com) */
  apiUrl?: string;
  /** Solana RPC URL */
  rpcUrl?: string;
  /** Cache TTL in ms (default: 30s) */
  cacheTtlMs?: number;
}

// ── Tool Definitions ───────────────────────────────────────────────────────

const TOOLS: McpTool[] = [
  {
    name: 'said_verify_agent',
    description:
      'Verify if a Solana wallet is a registered SAID agent. Returns registration status, verification status, identity info (name, description, socials), trust score breakdown, and MCP/A2A endpoints. This is the primary method for checking if an agent is trustworthy.',
    inputSchema: {
      type: 'object',
      properties: {
        wallet: {
          type: 'string',
          description: 'Solana wallet address to verify (base58, 32-44 chars)',
        },
      },
      required: ['wallet'],
    },
  },
  {
    name: 'said_trust_score',
    description:
      'Get a multi-dimensional trust score breakdown for a SAID agent. Returns scores across 6 pillars: identity, activity, economic, ecosystem, longevity, and fairscale. Also returns tier (e.g. Gold, Silver) and badges.',
    inputSchema: {
      type: 'object',
      properties: {
        wallet: {
          type: 'string',
          description: 'Solana wallet address',
        },
      },
      required: ['wallet'],
    },
  },
  {
    name: 'said_risk_assessment',
    description:
      'Get a comprehensive risk assessment for interacting with an agent. Returns risk tier (minimal/low/moderate/elevated/high/unknown), recommended max transaction value in USDC, recommended escrow percentage, and lists of risk factors and positive signals. Use this to decide HOW to interact with an agent.',
    inputSchema: {
      type: 'object',
      properties: {
        wallet: {
          type: 'string',
          description: 'Solana wallet address',
        },
      },
      required: ['wallet'],
    },
  },
  {
    name: 'said_credit_score',
    description:
      'Get a SACRS (SAID Agent Credit Rating Score) — a FICO-compatible 300-850 credit score derived from on-chain staking, slashing history, trust score, and feedback. SAID is the ONLY protocol with staking/slashing data for credit scoring. Returns recommended LTV, max borrow, and rate premium.',
    inputSchema: {
      type: 'object',
      properties: {
        wallet: {
          type: 'string',
          description: 'Solana wallet address',
        },
      },
      required: ['wallet'],
    },
  },
  {
    name: 'said_dual_score',
    description:
      'Get a dual-score assessment separating provider trust ("will this agent deliver quality work?") from consumer trust ("will this agent pay reliably?"). An agent can be great at delivering but bad at paying, or vice versa. A single score conflates these.',
    inputSchema: {
      type: 'object',
      properties: {
        wallet: {
          type: 'string',
          description: 'Solana wallet address',
        },
      },
      required: ['wallet'],
    },
  },
  {
    name: 'said_trust_summary',
    description:
      'Get a comprehensive one-call trust overview combining all SAID signals: registration, verification, trust score, stake info, risk assessment, SACRS credit score, and dual-score. Ideal for dashboards and profiles.',
    inputSchema: {
      type: 'object',
      properties: {
        wallet: {
          type: 'string',
          description: 'Solana wallet address',
        },
      },
      required: ['wallet'],
    },
  },
  {
    name: 'said_stake_info',
    description:
      'Get staking information for a SAID agent. Returns stake amount in SOL, status (active/unstake_requested/unstake_complete), cooldown info, and slashing count. Staked agents have "skin in the game" — this is SAID\'s key differentiator vs pure reputation systems.',
    inputSchema: {
      type: 'object',
      properties: {
        wallet: {
          type: 'string',
          description: 'Solana wallet address',
        },
      },
      required: ['wallet'],
    },
  },
  {
    name: 'said_batch_verify',
    description:
      'Verify multiple Solana wallets in batch. More efficient than calling said_verify_agent for each. Returns array of {wallet, verified, registered, trustScore, tier}.',
    inputSchema: {
      type: 'object',
      properties: {
        wallets: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of Solana wallet addresses (max 25)',
        },
      },
      required: ['wallets'],
    },
  },
  {
    name: 'said_feedback',
    description:
      'Get feedback/reviews for a SAID agent. Returns array of feedback entries with score (0-100), comment, weight, and signature. Useful for understanding an agent\'s track record.',
    inputSchema: {
      type: 'object',
      properties: {
        wallet: {
          type: 'string',
          description: 'Solana wallet address',
        },
      },
      required: ['wallet'],
    },
  },
  {
    name: 'said_leaderboard',
    description:
      'Get the SAID agent leaderboard ranked by reputation score. Returns top agents with their wallet, name, reputation score, feedback count, verification status, and rank.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'said_agent_card',
    description:
      'Fetch the ERC-8004 compliant Agent Card (JSON-LD) for a SAID agent. This is the standardized identity format that other protocols and registries can consume. Returns null if agent has no card.',
    inputSchema: {
      type: 'object',
      properties: {
        wallet: {
          type: 'string',
          description: 'Solana wallet address',
        },
      },
      required: ['wallet'],
    },
  },
  {
    name: 'said_protocol_stats',
    description:
      'Get protocol-wide statistics: total registered agents, verified agents, and average reputation score. Useful for understanding the SAID ecosystem size.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// ── Server Factory ─────────────────────────────────────────────────────────

/**
 * Create an MCP server handler set for SAID Protocol.
 *
 * This returns handlers compatible with any MCP transport (stdio, HTTP, SSE).
 * Use with `@modelcontextprotocol/sdk` or any MCP-compatible server framework.
 *
 * @example With stdio transport
 * ```ts
 * import { Server } from '@modelcontextprotocol/sdk/server/index.js';
 * import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
 * import { createSaidMcpServer } from '@said-protocol/client/mcp-server';
 *
 * const handlers = createSaidMcpServer();
 * const server = new Server(
 *   { name: 'said-protocol', version: '0.1.0' },
 *   { capabilities: { tools: {} } },
 * );
 * server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: handlers.listTools() }));
 * server.setRequestHandler(CallToolRequestSchema, (req) => handlers.callTool(req.params));
 *
 * const transport = new StdioServerTransport();
 * await server.connect(transport);
 * ```
 */
export function createSaidMcpServer(
  options: SaidMcpServerOptions = {},
): McpServerHandlers {
  const client = new SAIDClient({
    apiUrl: options.apiUrl,
    rpcUrl: options.rpcUrl,
    cacheTtlMs: options.cacheTtlMs,
  });

  async function handleCall(call: McpToolCall): Promise<McpToolResult> {
    const args = call.arguments || {};
    const wallet = args.wallet as string | undefined;
    const wallets = args.wallets as string[] | undefined;

    try {
      switch (call.name) {
        // ── Verification & Trust Scoring ─────────────────────────────

        case 'said_verify_agent': {
          if (!wallet) return err('wallet is required');
          const agent: AgentVerification = await client.getAgent(wallet);
          return ok(agent);
        }

        case 'said_trust_score': {
          if (!wallet) return err('wallet is required');
          const score: TrustScoreBreakdown | null = await client.getTrustScore(wallet);
          if (!score) return err(`No trust score found for ${wallet}`);
          return ok(score);
        }

        case 'said_risk_assessment': {
          if (!wallet) return err('wallet is required');
          const risk: RiskAssessment = await client.getRiskAssessment(wallet);
          return ok(risk);
        }

        case 'said_credit_score': {
          if (!wallet) return err('wallet is required');
          const credit: SACRSResult = await client.getCreditScore(wallet);
          return ok(credit);
        }

        case 'said_dual_score': {
          if (!wallet) return err('wallet is required');
          const dual: DualScore = await client.getDualScore(wallet);
          return ok(dual);
        }

        case 'said_trust_summary': {
          if (!wallet) return err('wallet is required');
          const summary: TrustSummary = await client.getTrustSummary(wallet);
          return ok(summary);
        }

        case 'said_stake_info': {
          if (!wallet) return err('wallet is required');
          const stake: StakeInfo = await client.getStakeInfo(wallet);
          return ok(stake);
        }

        // ── Batch Operations ──────────────────────────────────────────

        case 'said_batch_verify': {
          if (!wallets || !Array.isArray(wallets)) {
            return err('wallets array is required');
          }
          if (wallets.length > 25) {
            return err('Maximum 25 wallets per batch');
          }
          const results: BatchVerificationResult[] = await client.verifyMultiple(wallets);
          return ok(results);
        }

        // ── Reputation & Discovery ────────────────────────────────────

        case 'said_feedback': {
          if (!wallet) return err('wallet is required');
          const feedback: FeedbackEntry[] = await client.getFeedback(wallet);
          return ok(feedback);
        }

        case 'said_leaderboard': {
          const leaderboard: LeaderboardEntry[] = await client.getLeaderboard();
          return ok(leaderboard);
        }

        case 'said_agent_card': {
          if (!wallet) return err('wallet is required');
          const card: AgentCard | null = await client.getAgentCard(wallet);
          if (!card) return err(`No agent card found for ${wallet}`);
          return ok(card);
        }

        case 'said_protocol_stats': {
          const stats = await client.getProtocolStats();
          return ok(stats);
        }

        default:
          return err(`Unknown tool: ${call.name}`);
      }
    } catch (e: any) {
      return err(e?.message || 'Request failed');
    }
  }

  return {
    listTools: () => TOOLS,
    callTool: handleCall,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function ok(data: unknown): McpToolResult {
  return {
    content: [
      {
        type: 'text',
        text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

function err(message: string): McpToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ error: message }),
      },
    ],
    isError: true,
  };
}

// ── Stdio Entry Point ──────────────────────────────────────────────────────

/**
 * Start the MCP server on stdio. This is the entry point for `npx @said-protocol/client --mcp`.
 *
 * Uses a minimal stdio JSON-RPC implementation that's compatible with the
 * MCP specification. No external MCP SDK dependency required — works standalone.
 */
export async function startStdioServer(options?: SaidMcpServerOptions): Promise<void> {
  const handlers = createSaidMcpServer(options);

  // Minimal MCP-compatible JSON-RPC over stdio
  // Implements: initialize, tools/list, tools/call
  const { createInterface } = await import('readline');
  const rl = createInterface({ input: process.stdin, terminal: false });

  const serverInfo = {
    name: 'said-protocol',
    version: '0.20.0',
    capabilities: { tools: {} },
  };

  rl.on('line', (line: string) => {
    let msg: any;
    try {
      msg = JSON.parse(line);
    } catch {
      return; // Ignore malformed lines
    }

    const { id, method, params } = msg;
    if (id === undefined || !method) return;

    (async () => {
      try {
        let result: any;

        switch (method) {
          case 'initialize':
            result = { protocolVersion: '2025-06-18', serverInfo, capabilities: serverInfo.capabilities };
            break;

          case 'initialized':
            // Notification, no response needed
            return;

          case 'tools/list':
            result = { tools: await handlers.listTools() };
            break;

          case 'tools/call': {
            const toolResult = await handlers.callTool({
              name: params?.name,
              arguments: params?.arguments || {},
            });
            result = toolResult;
            break;
          }

          default:
            writeError(id, -32601, `Method not found: ${method}`);
            return;
        }

        process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
      } catch (e: any) {
        writeError(id, -32603, e?.message || 'Internal error');
      }
    })();
  });

  // Keep process alive
  return new Promise(() => {});
}

function writeError(id: number | string, code: number, message: string): void {
  process.stdout.write(
    JSON.stringify({
      jsonrpc: '2.0',
      id,
      error: { code, message },
    }) + '\n',
  );
}
