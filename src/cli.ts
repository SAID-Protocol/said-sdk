#!/usr/bin/env node

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { createHash } from "crypto";
import { readFileSync } from "fs";

const PROGRAM_ID = new PublicKey("5dpw6KEQPn248pnkkaYyWfHwu2nfb3LUMbTucb6LaA8G");
const API_BASE = "https://api.saidprotocol.com";
const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";

// Pre-computed discriminators
const REGISTER_DISC = Buffer.from("879d42c30271af1e", "hex");
const VERIFY_DISC = Buffer.from("84e7021e734a171a", "hex");

// ── Helpers ──

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      args[key] = next && !next.startsWith("--") ? (i++, next) : "true";
    }
  }
  return args;
}

function loadKeypair(path: string): Keypair {
  const raw = JSON.parse(readFileSync(path, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function getAgentPDA(owner: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), owner.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

function getTreasuryPDA(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    PROGRAM_ID
  );
  return pda;
}

function getStakePDA(agentIdentity: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("stake"), agentIdentity.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

function disc(name: string): Buffer {
  const hash = createHash("sha256").update(`global:${name}`).digest();
  return hash.subarray(0, 8);
}

function borshString(s: string): Buffer {
  const bytes = Buffer.from(s, "utf-8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(bytes.length);
  return Buffer.concat([len, bytes]);
}

async function sendTx(connection: Connection, keypair: Keypair, ix: TransactionInstruction): Promise<string> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const msg = new TransactionMessage({
    payerKey: keypair.publicKey,
    recentBlockhash: blockhash,
    instructions: [ix],
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  tx.sign([keypair]);
  const sig = await connection.sendTransaction(tx, { skipPreflight: false });
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  return sig;
}

// ── Commands ──

async function register(args: Record<string, string>) {
  if (!args.keypair) { console.error("Missing --keypair"); process.exit(1); }
  if (!args.name) { console.error("Missing --name"); process.exit(1); }

  const keypair = loadKeypair(args.keypair);
  const wallet = keypair.publicKey.toBase58();
  const rpc = args.rpc || DEFAULT_RPC;
  const connection = new Connection(rpc, "confirmed");
  const description = args.description || "";

  // 1. API registration
  console.log("📡 Registering with SAID API...");
  const timestamp = Date.now();
  const message = `SAID:register:${wallet}:${args.name}:${timestamp}`;
  const msgBytes = new TextEncoder().encode(message);
  const signature = bs58.encode(nacl.sign.detached(msgBytes, keypair.secretKey));

  const body: Record<string, unknown> = {
    wallet, name: args.name, description, signature, timestamp,
  };
  if (args.twitter) body.twitter = args.twitter;
  if (args.website) body.website = args.website;
  if (args.capabilities) body.capabilities = args.capabilities.split(",");

  try {
    const res = await fetch(`${API_BASE}/api/register/sponsored`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      console.log("✅ API registration successful");
    } else if (res.status === 409) {
      console.log("ℹ️  Already registered in API, proceeding to on-chain...");
    } else {
      console.warn(`⚠️  API returned ${res.status}: ${await res.text()}`);
    }
  } catch (e: any) {
    console.warn(`⚠️  API call failed: ${e.message} — continuing to on-chain...`);
  }

  // 2. On-chain registration
  console.log("⛓️  Registering on-chain...");
  const metadataUri = `${API_BASE}/api/cards/${wallet}.json`;
  const data = Buffer.concat([REGISTER_DISC, borshString(metadataUri)]);
  const agentPDA = getAgentPDA(keypair.publicKey);

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: agentPDA, isSigner: false, isWritable: true },
      { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  try {
    const sig = await sendTx(connection, keypair, ix);
    console.log(`✅ Registered on-chain! tx: ${sig}`);
  } catch (e: any) {
    if (e.message?.includes("already in use") || e.logs?.some((l: string) => l.includes("already in use"))) {
      console.log("ℹ️  Already registered on-chain");
    } else {
      console.error(`❌ On-chain registration failed: ${e.message}`);
      process.exit(1);
    }
  }
}

async function verify(args: Record<string, string>) {
  if (!args.keypair) { console.error("Missing --keypair"); process.exit(1); }

  const keypair = loadKeypair(args.keypair);
  const wallet = keypair.publicKey.toBase58();
  const rpc = args.rpc || DEFAULT_RPC;
  const connection = new Connection(rpc, "confirmed");

  console.log("⛓️  Verifying on-chain (0.01 SOL fee)...");
  const agentPDA = getAgentPDA(keypair.publicKey);
  const treasuryPDA = getTreasuryPDA();

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: agentPDA, isSigner: false, isWritable: true },
      { pubkey: treasuryPDA, isSigner: false, isWritable: true },
      { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: VERIFY_DISC,
  });

  try {
    const sig = await sendTx(connection, keypair, ix);
    console.log(`✅ Verified! tx: ${sig}`);
  } catch (e: any) {
    if (e.message?.includes("insufficient")) {
      console.error("❌ Insufficient balance. Need at least 0.01 SOL + fees.");
    } else {
      console.error(`❌ Verification failed: ${e.message}`);
    }
    process.exit(1);
  }

  // Notify API
  try {
    await fetch(`${API_BASE}/api/verify/${wallet}`);
    console.log("📡 API notified of verification");
  } catch { /* indexer will pick it up */ }
}

async function status(args: Record<string, string>) {
  if (!args.wallet) { console.error("Missing --wallet"); process.exit(1); }

  const wallet = args.wallet;
  const rpc = args.rpc || DEFAULT_RPC;
  const connection = new Connection(rpc, "confirmed");

  // Check on-chain
  const ownerPk = new PublicKey(wallet);
  const agentPDA = getAgentPDA(ownerPk);
  const accountInfo = await connection.getAccountInfo(agentPDA);

  console.log(`Agent: ${wallet}`);
  console.log(`PDA:   ${agentPDA.toBase58()}`);
  console.log(`On-chain: ${accountInfo ? "✅ Registered" : "❌ Not registered"}`);

  // Check API
  try {
    const res = await fetch(`${API_BASE}/api/cards/${wallet}.json`);
    if (res.ok) {
      const data = await res.json();
      console.log(`API:   ✅ Found — ${data.name || "unnamed"}`);
      if (data.verified) console.log(`Verified: ✅`);
    } else {
      console.log(`API:   ❌ Not found`);
    }
  } catch {
    console.log(`API:   ⚠️  Could not reach`);
  }
}

async function stakeCmd(args: Record<string, string>) {
  if (!args.keypair) { console.error("Missing --keypair"); process.exit(1); }
  const amount = parseFloat(args.amount || "0");
  if (amount < 0.1) { console.error("Minimum stake is 0.1 SOL. Use --amount 0.1"); process.exit(1); }

  const keypair = loadKeypair(args.keypair);
  const rpc = args.rpc || DEFAULT_RPC;
  const connection = new Connection(rpc, "confirmed");

  const agentPDA = getAgentPDA(keypair.publicKey);
  const stakePDA = getStakePDA(agentPDA);

  console.log(`⛓️  Staking ${amount} SOL...`);
  const amtBuf = Buffer.alloc(8);
  amtBuf.writeBigUInt64LE(BigInt(Math.round(amount * 1_000_000_000)));

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: agentPDA, isSigner: false, isWritable: true },
      { pubkey: stakePDA, isSigner: false, isWritable: true },
      { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([disc("stake"), amtBuf]),
  });

  try {
    const sig = await sendTx(connection, keypair, ix);
    console.log(`✅ Staked ${amount} SOL! tx: ${sig}`);
  } catch (e: any) {
    if (e.message?.includes("AlreadyStaked")) console.error("❌ Agent already has active stake. Use add-stake to increase.");
    else if (e.message?.includes("NotVerified")) console.error("❌ Agent not verified. Run `said verify` first.");
    else if (e.message?.includes("StakeTooLow")) console.error("❌ Stake too low. Minimum is 0.1 SOL.");
    else console.error(`❌ Stake failed: ${e.message}`);
    process.exit(1);
  }
}

async function addStakeCmd(args: Record<string, string>) {
  if (!args.keypair) { console.error("Missing --keypair"); process.exit(1); }
  const amount = parseFloat(args.amount || "0");
  if (amount <= 0) { console.error("--amount required"); process.exit(1); }

  const keypair = loadKeypair(args.keypair);
  const rpc = args.rpc || DEFAULT_RPC;
  const connection = new Connection(rpc, "confirmed");

  const agentPDA = getAgentPDA(keypair.publicKey);
  const stakePDA = getStakePDA(agentPDA);

  console.log(`⛓️  Adding ${amount} SOL to stake...`);
  const amtBuf = Buffer.alloc(8);
  amtBuf.writeBigUInt64LE(BigInt(Math.round(amount * 1_000_000_000)));

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: agentPDA, isSigner: false, isWritable: true },
      { pubkey: stakePDA, isSigner: false, isWritable: true },
      { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([disc("add_stake"), amtBuf]),
  });

  try {
    const sig = await sendTx(connection, keypair, ix);
    console.log(`✅ Added ${amount} SOL to stake! tx: ${sig}`);
  } catch (e: any) {
    if (e.message?.includes("NoActiveStake")) console.error("❌ No active stake. Use `said stake` first.");
    else if (e.message?.includes("AlreadyUnstaking")) console.error("❌ Can't add stake while unstaking.");
    else console.error(`❌ Add stake failed: ${e.message}`);
    process.exit(1);
  }
}

async function requestUnstakeCmd(args: Record<string, string>) {
  if (!args.keypair) { console.error("Missing --keypair"); process.exit(1); }
  const keypair = loadKeypair(args.keypair);
  const rpc = args.rpc || DEFAULT_RPC;
  const connection = new Connection(rpc, "confirmed");

  const agentPDA = getAgentPDA(keypair.publicKey);
  const stakePDA = getStakePDA(agentPDA);

  console.log("⛓️  Requesting unstake (7-day cooldown begins)..." );
  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: agentPDA, isSigner: false, isWritable: true },
      { pubkey: stakePDA, isSigner: false, isWritable: true },
      { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
    ],
    data: disc("request_unstake"),
  });

  try {
    const sig = await sendTx(connection, keypair, ix);
    console.log(`✅ Unstake requested! Cooldown: 7 days. tx: ${sig}`);
    console.log("   Run `said complete-unstake --keypair <path>` after cooldown.");
  } catch (e: any) {
    if (e.message?.includes("NoActiveStake")) console.error("❌ No active stake.");
    else if (e.message?.includes("AlreadyUnstaking")) console.error("❌ Unstake already requested.");
    else console.error(`❌ Request failed: ${e.message}`);
    process.exit(1);
  }
}

async function completeUnstakeCmd(args: Record<string, string>) {
  if (!args.keypair) { console.error("Missing --keypair"); process.exit(1); }
  const keypair = loadKeypair(args.keypair);
  const rpc = args.rpc || DEFAULT_RPC;
  const connection = new Connection(rpc, "confirmed");

  const agentPDA = getAgentPDA(keypair.publicKey);
  const stakePDA = getStakePDA(agentPDA);

  console.log("⛓️  Completing unstake...");
  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: agentPDA, isSigner: false, isWritable: true },
      { pubkey: stakePDA, isSigner: false, isWritable: true },
      { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
    ],
    data: disc("complete_unstake"),
  });

  try {
    const sig = await sendTx(connection, keypair, ix);
    console.log(`✅ Unstaked! SOL returned to wallet. tx: ${sig}`);
  } catch (e: any) {
    if (e.message?.includes("CooldownNotComplete")) console.error("❌ 7-day cooldown not yet complete.");
    else if (e.message?.includes("UnstakeNotRequested")) console.error("❌ No unstake request pending. Run `said request-unstake` first.");
    else console.error(`❌ Complete unstake failed: ${e.message}`);
    process.exit(1);
  }
}

async function emergencyUnstakeCmd(args: Record<string, string>) {
  if (!args.keypair) { console.error("Missing --keypair"); process.exit(1); }
  const keypair = loadKeypair(args.keypair);
  const rpc = args.rpc || DEFAULT_RPC;
  const connection = new Connection(rpc, "confirmed");

  const agentPDA = getAgentPDA(keypair.publicKey);
  const stakePDA = getStakePDA(agentPDA);
  const treasuryPDA = getTreasuryPDA();

  console.log("⚠️  Emergency unstake (10% penalty)..." );
  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: agentPDA, isSigner: false, isWritable: true },
      { pubkey: stakePDA, isSigner: false, isWritable: true },
      { pubkey: treasuryPDA, isSigner: false, isWritable: true },
      { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
    ],
    data: disc("emergency_unstake"),
  });

  try {
    const sig = await sendTx(connection, keypair, ix);
    console.log(`✅ Emergency unstaked! 90% returned, 10% burned. tx: ${sig}`);
  } catch (e: any) {
    if (e.message?.includes("NoActiveStake")) console.error("❌ No active stake.");
    else console.error(`❌ Emergency unstake failed: ${e.message}`);
    process.exit(1);
  }
}

async function cancelUnstakeCmd(args: Record<string, string>) {
  if (!args.keypair) { console.error("Missing --keypair"); process.exit(1); }
  const keypair = loadKeypair(args.keypair);
  const rpc = args.rpc || DEFAULT_RPC;
  const connection = new Connection(rpc, "confirmed");

  const agentPDA = getAgentPDA(keypair.publicKey);
  const stakePDA = getStakePDA(agentPDA);

  console.log("⛓️  Cancelling unstake request...");
  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: agentPDA, isSigner: false, isWritable: true },
      { pubkey: stakePDA, isSigner: false, isWritable: true },
      { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
    ],
    data: disc("cancel_unstake"),
  });

  try {
    const sig = await sendTx(connection, keypair, ix);
    console.log(`✅ Unstake cancelled! Stake remains active. tx: ${sig}`);
  } catch (e: any) {
    if (e.message?.includes("UnstakeNotRequested")) console.error("❌ No unstake request to cancel.");
    else console.error(`❌ Cancel failed: ${e.message}`);
    process.exit(1);
  }
}

// ── Trust & Reputation Commands ──

async function trustCmd(args: Record<string, string>) {
  if (!args.wallet) { console.error("Missing --wallet"); process.exit(1); }

  try {
    const res = await fetch(`${API_BASE}/api/verify/${args.wallet}`);
    const data = await res.json();

    if (!data.registered) {
      console.log(`❌ Agent not registered: ${args.wallet}`);
      process.exit(1);
    }

    console.log(`\n  Agent: ${data.identity?.name || "Unnamed"} (${args.wallet})`);
    console.log(`  Verified: ${data.verified ? "✅" : "❌"}`);
    if (data.identity?.description) console.log(`  Description: ${data.identity.description}`);
    if (data.identity?.twitter) console.log(`  Twitter: @${data.identity.twitter}`);
    if (data.identity?.website) console.log(`  Website: ${data.identity.website}`);

    if (data.reputation) {
      console.log(`\n  ── Reputation ──`);
      console.log(`  Score: ${data.reputation.score.toFixed(1)}/100`);
      console.log(`  Tier: ${data.reputation.tier}`);
      console.log(`  Feedback Count: ${data.reputation.feedbackCount}`);
      console.log(`  Composite: ${data.reputation.compositeScore}`);
    }

    if (data.trustScore) {
      const ts = data.trustScore;
      console.log(`\n  ── Trust Score Breakdown ──`);
      console.log(`  Overall: ${ts.score}/100 (${ts.tier})`);
      console.log(`  Badges: ${ts.badges.length ? ts.badges.join(", ") : "none"}`);
      console.log(`\n  Dimensions:`);
      console.log(`    Identity:   ${ts.identity}`);
      console.log(`    Activity:   ${ts.activity}`);
      console.log(`    Economic:   ${ts.economic}`);
      console.log(`    Ecosystem:  ${ts.ecosystem}`);
      console.log(`    Longevity:  ${ts.longevity}`);
      console.log(`    FairScale:  ${ts.fairscale}`);
      console.log(`\n  Computed: ${ts.computedAt}`);
    } else {
      console.log(`\n  Trust score not yet computed.`);
    }
    console.log();
  } catch (e: any) {
    console.error(`❌ Failed: ${e.message}`);
    process.exit(1);
  }
}

async function feedbackCmd(args: Record<string, string>) {
  if (!args.wallet) { console.error("Missing --wallet"); process.exit(1); }
  const limit = parseInt(args.limit || "10");

  try {
    const res = await fetch(`${API_BASE}/api/agents/${args.wallet}/feedback`);
    const data = await res.json();
    const feedback = (data.feedback || []).slice(0, limit);

    if (feedback.length === 0) {
      console.log("No feedback found for this agent.");
      return;
    }

    console.log(`\n  Feedback for ${args.wallet.slice(0, 8)}... (${data.feedback?.length || 0} total, showing ${feedback.length})\n`);

    for (const f of feedback) {
      const stars = "★".repeat(Math.round(f.score / 20)) + "☆".repeat(5 - Math.round(f.score / 20));
      const date = new Date(f.createdAt).toLocaleDateString();
      const verified = f.fromIsVerified ? "✅" : "⚪";
      console.log(`  ${stars} ${f.score}/100 ${verified} ${date}`);
      console.log(`    ${f.comment}`);
      console.log(`    From: ${f.fromWallet.slice(0, 8)}...`);
      console.log();
    }
  } catch (e: any) {
    console.error(`❌ Failed: ${e.message}`);
    process.exit(1);
  }
}

async function leaderboardCmd(args: Record<string, string>) {
  const limit = parseInt(args.limit || "10");

  try {
    const res = await fetch(`${API_BASE}/api/leaderboard`);
    const data = await res.json();
    const entries = (data.leaderboard || []).slice(0, limit);

    if (entries.length === 0) {
      console.log("Leaderboard is empty.");
      return;
    }

    console.log(`\n  ╔══ SAID Protocol Leaderboard ══╗\n`);

    for (const e of entries) {
      const medal = e.rank === 1 ? "🥇" : e.rank === 2 ? "🥈" : e.rank === 3 ? "🥉" : `#${e.rank}`;
      const verified = e.isVerified ? "✅" : "  ";
      const score = e.reputationScore.toFixed(1).padStart(5);
      console.log(`  ${medal}  ${score}  ${verified}  ${e.name}`);
      console.log(`       ${e.wallet.slice(0, 8)}... • ${e.feedbackCount} feedback`);
    }
    console.log();
  } catch (e: any) {
    console.error(`❌ Failed: ${e.message}`);
    process.exit(1);
  }
}

async function passportCmd(args: Record<string, string>) {
  if (!args.wallet) { console.error("Missing --wallet"); process.exit(1); }

  try {
    const res = await fetch(`${API_BASE}/api/agents/${args.wallet}/passport`);
    const data = await res.json();

    console.log(`\n  Agent: ${args.wallet}`);
    if (data.hasPassport) {
      console.log(`  Passport: ✅ Minted`);
      if (data.mintAddress) console.log(`  Mint: ${data.mintAddress}`);
    } else {
      console.log(`  Passport: ❌ Not minted`);
      if (data.canMint) console.log(`  Status: Eligible to mint`);
      if (data.reason) console.log(`  Info: ${data.reason}`);
    }
    console.log();
  } catch (e: any) {
    console.error(`❌ Failed: ${e.message}`);
    process.exit(1);
  }
}

async function statsCmd() {
  try {
    const res = await fetch(`${API_BASE}/api/stats`);
    const data = await res.json();

    console.log(`\n  ╔══ SAID Protocol Stats ══╗\n`);
    console.log(`  Total Agents:     ${data.totalAgents?.toLocaleString()}`);
    console.log(`  Verified Agents:  ${data.verifiedAgents?.toLocaleString()}`);
    console.log(`  Avg Reputation:   ${data.averageReputation?.toFixed(4)}`);
    console.log();
  } catch (e: any) {
    console.error(`❌ Failed: ${e.message}`);
    process.exit(1);
  }
}

// ── Discovery Commands ──

async function discoverCmd(args: Record<string, string>) {
  const limit = parseInt(args.limit || "20");

  try {
    const url = new URL(`${API_BASE}/xchain/discover`);
    if (args.query) url.searchParams.set("q", args.query);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const agents = (data.agents || []).slice(0, limit);

    if (agents.length === 0) {
      console.log("No agents found.");
      return;
    }

    console.log(`\n  ╔══ SAID Agent Directory ══╗\n`);
    for (const a of agents) {
      const verified = a.verified ? "✅" : "  ";
      const chains = a.chain || "?";
      console.log(`  ${verified}  ${a.name || "Unnamed"} (${a.address.slice(0, 8)}...)`);
      console.log(`       Chain: ${chains} • Source: ${a.source}`);
      if (a.description) console.log(`       ${a.description.slice(0, 80)}`);
      console.log();
    }
    console.log(`  Showing ${agents.length} of ${data.agents?.length || 0} agents\n`);
  } catch (e: any) {
    console.error(`❌ Failed: ${e.message}`);
    process.exit(1);
  }
}

async function resolveCmd(args: Record<string, string>) {
  if (!args.wallet) { console.error("Missing --wallet"); process.exit(1); }

  try {
    const url = new URL(`${API_BASE}/xchain/resolve/${args.wallet}`);
    if (args.chain) url.searchParams.set("chain", args.chain);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const agents = data.agents || [];

    if (agents.length === 0) {
      console.log(`No agents found for ${args.wallet}`);
      return;
    }

    console.log(`\n  Agent: ${args.wallet}\n`);
    for (const a of agents) {
      const verified = a.verified ? "✅" : "❌";
      console.log(`  ${verified}  ${a.chain} — ${a.name || "Unnamed"}`);
      if (a.source) console.log(`       Source: ${a.source}`);
      if (a.endpoint) console.log(`       Endpoint: ${a.endpoint}`);
      if (a.reputationScore !== undefined) console.log(`       Reputation: ${a.reputationScore}`);
      console.log();
    }
  } catch (e: any) {
    console.error(`❌ Failed: ${e.message}`);
    process.exit(1);
  }
}

// ── Main ──

const command = process.argv[2];
const args = parseArgs(process.argv.slice(3));

switch (command) {
  case "register": register(args); break;
  case "verify": verify(args); break;
  case "status": status(args); break;
  case "stake": stakeCmd(args); break;
  case "add-stake": addStakeCmd(args); break;
  case "request-unstake": requestUnstakeCmd(args); break;
  case "complete-unstake": completeUnstakeCmd(args); break;
  case "cancel-unstake": cancelUnstakeCmd(args); break;
  case "emergency-unstake": emergencyUnstakeCmd(args); break;
  // Trust & reputation
  case "trust": trustCmd(args); break;
  case "feedback": feedbackCmd(args); break;
  case "leaderboard": leaderboardCmd(args); break;
  case "passport": passportCmd(args); break;
  case "stats": statsCmd(); break;
  // Discovery
  case "discover": discoverCmd(args); break;
  case "resolve": resolveCmd(args); break;
  default:
    console.log(`SAID Protocol CLI v0.7.0

Usage:
  ── Registration & Staking ──
  said register           --keypair <path> --name <name> [--description <desc>] [--twitter <handle>] [--website <url>]
  said verify             --keypair <path>
  said stake              --keypair <path> --amount <SOL>    (min 0.1 SOL, requires verified agent)
  said add-stake          --keypair <path> --amount <SOL>    (add to existing stake)
  said request-unstake    --keypair <path>                    (starts 7-day cooldown)
  said cancel-unstake     --keypair <path>                    (cancel pending unstake)
  said complete-unstake   --keypair <path>                    (after 7-day cooldown)
  said emergency-unstake  --keypair <path>                    (immediate, 10% penalty)

  ── Trust & Reputation ──
  said trust              --wallet <address>                  (full trust score breakdown)
  said feedback           --wallet <address> [--limit <n>]    (agent feedback/reviews)
  said leaderboard        [--limit <n>]                       (top agents by reputation)
  said passport           --wallet <address>                  (check soulbound passport)
  said stats                                                 (protocol-wide statistics)
  said status             --wallet <address>                  (quick registration check)

  ── Discovery ──
  said discover           [--query <term>] [--limit <n>]      (search agents across chains)
  said resolve            --wallet <address> [--chain <name>] (resolve agent across chains)

Options:
  --rpc <url>   Custom RPC URL (default: mainnet-beta)`);
}
