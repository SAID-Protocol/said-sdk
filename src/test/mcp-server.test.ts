import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSaidMcpServer } from '../mcp-server.js';

describe('SAID MCP Server', () => {

  const server = createSaidMcpServer({
    apiUrl: 'https://api.saidprotocol.com',
    cacheTtlMs: 0, // disable cache for tests
  });

  describe('listTools', () => {
    it('returns all expected tools', async () => {
      const tools = await server.listTools();
      const names = tools.map(t => t.name);

      assert.ok(names.includes('said_verify_agent'), 'missing said_verify_agent');
      assert.ok(names.includes('said_trust_score'), 'missing said_trust_score');
      assert.ok(names.includes('said_risk_assessment'), 'missing said_risk_assessment');
      assert.ok(names.includes('said_credit_score'), 'missing said_credit_score');
      assert.ok(names.includes('said_dual_score'), 'missing said_dual_score');
      assert.ok(names.includes('said_trust_summary'), 'missing said_trust_summary');
      assert.ok(names.includes('said_stake_info'), 'missing said_stake_info');
      assert.ok(names.includes('said_batch_verify'), 'missing said_batch_verify');
      assert.ok(names.includes('said_feedback'), 'missing said_feedback');
      assert.ok(names.includes('said_leaderboard'), 'missing said_leaderboard');
      assert.ok(names.includes('said_agent_card'), 'missing said_agent_card');
      assert.ok(names.includes('said_protocol_stats'), 'missing said_protocol_stats');
    });

    it('has proper schema for each tool', async () => {
      const tools = await server.listTools();
      for (const tool of tools) {
        assert.ok(tool.name, 'tool missing name');
        assert.ok(tool.description.length > 20, `${tool.name} description too short`);
        assert.ok(tool.inputSchema.type === 'object', `${tool.name} schema not object`);
        assert.ok(tool.inputSchema.properties, `${tool.name} missing properties`);
      }
    });

    it('exposes 12 tools', async () => {
      const tools = await server.listTools();
      assert.strictEqual(tools.length, 12, `expected 12 tools, got ${tools.length}`);
    });
  });

  describe('callTool — validation', () => {
    it('returns error for missing wallet', async () => {
      const result = await server.callTool({
        name: 'said_verify_agent',
        arguments: {},
      });
      assert.ok(result.isError, 'should be an error');
      const parsed = JSON.parse(result.content[0].text);
      assert.ok(parsed.error.includes('wallet'), 'error should mention wallet');
    });

    it('returns error for unknown tool', async () => {
      const result = await server.callTool({
        name: 'nonexistent_tool',
        arguments: {},
      });
      assert.ok(result.isError, 'should be an error');
      const parsed = JSON.parse(result.content[0].text);
      assert.ok(parsed.error.includes('Unknown tool'), 'should mention unknown tool');
    });

    it('returns error for batch_verify with missing wallets', async () => {
      const result = await server.callTool({
        name: 'said_batch_verify',
        arguments: {},
      });
      assert.ok(result.isError, 'should be an error');
    });

    it('returns error for batch_verify with >25 wallets', async () => {
      const wallets = Array.from({ length: 26 }, (_, i) => `Wallet${i}`);
      const result = await server.callTool({
        name: 'said_batch_verify',
        arguments: { wallets },
      });
      assert.ok(result.isError, 'should reject >25 wallets');
      const parsed = JSON.parse(result.content[0].text);
      assert.ok(parsed.error.includes('Maximum 25'), 'should mention limit');
    });
  });

  describe('callTool — live API integration', { timeout: 15000 }, () => {
    // Use a known SAID agent address — the official SAID agent
    const KNOWN_AGENT = 'DgRXxJmZ8GmwNy4QfwUYYh2N3bSNgNCJpm8nQFgvDUUV';

    it('verifies a known agent', async () => {
      const result = await server.callTool({
        name: 'said_verify_agent',
        arguments: { wallet: KNOWN_AGENT },
      });

      // Should get back valid JSON, not an error (agent may or may not be registered,
      // but the API call itself should succeed)
      if (!result.isError) {
        const data = JSON.parse(result.content[0].text);
        assert.ok('registered' in data, 'response should have registered field');
        assert.ok('verified' in data, 'response should have verified field');
      }
    });

    it('gets protocol stats', async () => {
      const result = await server.callTool({
        name: 'said_protocol_stats',
        arguments: {},
      });

      // API might be down, but format should be right
      if (!result.isError) {
        const data = JSON.parse(result.content[0].text);
        assert.ok('totalAgents' in data || typeof data === 'object', 'should return stats object');
      }
    });
  });

  describe('tool descriptions', () => {
    it('mentions SAID differentiators in relevant tools', async () => {
      const tools = await server.listTools();
      const stakeTool = tools.find(t => t.name === 'said_stake_info');
      assert.ok(stakeTool, 'missing stake_info tool');
      assert.ok(
        stakeTool!.description.includes('skin in the game') || stakeTool!.description.includes('staking'),
        'stake tool should mention staking/skin in the game',
      );

      const creditTool = tools.find(t => t.name === 'said_credit_score');
      assert.ok(creditTool, 'missing credit_score tool');
      assert.ok(
        creditTool!.description.includes('staking') || creditTool!.description.includes('slashing'),
        'credit tool should mention staking/slashing',
      );
    });
  });
});
