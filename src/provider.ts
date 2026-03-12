import { ethers } from "ethers";
import { getChainConfig } from "./config.js";

export function getProvider(chainId: number): ethers.JsonRpcProvider {
  const config = getChainConfig(chainId);
  return new ethers.JsonRpcProvider(config.rpc);
}

export function getWallet(chainId: number): ethers.Wallet {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) {
    throw new Error("PRIVATE_KEY environment variable is required.\nSet it with: export PRIVATE_KEY=0x...");
  }
  return new ethers.Wallet(pk, getProvider(chainId));
}
