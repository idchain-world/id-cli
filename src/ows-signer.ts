/**
 * OWS-backed ethers Signer
 *
 * Delegates transaction signing to `ows sign tx` / `ows sign send-tx`.
 * The private key never leaves the OWS vault. Policies attached to the
 * OWS API key (via OWS_PASSPHRASE) are enforced before signing.
 *
 * Usage:
 *   const signer = new OwsSigner("idchain-registrar", provider);
 *   const contract = new ethers.Contract(addr, abi, signer);
 *   await contract.someMethod();  // signs via OWS
 */

import { ethers } from "ethers";
import { execFileSync } from "child_process";

/**
 * Resolve the EVM address for an OWS wallet by parsing `ows wallet list`.
 */
function getOwsWalletAddress(walletName: string): string {
  const output = execFileSync("ows", ["wallet", "list"], {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 10000,
  });

  let inWallet = false;
  for (const line of output.split("\n")) {
    if (line.includes("Name:") && line.includes(walletName)) {
      inWallet = true;
      continue;
    }
    if (inWallet && line.includes("Name:")) break;
    if (inWallet) {
      const match = line.trim().match(/^eip155:1\s.*→\s*(0x[0-9a-fA-F]+)/);
      if (match) return ethers.getAddress(match[1]);
    }
  }
  throw new Error(`OWS wallet "${walletName}" not found or has no EVM address`);
}

/**
 * Map chain ID to CAIP-2 identifier for OWS.
 */
function chainIdToCaip2(chainId: number): string {
  return `eip155:${chainId}`;
}

export class OwsSigner extends ethers.AbstractSigner {
  private _walletName: string;
  private _chainId: number;

  /** Synchronous address — resolved eagerly at construction time. */
  readonly address: string;

  constructor(walletName: string, provider: ethers.Provider, chainId: number) {
    super(provider);
    this._walletName = walletName;
    this._chainId = chainId;
    // Resolve address eagerly so .address works synchronously like ethers.Wallet
    this.address = getOwsWalletAddress(walletName);
  }

  async getAddress(): Promise<string> {
    return this.address;
  }

  connect(provider: ethers.Provider): OwsSigner {
    return new OwsSigner(this._walletName, provider, this._chainId);
  }

  async signTransaction(tx: ethers.TransactionLike): Promise<string> {
    // Populate missing fields (nonce, gasLimit, etc.)
    const populated = await this.populateTransaction(tx);

    // Strip 'from' — ethers won't serialize unsigned tx with a from field
    const { from: _, ...txWithoutFrom } = populated;

    // Build the transaction object for serialization
    const txObj = ethers.Transaction.from(txWithoutFrom);
    const unsignedHex = txObj.unsignedSerialized;

    // Sign via OWS — returns raw signature bytes (r || s || v) without 0x prefix
    const env: Record<string, string> = { ...process.env } as Record<string, string>;
    const sigHex = execFileSync("ows", [
      "sign", "tx",
      "--wallet", this._walletName,
      "--chain", chainIdToCaip2(this._chainId),
      "--tx", unsignedHex,
    ], {
      encoding: "utf8",
      env,
      timeout: 30000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();

    // Parse signature: 64 bytes r + 32 bytes s + 1 byte v = 65 bytes = 130 hex chars
    const sigBytes = sigHex.startsWith("0x") ? sigHex : `0x${sigHex}`;
    const r = sigBytes.slice(0, 66);         // 0x + 64 chars
    const s = `0x${sigBytes.slice(66, 130)}`;
    const v = parseInt(sigBytes.slice(130, 132), 16);

    // Reconstruct signed transaction
    txObj.signature = ethers.Signature.from({ r, s, v: v < 27 ? v + 27 : v });
    return txObj.serialized;
  }

  async signMessage(message: string | Uint8Array): Promise<string> {
    const msgHex = typeof message === "string"
      ? ethers.hexlify(ethers.toUtf8Bytes(message))
      : ethers.hexlify(message);

    const env: Record<string, string> = { ...process.env } as Record<string, string>;

    const result = execFileSync("ows", [
      "sign", "message",
      "--wallet", this._walletName,
      "--chain", chainIdToCaip2(this._chainId),
      "--message", msgHex,
    ], {
      encoding: "utf8",
      env,
      timeout: 30000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();

    return result;
  }

  async signTypedData(
    domain: ethers.TypedDataDomain,
    types: Record<string, ethers.TypedDataField[]>,
    value: Record<string, unknown>,
  ): Promise<string> {
    // Build EIP-712 typed data JSON for OWS
    const typedData = JSON.stringify({
      types: {
        EIP712Domain: [
          ...(domain.name !== undefined ? [{ name: "name", type: "string" }] : []),
          ...(domain.version !== undefined ? [{ name: "version", type: "string" }] : []),
          ...(domain.chainId !== undefined ? [{ name: "chainId", type: "uint256" }] : []),
          ...(domain.verifyingContract !== undefined ? [{ name: "verifyingContract", type: "address" }] : []),
          ...(domain.salt !== undefined ? [{ name: "salt", type: "bytes32" }] : []),
        ],
        ...types,
      },
      primaryType: Object.keys(types)[0],
      domain: {
        ...(domain.name !== undefined && { name: domain.name }),
        ...(domain.version !== undefined && { version: domain.version }),
        ...(domain.chainId !== undefined && { chainId: String(domain.chainId) }),
        ...(domain.verifyingContract !== undefined && { verifyingContract: domain.verifyingContract }),
        ...(domain.salt !== undefined && { salt: domain.salt }),
      },
      message: Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, typeof v === "bigint" ? String(v) : v])
      ),
    });

    const env: Record<string, string> = { ...process.env } as Record<string, string>;

    const result = execFileSync("ows", [
      "sign", "message",
      "--wallet", this._walletName,
      "--chain", chainIdToCaip2(this._chainId),
      "--message", "dummy",
      "--typed-data", typedData,
      "--json",
    ], {
      encoding: "utf8",
      env,
      timeout: 30000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();

    const parsed = JSON.parse(result);
    const sig = parsed.signature.startsWith("0x") ? parsed.signature : `0x${parsed.signature}`;
    return sig;
  }
}
