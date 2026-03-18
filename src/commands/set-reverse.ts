import { Command } from "commander";
import { ethers } from "ethers";
import chalk from "chalk";
import { getChainConfig, resolveChain } from "../config.js";
import { getWallet } from "../provider.js";
import { REVERSE_REGISTRAR_ABI } from "../abi.js";
import { isDryRun, proposeTx, validateAddress, CliError, ExitCode } from "../utils.js";
import { outputSuccess, handleErrorJson, humanLog, statusLog } from "../output.js";

// ── ENS Reverse Registrar addresses ─────────────────────────────────────────

const REVERSE_REGISTRAR: Record<number, string> = {
  1:        "0xa58E81fe9b61B5c3fE2AFD33CF304c454AbFc7Cb", // Ethereum L1 (addr.reverse)
  8453:     "0x0000000000D8e504002cC26E3Ec46D81971C1664", // Base
  10:       "0x0000000000D8e504002cC26E3Ec46D81971C1664", // Optimism
  42161:    "0x0000000000D8e504002cC26E3Ec46D81971C1664", // Arbitrum
  11155111: "0xA0a1AbcDAe1a2a4A2EF8e9113Ff0e02DD81DC0C6", // Sepolia
};

// ── Chain resolution from cointype ──────────────────────────────────────────

const COINTYPE_ALIASES: Record<string, number> = {
  DEFAULT: 1,       // L1 Ethereum (addr.reverse)
  ETH: 1,
  BASE: 8453,
  OP: 10,
  OPTIMISM: 10,
  ARB: 42161,
  ARBITRUM: 42161,
  SEP: 11155111,
  SEPOLIA: 11155111,
};

/**
 * Resolve a cointype argument to a chain ID for the reverse registrar.
 * Accepts chain names (DEFAULT, ETH, BASE, OP, ARB, SEP) or numeric chain IDs.
 */
function resolveReverseChain(input: string): number {
  const upper = input.toUpperCase();
  if (upper in COINTYPE_ALIASES) return COINTYPE_ALIASES[upper];
  const n = parseInt(input, 10);
  if (!isNaN(n) && REVERSE_REGISTRAR[n]) return n;
  throw new CliError(
    `Unknown reverse target: "${input}". Use: DEFAULT, ETH, BASE, OP, ARB, SEP, or a supported chain ID.`,
    ExitCode.INPUT_ERROR,
  );
}

// ── Command ─────────────────────────────────────────────────────────────────

export const setReverseCommand = new Command("set-reverse")
  .description("Set reverse name via ENS Reverse Registrar (ENSIP-19)")
  .argument("<name>", "Agent name to set as reverse (e.g., agent-0.base.xid.eth)")
  .argument("[target]", "Reverse target: DEFAULT (L1), BASE, OP, ARB, SEP, or chain ID", "DEFAULT")
  .option("--addr <address>", "Set reverse for this address instead of your wallet (setNameForAddr)")
  .option("--dry-run", "Show transaction proposal without executing")
  .action(async (name, targetArg, opts) => {
    try {
      const reverseChainId = resolveReverseChain(targetArg);
      const config = getChainConfig(reverseChainId);
      const registrarAddr = REVERSE_REGISTRAR[reverseChainId];

      if (!registrarAddr) {
        throw new CliError(
          `No reverse registrar known for chain ${reverseChainId}.`,
          ExitCode.INPUT_ERROR,
        );
      }

      const isDefault = reverseChainId === 1;
      const namespace = isDefault ? "addr.reverse" : `${(0x80000000 + reverseChainId).toString(16)}.reverse`;

      humanLog(chalk.bold("Set Reverse Name"));
      humanLog(`  Name:       ${chalk.bold(name)}`);
      humanLog(`  Target:     ${config.name} (${reverseChainId})`);
      humanLog(`  Registrar:  ${registrarAddr}`);
      humanLog(`  Namespace:  ${namespace}`);
      if (opts.addr) {
        humanLog(`  For addr:   ${opts.addr}`);
      }

      if (opts.addr) {
        // setNameForAddr — set reverse for a specific address
        const addr = validateAddress(opts.addr, "--addr");

        if (isDryRun()) {
          proposeTx({
            action: `Set reverse for ${addr} → ${name}`,
            chainId: reverseChainId,
            contractName: "ENS Reverse Registrar",
            contractAddress: registrarAddr,
            functionAbi: "function setNameForAddr(address addr, string name) returns (bytes32)",
            args: [addr, name],
            argLabels: ["addr", "name"],
            notes: [
              `Namespace: ${namespace}`,
              `Caller must be authorized for address ${addr}.`,
            ],
          });
          return;
        }

        const wallet = getWallet(reverseChainId);
        const registrar = new ethers.Contract(registrarAddr, REVERSE_REGISTRAR_ABI, wallet);

        statusLog(chalk.dim(`Setting reverse for ${addr} via setNameForAddr...`));
        const tx = await registrar.setNameForAddr(addr, name);
        humanLog(`Tx: ${chalk.dim(tx.hash)}`);
        await tx.wait();
        humanLog(chalk.green(`Reverse set: ${addr} → ${chalk.bold(name)}`));

        outputSuccess({
          address: addr,
          reverseName: name,
          method: "setNameForAddr",
          registrar: registrarAddr,
          namespace,
          txHash: tx.hash,
        }, { chain: config.name, chainId: reverseChainId });
      } else {
        // setName — set reverse for msg.sender
        if (isDryRun()) {
          proposeTx({
            action: `Set reverse for your wallet → ${name}`,
            chainId: reverseChainId,
            contractName: "ENS Reverse Registrar",
            contractAddress: registrarAddr,
            functionAbi: "function setName(string name) returns (bytes32)",
            args: [name],
            argLabels: ["name"],
            notes: [
              `Namespace: ${namespace}`,
              "Sets reverse for the calling wallet address (msg.sender).",
            ],
          });
          return;
        }

        const wallet = getWallet(reverseChainId);
        const registrar = new ethers.Contract(registrarAddr, REVERSE_REGISTRAR_ABI, wallet);

        statusLog(chalk.dim(`Setting reverse for ${wallet.address} via setName...`));
        const tx = await registrar.setName(name);
        humanLog(`Tx: ${chalk.dim(tx.hash)}`);
        await tx.wait();
        humanLog(chalk.green(`Reverse set: ${wallet.address} → ${chalk.bold(name)}`));

        outputSuccess({
          address: wallet.address,
          reverseName: name,
          method: "setName",
          registrar: registrarAddr,
          namespace,
          txHash: tx.hash,
        }, { chain: config.name, chainId: reverseChainId });
      }
    } catch (err: any) {
      handleErrorJson(err);
    }
  });
