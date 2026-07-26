/**
 * Example 05 — Express Middleware
 *
 * Gate HTTP endpoints based on SAID trust scores.
 * Block untrusted agents from accessing your API, or flag them for review.
 *
 * Run: npx tsx examples/05-express-middleware.ts
 *
 * Requires: npm install express
 */

import express from 'express';
import { SAIDClient, createTrustMiddleware, expressAdapter } from '@said-protocol/client';

async function main() {
  const app = express();
  const client = new SAIDClient();

  // Create trust middleware — block mode rejects untrusted agents
  const mw = createTrustMiddleware(client, {
    mode: 'block',
    minScore: 50,
    requireVerified: true,
  });

  // Protect specific routes
  app.use('/api/trusted', expressAdapter(mw));

  app.get('/api/trusted/data', (req, res) => {
    // req.said.wallet — the verified wallet address
    // req.said.trustScore — the agent's trust score
    res.json({
      message: `Hello agent ${req.said.wallet}`,
      yourScore: req.said.trustScore,
    });
  });

  // Flag mode — request passes through but trust data is in headers
  const flagMw = createTrustMiddleware(client, { mode: 'flag', minScore: 40 });
  app.use('/api/public', expressAdapter(flagMw));

  app.get('/api/public/data', (req, res) => {
    // Trust info available in headers: x-said-score, x-said-tier, x-said-verified
    res.json({
      data: 'public endpoint',
      trustHeaders: {
        score: req.headers['x-said-score'],
        tier: req.headers['x-said-tier'],
        verified: req.headers['x-said-verified'],
      },
    });
  });

  // Open endpoint — no trust check
  app.get('/api/open', (_req, res) => {
    res.json({ data: 'no trust check needed' });
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on :${PORT}`);
    console.log(`  Protected:  /api/trusted/data  (requires score >= 50 + verified)`);
    console.log(`  Flagged:    /api/public/data   (trust info in headers)`);
    console.log(`  Open:       /api/open          (no trust check)`);
  });
}

main().catch(console.error);
