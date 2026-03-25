import { Command } from "commander";
import { ethers } from "ethers";
import chalk from "chalk";
import { getChainConfig } from "../config.js";
import { getWallet, getProvider } from "../provider.js";
import { REGISTRY_ABI } from "../abi.js";
import { resolveNameAsync, isDryRun, proposeTx, verifyOwnership, CliError, ExitCode } from "../utils.js";
import { outputSuccess, handleErrorJson, humanLog, statusLog } from "../output.js";
import { indexerFetch } from "../utils.js";

// ── Hook parsing ─────────────────────────────────────────────────────────────

/**
 * Split a string by commas at paren depth 0.
 * e.g. "0xab,foo(a,b),(bool),0xcd" → ["0xab","foo(a,b)","(bool)","0xcd"]
 */
function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

export interface ParsedHook {
  selector: string;
  signature: string;
  returnType: string;
  target: string;
  extra?: string;
}

/**
 * Parse and validate an ERC-8121 hook string.
 *
 * Format: hook(<selector>, <signature>, <returnType>, <target>[, <extra>])
 *  - selector: 4-byte hex (0x + 8 hex chars)
 *  - signature: function signature like transfer(address,uint256)
 *  - returnType: return types in parens like (bool)
 *  - target: address starting with 0x
 *  - extra: optional 5th param
 */
export function parseHook(hookStr: string): ParsedHook {
  const trimmed = hookStr.trim();

  if (!trimmed.startsWith("hook(")) {
    throw new CliError('Hook must start with "hook("', ExitCode.INPUT_ERROR);
  }
  if (!trimmed.endsWith(")")) {
    throw new CliError('Hook must end with ")"', ExitCode.INPUT_ERROR);
  }

  // Extract inner content between hook( and the final )
  const inner = trimmed.slice(5, -1);
  const params = splitTopLevel(inner);

  if (params.length < 4 || params.length > 5) {
    throw new CliError(
      `Hook must have 4 or 5 parameters, got ${params.length}.`,
      ExitCode.INPUT_ERROR,
    );
  }

  const [selector, signature, returnType, target] = params;
  const extra = params[4];

  // Validate selector format: 0x + 8 hex chars
  if (!/^0x[0-9a-fA-F]{8}$/.test(selector)) {
    throw new CliError(
      `Invalid selector "${selector}". Expected 4-byte hex (0x + 8 hex chars).`,
      ExitCode.INPUT_ERROR,
    );
  }

  // Validate signature has parens
  const sigMatch = signature.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\(.*\)$/);
  if (!sigMatch) {
    throw new CliError(
      `Invalid signature "${signature}". Expected format like "transfer(address,uint256)".`,
      ExitCode.INPUT_ERROR,
    );
  }

  // Verify selector matches keccak256(signature)
  const computedSelector = ethers.keccak256(ethers.toUtf8Bytes(signature)).slice(0, 10);
  if (computedSelector.toLowerCase() !== selector.toLowerCase()) {
    throw new CliError(
      `Selector mismatch: "${selector}" does not match keccak256("${signature}") = ${computedSelector}.`,
      ExitCode.INPUT_ERROR,
    );
  }

  // Validate return type is in parens
  if (!returnType.startsWith("(") || !returnType.endsWith(")")) {
    throw new CliError(
      `Invalid return type "${returnType}". Must be wrapped in parentheses, e.g. "(bool)".`,
      ExitCode.INPUT_ERROR,
    );
  }

  // Validate target starts with 0x
  if (!target.startsWith("0x")) {
    throw new CliError(
      `Invalid target "${target}". Must start with 0x.`,
      ExitCode.INPUT_ERROR,
    );
  }

  return { selector, signature, returnType, target, extra };
}

// ── Commands ─────────────────────────────────────────────────────────────────

export const setHookCommand = new Command("set-hook")
  .description("Set an ERC-8121 hook on a name")
  .argument("<name>", "Name (e.g., agent-0, neo.agent-0, agent-0.base.xid.eth)")
  .argument("<hook>", 'Hook value, e.g. hook(0xbeabacc8,transfer(address,address,uint256),(bool),0xTarget)')
  .option("-c, --chain <chain>", "Chain", "base")
  .option("--dry-run", "Show transaction proposal without executing")
  .action(async (name, hookValue, opts) => {
    try {
      const parsed = parseHook(hookValue);
      const key = `erc8121-hook[${parsed.selector}]`;

      const resolved = await resolveNameAsync(name, opts.chain);
      const config = getChainConfig(resolved.chainId);

      if (isDryRun()) {
        proposeTx({
          action: `Set ERC-8121 hook ${parsed.selector} on ${resolved.domain}`,
          chainId: resolved.chainId,
          contractName: "IDRegistry",
          contractAddress: config.ID_REGISTRY,
          functionAbi: "function setText(bytes32 node, string key, string value)",
          args: [resolved.node, key, hookValue],
          argLabels: ["node", "key", "value"],
          notes: [
            `Selector: ${parsed.selector}`,
            `Signature: ${parsed.signature}`,
            `Return: ${parsed.returnType}`,
            `Target: ${parsed.target}`,
          ],
        });
        return;
      }

      const wallet = getWallet(resolved.chainId);
      const registry = new ethers.Contract(config.ID_REGISTRY, REGISTRY_ABI, wallet);
      await verifyOwnership(registry, resolved.node, wallet, resolved.domain);

      statusLog(chalk.dim(`Setting hook ${parsed.selector} on ${resolved.domain}...`));
      const tx = await registry.setText(resolved.node, key, hookValue);
      humanLog(`Tx: ${chalk.dim(tx.hash)}`);
      await tx.wait();
      humanLog(chalk.green(`Set hook ${chalk.bold(parsed.selector)} for ${parsed.signature}`));
      outputSuccess({
        domain: resolved.domain,
        key,
        selector: parsed.selector,
        signature: parsed.signature,
        returnType: parsed.returnType,
        target: parsed.target,
        hookValue,
        txHash: tx.hash,
      }, { chainId: resolved.chainId });
    } catch (err: any) {
      handleErrorJson(err);
    }
  });

export const getHooksCommand = new Command("get-hooks")
  .description("Show all ERC-8121 hooks for a name")
  .argument("<name>", "Name (e.g., agent-0, neo.agent-0, agent-0.base.xid.eth)")
  .option("-c, --chain <chain>", "Chain", "base")
  .action(async (name, opts) => {
    try {
      const resolved = await resolveNameAsync(name, opts.chain);

      humanLog(chalk.bold(`ERC-8121 Hooks for ${resolved.domain}\n`));

      const res = await indexerFetch(`/api/domains/${resolved.node}/records`);
      if (!res.ok) {
        humanLog(chalk.dim("No records found (indexer unavailable)."));
        outputSuccess({ domain: resolved.domain, hooks: [] }, { chainId: resolved.chainId });
        return;
      }

      const records = await res.json();
      const hooks = (records.textRecords || []).filter(
        (r: { key: string; value: string }) => r.key.startsWith("erc8121-hook["),
      );

      if (hooks.length === 0) {
        humanLog(chalk.dim("No hooks set."));
        outputSuccess({ domain: resolved.domain, hooks: [] }, { chainId: resolved.chainId });
        return;
      }

      for (const h of hooks) {
        const selectorMatch = h.key.match(/^erc8121-hook\[([^\]]+)\]$/);
        const selector = selectorMatch ? selectorMatch[1] : h.key;
        humanLog(`  ${chalk.bold(selector)}: ${h.value}`);
      }

      outputSuccess({
        domain: resolved.domain,
        hooks: hooks.map((h: { key: string; value: string }) => ({
          key: h.key,
          value: h.value,
        })),
      }, { chainId: resolved.chainId });
    } catch (err: any) {
      handleErrorJson(err);
    }
  });
