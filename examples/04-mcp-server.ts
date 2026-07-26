/**
 * Example 04 — MCP Server Configuration
 *
 * SAID SDK ships with a built-in MCP (Model Context Protocol) server.
 * This lets AI agents (Claude Code, Cursor, etc.) query SAID trust data
 * directly through the standard MCP stdio protocol.
 *
 * Two ways to use it:
 * 1. Add to your claude_desktop_config.json / mcp.json
 * 2. Run standalone via CLI
 */

// ── Option 1: Add to MCP config file ──────────────────────────────
//
// For Claude Code, add to ~/.config/claude-code/mcp.json:
//
// {
//   "mcpServers": {
//     "said": {
//       "command": "npx",
//       "args": ["-y", "@said-protocol/client", "--mcp"]
//     }
//   }
// }
//
// For Cursor, add to ~/.cursor/mcp.json (same format).
//
// Once added, Claude/Cursor can use these 12 tools:
//
//   said_verify_agent     — Full agent verification + identity + trust score
//   said_trust_score      — Multi-dimensional score breakdown (6 pillars)
//   said_risk_assessment  — Risk tier + recommended tx params + escrow
//   said_credit_score     — SACRS 300-850 FICO-compatible credit score
//   said_dual_score       — Provider trust vs consumer trust separation
//   said_trust_summary    — One-call comprehensive trust overview
//   said_stake_info       — Staking amount, status, slashing history
//   said_batch_verify     — Batch verify up to 25 wallets
//   said_feedback         — Agent reviews and feedback entries
//   said_leaderboard      — Top agents by reputation
//   said_agent_card       — ERC-8004 Agent Card (JSON-LD)
//   said_protocol_stats   — Protocol-wide statistics

// ── Option 2: Programmatic usage ──────────────────────────────────

import { createSaidMcpServer, startStdioServer } from '../src/mcp-server.js';

// Start the MCP server programmatically (e.g., in a custom agent runtime)
async function main() {
  const server = createSaidMcpServer();

  // List available tools
  const tools = await server.listTools();
  console.log(`SAID MCP Server: ${tools.length} tools available`);
  tools.forEach(t => console.log(`  • ${t.name}: ${t.description.split('\n')[0]}`));

  // Start stdio JSON-RPC server (for MCP-compatible clients)
  // Uncomment to run:
  // await startStdioServer();
  console.log('\nUncomment startStdioServer() to run the MCP server.');
}

main().catch(console.error);
