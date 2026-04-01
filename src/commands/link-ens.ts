import { Command } from "commander";
import { ethers } from "ethers";
import chalk from "chalk";
import { getConfig, CHAIN_ID } from "../config.js";
import { getWallet } from "../provider.js";
import {
  REGISTRY_ABI,
  ENS_REGISTRY_ABI,
  ENS_NAME_WRAPPER_ABI,
  ID_UNIFIED_RESOLVER_ABI,
} from "../abi.js";
import { resolveNameAsync, isDryRun, proposeTx, CliError, ExitCode, labelhash } from "../utils.js";
import { outputSuccess, handleErrorJson, humanLog, statusLog } from "../output.js";

// ── ENS contract addresses ──────────────────────────────────────────────────

const ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";

const ENS_NAME_WRAPPER_ADDR = "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401";

// Base agents use the unified resolver on mainnet (CCIP-Read)
const UNIFIED_RESOLVER = "0xf4606833A389e8394b8c5ce1B3DeEB9f0B4c7F1a";
const RESOLVER_CHAIN_ID = 1; // Resolver lives on L1

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
  provider: ethers.Provider,
): Promise<{ owner: string | null; isWrapped: boolean }> {
  const registry = new ethers.Contract(ENS_REGISTRY, ENS_REGISTRY_ABI, provider);
  let ownerAddr = await registry.owner(ensNameNode);

  let isWrapped = false;
  if (ownerAddr.toLowerCase() === ENS_NAME_WRAPPER_ADDR.toLowerCase()) {
    isWrapped = true;
    const wrapper = new ethers.Contract(ENS_NAME_WRAPPER_ADDR, ENS_NAME_WRAPPER_ABI, provider);
    ownerAddr = await wrapper.ownerOf(ensNameNode);
  }

  if (ownerAddr === ethers.ZeroAddress) return { owner: null, isWrapped };
  return { owner: ownerAddr, isWrapped };
}

// ── Command ─────────────────────────────────────────────────────────────────

export const linkEnsCommand = new Command("link-ens")
  .description("Link a .eth name to an agent ID (forward link + back-link + resolver)")
  .argument("<ens-name>", "ENS name to link (e.g., alice.eth)")
  .argument("<agent-name>", "Agent name to link to (e.g., agent-0.xid.eth)")
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
      const agentConfig = getConfig();

      const ensNameNode = ensNamehash(ensName);
      const agentNode = resolved.node;

      humanLog(chalk.bold("Link ENS Name"));
      humanLog(`  ENS name:   ${chalk.bold(ensName)}`);
      humanLog(`  Agent:      ${chalk.bold(resolved.domain)}`);
      humanLog(`  Resolver:   IDUnifiedResolver`);
      humanLog(`             ${UNIFIED_RESOLVER}`);
      humanLog("");

      const stepFilter = opts.step ? parseInt(opts.step, 10) : null;

      // ── Step 1: Set back-link on Base ──────────────────────────────────

      if (!stepFilter || stepFilter === 1) {
        humanLog(chalk.bold("Step 1: Set back-link on agent"));
        humanLog(chalk.dim(`  Sets ens-link[${ensName}] = "true" on Base`));

        const backLinkKey = `ens-link[${ensName}]`;

        if (isDryRun()) {
          proposeTx({
            action: `Set back-link: ens-link[${ensName}] = "true"`,
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
          const wallet = getWallet();
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

      // ── Step 2: Set forward link on resolver (L1) ────────────────────

      if (!stepFilter || stepFilter === 2) {
        humanLog(chalk.bold("Step 2: Set forward link on resolver"));
        humanLog(chalk.dim(`  Links ${ensName} → ${resolved.domain} on Ethereum`));

        if (isDryRun()) {
          proposeTx({
            action: `Set forward link: ${ensName} → ${resolved.domain}`,
            contractName: "IDUnifiedResolver",
            contractAddress: UNIFIED_RESOLVER,
            functionAbi: "function setLink(bytes32 ensNode, uint256 chainId, bytes32 agentNode)",
            args: [ensNameNode, CHAIN_ID, agentNode],
            argLabels: ["ensNode", "chainId", "agentNode"],
            notes: [
              `ENS name: ${ensName} (${ensNameNode})`,
              `Agent: ${resolved.domain} (${agentNode})`,
              `Agent chain: Base (${CHAIN_ID})`,
              `Caller must be the ENS name owner.`,
            ],
          });
        } else {
          // Need L1 wallet for resolver interaction
          const pk = process.env.PRIVATE_KEY;
          if (!pk) {
            throw new CliError("Forward link requires PRIVATE_KEY (L1 Ethereum transaction).", ExitCode.AUTH_ERROR);
          }
          const l1Rpc = process.env.RPC_URL_ETH || "https://ethereum-rpc.publicnode.com";
          const l1Provider = new ethers.JsonRpcProvider(l1Rpc);
          const wallet = new ethers.Wallet(pk, l1Provider);

          const resolver = new ethers.Contract(UNIFIED_RESOLVER, ID_UNIFIED_RESOLVER_ABI, wallet);
          statusLog(chalk.dim(`  Calling setLink(${ensNameNode.slice(0, 10)}..., ${CHAIN_ID}, ${agentNode.slice(0, 10)}...)...`));
          const tx = await resolver.setLink(ensNameNode, CHAIN_ID, agentNode);
          humanLog(`  Tx: ${chalk.dim(tx.hash)}`);
          await tx.wait();
          humanLog(chalk.green(`  Forward link set.`));
        }
        humanLog("");
      }

      // ── Step 3: Set resolver on .eth name (L1) ────────────────────────

      if (!stepFilter || stepFilter === 3) {
        humanLog(chalk.bold("Step 3: Set resolver on ENS name"));
        humanLog(chalk.dim(`  Points ${ensName}'s resolver to IDUnifiedResolver on Ethereum`));

        if (isDryRun()) {
          proposeTx({
            action: `Set resolver on ${ensName} to linking resolver`,
            contractName: "ENS Registry",
            contractAddress: ENS_REGISTRY,
            functionAbi: "function setResolver(bytes32 node, address resolver)",
            args: [ensNameNode, UNIFIED_RESOLVER],
            argLabels: ["node", "resolver"],
            notes: [
              `ENS name: ${ensName}`,
              `Resolver: ${UNIFIED_RESOLVER}`,
              `For wrapped names, uses NameWrapper.setResolver() instead.`,
            ],
          });
        } else {
          const pk = process.env.PRIVATE_KEY;
          if (!pk) {
            throw new CliError("Setting resolver requires PRIVATE_KEY (L1 Ethereum transaction).", ExitCode.AUTH_ERROR);
          }
          const l1Rpc = process.env.RPC_URL_ETH || "https://ethereum-rpc.publicnode.com";
          const l1Provider = new ethers.JsonRpcProvider(l1Rpc);
          const wallet = new ethers.Wallet(pk, l1Provider);

          // Check if name is wrapped
          const { owner: ensOwner, isWrapped } = await checkEnsOwnership(ensNameNode, l1Provider);

          if (!ensOwner) {
            throw new CliError(`${ensName} is not registered on ENS.`, ExitCode.NOT_FOUND);
          }

          if (ensOwner.toLowerCase() !== wallet.address.toLowerCase()) {
            throw new CliError(
              `You don't own ${ensName} on ENS. Owner: ${ensOwner}`,
              ExitCode.AUTH_ERROR,
            );
          }

          if (isWrapped) {
            const wrapper = new ethers.Contract(ENS_NAME_WRAPPER_ADDR, ENS_NAME_WRAPPER_ABI, wallet);
            statusLog(chalk.dim(`  Setting resolver via NameWrapper (wrapped name)...`));
            const tx = await wrapper.setResolver(ensNameNode, UNIFIED_RESOLVER);
            humanLog(`  Tx: ${chalk.dim(tx.hash)}`);
            await tx.wait();
          } else {
            const registry = new ethers.Contract(ENS_REGISTRY, ENS_REGISTRY_ABI, wallet);
            statusLog(chalk.dim(`  Setting resolver via ENS Registry...`));
            const tx = await registry.setResolver(ensNameNode, UNIFIED_RESOLVER);
            humanLog(`  Tx: ${chalk.dim(tx.hash)}`);
            await tx.wait();
          }
          humanLog(chalk.green(`  Resolver set to IDUnifiedResolver.`));
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
          resolverType: "unified",
          resolverAddress: UNIFIED_RESOLVER,
        });
      }
    } catch (err: any) {
      handleErrorJson(err);
    }
  });
