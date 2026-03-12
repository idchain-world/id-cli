import { Command } from "commander";
import { ethers } from "ethers";
import chalk from "chalk";
import { resolveChain, getChainConfig } from "../config.js";
import { getWallet } from "../provider.js";
import { LOCK_CONTROLLER_ABI, USDC_ABI } from "../abi.js";
import { formatDomainName, formatUsdc, parseDuration, signUsdcPermit } from "../utils.js";

export const renewCommand = new Command("renew")
  .description("Renew an agent name")
  .argument("<label>", "Agent label to renew (e.g., agent-0)")
  .option("-c, --chain <chain>", "Chain", "base")
  .option("-d, --duration <duration>", "Renewal duration", "1y")
  .option("--referrer <addr>", "Referrer address")
  .action(async (label, opts) => {
    try {
      const chainId = resolveChain(opts.chain);
      const config = getChainConfig(chainId);
      const wallet = getWallet(chainId);
      const duration = parseDuration(opts.duration);

      console.log(chalk.dim(`Renewing ${formatDomainName(label, chainId)} on ${config.name}`));

      const controller = new ethers.Contract(config.ID_LOCK_CONTROLLER, LOCK_CONTROLLER_ABI, wallet);
      const usdc = new ethers.Contract(config.MOCK_USDC, USDC_ABI, wallet);

      const price = await controller.rentPrice(duration);
      console.log(`Price: ${chalk.bold(formatUsdc(price))} USDC`);

      // Check balance
      const balance = await usdc.balanceOf(wallet.address);
      if (balance < price) {
        console.error(chalk.red(`Insufficient USDC balance: ${formatUsdc(balance)} < ${formatUsdc(price)}`));
        process.exit(1);
      }

      // Sign permit
      console.log(chalk.dim("Signing USDC permit..."));
      const permit = await signUsdcPermit(wallet, usdc, config.ID_LOCK_CONTROLLER, price, chainId);

      // Renew
      console.log(chalk.dim("Submitting renewal..."));
      const referrer = opts.referrer || ethers.ZeroAddress;
      const tx = await controller.renew(
        config.PARENT_NODE, label, referrer, duration,
        price, permit.deadline, permit.v, permit.r, permit.s
      );

      console.log(`Tx: ${chalk.dim(tx.hash)}`);
      const receipt = await tx.wait();
      console.log(chalk.green(`Renewed ${chalk.bold(formatDomainName(label, chainId))}`));
      console.log(chalk.dim(`Gas used: ${receipt.gasUsed.toString()}`));
    } catch (err: any) {
      console.error(chalk.red(err.message));
      process.exit(1);
    }
  });
