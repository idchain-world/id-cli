import { ethers } from "ethers";
import chalk from "chalk";
import { getConfig, CHAIN_ID, INDEXER_BASE_URL } from "./config.js";

// ── Exit codes ───────────────────────────────────────────────────────────────

export enum ExitCode {
  SUCCESS = 0,
  GENERAL_ERROR = 1,
  INPUT_ERROR = 2,
  AUTH_ERROR = 3,
  NOT_FOUND = 4,
  INSUFFICIENT_FUNDS = 5,
}

export class CliError extends Error {
  constructor(message: string, public exitCode: ExitCode = ExitCode.GENERAL_ERROR) {
    super(message);
  }
}

export function handleError(err: any): never {
  const exitCode = err instanceof CliError ? err.exitCode : ExitCode.GENERAL_ERROR;
  console.error(chalk.red(err.message || String(err)));
  process.exit(exitCode);
}

// ── Input validation ─────────────────────────────────────────────────────────

const LABEL_RE = /^[a-z0-9-]+$/;

export function validateLabel(label: string): void {
  if (!label) throw new CliError("Label cannot be empty.", ExitCode.INPUT_ERROR);
  if (!LABEL_RE.test(label)) {
    throw new CliError(
      `Invalid label "${label}". Labels may only contain lowercase letters, digits, and hyphens.`,
      ExitCode.INPUT_ERROR,
    );
  }
}

export function validateAddress(addr: string, flagName: string): string {
  try {
    return ethers.getAddress(addr);
  } catch {
    throw new CliError(`Invalid address for ${flagName}: "${addr}".`, ExitCode.INPUT_ERROR);
  }
}

export function parseNonNegativeInt(value: string, flagName: string): number {
  const n = parseInt(value, 10);
  if (isNaN(n) || n < 0) {
    throw new CliError(`${flagName} must be a non-negative integer, got "${value}".`, ExitCode.INPUT_ERROR);
  }
  return n;
}

export async function verifyOwnership(
  registry: ethers.Contract,
  node: string,
  wallet: { address: string },
  domain: string,
): Promise<void> {
  const currentOwner = await registry.owner(node);
  if (currentOwner === ethers.ZeroAddress) {
    throw new CliError(`${domain} is not registered.`, ExitCode.NOT_FOUND);
  }
  if (currentOwner.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new CliError(`You don't own ${domain}. Owner: ${currentOwner}`, ExitCode.NOT_FOUND);
  }
}

export function labelhash(label: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(label));
}

export function makeNode(parentNode: string, label: string): string {
  return ethers.keccak256(
    ethers.concat([parentNode, labelhash(label)])
  );
}

export function getNodeForLabel(label: string): string {
  const config = getConfig();
  return makeNode(config.PARENT_NODE, label);
}

export function formatDomainName(label: string): string {
  const config = getConfig();
  return `${label}${config.suffix}`;
}

/**
 * Resolve a name input to { path, node, chainId, domain }.
 *
 * Accepts:
 *   - Full domain:  neo.agent-0.xid.eth
 *   - Short path:   neo.agent-0
 *   - Simple label:  agent-0
 *
 * For multi-level paths like "neo.agent-0", hashes each label
 * from right to left starting from the PARENT_NODE.
 */
export interface ResolvedName {
  path: string;       // e.g. "neo.agent-0"
  node: string;       // namehash
  chainId: number;
  domain: string;     // e.g. "neo.agent-0.xid.eth"
  topLabel: string;   // e.g. "agent-0" (the direct child of PARENT_NODE)
}

export function resolveName(input: string): ResolvedName {
  // Strip .xid.eth suffix if present
  const suffix = getConfig().suffix;
  let path = input;
  if (input.endsWith(suffix)) {
    path = input.slice(0, -suffix.length);
  }
  // Also handle legacy .base.xid.eth suffix
  if (input.endsWith(".base.xid.eth")) {
    path = input.slice(0, -".base.xid.eth".length);
  }
  return resolvePathOnChain(path);
}

function resolvePathOnChain(path: string): ResolvedName {
  const config = getConfig();
  const labels = path.split(".");

  // Validate each label segment
  for (const label of labels) {
    validateLabel(label);
  }

  // Hash from right to left: agent-0 first, then neo
  let node = config.PARENT_NODE;
  const topLabel = labels[labels.length - 1];
  for (let i = labels.length - 1; i >= 0; i--) {
    node = makeNode(node, labels[i]);
  }

  return {
    path,
    node,
    chainId: CHAIN_ID,
    domain: `${path}${config.suffix}`,
    topLabel,
  };
}

/**
 * Async name resolution that supports both xid.eth names and linked .eth names.
 * For .eth names, calls the idchain.world resolve API to find the linked agent.
 */
export async function resolveNameAsync(input: string): Promise<ResolvedName> {
  // If it ends with .eth but NOT .xid.eth, it's a linked ENS name
  if (input.endsWith(".eth") && !input.endsWith(".xid.eth")) {
    return resolveLinkedEnsName(input);
  }
  // Otherwise use the sync resolver
  return resolveName(input);
}

const RESOLVE_API_URL = process.env.RESOLVE_API_URL || "https://idchain.world/api/v1/resolve";

async function resolveLinkedEnsName(ensName: string): Promise<ResolvedName> {
  const url = `${RESOLVE_API_URL}/${encodeURIComponent(ensName)}`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) {
      throw new CliError(`Could not resolve ${ensName}. No verified link found.`, ExitCode.NOT_FOUND);
    }
    throw new CliError(`Failed to resolve ${ensName}: HTTP ${res.status}`, ExitCode.GENERAL_ERROR);
  }
  const json = await res.json();
  if (!json.ok || !json.data) {
    throw new CliError(`Failed to resolve ${ensName}: ${json.error?.message || "unknown error"}`, ExitCode.GENERAL_ERROR);
  }

  const { registryName, node } = json.data;
  if (!registryName || !node) {
    throw new CliError(`Incomplete resolve response for ${ensName}.`, ExitCode.GENERAL_ERROR);
  }

  // Parse path from registryName (e.g. "treo.agent-1.xid.eth" → path "treo.agent-1")
  const config = getConfig();
  let path: string;
  if (registryName.endsWith(config.suffix)) {
    path = registryName.slice(0, -config.suffix.length);
  } else if (registryName.endsWith(".base.xid.eth")) {
    // Handle legacy format
    path = registryName.slice(0, -".base.xid.eth".length);
  } else {
    throw new CliError(`Unexpected registry name format: ${registryName}`, ExitCode.GENERAL_ERROR);
  }
  const labels = path.split(".");
  const topLabel = labels[labels.length - 1];

  return {
    path,
    node,
    chainId: CHAIN_ID,
    domain: `${path}${config.suffix}`,
    topLabel,
  };
}

export function formatUsdc(amount: bigint): string {
  return ethers.formatUnits(amount, 6);
}

export async function signUsdcPermit(
  wallet: ethers.Wallet | (ethers.AbstractSigner & { address: string }),
  usdc: ethers.Contract,
  spender: string,
  value: bigint,
): Promise<{ deadline: bigint; v: number; r: string; s: string }> {
  const tokenName = await usdc.name();
  const nonce = await usdc.nonces(wallet.address);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

  const sig = ethers.Signature.from(
    await wallet.signTypedData(
      {
        name: tokenName,
        version: "1",
        chainId: CHAIN_ID,
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
  contractName: string;
  contractAddress: string;
  functionAbi: string;
  args: any[];
  argLabels: string[];
  notes?: string[];
}

export function proposeTx(p: TxProposal): void {
  const config = getConfig();
  const iface = new ethers.Interface([p.functionAbi]);
  const fragment = iface.fragments[0] as ethers.FunctionFragment;
  const calldata = iface.encodeFunctionData(fragment, p.args);
  const selector = calldata.slice(0, 10);

  console.log("");
  console.log(chalk.bold("Transaction Proposal"));
  console.log("=".repeat(50));
  console.log(`  ${chalk.dim("Action:")}     ${p.action}`);
  console.log(`  ${chalk.dim("Chain:")}      ${config.name} (${CHAIN_ID})`);
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
    else if (Array.isArray(val)) display = val.length ? JSON.stringify(val, (_, v) => typeof v === "bigint" ? v.toString() : v) : "[]";
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
