import { Command } from "commander";
import { ethers } from "ethers";
import chalk from "chalk";
import { resolveChain, getChainConfig } from "../config.js";
import { getProvider } from "../provider.js";
import { REGISTRY_ABI } from "../abi.js";
import { getNodeForLabel, formatDomainName, indexerFetch } from "../utils.js";

export const infoCommand = new Command("info")
  .description("Show details for an agent name")
  .argument("<label>", "Agent label (e.g., agent-0)")
  .option("-c, --chain <chain>", "Chain", "base")
  .action(async (label, opts) => {
    try {
      const chainId = resolveChain(opts.chain);
      const config = getChainConfig(chainId);
      const provider = getProvider(chainId);
      const node = getNodeForLabel(label, chainId);
      const domain = formatDomainName(label, chainId);

      const registry = new ethers.Contract(config.ID_REGISTRY, REGISTRY_ABI, provider);

      // Fetch onchain data
      const [owner, ethAddr, isLocked] = await Promise.all([
        registry.owner(node),
        registry.getFunction("addr(bytes32)").staticCall(node).catch(() => ethers.ZeroAddress),
        registry.isLocked(node).catch(() => false),
      ]);

      if (owner === ethers.ZeroAddress) {
        console.log(chalk.yellow(`${domain} is not registered.`));
        return;
      }

      console.log(chalk.bold(domain));
      console.log(`  Node:    ${chalk.dim(node)}`);
      console.log(`  Owner:   ${owner}`);
      console.log(`  Locked:  ${isLocked ? chalk.green("yes") : chalk.dim("no")}`);
      if (ethAddr !== ethers.ZeroAddress) {
        console.log(`  ETH:     ${ethAddr}`);
      }

      // Try indexer for more details
      try {
        const res = await indexerFetch(`/api/domains/${node}`);
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

      // Fetch records from indexer (public endpoint, no API key needed)
      try {
        const res = await indexerFetch(`/api/domains/${node}/records`);
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
