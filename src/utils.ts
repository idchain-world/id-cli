import { ethers } from "ethers";
import { getChainConfig, INDEXER_BASE_URL, type ChainConfig } from "./config.js";

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
  const apiKey = process.env.INDEXER_API_KEY || process.env.API_KEY || "";
  const url = `${INDEXER_BASE_URL}${path}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  return fetch(url, { headers });
}
