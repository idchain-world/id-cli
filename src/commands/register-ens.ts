import { Command } from "commander";
import { ethers } from "ethers";
import chalk from "chalk";
import { getChainConfig } from "../config.js";
import { getProvider, getWallet } from "../provider.js";
import { ENS_REGISTRAR_CONTROLLER_ABI } from "../abi.js";
import { isDryRun, proposeTx, CliError, ExitCode } from "../utils.js";
import { outputSuccess, handleErrorJson, humanLog, statusLog } from "../output.js";

// ── ENS contract addresses ──────────────────────────────────────────────────

const ENS_REGISTRAR_CONTROLLER: Record<number, string> = {
  1:        "0x253553366Da8546fC250F225fe3d25d0C782303b",
  11155111: "0xFED6a969AaA60E4961FCD3EBF1A2e8913E65B855",
};

const ENS_PUBLIC_RESOLVER: Record<number, string> = {
  1:        "0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63",
  11155111: "0x8FADE66B79cC9f707aB26799354482EB93a5B7dD",
};

function getRegistryChainId(agentChainId: number): number {
  return agentChainId === 11155111 ? 11155111 : 1;
}

// ── Command ─────────────────────────────────────────────────────────────────

export const registerEnsCommand = new Command("register-ens")
  .description("Register a .eth name via ENS two-step commit/reveal")
  .argument("<label>", "ENS label to register (e.g., alice for alice.eth)")
  .option("-c, --chain <chain>", "Agent chain (determines L1 vs Sepolia ENS registry)", "base")
  .option("--duration <seconds>", "Registration duration in seconds (default: 1 year)", "31536000")
  .option("--owner <address>", "Owner address (default: your wallet)")
  .option("--dry-run", "Show transaction proposal without executing")
  .action(async (label, opts) => {
    try {
      const agentChainId = (await import("../config.js")).resolveChain(opts.chain);
      const registryChainId = getRegistryChainId(agentChainId);
      const controllerAddr = ENS_REGISTRAR_CONTROLLER[registryChainId];
      const resolverAddr = ENS_PUBLIC_RESOLVER[registryChainId];

      if (!controllerAddr) {
        throw new CliError(
          `ENS registration not supported for chain ${registryChainId}.`,
          ExitCode.INPUT_ERROR,
        );
      }

      const durationSeconds = parseInt(opts.duration, 10);
      if (isNaN(durationSeconds) || durationSeconds <= 0) {
        throw new CliError("Duration must be a positive number of seconds.", ExitCode.INPUT_ERROR);
      }

      const ensName = `${label}.eth`;
      const chainLabel = registryChainId === 11155111 ? "Sepolia" : "Ethereum";

      // Check availability and price using public RPC
      const provider = getProvider(registryChainId);
      const controller = new ethers.Contract(controllerAddr, ENS_REGISTRAR_CONTROLLER_ABI, provider);

      statusLog(chalk.dim(`Checking availability of ${ensName} on ${chainLabel}...`));
      const [isAvailable, rentPrice] = await Promise.all([
        controller.available(label),
        controller.rentPrice(label, durationSeconds),
      ]);

      if (!isAvailable) {
        throw new CliError(`${ensName} is not available for registration.`, ExitCode.INPUT_ERROR);
      }

      const totalPrice = rentPrice.base + rentPrice.premium;
      const priceWithBuffer = totalPrice + (totalPrice / 10n); // +10% buffer
      const years = durationSeconds / 31536000;

      humanLog(chalk.bold("Register ENS Name"));
      humanLog(`  Name:       ${chalk.bold(ensName)}`);
      humanLog(`  Registry:   ${chainLabel} (${registryChainId})`);
      humanLog(`  Duration:   ${years >= 1 ? `${years} year(s)` : `${durationSeconds}s`}`);
      humanLog(`  Price:      ${ethers.formatEther(totalPrice)} ETH`);
      humanLog(`  With buffer: ${ethers.formatEther(priceWithBuffer)} ETH (+10%)`);
      humanLog(`  Resolver:   ${resolverAddr}`);

      if (isDryRun()) {
        proposeTx({
          action: `Register ${ensName} on ${chainLabel} ENS`,
          chainId: registryChainId,
          contractName: "ENS ETHRegistrarController",
          contractAddress: controllerAddr,
          functionAbi: "function register(string name, address owner, uint256 duration, bytes32 secret, address resolver, bytes[] data, bool reverseRecord, uint16 ownerControlledFuses) payable",
          args: [label, ethers.ZeroAddress, durationSeconds, ethers.ZeroHash, resolverAddr, [], false, 0],
          argLabels: ["name", "owner (your wallet)", "duration", "secret (random)", "resolver", "data", "reverseRecord", "ownerControlledFuses"],
          notes: [
            `Two-step process: commit() then wait 60s then register().`,
            `Price: ${ethers.formatEther(totalPrice)} ETH + 10% buffer.`,
            `Excess ETH is refunded.`,
          ],
        });
        return;
      }

      const wallet = getWallet(registryChainId);
      const ownerAddr = opts.owner || wallet.address;
      const controllerWithSigner = new ethers.Contract(controllerAddr, ENS_REGISTRAR_CONTROLLER_ABI, wallet);

      // Step 1: Generate secret and commit
      const randomBytes = ethers.randomBytes(32);
      const secret = ethers.hexlify(randomBytes);

      statusLog(chalk.dim("Step 1/2: Making commitment..."));
      const commitment = await controllerWithSigner.makeCommitment(
        label, ownerAddr, durationSeconds, secret, resolverAddr, [], false, 0,
      );

      const commitTx = await controllerWithSigner.commit(commitment);
      humanLog(`  Commit tx: ${chalk.dim(commitTx.hash)}`);
      await commitTx.wait();
      humanLog(chalk.green("  Commitment submitted."));

      // Wait 60 seconds
      humanLog("");
      humanLog(chalk.yellow("  Waiting 60 seconds (anti-front-running delay)..."));
      for (let i = 60; i > 0; i -= 10) {
        statusLog(chalk.dim(`  ${i}s remaining...`));
        await new Promise(r => setTimeout(r, Math.min(i, 10) * 1000));
      }
      humanLog(chalk.green("  Wait complete."));
      humanLog("");

      // Step 2: Register
      statusLog(chalk.dim("Step 2/2: Registering..."));
      const registerTx = await controllerWithSigner.register(
        label, ownerAddr, durationSeconds, secret, resolverAddr, [], false, 0,
        { value: priceWithBuffer },
      );
      humanLog(`  Register tx: ${chalk.dim(registerTx.hash)}`);
      await registerTx.wait();
      humanLog(chalk.green(`  ${chalk.bold(ensName)} registered successfully!`));

      outputSuccess({
        ensName,
        label,
        owner: ownerAddr,
        duration: durationSeconds,
        price: ethers.formatEther(totalPrice),
        resolver: resolverAddr,
        commitTxHash: commitTx.hash,
        registerTxHash: registerTx.hash,
      }, { chain: chainLabel, chainId: registryChainId });
    } catch (err: any) {
      handleErrorJson(err);
    }
  });
