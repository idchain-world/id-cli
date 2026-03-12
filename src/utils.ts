import { ethers } from "ethers";
import chalk from "chalk";
import { getChainConfig, resolveChain, CHAIN_CONFIGS, INDEXER_BASE_URL, type ChainConfig } from "./config.js";

export function labelhash(label: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(label));
}

export function makeNode(parentNode: string, label: string): string {
  return ethers.keccak256(
    ethers.concat([parentNode, labelhash(label)])
  );
}

export function getNodeForLabel(label: string, chainId: number): string {
  const config = getChainConfig(chainId);
  return makeNode(config.PARENT_NODE, label);
}

export function formatDomainName(label: string, chainId: number): string {
  const config = getChainConfig(chainId);
  return `${label}${config.suffix}`;
}

/**
 * Resolve a name input to { path, node, chainId, domain }.
 *
 * Accepts:
 *   - Full domain:  neo.agent-0.base.xid.eth
 *   - Short path:   neo.agent-0  (requires chainId from --chain)
 *   - Simple label:  agent-0     (requires chainId from --chain)
 *
 * For multi-level paths like "neo.agent-0", hashes each label
 * from right to left starting from the chain's PARENT_NODE.
 */
export interface ResolvedName {
  path: string;       // e.g. "neo.agent-0"
  node: string;       // namehash
  chainId: number;
  domain: string;     // e.g. "neo.agent-0.base.xid.eth"
  topLabel: string;   // e.g. "agent-0" (the direct child of PARENT_NODE)
}

export function resolveName(input: string, chainFlag?: string): ResolvedName {
  // Try to detect full domain: ends with .xid.eth
  const suffixMatch = input.match(/^(.+?)(\.(base|eth|op|arb)\.xid\.eth)$/);
  if (suffixMatch) {
    const path = suffixMatch[1];
    const suffix = suffixMatch[2];
    // Find chain by suffix
    const config = Object.values(CHAIN_CONFIGS).find(c => c.suffix === suffix);
    if (!config) throw new Error(`Unknown suffix: ${suffix}`);
    return resolvePathOnChain(path, config.chainId);
  }

  // Otherwise use --chain flag
  const chainId = chainFlag ? resolveChain(chainFlag) : 8453;
  return resolvePathOnChain(input, chainId);
}

function resolvePathOnChain(path: string, chainId: number): ResolvedName {
  const config = getChainConfig(chainId);
  const labels = path.split(".");

  // Hash from right to left: agent-0 first, then neo
  // labels = ["neo", "agent-0"] → hash agent-0 under PARENT_NODE, then neo under that
  let node = config.PARENT_NODE;
  const topLabel = labels[labels.length - 1];
  for (let i = labels.length - 1; i >= 0; i--) {
    node = makeNode(node, labels[i]);
  }

  return {
    path,
    node,
    chainId,
    domain: `${path}${config.suffix}`,
    topLabel,
  };
}

export function formatUsdc(amount: bigint): string {
  return ethers.formatUnits(amount, 6);
}

export function parseDuration(input: string): bigint {
  const match = input.match(/^(\d+)(d|y|days?|years?)$/i);
  if (match) {
    const num = BigInt(match[1]);
    const unit = match[2].toLowerCase();
    if (unit.startsWith("y")) return num * 365n * 24n * 60n * 60n;
    if (unit.startsWith("d")) return num * 24n * 60n * 60n;
  }
  // Try as raw seconds
  const secs = BigInt(input);
  if (secs > 0n) return secs;
  throw new Error(`Invalid duration: ${input}. Use format like "1y", "365d", or seconds.`);
}

export async function signUsdcPermit(
  wallet: ethers.Wallet,
  usdc: ethers.Contract,
  spender: string,
  value: bigint,
  chainId: number,
): Promise<{ deadline: bigint; v: number; r: string; s: string }> {
  const tokenName = await usdc.name();
  const nonce = await usdc.nonces(wallet.address);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

  const sig = ethers.Signature.from(
    await wallet.signTypedData(
      {
        name: tokenName,
        version: "1",
        chainId,
        verifyingContract: await usdc.getAddress(),
      },
      {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      { owner: wallet.address, spender, value, nonce, deadline }
    )
  );

  return { deadline, v: sig.v, r: sig.r, s: sig.s };
}

export async function indexerFetch(path: string): Promise<Response> {
  // Strip /api prefix since we route through the website proxy at /api/indexer
  const cleanPath = path.startsWith("/api") ? path.slice(4) : path;
  const url = `${INDEXER_BASE_URL}${cleanPath}`;
  const headers: Record<string, string> = {};
  // Add auth header when using a custom indexer URL directly
  if (process.env.INDEXER_URL) {
    const apiKey = process.env.INDEXER_API_KEY || process.env.API_KEY || "";
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  }
  return fetch(url, Object.keys(headers).length ? { headers } : undefined);
}

// ── Dry-run mode ──────────────────────────────────────────────────────────────

export function isDryRun(): boolean {
  return process.argv.includes("--dry-run");
}

export interface TxProposal {
  action: string;
  chainId: number;
  contractName: string;
  contractAddress: string;
  functionAbi: string;
  args: any[];
  argLabels: string[];
  notes?: string[];
}

export function proposeTx(p: TxProposal): void {
  const config = getChainConfig(p.chainId);
  const iface = new ethers.Interface([p.functionAbi]);
  const fragment = iface.fragments[0] as ethers.FunctionFragment;
  const calldata = iface.encodeFunctionData(fragment, p.args);
  const selector = calldata.slice(0, 10);

  console.log("");
  console.log(chalk.bold("Transaction Proposal"));
  console.log("=".repeat(50));
  console.log(`  ${chalk.dim("Action:")}     ${p.action}`);
  console.log(`  ${chalk.dim("Chain:")}      ${config.name} (${p.chainId})`);
  console.log(`  ${chalk.dim("Contract:")}   ${p.contractName}`);
  console.log(`               ${p.contractAddress}`);
  console.log(`  ${chalk.dim("Function:")}   ${fragment.format("sighash")}`);
  console.log(`  ${chalk.dim("Selector:")}   ${selector}`);
  console.log("");
  console.log(chalk.dim("  Arguments:"));
  for (let i = 0; i < p.argLabels.length; i++) {
    const val = p.args[i];
    let display: string;
    if (typeof val === "bigint") display = val.toString();
    else if (Array.isArray(val)) display = val.length ? JSON.stringify(val) : "[]";
    else display = String(val);
    console.log(`    ${p.argLabels[i].padEnd(16)} ${display}`);
  }
  console.log("");
  console.log(chalk.dim("  Calldata:"));
  // Split long calldata into lines of 66 chars (0x + 64 hex)
  for (let i = 0; i < calldata.length; i += 66) {
    console.log(`    ${calldata.slice(i, i + 66)}`);
  }
  if (p.notes?.length) {
    console.log("");
    console.log(chalk.dim("  Notes:"));
    for (const note of p.notes) {
      console.log(`    ${note}`);
    }
  }
  console.log("");
  console.log(chalk.dim("  Verify:"));
  console.log(`    ${config.explorer}/address/${p.contractAddress}#writeContract`);
  console.log("=".repeat(50));
}
