import { Command } from "commander";
import { ethers } from "ethers";
import chalk from "chalk";
import { getChainConfig } from "../config.js";
import { getWallet, getProvider } from "../provider.js";
import { REGISTRY_ABI } from "../abi.js";
import { resolveName, indexerFetch, isDryRun, proposeTx, parsePositiveInt, verifyOwnership } from "../utils.js";
import { outputSuccess, handleErrorJson, humanLog, statusLog } from "../output.js";

export const recordsCommand = new Command("records")
  .description("Show all records for a name")
  .argument("<name>", "Name (e.g., agent-0, neo.agent-0, agent-0.base.xid.eth)")
  .option("-c, --chain <chain>", "Chain", "base")
  .option("--select <fields>", "Comma-separated fields to include (text,address,data,contenthash)")
  .action(async (name, opts) => {
    try {
      const resolved = resolveName(name, opts.chain);

      humanLog(chalk.bold(`Records for ${resolved.domain}\n`));

      const res = await indexerFetch(`/api/domains/${resolved.node}/records`);
      if (!res.ok) {
        const config = getChainConfig(resolved.chainId);
        const provider = getProvider(resolved.chainId);
        const registry = new ethers.Contract(config.ID_REGISTRY, REGISTRY_ABI, provider);
        const ethAddr = await registry.getFunction("addr(bytes32)").staticCall(resolved.node).catch(() => null);
        if (ethAddr && ethAddr !== ethers.ZeroAddress) {
          humanLog(`ETH address: ${ethAddr}`);
        }
        outputSuccess({ domain: resolved.domain, ethAddress: ethAddr || null }, { chainId: resolved.chainId });
        return;
      }

      const records = await res.json();
      const fields = opts.select
        ? new Set(opts.select.split(",").map((s: string) => s.trim()))
        : null;
      const showAll = !fields;

      if ((showAll || fields?.has("text")) && records.textRecords?.length) {
        humanLog(chalk.dim("Text Records:"));
        for (const r of records.textRecords) {
          humanLog(`  ${chalk.bold(r.key)}: ${r.value}`);
        }
      } else if (showAll) {
        humanLog(chalk.dim("No text records."));
      }

      if ((showAll || fields?.has("address")) && records.addressRecords?.length) {
        humanLog(chalk.dim("\nAddress Records:"));
        for (const r of records.addressRecords) {
          humanLog(`  ${chalk.bold(`coin ${r.coinType}`)}: ${r.address}`);
        }
      }

      if ((showAll || fields?.has("data")) && records.dataRecords?.length) {
        humanLog(chalk.dim("\nData Records:"));
        for (const r of records.dataRecords) {
          humanLog(`  ${chalk.bold(r.key)}: ${r.value}`);
        }
      }

      if ((showAll || fields?.has("contenthash")) && records.contenthash && records.contenthash !== "0x") {
        humanLog(chalk.dim(`\nContent hash: ${records.contenthash}`));
      }

      const data: any = { domain: resolved.domain };
      if (showAll || fields?.has("text")) data.textRecords = records.textRecords || [];
      if (showAll || fields?.has("address")) data.addressRecords = records.addressRecords || [];
      if (showAll || fields?.has("data")) data.dataRecords = records.dataRecords || [];
      if (showAll || fields?.has("contenthash")) data.contenthash = records.contenthash || null;
      outputSuccess(data, { chainId: resolved.chainId });
    } catch (err: any) {
      handleErrorJson(err);
    }
  });

export const setTextCommand = new Command("set-text")
  .description("Set a text record on a name")
  .argument("<name>", "Name (e.g., agent-0, neo.agent-0, agent-0.base.xid.eth)")
  .argument("<key>", "Record key")
  .argument("<value>", "Record value")
  .option("-c, --chain <chain>", "Chain", "base")
  .option("--dry-run", "Show transaction proposal without executing")
  .action(async (name, key, value, opts) => {
    try {
      const resolved = resolveName(name, opts.chain);
      const config = getChainConfig(resolved.chainId);

      if (isDryRun()) {
        proposeTx({
          action: `Set text record "${key}" on ${resolved.domain}`,
          chainId: resolved.chainId,
          contractName: "IDRegistry",
          contractAddress: config.ID_REGISTRY,
          functionAbi: "function setText(bytes32 node, string key, string value)",
          args: [resolved.node, key, value],
          argLabels: ["node", "key", "value"],
        });
        return;
      }

      const wallet = getWallet(resolved.chainId);
      const registry = new ethers.Contract(config.ID_REGISTRY, REGISTRY_ABI, wallet);
      await verifyOwnership(registry, resolved.node, wallet, resolved.domain);

      statusLog(chalk.dim(`Setting ${key} on ${resolved.domain}...`));
      const tx = await registry.setText(resolved.node, key, value);
      humanLog(`Tx: ${chalk.dim(tx.hash)}`);
      await tx.wait();
      humanLog(chalk.green(`Set ${chalk.bold(key)} = ${value}`));
      outputSuccess({
        domain: resolved.domain,
        key,
        value,
        txHash: tx.hash,
      }, { chainId: resolved.chainId });
    } catch (err: any) {
      handleErrorJson(err);
    }
  });

export const setAddrCommand = new Command("set-addr")
  .description("Set an address record on a name")
  .argument("<name>", "Name (e.g., agent-0, neo.agent-0, agent-0.base.xid.eth)")
  .argument("<address>", "Address value")
  .option("-c, --chain <chain>", "Chain", "base")
  .option("--coin-type <type>", "Coin type (default: 60 for ETH)", "60")
  .option("--dry-run", "Show transaction proposal without executing")
  .action(async (name, address, opts) => {
    try {
      const resolved = resolveName(name, opts.chain);
      const config = getChainConfig(resolved.chainId);
      const coinType = parsePositiveInt(opts.coinType, "--coin-type");

      if (isDryRun()) {
        if (coinType === 60) {
          proposeTx({
            action: `Set ETH address on ${resolved.domain}`,
            chainId: resolved.chainId,
            contractName: "IDRegistry",
            contractAddress: config.ID_REGISTRY,
            functionAbi: "function setAddr(bytes32 node, address addr)",
            args: [resolved.node, address],
            argLabels: ["node", "addr"],
          });
        } else {
          const addrBytes = ethers.getBytes(address);
          proposeTx({
            action: `Set coin ${coinType} address on ${resolved.domain}`,
            chainId: resolved.chainId,
            contractName: "IDRegistry",
            contractAddress: config.ID_REGISTRY,
            functionAbi: "function setAddr(bytes32 node, uint256 coinType, bytes newAddress)",
            args: [resolved.node, coinType, addrBytes],
            argLabels: ["node", "coinType", "newAddress"],
          });
        }
        return;
      }

      const wallet = getWallet(resolved.chainId);
      const registry = new ethers.Contract(config.ID_REGISTRY, REGISTRY_ABI, wallet);
      await verifyOwnership(registry, resolved.node, wallet, resolved.domain);

      if (coinType === 60) {
        statusLog(chalk.dim(`Setting ETH address on ${resolved.domain}...`));
        const tx = await registry.getFunction("setAddr(bytes32,address)").send(resolved.node, address);
        humanLog(`Tx: ${chalk.dim(tx.hash)}`);
        await tx.wait();
        humanLog(chalk.green(`Set ETH address to ${address}`));
        outputSuccess({ domain: resolved.domain, coinType, address, txHash: tx.hash }, { chainId: resolved.chainId });
      } else {
        statusLog(chalk.dim(`Setting coin ${coinType} address on ${resolved.domain}...`));
        const addrBytes = ethers.getBytes(address);
        const tx = await registry.getFunction("setAddr(bytes32,uint256,bytes)").send(resolved.node, coinType, addrBytes);
        humanLog(`Tx: ${chalk.dim(tx.hash)}`);
        await tx.wait();
        humanLog(chalk.green(`Set coin ${coinType} address.`));
        outputSuccess({ domain: resolved.domain, coinType, address, txHash: tx.hash }, { chainId: resolved.chainId });
      }
    } catch (err: any) {
      handleErrorJson(err);
    }
  });

export const setContenthashCommand = new Command("set-contenthash")
  .description("Set the content hash on a name")
  .argument("<name>", "Name (e.g., agent-0, neo.agent-0, agent-0.base.xid.eth)")
  .argument("<hash>", "Content hash (hex)")
  .option("-c, --chain <chain>", "Chain", "base")
  .option("--dry-run", "Show transaction proposal without executing")
  .action(async (name, hash, opts) => {
    try {
      const resolved = resolveName(name, opts.chain);
      const config = getChainConfig(resolved.chainId);

      if (isDryRun()) {
        proposeTx({
          action: `Set content hash on ${resolved.domain}`,
          chainId: resolved.chainId,
          contractName: "IDRegistry",
          contractAddress: config.ID_REGISTRY,
          functionAbi: "function setContenthash(bytes32 node, bytes hash)",
          args: [resolved.node, hash],
          argLabels: ["node", "hash"],
        });
        return;
      }

      const wallet = getWallet(resolved.chainId);
      const registry = new ethers.Contract(config.ID_REGISTRY, REGISTRY_ABI, wallet);
      await verifyOwnership(registry, resolved.node, wallet, resolved.domain);

      statusLog(chalk.dim(`Setting content hash on ${resolved.domain}...`));
      const tx = await registry.setContenthash(resolved.node, hash);
      humanLog(`Tx: ${chalk.dim(tx.hash)}`);
      await tx.wait();
      humanLog(chalk.green("Content hash updated."));
      outputSuccess({ domain: resolved.domain, contenthash: hash, txHash: tx.hash }, { chainId: resolved.chainId });
    } catch (err: any) {
      handleErrorJson(err);
    }
  });
