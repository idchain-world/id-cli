import { Command } from "commander";
import { ethers } from "ethers";
import chalk from "chalk";
import { resolveChain, getChainConfig } from "../config.js";
import { getWallet } from "../provider.js";
import { IDENTITY_REGISTRY_ABI, REGISTRY_ABI } from "../abi.js";
import { resolveName, isDryRun, proposeTx } from "../utils.js";

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

function buildEnsip25Key(chainId: number, registryAddress: string, agentId: string): string {
  const erc7930 = buildErc7930Address(chainId, registryAddress);
  return `agent-registration[${erc7930}][${agentId}]`;
}

export const registerAgentCommand = new Command("register-agent")
  .description("Register on ERC-8004 IdentityRegistry (with optional ENSIP-25 linking)")
  .argument("<name>", "Name (e.g., agent-0, neo.agent-0, agent-0.base.xid.eth)")
  .option("-c, --chain <chain>", "Chain for the ERC-8004 registry", "base")
  .option("--name-chain <chain>", "Chain where the ENS name lives (if different from registry chain)")
  .option("--services <json>", "Services JSON array")
  .option("--mcp <endpoint>", "Add an MCP service endpoint")
  .option("--http <endpoint>", "Add an HTTP service endpoint")
  .option("--link", "Also set the ENSIP-25 text record to link the agent to the name")
  .action(async (name, opts) => {
    try {
      const registryChainId = resolveChain(opts.chain);
      const registryConfig = getChainConfig(registryChainId);
      const wallet = getWallet(registryChainId);

      const nameChainId = opts.nameChain ? resolveChain(opts.nameChain) : registryChainId;
      const resolved = resolveName(name, opts.nameChain || opts.chain);

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
          chainId: registryChainId,
          contractName: "IdentityRegistry (ERC-8004)",
          contractAddress: registryConfig.IDENTITY_REGISTRY_8004,
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
          const nameConfig = getChainConfig(nameChainId);
          console.log(chalk.dim("\n  ENSIP-25 linking (second transaction):"));
          console.log(chalk.dim(`    Contract: IDRegistry (${nameConfig.ID_REGISTRY})`));
          console.log(chalk.dim(`    Function: setText(node, key, "1")`));
          console.log(chalk.dim(`    Key format: agent-registration[erc7930][agentId]`));
          console.log(chalk.dim(`    (Agent ID determined after first tx)`));
        }
        return;
      }

      console.log(chalk.dim(`Registering on ERC-8004 IdentityRegistry (${registryConfig.name})...`));
      console.log(chalk.dim(`Agent URI: ${resolved.domain}`));
      console.log(chalk.dim(`Services: ${services.map((s) => s.name).join(", ")}`));

      const registry = new ethers.Contract(
        registryConfig.IDENTITY_REGISTRY_8004,
        IDENTITY_REGISTRY_ABI,
        wallet
      );

      const tx = await registry.register(agentURI);
      console.log(`Tx: ${chalk.dim(tx.hash)}`);
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
        console.log(chalk.green(`Registered! Agent ID: ${chalk.bold(agentId)}`));
        console.log(chalk.dim(`View: https://www.8004scan.io/agents/${registryConfig.shortName}/${agentId}`));
      } else {
        console.log(chalk.green("Registered! (could not extract agent ID from logs)"));
      }

      // Link via ENSIP-25 if --link flag is set
      if (opts.link && agentId) {
        const nameConfig = getChainConfig(nameChainId);
        const ensip25Key = buildEnsip25Key(registryChainId, registryConfig.IDENTITY_REGISTRY_8004, agentId);

        const nameWallet = nameChainId !== registryChainId ? getWallet(nameChainId) : wallet;
        const nameRegistry = new ethers.Contract(nameConfig.ID_REGISTRY, REGISTRY_ABI, nameWallet);

        console.log(chalk.dim(`\nSetting ENSIP-25 record on ${nameConfig.name}...`));
        console.log(chalk.dim(`Key: ${ensip25Key}`));
        const linkTx = await nameRegistry.setText(resolved.node, ensip25Key, "1");
        console.log(`Tx: ${chalk.dim(linkTx.hash)}`);
        await linkTx.wait();
        console.log(chalk.green("Linked agent to name via ENSIP-25."));
      } else if (opts.link && !agentId) {
        console.log(chalk.yellow("Cannot link: agent ID not found. Use `idcli link-agent` manually."));
      } else if (agentId) {
        console.log(chalk.dim(`\nTo link to your name, run:`));
        console.log(`  idcli link-agent ${resolved.path} ${agentId} --chain ${opts.chain}`);
      }
    } catch (err: any) {
      console.error(chalk.red(err.message));
      process.exit(1);
    }
  });

export const linkAgentCommand = new Command("link-agent")
  .description("Link an ERC-8004 agent to an ENS name via ENSIP-25")
  .argument("<name>", "Name (e.g., agent-0, neo.agent-0, agent-0.base.xid.eth)")
  .argument("<agentId>", "ERC-8004 agent ID")
  .option("-c, --chain <chain>", "Chain where the ERC-8004 registry lives", "base")
  .option("--name-chain <chain>", "Chain where the ENS name lives (if different)")
  .action(async (name, agentId, opts) => {
    try {
      const registryChainId = resolveChain(opts.chain);
      const registryConfig = getChainConfig(registryChainId);
      const nameChainId = opts.nameChain ? resolveChain(opts.nameChain) : registryChainId;
      const nameConfig = getChainConfig(nameChainId);
      const resolved = resolveName(name, opts.nameChain || opts.chain);

      const ensip25Key = buildEnsip25Key(registryChainId, registryConfig.IDENTITY_REGISTRY_8004, agentId);

      if (isDryRun()) {
        proposeTx({
          action: `Link agent ${agentId} to ${resolved.domain} via ENSIP-25`,
          chainId: nameChainId,
          contractName: "IDRegistry",
          contractAddress: nameConfig.ID_REGISTRY,
          functionAbi: "function setText(bytes32 node, string key, string value)",
          args: [resolved.node, ensip25Key, "1"],
          argLabels: ["node", "key", "value"],
          notes: [
            `ENSIP-25 key: ${ensip25Key}`,
            `Registry: ${registryConfig.IDENTITY_REGISTRY_8004} (${registryConfig.name})`,
          ],
        });
        return;
      }

      const wallet = getWallet(nameChainId);
      console.log(chalk.dim(`Linking agent ${agentId} to ${resolved.domain}...`));
      console.log(chalk.dim(`Key: ${ensip25Key}`));

      const registry = new ethers.Contract(nameConfig.ID_REGISTRY, REGISTRY_ABI, wallet);
      const tx = await registry.setText(resolved.node, ensip25Key, "1");
      console.log(`Tx: ${chalk.dim(tx.hash)}`);
      await tx.wait();
      console.log(chalk.green(`Linked agent ${chalk.bold(agentId)} to ${chalk.bold(resolved.domain)} via ENSIP-25.`));
    } catch (err: any) {
      console.error(chalk.red(err.message));
      process.exit(1);
    }
  });
