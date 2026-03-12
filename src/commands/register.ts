import { Command } from "commander";
import { ethers } from "ethers";
import chalk from "chalk";
import { resolveChain, getChainConfig } from "../config.js";
import { getWallet } from "../provider.js";
import { REGISTRAR_ABI, USDC_ABI } from "../abi.js";
import { formatDomainName, formatUsdc, parseDuration, signUsdcPermit, isDryRun, proposeTx } from "../utils.js";

export const registerCommand = new Command("register")
  .description("Register a new agent name")
  .option("-c, --chain <chain>", "Chain to register on", "base")
  .option("-d, --duration <duration>", "Registration duration", "1y")
  .option("--sublabel <name>", "Create a subname under the registered agent")
  .option("--text <pairs...>", "Text records as key=value pairs")
  .option("--address <addr>", "Set ETH address record to this address")
  .option("--referrer <addr>", "Referrer address for fee sharing")
  .action(async (opts) => {
    try {
      const chainId = resolveChain(opts.chain);
      const config = getChainConfig(chainId);
      const wallet = getWallet(chainId);
      const duration = parseDuration(opts.duration);

      console.log(chalk.dim(`Chain: ${config.name} (${chainId})`));
      console.log(chalk.dim(`Wallet: ${wallet.address}`));

      const registrar = new ethers.Contract(config.ID_AGENT_REGISTRAR, REGISTRAR_ABI, wallet);
      const usdc = new ethers.Contract(config.MOCK_USDC, USDC_ABI, wallet);

      // Get next label and price
      const [nextLabel, price] = await Promise.all([
        registrar.nextLabel(),
        registrar.rentPrice(duration),
      ]);

      console.log(`Next label: ${chalk.bold(nextLabel)}`);
      const domainName = opts.sublabel
        ? `${opts.sublabel}.${nextLabel}${config.suffix}`
        : formatDomainName(nextLabel, chainId);
      console.log(`Domain: ${chalk.bold(domainName)}`);
      console.log(`Price: ${chalk.bold(formatUsdc(price))} USDC`);

      // Check USDC balance
      const balance = await usdc.balanceOf(wallet.address);
      if (balance < price) {
        console.error(chalk.red(`Insufficient USDC balance: ${formatUsdc(balance)} < ${formatUsdc(price)}`));
        process.exit(1);
      }

      // Parse text records
      const keys: string[] = [];
      const values: string[] = [];
      if (opts.text) {
        for (const pair of opts.text) {
          const eq = pair.indexOf("=");
          if (eq === -1) throw new Error(`Invalid text record: ${pair}. Use key=value format.`);
          keys.push(pair.slice(0, eq));
          values.push(pair.slice(eq + 1));
        }
      }

      // Address records
      const coinTypes: bigint[] = [];
      const addresses: string[] = [];
      if (opts.address) {
        coinTypes.push(60n);
        addresses.push(opts.address);
      }

      const referrer = opts.referrer || ethers.ZeroAddress;

      if (isDryRun()) {
        const fnAbi = opts.sublabel
          ? REGISTRAR_ABI.find(a => a.includes("registerWithParent"))!
          : REGISTRAR_ABI.find(a => a.includes("function register("))!;
        const args = opts.sublabel
          ? [wallet.address, referrer, duration, opts.sublabel, keys, values, coinTypes, addresses, "0x", [], [], price, 0n, 0, ethers.ZeroHash, ethers.ZeroHash]
          : [wallet.address, referrer, duration, keys, values, coinTypes, addresses, "0x", [], [], price, 0n, 0, ethers.ZeroHash, ethers.ZeroHash];
        const argLabels = opts.sublabel
          ? ["owner", "referrer", "duration", "sublabel", "textKeys", "textValues", "coinTypes", "addresses", "contentHash", "dataKeys", "dataValues", "permitValue", "permitDeadline", "permitV", "permitR", "permitS"]
          : ["owner", "referrer", "duration", "textKeys", "textValues", "coinTypes", "addresses", "contentHash", "dataKeys", "dataValues", "permitValue", "permitDeadline", "permitV", "permitR", "permitS"];
        proposeTx({
          action: `Register ${domainName}`,
          chainId,
          contractName: "IDAgentRegistrar",
          contractAddress: config.ID_AGENT_REGISTRAR,
          functionAbi: fnAbi,
          args,
          argLabels,
          notes: [
            `Cost: ${formatUsdc(price)} USDC`,
            "Permit fields (v/r/s/deadline) are placeholders.",
            "A USDC EIP-2612 permit will be signed at execution time.",
          ],
        });
        return;
      }

      // Sign USDC permit
      console.log(chalk.dim("Signing USDC permit..."));
      const permit = await signUsdcPermit(wallet, usdc, config.ID_AGENT_REGISTRAR, price, chainId);

      // Register
      console.log(chalk.dim("Submitting registration..."));
      let tx;
      if (opts.sublabel) {
        tx = await registrar.registerWithParent(
          wallet.address, referrer, duration, opts.sublabel,
          keys, values, coinTypes, addresses, "0x", [], [],
          price, permit.deadline, permit.v, permit.r, permit.s
        );
      } else {
        tx = await registrar.register(
          wallet.address, referrer, duration,
          keys, values, coinTypes, addresses, "0x", [], [],
          price, permit.deadline, permit.v, permit.r, permit.s
        );
      }

      console.log(`Tx: ${chalk.dim(tx.hash)}`);
      const receipt = await tx.wait();
      console.log(chalk.green(`Registered ${chalk.bold(domainName)}`));
      console.log(chalk.dim(`Gas used: ${receipt.gasUsed.toString()}`));
    } catch (err: any) {
      console.error(chalk.red(err.message));
      process.exit(1);
    }
  });
