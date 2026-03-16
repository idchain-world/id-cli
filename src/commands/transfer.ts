import { Command } from "commander";
import { ethers } from "ethers";
import chalk from "chalk";
import { getChainConfig } from "../config.js";
import { getWallet } from "../provider.js";
import { REGISTRY_ABI } from "../abi.js";
import { resolveName, isDryRun, proposeTx, handleError, validateAddress, verifyOwnership } from "../utils.js";

export const transferCommand = new Command("transfer")
  .description("Transfer ownership of an agent name")
  .argument("<name>", "Name (e.g., agent-0, neo.agent-0, agent-0.base.xid.eth)")
  .requiredOption("--to <address>", "New owner address")
  .option("-c, --chain <chain>", "Chain", "base")
  .option("--dry-run", "Show transaction proposal without executing")
  .action(async (name, opts) => {
    try {
      const toAddress = validateAddress(opts.to, "--to");
      const resolved = resolveName(name, opts.chain);
      const config = getChainConfig(resolved.chainId);
      const wallet = getWallet(resolved.chainId);

      if (isDryRun()) {
        proposeTx({
          action: `Transfer ${resolved.domain} to ${toAddress}`,
          chainId: resolved.chainId,
          contractName: "IDRegistry",
          contractAddress: config.ID_REGISTRY,
          functionAbi: "function setOwner(bytes32 node, address newOwner)",
          args: [resolved.node, toAddress],
          argLabels: ["node", "newOwner"],
        });
        return;
      }

      const registry = new ethers.Contract(config.ID_REGISTRY, REGISTRY_ABI, wallet);
      await verifyOwnership(registry, resolved.node, wallet, resolved.domain);

      console.log(chalk.dim(`Transferring ${resolved.domain} to ${toAddress}`));
      const tx = await registry.setOwner(resolved.node, toAddress);
      console.log(`Tx: ${chalk.dim(tx.hash)}`);
      await tx.wait();
      console.log(chalk.green(`Transferred ${chalk.bold(resolved.domain)} to ${toAddress}`));
    } catch (err: any) {
      handleError(err);
    }
  });
