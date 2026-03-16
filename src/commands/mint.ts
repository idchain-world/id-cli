import { Command } from "commander";
import { ethers } from "ethers";
import chalk from "chalk";
import { resolveChain, getChainConfig } from "../config.js";
import { getWallet } from "../provider.js";
import { USDC_ABI } from "../abi.js";
import { formatUsdc, isDryRun, proposeTx } from "../utils.js";
import { outputSuccess, handleErrorJson, humanLog, statusLog } from "../output.js";

export const mintCommand = new Command("mint-usdc")
  .description("Mint test USDC (testnet only)")
  .option("-c, --chain <chain>", "Chain", "sepolia")
  .option("-a, --amount <amount>", "Amount in USDC", "100")
  .option("--dry-run", "Show transaction proposal without executing")
  .action(async (opts) => {
    try {
      const chainId = resolveChain(opts.chain);
      const config = getChainConfig(chainId);
      const wallet = getWallet(chainId);

      const amount = ethers.parseUnits(opts.amount, 6);

      if (isDryRun()) {
        proposeTx({
          action: `Mint ${opts.amount} USDC`,
          chainId,
          contractName: "MockUSDC",
          contractAddress: config.MOCK_USDC,
          functionAbi: "function mint(address to, uint256 amount)",
          args: [wallet.address, amount],
          argLabels: ["to", "amount"],
        });
        return;
      }

      const usdc = new ethers.Contract(config.MOCK_USDC, USDC_ABI, wallet);

      statusLog(chalk.dim(`Minting ${opts.amount} USDC on ${config.name}...`));
      const tx = await usdc.mint(wallet.address, amount);
      humanLog(`Tx: ${chalk.dim(tx.hash)}`);
      await tx.wait();

      const balance = await usdc.balanceOf(wallet.address);
      humanLog(chalk.green(`Minted ${opts.amount} USDC. Balance: ${formatUsdc(balance)} USDC`));
      outputSuccess({
        amount: opts.amount,
        txHash: tx.hash,
        balance: { raw: balance.toString(), formatted: formatUsdc(balance) },
      }, { chain: config.name, chainId });
    } catch (err: any) {
      handleErrorJson(err);
    }
  });
