import { Command } from "commander";
import { ethers } from "ethers";
import chalk from "chalk";
import { getConfig, CHAIN_ID } from "../config.js";
import { getWallet } from "../provider.js";
import { IDENTITY_REGISTRY_ABI, REGISTRY_ABI } from "../abi.js";
import { resolveNameAsync, isDryRun, proposeTx, verifyOwnership } from "../utils.js";
import { outputSuccess, handleErrorJson, humanLog, statusLog } from "../output.js";

/**
 * ERC-7930 interoperable address encoding for ENSIP-25 text record keys.
 */
function chainIdToMinimalBytes(chainId: number): number[] {
  if (chainId === 0) return [0];
  const bytes: number[] = [];
  let n = chainId;
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n = n >> 8;
  }
  return bytes;
}

function buildErc7930Address(chainId: number, contractAddress: string): string {
  const chainRefBytes = chainIdToMinimalBytes(chainId);
  const addrHex = contractAddress.toLowerCase().replace(/^0x/, "");
  const parts = [
    "0001",
    "0000",
    chainRefBytes.length.toString(16).padStart(2, "0"),
    chainRefBytes.map((b) => b.toString(16).padStart(2, "0")).join(""),
    "14",
    addrHex,
  ];
  return "0x" + parts.join("");
}

function buildEnsip25Key(registryAddress: string, agentId: string): string {
  const erc7930 = buildErc7930Address(CHAIN_ID, registryAddress);
  return `agent-registration[${erc7930}][${agentId}]`;
}

export const registerAgentCommand = new Command("register-agent")
  .description("Register on ERC-8004 IdentityRegistry (with optional ENSIP-25 linking)")
  .argument("<name>", "Name (e.g., agent-0, neo.agent-0, agent-0.xid.eth)")
  .option("--services <json>", "Services JSON array")
  .option("--mcp <endpoint>", "Add an MCP service endpoint")
  .option("--http <endpoint>", "Add an HTTP service endpoint")
  .option("--link", "Also set the ENSIP-25 text record to link the agent to the name")
  .option("--dry-run", "Show transaction proposal without executing")
  .action(async (name, opts) => {
    try {
      const config = getConfig();
      const wallet = getWallet();
      const resolved = await resolveNameAsync(name);

      // Build agentURI
      const services: { name: string; endpoint: string }[] = [
        { name: "ENS", endpoint: resolved.domain },
      ];
      if (opts.mcp) services.push({ name: "MCP", endpoint: opts.mcp });
      if (opts.http) services.push({ name: "HTTP", endpoint: opts.http });
      if (opts.services) {
        const extra = JSON.parse(opts.services);
        services.push(...extra);
      }

      const agentData = { name: resolved.domain, services };
      const agentURI = "data:application/json;base64," + Buffer.from(JSON.stringify(agentData)).toString("base64");

      if (isDryRun()) {
        proposeTx({
          action: `Register agent for ${resolved.domain} on ERC-8004`,
          contractName: "IdentityRegistry (ERC-8004)",
          contractAddress: config.IDENTITY_REGISTRY_8004,
          functionAbi: "function register(string agentURI) returns (uint256)",
          args: [agentURI],
          argLabels: ["agentURI"],
          notes: [
            `Agent name: ${resolved.domain}`,
            `Services: ${services.map((s) => s.name).join(", ")}`,
            ...(opts.link ? ["Will also set ENSIP-25 text record after registration."] : []),
          ],
        });
        if (opts.link) {
          humanLog(chalk.dim("\n  ENSIP-25 linking (second transaction):"));
          humanLog(chalk.dim(`    Contract: IDRegistry (${config.ID_REGISTRY})`));
          humanLog(chalk.dim(`    Function: setText(node, key, "1")`));
          humanLog(chalk.dim(`    Key format: agent-registration[erc7930][agentId]`));
          humanLog(chalk.dim(`    (Agent ID determined after first tx)`));
        }
        return;
      }

      statusLog(chalk.dim(`Registering on ERC-8004 IdentityRegistry (${config.name})...`));
      statusLog(chalk.dim(`Agent URI: ${resolved.domain}`));
      statusLog(chalk.dim(`Services: ${services.map((s) => s.name).join(", ")}`));

      const registry = new ethers.Contract(
        config.IDENTITY_REGISTRY_8004,
        IDENTITY_REGISTRY_ABI,
        wallet
      );

      const tx = await registry.register(agentURI);
      humanLog(`Tx: ${chalk.dim(tx.hash)}`);
      const receipt = await tx.wait();

      // Extract agentId from Transfer event (ERC-721 mint: from = address(0))
      let agentId: string | null = null;
      for (const log of receipt.logs) {
        if (log.topics.length === 4 && log.topics[1] === ethers.zeroPadValue("0x00", 32)) {
          agentId = BigInt(log.topics[3]).toString();
          break;
        }
      }

      if (agentId) {
        humanLog(chalk.green(`Registered! Agent ID: ${chalk.bold(agentId)}`));
        humanLog(chalk.dim(`View: https://www.8004scan.io/agents/${config.shortName}/${agentId}`));
      } else {
        humanLog(chalk.green("Registered! (could not extract agent ID from logs)"));
      }

      // Link via ENSIP-25 if --link flag is set
      let linked = false;
      if (opts.link && agentId) {
        const ensip25Key = buildEnsip25Key(config.IDENTITY_REGISTRY_8004, agentId);

        const nameRegistry = new ethers.Contract(config.ID_REGISTRY, REGISTRY_ABI, wallet);
        await verifyOwnership(nameRegistry, resolved.node, wallet, resolved.domain);

        statusLog(chalk.dim(`\nSetting ENSIP-25 record...`));
        statusLog(chalk.dim(`Key: ${ensip25Key}`));
        const linkTx = await nameRegistry.setText(resolved.node, ensip25Key, "1");
        humanLog(`Tx: ${chalk.dim(linkTx.hash)}`);
        await linkTx.wait();
        humanLog(chalk.green("Linked agent to name via ENSIP-25."));
        linked = true;
      } else if (opts.link && !agentId) {
        humanLog(chalk.yellow("Cannot link: agent ID not found. Use `id-cli link-agent` manually."));
      } else if (agentId) {
        humanLog(chalk.dim(`\nTo link to your name, run:`));
        humanLog(`  id-cli link-agent ${resolved.path} ${agentId}`);
      }

      outputSuccess({
        domain: resolved.domain,
        agentId,
        txHash: tx.hash,
        gasUsed: receipt.gasUsed.toString(),
        services: services.map((s) => s.name),
        linked,
      });
    } catch (err: any) {
      handleErrorJson(err);
    }
  });

export const linkAgentCommand = new Command("link-agent")
  .description("Link an ERC-8004 agent to an ENS name via ENSIP-25")
  .argument("<name>", "Name (e.g., agent-0, neo.agent-0, agent-0.xid.eth)")
  .argument("<agentId>", "ERC-8004 agent ID")
  .option("--dry-run", "Show transaction proposal without executing")
  .action(async (name, agentId, opts) => {
    try {
      const config = getConfig();
      const resolved = await resolveNameAsync(name);
      const ensip25Key = buildEnsip25Key(config.IDENTITY_REGISTRY_8004, agentId);

      if (isDryRun()) {
        proposeTx({
          action: `Link agent ${agentId} to ${resolved.domain} via ENSIP-25`,
          contractName: "IDRegistry",
          contractAddress: config.ID_REGISTRY,
          functionAbi: "function setText(bytes32 node, string key, string value)",
          args: [resolved.node, ensip25Key, "1"],
          argLabels: ["node", "key", "value"],
          notes: [
            `ENSIP-25 key: ${ensip25Key}`,
            `Registry: ${config.IDENTITY_REGISTRY_8004}`,
          ],
        });
        return;
      }

      const wallet = getWallet();
      statusLog(chalk.dim(`Linking agent ${agentId} to ${resolved.domain}...`));
      statusLog(chalk.dim(`Key: ${ensip25Key}`));

      const registry = new ethers.Contract(config.ID_REGISTRY, REGISTRY_ABI, wallet);
      await verifyOwnership(registry, resolved.node, wallet, resolved.domain);

      const tx = await registry.setText(resolved.node, ensip25Key, "1");
      humanLog(`Tx: ${chalk.dim(tx.hash)}`);
      await tx.wait();
      humanLog(chalk.green(`Linked agent ${chalk.bold(agentId)} to ${chalk.bold(resolved.domain)} via ENSIP-25.`));
      outputSuccess({
        domain: resolved.domain,
        agentId,
        ensip25Key,
        txHash: tx.hash,
      });
    } catch (err: any) {
      handleErrorJson(err);
    }
  });
