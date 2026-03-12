import { Command } from "commander";
import { ethers } from "ethers";
import chalk from "chalk";
import { resolveChain, getChainConfig } from "../config.js";
import { getWallet } from "../provider.js";
import { REGISTRY_ABI } from "../abi.js";
import { getNodeForLabel, formatDomainName, indexerFetch } from "../utils.js";

const createCmd = new Command("create")
  .description("Create a subname under an agent")
  .argument("<sublabel>", "Subname label (e.g., neo)")
  .option("--parent <label>", "Parent agent label (e.g., agent-0)", "")
  .option("-c, --chain <chain>", "Chain", "base")
  .option("--owner <address>", "Owner address (defaults to your wallet)")
  .action(async (sublabel, opts) => {
    try {
      if (!opts.parent) {
        console.error(chalk.red("--parent is required. Example: xid subname create neo --parent agent-0"));
        process.exit(1);
      }

      const chainId = resolveChain(opts.chain);
      const config = getChainConfig(chainId);
      const wallet = getWallet(chainId);
      const parentNode = getNodeForLabel(opts.parent, chainId);
      const owner = opts.owner || wallet.address;

      const parentDomain = formatDomainName(opts.parent, chainId);
      const fullDomain = `${sublabel}.${parentDomain}`;

      const registry = new ethers.Contract(config.ID_REGISTRY, REGISTRY_ABI, wallet);

      console.log(chalk.dim(`Creating ${fullDomain}...`));
      const tx = await registry.setSubnodeOwner(parentNode, sublabel, owner);
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

const listCmd = new Command("list")
  .description("List subnames under an agent")
  .argument("<label>", "Parent agent label")
  .option("-c, --chain <chain>", "Chain", "base")
  .action(async (label, opts) => {
    try {
      const chainId = resolveChain(opts.chain);
      const domain = formatDomainName(label, chainId);

      const res = await indexerFetch(`/api/domains?parent=${label}&chain=${chainId}`);
      if (!res.ok) {
        console.log(chalk.dim("Could not fetch subnames from indexer."));
        return;
      }

      const data = await res.json();
      const domains = data.domains || data || [];
      if (!domains.length) {
        console.log(chalk.dim(`No subnames found under ${domain}`));
        return;
      }

      console.log(chalk.bold(`Subnames of ${domain}\n`));
      for (const d of domains) {
        console.log(`  ${d.label || d.name}  ${chalk.dim(d.owner || "")}`);
      }
    } catch (err: any) {
      console.error(chalk.red(err.message));
      process.exit(1);
    }
  });

export const subnameCommand = new Command("subname")
  .description("Create and manage subnames")
  .addCommand(createCmd)
  .addCommand(listCmd);
