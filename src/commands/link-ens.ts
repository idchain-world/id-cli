import { Command } from "commander";
import { ethers } from "ethers";
import chalk from "chalk";
import { getChainConfig } from "../config.js";
import { getProvider, getWallet } from "../provider.js";
import {
  REGISTRY_ABI,
  ENS_REGISTRY_ABI,
  ENS_NAME_WRAPPER_ABI,
  ID_LINKED_RESOLVER_ABI,
  ID_UNIFIED_RESOLVER_ABI,
} from "../abi.js";
import { resolveNameAsync, isDryRun, proposeTx, CliError, ExitCode, labelhash } from "../utils.js";
import { outputSuccess, handleErrorJson, humanLog, statusLog } from "../output.js";

// ── ENS contract addresses ──────────────────────────────────────────────────

const ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";

const ENS_NAME_WRAPPER: Record<number, string> = {
  1:        "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401",
  11155111: "0x0635513f179D50A207757E05759CbD106d7dFcE8",
};

// Linking resolver addresses
const ENS_LINKING_RESOLVERS = {
  LINKED_MAINNET:  "0x104f0C0D2763334430C44585a7f97AcdE67ad2D1",
  LINKED_SEPOLIA:  "0x94C474694EEf58181b834300f54a9F225FCc67c9",
  UNIFIED_MAINNET: "0xf4606833A389e8394b8c5ce1B3DeEB9f0B4c7F1a",
};

interface LinkingConfig {
  resolverAddress: string;
  resolverChainId: number;
  type: "linked" | "unified";
}

function getEnsLinkingConfig(agentChainId: number): LinkingConfig {
  switch (agentChainId) {
    case 1:
      return { resolverAddress: ENS_LINKING_RESOLVERS.LINKED_MAINNET, resolverChainId: 1, type: "linked" };
    case 11155111:
      return { resolverAddress: ENS_LINKING_RESOLVERS.LINKED_SEPOLIA, resolverChainId: 11155111, type: "linked" };
    case 8453:
    case 10:
    case 42161:
      return { resolverAddress: ENS_LINKING_RESOLVERS.UNIFIED_MAINNET, resolverChainId: 1, type: "unified" };
    default:
      throw new CliError(`ENS linking not supported for chain ${agentChainId}.`, ExitCode.INPUT_ERROR);
  }
}

function getRegistryChainId(agentChainId: number): number {
  return agentChainId === 11155111 ? 11155111 : 1;
}

function ensNamehash(name: string): string {
  let node = ethers.ZeroHash;
  if (name === "") return node;
  const labels = name.split(".");
  for (let i = labels.length - 1; i >= 0; i--) {
    node = ethers.keccak256(
      ethers.concat([node, ethers.keccak256(ethers.toUtf8Bytes(labels[i]))])
    );
  }
  return node;
}

// ── Check ENS ownership ─────────────────────────────────────────────────────

async function checkEnsOwnership(
  ensNameNode: string,
  registryChainId: number,
): Promise<{ owner: string | null; isWrapped: boolean }> {
  const provider = getProvider(registryChainId);
  const registry = new ethers.Contract(ENS_REGISTRY, ENS_REGISTRY_ABI, provider);
  let ownerAddr = await registry.owner(ensNameNode);

  const nameWrapperAddr = ENS_NAME_WRAPPER[registryChainId];
  let isWrapped = false;
  if (nameWrapperAddr && ownerAddr.toLowerCase() === nameWrapperAddr.toLowerCase()) {
    isWrapped = true;
    const wrapper = new ethers.Contract(nameWrapperAddr, ENS_NAME_WRAPPER_ABI, provider);
    ownerAddr = await wrapper.ownerOf(ensNameNode);
  }

  if (ownerAddr === ethers.ZeroAddress) return { owner: null, isWrapped };
  return { owner: ownerAddr, isWrapped };
}

// ── Command ─────────────────────────────────────────────────────────────────

export const linkEnsCommand = new Command("link-ens")
  .description("Link a .eth name to an agent ID (forward link + back-link + resolver)")
  .argument("<ens-name>", "ENS name to link (e.g., alice.eth)")
  .argument("<agent-name>", "Agent name to link to (e.g., agent-0.base.xid.eth)")
  .option("--step <step>", "Run only a specific step: 1 (back-link), 2 (forward-link), 3 (resolver)")
  .option("--dry-run", "Show transaction proposal without executing")
  .action(async (ensName, agentName, opts) => {
    try {
      // Validate ENS name
      ensName = ensName.toLowerCase().trim();
      if (!ensName.endsWith(".eth")) {
        throw new CliError(`ENS name must end with .eth: "${ensName}"`, ExitCode.INPUT_ERROR);
      }
      const parts = ensName.split(".");
      if (parts.length !== 2 || parts[0].length === 0) {
        throw new CliError(`Only second-level .eth names supported (e.g., alice.eth), got "${ensName}"`, ExitCode.INPUT_ERROR);
      }

      // Resolve agent name
      const resolved = await resolveNameAsync(agentName);
      const agentConfig = getChainConfig(resolved.chainId);
      const linkingConfig = getEnsLinkingConfig(resolved.chainId);
      const registryChainId = getRegistryChainId(resolved.chainId);

      const ensNameNode = ensNamehash(ensName);
      const agentNode = resolved.node;

      const chainLabel = registryChainId === 11155111 ? "Sepolia" : "Ethereum";
      const agentChainLabel = agentConfig.name;

      humanLog(chalk.bold("Link ENS Name"));
      humanLog(`  ENS name:   ${chalk.bold(ensName)}`);
      humanLog(`  Agent:      ${chalk.bold(resolved.domain)}`);
      humanLog(`  Agent chain: ${agentChainLabel} (${resolved.chainId})`);
      humanLog(`  Resolver:   ${linkingConfig.type === "linked" ? "IDLinkedResolver" : "IDUnifiedResolver"}`);
      humanLog(`             ${linkingConfig.resolverAddress}`);
      humanLog("");

      const stepFilter = opts.step ? parseInt(opts.step, 10) : null;

      // ── Step 1: Set back-link on agent's chain ──────────────────────────

      if (!stepFilter || stepFilter === 1) {
        humanLog(chalk.bold("Step 1: Set back-link on agent"));
        humanLog(chalk.dim(`  Sets ens-link[${ensName}] = "true" on ${agentChainLabel}`));

        const backLinkKey = `ens-link[${ensName}]`;

        if (isDryRun()) {
          proposeTx({
            action: `Set back-link: ens-link[${ensName}] = "true"`,
            chainId: resolved.chainId,
            contractName: "IDRegistry",
            contractAddress: agentConfig.ID_REGISTRY,
            functionAbi: "function setText(bytes32 node, string key, string value)",
            args: [agentNode, backLinkKey, "true"],
            argLabels: ["node", "key", "value"],
            notes: [
              `Agent: ${resolved.domain}`,
              `This confirms the agent owner consents to the link.`,
            ],
          });
        } else {
          const wallet = getWallet(resolved.chainId);
          const registry = new ethers.Contract(agentConfig.ID_REGISTRY, REGISTRY_ABI, wallet);

          // Check if back-link already set
          const existing = await registry.text(agentNode, backLinkKey);
          if (existing === "true") {
            humanLog(chalk.green(`  Back-link already set.`));
          } else {
            statusLog(chalk.dim(`  Setting ${backLinkKey} = "true"...`));
            const tx = await registry.setText(agentNode, backLinkKey, "true");
            humanLog(`  Tx: ${chalk.dim(tx.hash)}`);
            await tx.wait();
            humanLog(chalk.green(`  Back-link set.`));
          }
        }
        humanLog("");
      }

      // ── Step 2: Set forward link on resolver (L1/Sepolia) ─────────────

      if (!stepFilter || stepFilter === 2) {
        humanLog(chalk.bold("Step 2: Set forward link on resolver"));
        humanLog(chalk.dim(`  Links ${ensName} → ${resolved.domain} on ${chainLabel}`));

        if (isDryRun()) {
          if (linkingConfig.type === "linked") {
            proposeTx({
              action: `Set forward link: ${ensName} → ${resolved.domain}`,
              chainId: linkingConfig.resolverChainId,
              contractName: "IDLinkedResolver",
              contractAddress: linkingConfig.resolverAddress,
              functionAbi: "function setLink(bytes32 ensNode, bytes32 agentNode)",
              args: [ensNameNode, agentNode],
              argLabels: ["ensNode", "agentNode"],
              notes: [
                `ENS name: ${ensName} (${ensNameNode})`,
                `Agent: ${resolved.domain} (${agentNode})`,
                `Caller must be the ENS name owner.`,
              ],
            });
          } else {
            proposeTx({
              action: `Set forward link: ${ensName} → ${resolved.domain}`,
              chainId: linkingConfig.resolverChainId,
              contractName: "IDUnifiedResolver",
              contractAddress: linkingConfig.resolverAddress,
              functionAbi: "function setLink(bytes32 ensNode, uint256 chainId, bytes32 agentNode)",
              args: [ensNameNode, resolved.chainId, agentNode],
              argLabels: ["ensNode", "chainId", "agentNode"],
              notes: [
                `ENS name: ${ensName} (${ensNameNode})`,
                `Agent: ${resolved.domain} (${agentNode})`,
                `Agent chain: ${agentChainLabel} (${resolved.chainId})`,
                `Caller must be the ENS name owner.`,
              ],
            });
          }
        } else {
          const wallet = getWallet(linkingConfig.resolverChainId);

          if (linkingConfig.type === "linked") {
            const resolver = new ethers.Contract(linkingConfig.resolverAddress, ID_LINKED_RESOLVER_ABI, wallet);
            statusLog(chalk.dim(`  Calling setLink(${ensNameNode.slice(0, 10)}..., ${agentNode.slice(0, 10)}...)...`));
            const tx = await resolver.setLink(ensNameNode, agentNode);
            humanLog(`  Tx: ${chalk.dim(tx.hash)}`);
            await tx.wait();
          } else {
            const resolver = new ethers.Contract(linkingConfig.resolverAddress, ID_UNIFIED_RESOLVER_ABI, wallet);
            statusLog(chalk.dim(`  Calling setLink(${ensNameNode.slice(0, 10)}..., ${resolved.chainId}, ${agentNode.slice(0, 10)}...)...`));
            const tx = await resolver.setLink(ensNameNode, resolved.chainId, agentNode);
            humanLog(`  Tx: ${chalk.dim(tx.hash)}`);
            await tx.wait();
          }
          humanLog(chalk.green(`  Forward link set.`));
        }
        humanLog("");
      }

      // ── Step 3: Set resolver on .eth name (L1/Sepolia) ────────────────

      if (!stepFilter || stepFilter === 3) {
        humanLog(chalk.bold("Step 3: Set resolver on ENS name"));
        humanLog(chalk.dim(`  Points ${ensName}'s resolver to the linking resolver on ${chainLabel}`));

        if (isDryRun()) {
          // Show both wrapped and unwrapped proposals
          proposeTx({
            action: `Set resolver on ${ensName} to linking resolver`,
            chainId: registryChainId,
            contractName: "ENS Registry",
            contractAddress: ENS_REGISTRY,
            functionAbi: "function setResolver(bytes32 node, address resolver)",
            args: [ensNameNode, linkingConfig.resolverAddress],
            argLabels: ["node", "resolver"],
            notes: [
              `ENS name: ${ensName}`,
              `Resolver: ${linkingConfig.resolverAddress}`,
              `For wrapped names, uses NameWrapper.setResolver() instead.`,
            ],
          });
        } else {
          // Check if name is wrapped
          const { owner: ensOwner, isWrapped } = await checkEnsOwnership(ensNameNode, registryChainId);

          if (!ensOwner) {
            throw new CliError(`${ensName} is not registered on ENS.`, ExitCode.NOT_FOUND);
          }

          const wallet = getWallet(registryChainId);
          if (ensOwner.toLowerCase() !== wallet.address.toLowerCase()) {
            throw new CliError(
              `You don't own ${ensName} on ENS. Owner: ${ensOwner}`,
              ExitCode.AUTH_ERROR,
            );
          }

          if (isWrapped) {
            const wrapperAddr = ENS_NAME_WRAPPER[registryChainId];
            const wrapper = new ethers.Contract(wrapperAddr, ENS_NAME_WRAPPER_ABI, wallet);
            statusLog(chalk.dim(`  Setting resolver via NameWrapper (wrapped name)...`));
            const tx = await wrapper.setResolver(ensNameNode, linkingConfig.resolverAddress);
            humanLog(`  Tx: ${chalk.dim(tx.hash)}`);
            await tx.wait();
          } else {
            const registry = new ethers.Contract(ENS_REGISTRY, ENS_REGISTRY_ABI, wallet);
            statusLog(chalk.dim(`  Setting resolver via ENS Registry...`));
            const tx = await registry.setResolver(ensNameNode, linkingConfig.resolverAddress);
            humanLog(`  Tx: ${chalk.dim(tx.hash)}`);
            await tx.wait();
          }
          humanLog(chalk.green(`  Resolver set to ${linkingConfig.type === "linked" ? "IDLinkedResolver" : "IDUnifiedResolver"}.`));
        }
        humanLog("");
      }

      if (!isDryRun()) {
        humanLog(chalk.green.bold(`${ensName} is now linked to ${resolved.domain}.`));
        humanLog(chalk.dim(`Resolving ${ensName} will return ${resolved.domain}'s records.`));

        outputSuccess({
          ensName,
          ensNameNode,
          agentName: resolved.domain,
          agentNode,
          agentChainId: resolved.chainId,
          resolverType: linkingConfig.type,
          resolverAddress: linkingConfig.resolverAddress,
        }, { chain: agentConfig.name, chainId: resolved.chainId });
      }
    } catch (err: any) {
      handleErrorJson(err);
    }
  });
