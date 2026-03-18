import { Command } from "commander";
import { ethers } from "ethers";
import chalk from "chalk";
import { getChainConfig } from "../config.js";
import { getWallet, getProvider } from "../provider.js";
import { REGISTRY_ABI } from "../abi.js";
import { resolveName, isDryRun, proposeTx, CliError, ExitCode } from "../utils.js";
import { outputSuccess, handleErrorJson, humanLog, statusLog } from "../output.js";

// ── Coin type resolution ────────────────────────────────────────────────────

// ENSIP-19: EVM coin types are 0x80000000 + chainId (unsigned)
const COIN_TYPE_ALIASES: Record<string, number> = {
  DEFAULT: 60,
  ETH: 60,
  BTC: 0,
  BASE: 0x80002105,     // 2147492101
  OP: 0x8000000a,       // 2147483658
  OPTIMISM: 0x8000000a,
  ARB: 0x8000a4b1,      // 2147525809
  ARBITRUM: 0x8000a4b1,
  SEP: 0x80aa36a7,      // 2158638759
  SEPOLIA: 0x80aa36a7,
};

function resolveCoinType(input: string): number {
  const upper = input.toUpperCase();
  if (upper in COIN_TYPE_ALIASES) return COIN_TYPE_ALIASES[upper];
  const n = parseInt(input, 10);
  if (!isNaN(n) && n >= 0) return n;
  throw new CliError(
    `Unknown coin type: "${input}". Use a number or: ${Object.keys(COIN_TYPE_ALIASES).join(", ")}`,
    ExitCode.INPUT_ERROR,
  );
}

function coinTypeLabel(coinType: number): string {
  const alias = Object.entries(COIN_TYPE_ALIASES).find(([, v]) => v === coinType);
  if (alias) return alias[0];
  return `coinType ${coinType}`;
}

/**
 * Determine which chain's registry holds the reverse namespace for a given coinType.
 * - coinType 60 (ETH default) → Ethereum L1 (chainId 1)
 * - EVM coinTypes (0x80000000 + chainId) → that chain
 * - Other coinTypes → null (use --chain flag)
 */
function registryChainForCoinType(coinType: number): number | null {
  if (coinType === 60) return 1; // Default reverse lives on L1 Ethereum
  if (coinType >= 0x80000000) {
    const chainId = coinType - 0x80000000;
    return chainId;
  }
  return null; // Unknown — user must specify --chain
}

// ── Reverse node computation (ENSIP-19) ─────────────────────────────────────

function reverseNodeFor(address: string, coinType: number): { node: string; domain: string; parentNode: string; label: string } {
  const hexAddr = address.toLowerCase().replace(/^0x/, "");

  let domain: string;
  let parentDomain: string;
  if (coinType === 60) {
    domain = `${hexAddr}.addr.reverse`;
    parentDomain = "addr.reverse";
  } else {
    const coinTypeHex = coinType.toString(16);
    domain = `${hexAddr}.${coinTypeHex}.reverse`;
    parentDomain = `${coinTypeHex}.reverse`;
  }

  return {
    node: ethers.namehash(domain),
    domain,
    parentNode: ethers.namehash(parentDomain),
    label: hexAddr,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function isHexAddress(input: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(input);
}

async function resolveAddressFromAgent(
  registry: ethers.Contract,
  node: string,
  coinType: number,
  domain: string,
): Promise<string> {
  if (coinType === 60) {
    const addr = await registry.getFunction("addr(bytes32)").staticCall(node);
    if (!addr || addr === ethers.ZeroAddress) {
      throw new CliError(`No ETH address set on ${domain}.`, ExitCode.NOT_FOUND);
    }
    return addr;
  }

  // For non-60 coinTypes, addr(bytes32, uint256) returns bytes
  const addrBytes: string = await registry.getFunction("addr(bytes32,uint256)").staticCall(node, coinType);
  if (!addrBytes || addrBytes === "0x" || addrBytes === ethers.ZeroHash) {
    throw new CliError(`No address for ${coinTypeLabel(coinType)} set on ${domain}.`, ExitCode.NOT_FOUND);
  }

  // For EVM chains (coinType >= 0x80000000), address is 20 bytes
  if (coinType >= 0x80000000 && addrBytes.length === 42) {
    return ethers.getAddress(addrBytes);
  }
  // Try to interpret as 20-byte EVM address
  if (addrBytes.length >= 42) {
    return ethers.getAddress("0x" + addrBytes.replace(/^0x/, "").slice(-40));
  }

  throw new CliError(
    `Address for ${coinTypeLabel(coinType)} on ${domain} is not a valid EVM address: ${addrBytes}`,
    ExitCode.INPUT_ERROR,
  );
}

// ── Command ─────────────────────────────────────────────────────────────────

export const setReverseCommand = new Command("set-reverse")
  .description("Set reverse name for an address (ENSIP-19)")
  .argument("<name-or-address>", "Full agent name (e.g., agent-0.base.xid.eth) or hex address (0x...)")
  .argument("[cointype]", "Coin type: DEFAULT, ETH, BASE, OP, ARB, SEP, or a number", "DEFAULT")
  .option("-c, --chain <chain>", "Override chain for registry interaction (auto-detected from cointype)")
  .option("--name <name>", "Reverse name to set (defaults to agent's full domain)")
  .option("--dry-run", "Show transaction proposal without executing")
  .action(async (nameOrAddr, cointypeArg, opts) => {
    try {
      const coinType = resolveCoinType(cointypeArg);

      let targetAddress: string;
      let reverseName: string;
      let nameChainId: number | undefined; // chain where the agent name lives (for address lookup)

      if (isHexAddress(nameOrAddr)) {
        // Direct hex address
        targetAddress = ethers.getAddress(nameOrAddr);
        if (!opts.name) {
          throw new CliError(
            "When using a direct address, --name is required to specify the reverse name.",
            ExitCode.INPUT_ERROR,
          );
        }
        reverseName = opts.name;
      } else {
        // Agent name — resolve address from the name's chain registry
        const resolved = resolveName(nameOrAddr, opts.chain);
        reverseName = opts.name || resolved.domain;
        nameChainId = resolved.chainId;

        const nameConfig = getChainConfig(resolved.chainId);
        const provider = getProvider(resolved.chainId);
        const readRegistry = new ethers.Contract(nameConfig.ID_REGISTRY, REGISTRY_ABI, provider);
        targetAddress = await resolveAddressFromAgent(readRegistry, resolved.node, coinType, resolved.domain);
      }

      // Determine which chain's registry holds the reverse namespace
      const autoChainId = registryChainForCoinType(coinType);
      const reverseChainId = opts.chain
        ? (await import("../config.js")).resolveChain(opts.chain)
        : autoChainId || nameChainId || 8453;
      const config = getChainConfig(reverseChainId);

      const reverse = reverseNodeFor(targetAddress, coinType);

      humanLog(chalk.bold("Set Reverse Name"));
      humanLog(`  Address:    ${targetAddress}`);
      humanLog(`  CoinType:   ${coinTypeLabel(coinType)} (${coinType})`);
      humanLog(`  Reverse to: ${chalk.bold(reverseName)}`);
      humanLog(`  Registry:   ${config.name} (${reverseChainId})`);
      humanLog(`  Node:       ${chalk.dim(reverse.node)}`);
      humanLog(`  Namespace:  ${chalk.dim(reverse.domain)}`);

      if (isDryRun()) {
        proposeTx({
          action: `Set reverse name for ${targetAddress} → ${reverseName}`,
          chainId: reverseChainId,
          contractName: "IDRegistry",
          contractAddress: config.ID_REGISTRY,
          functionAbi: "function setText(bytes32 node, string key, string value)",
          args: [reverse.node, "name", reverseName],
          argLabels: ["node", "key", "value"],
          notes: [
            `Reverse domain: ${reverse.domain}`,
            `CoinType: ${coinTypeLabel(coinType)} (${coinType})`,
            `Registry chain: ${config.name} (auto-detected from cointype)`,
            "Uses setText if you already own the reverse node.",
            "If not owned, will use setSubnodeRecord to claim + set in one tx.",
          ],
        });
        return;
      }

      const wallet = getWallet(reverseChainId);
      const registry = new ethers.Contract(config.ID_REGISTRY, REGISTRY_ABI, wallet);

      // Check if we already own the reverse node
      const currentOwner = await registry.owner(reverse.node);
      const weOwnIt = currentOwner.toLowerCase() === wallet.address.toLowerCase();

      let tx: ethers.ContractTransactionResponse;

      if (weOwnIt) {
        // We own the reverse node — just set the name record
        statusLog(chalk.dim("Setting reverse name via setText..."));
        tx = await registry.setText(reverse.node, "name", reverseName);
      } else {
        // We don't own it — try to claim via setSubnodeRecord on the parent
        statusLog(chalk.dim("Claiming reverse node via setSubnodeRecord..."));
        tx = await registry.setSubnodeRecord(
          reverse.parentNode,    // parent: addr.reverse or [coinTypeHex].reverse
          reverse.label,         // label: hex address (without 0x)
          wallet.address,        // newOwner: our wallet
          ["name"],              // text keys
          [reverseName],         // text values
          [], [],                // no address records
          "0x",                  // no contenthash
          [], [],                // no data records
        );
      }

      humanLog(`Tx: ${chalk.dim(tx.hash)}`);
      await tx.wait();
      humanLog(chalk.green(`Reverse set: ${targetAddress} → ${chalk.bold(reverseName)}`));

      outputSuccess({
        address: targetAddress,
        coinType,
        coinTypeLabel: coinTypeLabel(coinType),
        reverseName,
        reverseNode: reverse.node,
        reverseDomain: reverse.domain,
        method: weOwnIt ? "setText" : "setSubnodeRecord",
        txHash: tx.hash,
      }, { chain: config.name, chainId: reverseChainId });
    } catch (err: any) {
      handleErrorJson(err);
    }
  });
