import { Command } from "commander";
import { ethers } from "ethers";
import chalk from "chalk";
import { getConfig } from "../config.js";
import { getWallet } from "../provider.js";
import { REGISTRAR_ABI, USDC_ABI } from "../abi.js";
import { formatDomainName, formatUsdc, signUsdcPermit, isDryRun, proposeTx, CliError, ExitCode, validateAddress, validateLabel } from "../utils.js";
import { outputSuccess, handleErrorJson, humanLog, statusLog } from "../output.js";

export const registerCommand = new Command("register")
  .description("Register a new agent name (permanent, one-time fee)")
  .option("--sublabel <name>", "Create a subname under the registered agent")
  .option("--text <pairs...>", "Text records as key=value pairs")
  .option("--address <addr>", "Set ETH address record to this address")
  .option("--referrer <addr>", "Referrer address for fee sharing")
  .option("--dry-run", "Show transaction proposal without executing")
  .action(async (opts) => {
    try {
      const config = getConfig();
      const wallet = getWallet();

      statusLog(chalk.dim(`Chain: ${config.name} (${config.chainId})`));
      statusLog(chalk.dim(`Wallet: ${wallet.address}`));

      const registrar = new ethers.Contract(config.ID_AGENT_REGISTRAR, REGISTRAR_ABI, wallet);
      const usdc = new ethers.Contract(config.MOCK_USDC, USDC_ABI, wallet);

      // Get next label and price
      const [nextLabel, price] = await Promise.all([
        registrar.nextLabel(),
        registrar.price(),
      ]);

      humanLog(`Next label: ${chalk.bold(nextLabel)}`);
      const domainName = opts.sublabel
        ? `${opts.sublabel}.${nextLabel}${config.suffix}`
        : formatDomainName(nextLabel);
      humanLog(`Domain: ${chalk.bold(domainName)}`);
      humanLog(`Price: ${chalk.bold(formatUsdc(price))} USDC (one-time, permanent)`);

      // Check USDC balance
      const balance = await usdc.balanceOf(wallet.address);
      if (balance < price) {
        throw new CliError(`Insufficient USDC balance: ${formatUsdc(balance)} < ${formatUsdc(price)}`, ExitCode.INSUFFICIENT_FUNDS);
      }

      // Parse text records
      const keys: string[] = [];
      const values: string[] = [];
      if (opts.text) {
        for (const pair of opts.text) {
          const eq = pair.indexOf("=");
          if (eq === -1) throw new CliError(`Invalid text record: ${pair}. Use key=value format.`, ExitCode.INPUT_ERROR);
          keys.push(pair.slice(0, eq));
          values.push(pair.slice(eq + 1));
        }
      }

      // Validate sublabel if provided
      if (opts.sublabel) validateLabel(opts.sublabel);

      // Address records
      const coinTypes: bigint[] = [];
      const addresses: string[] = [];
      if (opts.address) {
        coinTypes.push(60n);
        addresses.push(validateAddress(opts.address, "--address"));
      }

      const referrer = opts.referrer ? validateAddress(opts.referrer, "--referrer") : ethers.ZeroAddress;

      if (isDryRun()) {
        const fnAbi = opts.sublabel
          ? REGISTRAR_ABI.find(a => a.includes("registerWithParent"))!
          : REGISTRAR_ABI.find(a => a.includes("function register("))!;
        const args = opts.sublabel
          ? [wallet.address, referrer, opts.sublabel, keys, values, coinTypes, addresses, "0x", [], [], price, 0n, 0, ethers.ZeroHash, ethers.ZeroHash]
          : [wallet.address, referrer, keys, values, coinTypes, addresses, "0x", [], [], price, 0n, 0, ethers.ZeroHash, ethers.ZeroHash];
        const argLabels = opts.sublabel
          ? ["owner", "referrer", "sublabel", "textKeys", "textValues", "coinTypes", "addresses", "contentHash", "dataKeys", "dataValues", "permitValue", "permitDeadline", "permitV", "permitR", "permitS"]
          : ["owner", "referrer", "textKeys", "textValues", "coinTypes", "addresses", "contentHash", "dataKeys", "dataValues", "permitValue", "permitDeadline", "permitV", "permitR", "permitS"];
        proposeTx({
          action: `Register ${domainName}`,
          contractName: "IDAgentRegistrar",
          contractAddress: config.ID_AGENT_REGISTRAR,
          functionAbi: fnAbi,
          args,
          argLabels,
          notes: [
            `Cost: ${formatUsdc(price)} USDC (one-time, permanent)`,
            "Permit fields (v/r/s/deadline) are placeholders.",
            "A USDC EIP-2612 permit will be signed at execution time.",
          ],
        });
        return;
      }

      // Try EIP-2612 permit, fall back to approve if not supported
      let permit = { deadline: 0n, v: 0, r: ethers.ZeroHash, s: ethers.ZeroHash };
      try {
        statusLog(chalk.dim("Signing USDC permit..."));
        permit = await signUsdcPermit(wallet, usdc, config.ID_AGENT_REGISTRAR, price);
      } catch (permitErr: any) {
        statusLog(chalk.dim(`Permit not supported (${permitErr.message?.slice(0, 60)}), using approve...`));
        const approveTx = await usdc.approve(config.ID_AGENT_REGISTRAR, price);
        await approveTx.wait();
        statusLog(chalk.dim("USDC approved."));
      }

      // Register
      statusLog(chalk.dim("Submitting registration..."));
      let tx;
      if (opts.sublabel) {
        tx = await registrar.registerWithParent(
          wallet.address, referrer, opts.sublabel,
          keys, values, coinTypes, addresses, "0x", [], [],
          price, permit.deadline, permit.v, permit.r, permit.s
        );
      } else {
        tx = await registrar.register(
          wallet.address, referrer,
          keys, values, coinTypes, addresses, "0x", [], [],
          price, permit.deadline, permit.v, permit.r, permit.s
        );
      }

      const receipt = await tx.wait();
      humanLog(`Tx: ${chalk.dim(tx.hash)}`);
      humanLog(chalk.green(`Registered ${chalk.bold(domainName)} (permanent)`));
      humanLog(chalk.dim(`Gas used: ${receipt.gasUsed.toString()}`));
      outputSuccess({
        domain: domainName,
        label: nextLabel,
        txHash: tx.hash,
        gasUsed: receipt.gasUsed.toString(),
        price: { raw: price.toString(), formatted: formatUsdc(price) },
      });
    } catch (err: any) {
      handleErrorJson(err);
    }
  });
