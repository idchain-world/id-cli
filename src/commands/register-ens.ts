import { Command } from "commander";
import { ethers } from "ethers";
import chalk from "chalk";
import { getProvider, getWallet } from "../provider.js";
import { ENS_REGISTRAR_CONTROLLER_ABI } from "../abi.js";
import { isDryRun, proposeTx, CliError, ExitCode } from "../utils.js";
import { outputSuccess, handleErrorJson, humanLog, statusLog } from "../output.js";

// ── ENS contract addresses (mainnet) ───────────────────────────────────────

const ENS_REGISTRAR_CONTROLLER = "0x253553366Da8546fC250F225fe3d25d0C782303b";
const ENS_PUBLIC_RESOLVER = "0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63";
const REGISTRY_CHAIN_ID = 1; // ENS lives on L1

// ── Command ─────────────────────────────────────────────────────────────────

export const registerEnsCommand = new Command("register-ens")
  .description("Register a .eth name via ENS two-step commit/reveal")
  .argument("<label>", "ENS label to register (e.g., alice for alice.eth)")
  .option("--duration <seconds>", "Registration duration in seconds (default: 1 year)", "31536000")
  .option("--owner <address>", "Owner address (default: your wallet)")
  .option("--dry-run", "Show transaction proposal without executing")
  .action(async (label, opts) => {
    try {
      const MIN_DURATION = 30 * 24 * 60 * 60; // 30 days
      const durationSeconds = parseInt(opts.duration, 10);
      if (isNaN(durationSeconds) || durationSeconds < MIN_DURATION) {
        throw new CliError(`Duration must be at least 30 days (${MIN_DURATION} seconds).`, ExitCode.INPUT_ERROR);
      }

      const ensName = `${label}.eth`;

      // Check availability and price using L1 RPC
      // register-ens always targets L1 Ethereum for ENS
      const l1Rpc = process.env.RPC_URL_ETH || "https://ethereum-rpc.publicnode.com";
      const provider = new ethers.JsonRpcProvider(l1Rpc);
      const controller = new ethers.Contract(ENS_REGISTRAR_CONTROLLER, ENS_REGISTRAR_CONTROLLER_ABI, provider);

      statusLog(chalk.dim(`Checking availability of ${ensName} on Ethereum...`));
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
      humanLog(`  Registry:   Ethereum (1)`);
      humanLog(`  Duration:   ${years >= 1 ? `${years} year(s)` : `${durationSeconds}s`}`);
      humanLog(`  Price:      ${ethers.formatEther(totalPrice)} ETH`);
      humanLog(`  With buffer: ${ethers.formatEther(priceWithBuffer)} ETH (+10%)`);
      humanLog(`  Resolver:   ${ENS_PUBLIC_RESOLVER}`);

      if (isDryRun()) {
        proposeTx({
          action: `Register ${ensName} on Ethereum ENS`,
          contractName: "ENS ETHRegistrarController",
          contractAddress: ENS_REGISTRAR_CONTROLLER,
          functionAbi: "function register(string name, address owner, uint256 duration, bytes32 secret, address resolver, bytes[] data, bool reverseRecord, uint16 ownerControlledFuses) payable",
          args: [label, ethers.ZeroAddress, durationSeconds, ethers.ZeroHash, ENS_PUBLIC_RESOLVER, [], false, 0],
          argLabels: ["name", "owner (your wallet)", "duration", "secret (random)", "resolver", "data", "reverseRecord", "ownerControlledFuses"],
          notes: [
            `Two-step process: commit() then wait 60s then register().`,
            `Price: ${ethers.formatEther(totalPrice)} ETH + 10% buffer.`,
            `Excess ETH is refunded.`,
          ],
        });
        return;
      }

      // For ENS registration, we need an L1 wallet
      // Use the same key but connect to L1 provider
      const pk = process.env.PRIVATE_KEY;
      if (!pk) {
        throw new CliError("ENS registration requires PRIVATE_KEY (L1 Ethereum transaction).", ExitCode.AUTH_ERROR);
      }
      const wallet = new ethers.Wallet(pk, provider);
      const ownerAddr = opts.owner || wallet.address;
      const controllerWithSigner = new ethers.Contract(ENS_REGISTRAR_CONTROLLER, ENS_REGISTRAR_CONTROLLER_ABI, wallet);

      // Step 1: Generate secret and commit
      const randomBytes = ethers.randomBytes(32);
      const secret = ethers.hexlify(randomBytes);

      statusLog(chalk.dim("Step 1/2: Making commitment..."));
      const commitment = await controllerWithSigner.makeCommitment(
        label, ownerAddr, durationSeconds, secret, ENS_PUBLIC_RESOLVER, [], false, 0,
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
        label, ownerAddr, durationSeconds, secret, ENS_PUBLIC_RESOLVER, [], false, 0,
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
        resolver: ENS_PUBLIC_RESOLVER,
        commitTxHash: commitTx.hash,
        registerTxHash: registerTx.hash,
      });
    } catch (err: any) {
      handleErrorJson(err);
    }
  });
