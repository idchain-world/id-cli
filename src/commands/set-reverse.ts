import { Command } from "commander";
import { ethers } from "ethers";
import chalk from "chalk";
import { getWallet } from "../provider.js";
import { REVERSE_REGISTRAR_ABI } from "../abi.js";
import { isDryRun, proposeTx, validateAddress, CliError, ExitCode } from "../utils.js";
import { outputSuccess, handleErrorJson, humanLog, statusLog } from "../output.js";

// ── ENS Reverse Registrar addresses ─────────────────────────────────────────

// "default" is the fallback reverse namespace (reverse), separate from chain-specific ones
const DEFAULT_REVERSE_REGISTRAR = "0x283F227c4Bd38ecE252C4Ae7ECE650B0e913f1f9"; // L1: reverse (default/fallback)

// Chain-specific reverse registrars (addr.reverse, [coinTypeHex].reverse, etc.)
const CHAIN_REVERSE_REGISTRAR: Record<number, string> = {
  1:        "0xa58E81fe9b61B5c3fE2AFD33CF304c454AbFc7Cb", // Ethereum L1 (addr.reverse)
  8453:     "0x0000000000D8e504002cC26E3Ec46D81971C1664", // Base
  10:       "0x0000000000D8e504002cC26E3Ec46D81971C1664", // Optimism
  42161:    "0x0000000000D8e504002cC26E3Ec46D81971C1664", // Arbitrum
  11155111: "0xA0a1AbcDAe1a2a4A2EF8e9113Ff0e02DD81DC0C6", // Sepolia
};

// ── Target resolution ───────────────────────────────────────────────────────

interface ReverseTarget {
  chainId: number;
  registrar: string;
  namespace: string;
  label: string;
}

const TARGET_MAP: Record<string, () => ReverseTarget> = {
  DEFAULT: () => ({ chainId: 1, registrar: DEFAULT_REVERSE_REGISTRAR, namespace: "reverse", label: "Default (fallback)" }),
  ETH: () => ({ chainId: 1, registrar: CHAIN_REVERSE_REGISTRAR[1], namespace: "addr.reverse", label: "Ethereum" }),
  BASE: () => ({ chainId: 8453, registrar: CHAIN_REVERSE_REGISTRAR[8453], namespace: "80002105.reverse", label: "Base" }),
  OP: () => ({ chainId: 10, registrar: CHAIN_REVERSE_REGISTRAR[10], namespace: "8000000a.reverse", label: "Optimism" }),
  OPTIMISM: () => ({ chainId: 10, registrar: CHAIN_REVERSE_REGISTRAR[10], namespace: "8000000a.reverse", label: "Optimism" }),
  ARB: () => ({ chainId: 42161, registrar: CHAIN_REVERSE_REGISTRAR[42161], namespace: "8000a4b1.reverse", label: "Arbitrum" }),
  ARBITRUM: () => ({ chainId: 42161, registrar: CHAIN_REVERSE_REGISTRAR[42161], namespace: "8000a4b1.reverse", label: "Arbitrum" }),
  SEP: () => ({ chainId: 11155111, registrar: CHAIN_REVERSE_REGISTRAR[11155111], namespace: "80aa36a7.reverse", label: "Sepolia" }),
  SEPOLIA: () => ({ chainId: 11155111, registrar: CHAIN_REVERSE_REGISTRAR[11155111], namespace: "80aa36a7.reverse", label: "Sepolia" }),
};

function resolveTarget(input: string): ReverseTarget {
  const upper = input.toUpperCase();
  if (upper in TARGET_MAP) return TARGET_MAP[upper]();
  throw new CliError(
    `Unknown reverse target: "${input}". Use: DEFAULT, ETH, BASE, OP, ARB, SEP.`,
    ExitCode.INPUT_ERROR,
  );
}

// ── Command ─────────────────────────────────────────────────────────────────

export const setReverseCommand = new Command("set-reverse")
  .description("Set reverse name via ENS Reverse Registrar (ENSIP-19)")
  .argument("<name>", "Agent name to set as reverse (e.g., agent-0.base.xid.eth)")
  .argument("[target]", "Reverse target: DEFAULT, ETH, BASE, OP, ARB, SEP", "DEFAULT")
  .option("--addr <address>", "Set reverse for this address instead of your wallet (setNameForAddr)")
  .option("--dry-run", "Show transaction proposal without executing")
  .action(async (name, targetArg, opts) => {
    try {
      const target = resolveTarget(targetArg);

      humanLog(chalk.bold("Set Reverse Name"));
      humanLog(`  Name:       ${chalk.bold(name)}`);
      humanLog(`  Target:     ${target.label} (${target.namespace})`);
      humanLog(`  Chain:      ${target.chainId}`);
      humanLog(`  Registrar:  ${target.registrar}`);
      if (opts.addr) {
        humanLog(`  For addr:   ${opts.addr}`);
      }

      if (opts.addr) {
        // setNameForAddr — set reverse for a specific address
        const addr = validateAddress(opts.addr, "--addr");

        if (isDryRun()) {
          proposeTx({
            action: `Set reverse for ${addr} → ${name}`,
            chainId: target.chainId,
            contractName: "ENS Reverse Registrar",
            contractAddress: target.registrar,
            functionAbi: "function setNameForAddr(address addr, string name) returns (bytes32)",
            args: [addr, name],
            argLabels: ["addr", "name"],
            notes: [
              `Target: ${target.label}`,
              `Namespace: ${target.namespace}`,
              `Caller must be authorized for address ${addr}.`,
            ],
          });
          return;
        }

        const wallet = getWallet(target.chainId);
        const registrar = new ethers.Contract(target.registrar, REVERSE_REGISTRAR_ABI, wallet);

        statusLog(chalk.dim(`Setting reverse for ${addr} via setNameForAddr...`));
        const tx = await registrar.setNameForAddr(addr, name);
        humanLog(`Tx: ${chalk.dim(tx.hash)}`);
        await tx.wait();
        humanLog(chalk.green(`Reverse set: ${addr} → ${chalk.bold(name)}`));

        outputSuccess({
          address: addr,
          reverseName: name,
          method: "setNameForAddr",
          target: target.label,
          registrar: target.registrar,
          namespace: target.namespace,
          txHash: tx.hash,
        }, { chain: target.label, chainId: target.chainId });
      } else {
        // setName — set reverse for msg.sender
        if (isDryRun()) {
          proposeTx({
            action: `Set reverse for your wallet → ${name}`,
            chainId: target.chainId,
            contractName: "ENS Reverse Registrar",
            contractAddress: target.registrar,
            functionAbi: "function setName(string name) returns (bytes32)",
            args: [name],
            argLabels: ["name"],
            notes: [
              `Target: ${target.label}`,
              `Namespace: ${target.namespace}`,
              "Sets reverse for the calling wallet address (msg.sender).",
            ],
          });
          return;
        }

        const wallet = getWallet(target.chainId);
        const registrar = new ethers.Contract(target.registrar, REVERSE_REGISTRAR_ABI, wallet);

        statusLog(chalk.dim(`Setting reverse for ${wallet.address} via setName...`));
        const tx = await registrar.setName(name);
        humanLog(`Tx: ${chalk.dim(tx.hash)}`);
        await tx.wait();
        humanLog(chalk.green(`Reverse set: ${wallet.address} → ${chalk.bold(name)}`));

        outputSuccess({
          address: wallet.address,
          reverseName: name,
          method: "setName",
          target: target.label,
          registrar: target.registrar,
          namespace: target.namespace,
          txHash: tx.hash,
        }, { chain: target.label, chainId: target.chainId });
      }
    } catch (err: any) {
      handleErrorJson(err);
    }
  });
