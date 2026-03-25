import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { ethers } from "ethers";
import { getChainConfig } from "./config.js";
import { CliError, ExitCode } from "./utils.js";

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

export function getWallet(chainId: number): ethers.Wallet {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) {
    throw new CliError(
      "PRIVATE_KEY environment variable is required.\nSet it with: export PRIVATE_KEY=0x...\nRead-only commands (info, records, explore) do not require it.",
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
      "Warning: PRIVATE_KEY loaded from .env file. For better security, set it as an environment variable: export PRIVATE_KEY=0x...",
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
