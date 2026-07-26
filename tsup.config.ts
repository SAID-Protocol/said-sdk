import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli.ts',
    middleware: 'src/middleware.ts',
    'agent-card': 'src/agent-card.ts',
    'acp': 'src/acp.ts',
    'x402': 'src/x402.ts',
    'passport': 'src/passport.ts',
    'trust-oracle': 'src/trust-oracle.ts',
    'sati': 'src/sati.ts',
    'mcp-server': 'src/mcp-server.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  // CLI needs to be CJS-compatible for npx usage
  // but also works as ESM
  noBanner: true,
});
