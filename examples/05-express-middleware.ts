/**
 * Example 05 — Express Trust Middleware
 *
 * Protect your API endpoints with SAID trust checks.
 * Agents below your trust threshold get blocked automatically.
 *
 * Run: npx tsx examples/05-express-middleware.ts
 */

import express from 'express';
import { SAIDClient, createTrustMiddleware, expressAdapter } from '../src/index.js';

const app = express();
const client = new SAIDClient();

// ── Basic: Block unverified agents ────────────────────────────────

const basicGate = createTrustMiddleware(client, {
  mode: 'block',
  requireVerified: true,
  minScore: 40,
});

app.use('/api/v1', expressAdapter(basicGate));

app.get('/api/v1/data', (req, res) => {
  res.json({
    data: 'Sensitive data only verified agents can see',
    agent: req.saidAgent,
  });
});

// ── Strict: Require stake for high-value endpoints ────────────────

const strictGate = createTrustMiddleware(client, {
  mode: 'block',
  requireVerified: true,
  minScore: 60,
  minStakeSOL: 0.5,
});

app.use('/api/v1/premium', expressAdapter(strictGate));

app.post('/api/v1/premium/execute', (req, res) => {
  res.json({
    message: 'High-value operation executed',
    agent: req.saidAgent,
  });
});

// ── Soft mode: Tag agents but don't block ─────────────────────────

const tagGate = createTrustMiddleware(client, {
  mode: 'tag',  // Don't block — just attach trust data
});

app.use('/api/v1/public', expressAdapter(tagGate));

app.get('/api/v1/public/feed', (req, res) => {
  res.json({
    feed: [],
    trustContext: req.saidAgent
      ? {
          verified: req.saidAgent.verified,
          score: req.saidAgent.trustScore?.score,
          tier: req.saidAgent.trustScore?.tier,
        }
      : null,
  });
});

// ── Error handler ─────────────────────────────────────────────────

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err.name === 'SAIDError') {
    return res.status(err.status || 403).json({
      error: err.message,
      code: 'TRUST_CHECK_FAILED',
    });
  }
  next(err);
});

// ── Start ─────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`SAID-protected API running on :${PORT}`);
  console.log(`\nTest with:`);
  console.log(`  curl -H "x-agent-wallet: WALLET" http://localhost:${PORT}/api/v1/data`);
  console.log(`  curl -H "x-agent-wallet: WALLET" http://localhost:${PORT}/api/v1/public/feed`);
});
