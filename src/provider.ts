import { ethers } from "ethers";
import { getChainConfig } from "./config.js";
import { CliError, ExitCode } from "./utils.js";

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
  return new ethers.Wallet(pk, getProvider(chainId));
}
