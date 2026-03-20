import { Command } from "commander";
import { ethers } from "ethers";
import chalk from "chalk";
import { getChainConfig } from "../config.js";
import { getProvider } from "../provider.js";
import { REGISTRY_ABI } from "../abi.js";
import { resolveNameAsync, indexerFetch } from "../utils.js";
import { outputSuccess, handleErrorJson, humanLog } from "../output.js";

export const infoCommand = new Command("info")
  .description("Show details for an agent name")
  .argument("<name>", "Name (e.g., agent-0, neo.agent-0, agent-0.base.xid.eth)")
  .option("-c, --chain <chain>", "Chain (not needed for full domain names)", "base")
  .option("--brief", "Show only owner and lock status (skip records)")
  .action(async (name, opts) => {
    try {
      const resolved = await resolveNameAsync(name, opts.chain);
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
        humanLog(chalk.yellow(`${resolved.domain} is not registered.`));
        outputSuccess({ domain: resolved.domain, registered: false }, { chain: config.name, chainId: resolved.chainId });
        return;
      }

      humanLog(chalk.bold(resolved.domain));
      humanLog(`  Node:    ${chalk.dim(resolved.node)}`);
      humanLog(`  Owner:   ${owner}`);
      humanLog(`  Locked:  ${isLocked ? chalk.green("yes") : chalk.dim("no")}`);
      if (ethAddr !== ethers.ZeroAddress) {
        humanLog(`  ETH:     ${ethAddr}`);
      }

      // Permanent names — show status
      if (isLocked) {
        humanLog(`  Status:  ${chalk.green("permanent")}`);
      }

      // Fetch records from indexer (public endpoint) unless --brief
      let textRecords: any[] = [];
      let addressRecords: any[] = [];
      if (!opts.brief) {
        try {
          const res = await indexerFetch(`/api/domains/${resolved.node}/records`);
          if (res.ok) {
            const records = await res.json();
            textRecords = records.textRecords || [];
            addressRecords = records.addressRecords || [];
            if (textRecords.length) {
              humanLog(chalk.dim("\n  Text Records:"));
              for (const r of textRecords) {
                humanLog(`    ${r.key}: ${r.value}`);
              }
            }
            if (addressRecords.length) {
              humanLog(chalk.dim("\n  Address Records:"));
              for (const r of addressRecords) {
                humanLog(`    coin ${r.coinType}: ${r.address}`);
              }
            }
          }
        } catch {
          // Skip if indexer unavailable
        }
      }

      outputSuccess({
        domain: resolved.domain,
        registered: true,
        node: resolved.node,
        owner,
        locked: isLocked,
        ethAddress: ethAddr !== ethers.ZeroAddress ? ethAddr : null,
        ...(opts.brief ? {} : { textRecords, addressRecords }),
      }, { chain: config.name, chainId: resolved.chainId });
    } catch (err: any) {
      handleErrorJson(err);
    }
  });
