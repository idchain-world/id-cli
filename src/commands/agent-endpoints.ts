import { Command } from "commander";
import { ethers } from "ethers";
import chalk from "chalk";
import { getConfig } from "../config.js";
import { getWallet } from "../provider.js";
import { REGISTRY_ABI } from "../abi.js";
import { resolveNameAsync, isDryRun, proposeTx, verifyOwnership, CliError, ExitCode } from "../utils.js";
import { outputSuccess, handleErrorJson, humanLog, statusLog } from "../output.js";

// ENSIP-26 agent endpoint protocol types
const VALID_PROTOCOLS = ["mcp", "a2a", "oasf", "web"] as const;
type Protocol = typeof VALID_PROTOCOLS[number];

function endpointKey(protocol: Protocol): string {
  return `agent-endpoint[${protocol}]`;
}

function validateUrl(url: string, flag: string): string {
  if (url.startsWith("https://") || url.startsWith("http://") || url.startsWith("ipfs://")) {
    return url;
  }
  throw new CliError(
    `Invalid URL for ${flag}: "${url}". Must start with https://, http://, or ipfs://`,
    ExitCode.INPUT_ERROR,
  );
}

export const setAgentEndpointsCommand = new Command("set-agent-endpoints")
  .description("Set ENSIP-26 agent endpoint records (bulk update via setRecord)")
  .argument("<name>", "Name (e.g., agent-0, neo.agent-0, agent-0.xid.eth)")
  .option("--mcp <url>", "MCP (Model Context Protocol) endpoint")
  .option("--a2a <url>", "A2A (Agent-to-Agent) endpoint")
  .option("--oasf <url>", "OASF (OpenAPI Service Format) endpoint")
  .option("--web <url>", "Web interface URL")
  .option("--context <text>", "Agent context description (agent-context record)")
  .option("--clear <protocols>", "Comma-separated protocols to clear (e.g., mcp,a2a or all)")
  .option("--dry-run", "Show transaction proposal without executing")
  .action(async (name, opts) => {
    try {
      const resolved = await resolveNameAsync(name);
      const config = getConfig();

      // Build text records from flags
      const keys: string[] = [];
      const values: string[] = [];

      for (const proto of VALID_PROTOCOLS) {
        if (opts[proto]) {
          validateUrl(opts[proto], `--${proto}`);
          keys.push(endpointKey(proto));
          values.push(opts[proto]);
        }
      }

      if (opts.context) {
        keys.push("agent-context");
        values.push(opts.context);
      }

      // Handle --clear
      if (opts.clear) {
        const toClear = opts.clear === "all"
          ? [...VALID_PROTOCOLS]
          : opts.clear.split(",").map((s: string) => s.trim());
        for (const proto of toClear) {
          if (!VALID_PROTOCOLS.includes(proto as Protocol)) {
            throw new CliError(`Unknown protocol "${proto}". Valid: ${VALID_PROTOCOLS.join(", ")}`, ExitCode.INPUT_ERROR);
          }
          const key = endpointKey(proto as Protocol);
          // Don't add duplicates if already being set
          if (!keys.includes(key)) {
            keys.push(key);
            values.push(""); // empty string clears the record
          }
        }
      }

      if (keys.length === 0) {
        throw new CliError(
          "No endpoints specified. Use --mcp, --a2a, --oasf, --web, --context, or --clear.",
          ExitCode.INPUT_ERROR,
        );
      }

      if (isDryRun()) {
        proposeTx({
          action: `Set ENSIP-26 agent endpoints on ${resolved.domain}`,
          contractName: "IDRegistry",
          contractAddress: config.ID_REGISTRY,
          functionAbi: "function setRecord(bytes32 node, string[] keys, string[] values, uint256[] coinTypes, bytes[] addresses, bytes contentHash, string[] dataKeys, bytes[] dataValues)",
          args: [resolved.node, keys, values, [], [], "0x", [], []],
          argLabels: ["node", "textKeys", "textValues", "coinTypes", "addresses", "contentHash", "dataKeys", "dataValues"],
          notes: keys.map((k, i) => `${k} = ${values[i] || "(clear)"}`),
        });
        return;
      }

      const wallet = getWallet();
      const registry = new ethers.Contract(config.ID_REGISTRY, REGISTRY_ABI, wallet);
      await verifyOwnership(registry, resolved.node, wallet, resolved.domain);

      statusLog(chalk.dim(`Setting ${keys.length} ENSIP-26 record(s) on ${resolved.domain}...`));
      const tx = await registry.setRecord(
        resolved.node,
        keys, values,
        [], [], // no address records
        "0x",   // no contenthash change
        [], [], // no data records
      );
      humanLog(`Tx: ${chalk.dim(tx.hash)}`);
      await tx.wait();

      for (let i = 0; i < keys.length; i++) {
        if (values[i]) {
          humanLog(chalk.green(`  ${keys[i]} = ${values[i]}`));
        } else {
          humanLog(chalk.yellow(`  ${keys[i]} (cleared)`));
        }
      }

      outputSuccess({
        domain: resolved.domain,
        records: keys.map((k, i) => ({ key: k, value: values[i] })),
        txHash: tx.hash,
      });
    } catch (err: any) {
      handleErrorJson(err);
    }
  });
