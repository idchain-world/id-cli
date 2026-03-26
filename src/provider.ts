import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { ethers } from "ethers";
import { getChainConfig } from "./config.js";
import { CliError, ExitCode } from "./utils.js";
import { OwsSigner } from "./ows-signer.js";

function isKeyFromDotenv(): boolean {
  try {
    const envPath = resolve(process.cwd(), ".env");
    if (!existsSync(envPath)) return false;
    const content = readFileSync(envPath, "utf-8");
    return /^PRIVATE_KEY=/m.test(content);
  } catch {
    return false;
  }
}

export function getProvider(chainId: number): ethers.JsonRpcProvider {
  const config = getChainConfig(chainId);
  return new ethers.JsonRpcProvider(config.rpc);
}

/**
 * Get a signer for the given chain.
 *
 * Supports two modes:
 * - OWS wallet: set --wallet flag or OWS_WALLET env var. Signs via `ows sign tx`.
 *   Private key never leaves the OWS vault. Policies enforced via OWS_PASSPHRASE.
 * - Raw key: set PRIVATE_KEY env var. Traditional ethers.Wallet signer.
 */
export function getWallet(chainId: number): ethers.Wallet | OwsSigner {
  // Check for OWS wallet first
  const owsWallet = process.env.OWS_WALLET;
  if (owsWallet) {
    return new OwsSigner(owsWallet, getProvider(chainId), chainId);
  }

  const pk = process.env.PRIVATE_KEY;
  if (!pk) {
    throw new CliError(
      "No signer configured.\n\nOption 1 (OWS): --wallet <name> or OWS_WALLET=<name>\nOption 2 (raw): PRIVATE_KEY=0x...\n\nRead-only commands (info, records, explore) do not require a signer.",
      ExitCode.AUTH_ERROR,
    );
  }
  if (!/^(0x)?[0-9a-fA-F]{64}$/.test(pk)) {
    throw new CliError(
      "PRIVATE_KEY must be a 64-character hex string (with optional 0x prefix).",
      ExitCode.INPUT_ERROR,
    );
  }
  if (isKeyFromDotenv()) {
    console.warn(
      "Warning: PRIVATE_KEY loaded from .env file. For better security, use OWS: --wallet <name>",
    );
  }
  try {
    return new ethers.Wallet(pk, getProvider(chainId));
  } catch {
    throw new CliError(
      "Invalid PRIVATE_KEY format — must be a 64-character hex string (with or without 0x prefix).",
      ExitCode.AUTH_ERROR,
    );
  }
}
