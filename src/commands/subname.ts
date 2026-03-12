import { Command } from "commander";
import { ethers } from "ethers";
import chalk from "chalk";
import { getChainConfig } from "../config.js";
import { getWallet } from "../provider.js";
import { REGISTRY_ABI } from "../abi.js";
import { resolveName, indexerFetch } from "../utils.js";

export const createSubnameCommand = new Command("create-subname")
  .description("Create a subname under an agent")
  .argument("<sublabel>", "Subname label (e.g., neo)")
  .requiredOption("--parent <name>", "Parent name (e.g., agent-0, agent-0.base.xid.eth)")
  .option("-c, --chain <chain>", "Chain", "base")
  .option("--owner <address>", "Owner address (defaults to your wallet)")
  .action(async (sublabel, opts) => {
    try {
      const parent = resolveName(opts.parent, opts.chain);
      const config = getChainConfig(parent.chainId);
      const wallet = getWallet(parent.chainId);
      const owner = opts.owner || wallet.address;

      const fullDomain = `${sublabel}.${parent.domain}`;

      const registry = new ethers.Contract(config.ID_REGISTRY, REGISTRY_ABI, wallet);

      console.log(chalk.dim(`Creating ${fullDomain}...`));
      const tx = await registry.setSubnodeOwner(parent.node, sublabel, owner);
      console.log(`Tx: ${chalk.dim(tx.hash)}`);
      await tx.wait();
      console.log(chalk.green(`Created ${chalk.bold(fullDomain)}`));
      if (owner !== wallet.address) {
        console.log(chalk.dim(`Owner: ${owner}`));
      }
    } catch (err: any) {
      console.error(chalk.red(err.message));
      process.exit(1);
    }
  });

export const listSubnamesCommand = new Command("list-subnames")
  .description("List subnames under an agent")
  .argument("<name>", "Parent name (e.g., agent-0, agent-0.base.xid.eth)")
  .option("-c, --chain <chain>", "Chain", "base")
  .action(async (name, opts) => {
    try {
      const resolved = resolveName(name, opts.chain);

      const res = await indexerFetch(`/api/domains?parent=${resolved.path}&chain=${resolved.chainId}`);
      if (!res.ok) {
        console.log(chalk.dim("Could not fetch subnames from indexer."));
        return;
      }

      const data = await res.json();
      const domains = data.domains || data || [];
      if (!domains.length) {
        console.log(chalk.dim(`No subnames found under ${resolved.domain}`));
        return;
      }

      console.log(chalk.bold(`Subnames of ${resolved.domain}\n`));
      for (const d of domains) {
        console.log(`  ${d.label || d.name}  ${chalk.dim(d.owner || "")}`);
      }
    } catch (err: any) {
      console.error(chalk.red(err.message));
      process.exit(1);
    }
  });
