import { Command } from "commander";
import { ethers } from "ethers";
import chalk from "chalk";
import { resolveChain, getChainConfig } from "../config.js";
import { getWallet } from "../provider.js";
import { REGISTRY_ABI } from "../abi.js";
import { getNodeForLabel, formatDomainName } from "../utils.js";

export const transferCommand = new Command("transfer")
  .description("Transfer ownership of an agent name")
  .argument("<label>", "Agent label (e.g., agent-0)")
  .requiredOption("--to <address>", "New owner address")
  .option("-c, --chain <chain>", "Chain", "base")
  .action(async (label, opts) => {
    try {
      const chainId = resolveChain(opts.chain);
      const config = getChainConfig(chainId);
      const wallet = getWallet(chainId);
      const node = getNodeForLabel(label, chainId);

      const registry = new ethers.Contract(config.ID_REGISTRY, REGISTRY_ABI, wallet);

      // Verify ownership
      const currentOwner = await registry.owner(node);
      if (currentOwner.toLowerCase() !== wallet.address.toLowerCase()) {
        console.error(chalk.red(`You don't own ${formatDomainName(label, chainId)}. Owner: ${currentOwner}`));
        process.exit(1);
      }

      console.log(chalk.dim(`Transferring ${formatDomainName(label, chainId)} to ${opts.to}`));
      const tx = await registry.setOwner(node, opts.to);
      console.log(`Tx: ${chalk.dim(tx.hash)}`);
      await tx.wait();
      console.log(chalk.green(`Transferred ${chalk.bold(formatDomainName(label, chainId))} to ${opts.to}`));
    } catch (err: any) {
      console.error(chalk.red(err.message));
      process.exit(1);
    }
  });
