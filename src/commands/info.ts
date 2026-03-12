import { Command } from "commander";
import { ethers } from "ethers";
import chalk from "chalk";
import { getChainConfig } from "../config.js";
import { getProvider } from "../provider.js";
import { REGISTRY_ABI } from "../abi.js";
import { resolveName, indexerFetch } from "../utils.js";

export const infoCommand = new Command("info")
  .description("Show details for an agent name")
  .argument("<name>", "Name (e.g., agent-0, neo.agent-0, agent-0.base.xid.eth)")
  .option("-c, --chain <chain>", "Chain (not needed for full domain names)", "base")
  .action(async (name, opts) => {
    try {
      const resolved = resolveName(name, opts.chain);
      const config = getChainConfig(resolved.chainId);
      const provider = getProvider(resolved.chainId);

      const registry = new ethers.Contract(config.ID_REGISTRY, REGISTRY_ABI, provider);

      // Fetch onchain data
      const [owner, ethAddr, isLocked] = await Promise.all([
        registry.owner(resolved.node),
        registry.getFunction("addr(bytes32)").staticCall(resolved.node).catch(() => ethers.ZeroAddress),
        registry.isLocked(resolved.node).catch(() => false),
      ]);

      if (owner === ethers.ZeroAddress) {
        console.log(chalk.yellow(`${resolved.domain} is not registered.`));
        return;
      }

      console.log(chalk.bold(resolved.domain));
      console.log(`  Node:    ${chalk.dim(resolved.node)}`);
      console.log(`  Owner:   ${owner}`);
      console.log(`  Locked:  ${isLocked ? chalk.green("yes") : chalk.dim("no")}`);
      if (ethAddr !== ethers.ZeroAddress) {
        console.log(`  ETH:     ${ethAddr}`);
      }

      // Try indexer for more details
      try {
        const res = await indexerFetch(`/api/domains/${resolved.node}`);
        if (res.ok) {
          const data = await res.json();
          if (data.lockExpiration) {
            const expiry = new Date(Number(data.lockExpiration) * 1000);
            const now = new Date();
            const daysLeft = Math.floor((expiry.getTime() - now.getTime()) / 86400000);
            console.log(`  Expires: ${expiry.toISOString().slice(0, 10)} (${daysLeft} days)`);
          }
        }
      } catch {
        // Indexer unavailable, skip
      }

      // Fetch records from indexer (public endpoint)
      try {
        const res = await indexerFetch(`/api/domains/${resolved.node}/records`);
        if (res.ok) {
          const records = await res.json();
          if (records.textRecords?.length) {
            console.log(chalk.dim("\n  Text Records:"));
            for (const r of records.textRecords) {
              console.log(`    ${r.key}: ${r.value}`);
            }
          }
          if (records.addressRecords?.length) {
            console.log(chalk.dim("\n  Address Records:"));
            for (const r of records.addressRecords) {
              console.log(`    coin ${r.coinType}: ${r.address}`);
            }
          }
        }
      } catch {
        // Skip if indexer unavailable
      }
    } catch (err: any) {
      console.error(chalk.red(err.message));
      process.exit(1);
    }
  });
