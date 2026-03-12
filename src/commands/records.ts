import { Command } from "commander";
import { ethers } from "ethers";
import chalk from "chalk";
import { getChainConfig } from "../config.js";
import { getWallet, getProvider } from "../provider.js";
import { REGISTRY_ABI } from "../abi.js";
import { resolveName, indexerFetch } from "../utils.js";

export const recordsCommand = new Command("records")
  .description("Show all records for a name")
  .argument("<name>", "Name (e.g., agent-0, neo.agent-0, agent-0.base.xid.eth)")
  .option("-c, --chain <chain>", "Chain", "base")
  .action(async (name, opts) => {
    try {
      const resolved = resolveName(name, opts.chain);

      console.log(chalk.bold(`Records for ${resolved.domain}\n`));

      const res = await indexerFetch(`/api/domains/${resolved.node}/records`);
      if (!res.ok) {
        const config = getChainConfig(resolved.chainId);
        const provider = getProvider(resolved.chainId);
        const registry = new ethers.Contract(config.ID_REGISTRY, REGISTRY_ABI, provider);
        const ethAddr = await registry.getFunction("addr(bytes32)").staticCall(resolved.node).catch(() => null);
        if (ethAddr && ethAddr !== ethers.ZeroAddress) {
          console.log(`ETH address: ${ethAddr}`);
        }
        return;
      }

      const records = await res.json();
      if (records.textRecords?.length) {
        console.log(chalk.dim("Text Records:"));
        for (const r of records.textRecords) {
          console.log(`  ${chalk.bold(r.key)}: ${r.value}`);
        }
      } else {
        console.log(chalk.dim("No text records."));
      }

      if (records.addressRecords?.length) {
        console.log(chalk.dim("\nAddress Records:"));
        for (const r of records.addressRecords) {
          console.log(`  ${chalk.bold(`coin ${r.coinType}`)}: ${r.address}`);
        }
      }

      if (records.dataRecords?.length) {
        console.log(chalk.dim("\nData Records:"));
        for (const r of records.dataRecords) {
          console.log(`  ${chalk.bold(r.key)}: ${r.value}`);
        }
      }

      if (records.contenthash && records.contenthash !== "0x") {
        console.log(chalk.dim(`\nContent hash: ${records.contenthash}`));
      }
    } catch (err: any) {
      console.error(chalk.red(err.message));
      process.exit(1);
    }
  });

export const setTextCommand = new Command("set-text")
  .description("Set a text record on a name")
  .argument("<name>", "Name (e.g., agent-0, neo.agent-0, agent-0.base.xid.eth)")
  .argument("<key>", "Record key")
  .argument("<value>", "Record value")
  .option("-c, --chain <chain>", "Chain", "base")
  .action(async (name, key, value, opts) => {
    try {
      const resolved = resolveName(name, opts.chain);
      const config = getChainConfig(resolved.chainId);
      const wallet = getWallet(resolved.chainId);
      const registry = new ethers.Contract(config.ID_REGISTRY, REGISTRY_ABI, wallet);

      console.log(chalk.dim(`Setting ${key} on ${resolved.domain}...`));
      const tx = await registry.setText(resolved.node, key, value);
      console.log(`Tx: ${chalk.dim(tx.hash)}`);
      await tx.wait();
      console.log(chalk.green(`Set ${chalk.bold(key)} = ${value}`));
    } catch (err: any) {
      console.error(chalk.red(err.message));
      process.exit(1);
    }
  });

export const setAddrCommand = new Command("set-addr")
  .description("Set an address record on a name")
  .argument("<name>", "Name (e.g., agent-0, neo.agent-0, agent-0.base.xid.eth)")
  .argument("<address>", "Address value")
  .option("-c, --chain <chain>", "Chain", "base")
  .option("--coin-type <type>", "Coin type (default: 60 for ETH)", "60")
  .action(async (name, address, opts) => {
    try {
      const resolved = resolveName(name, opts.chain);
      const config = getChainConfig(resolved.chainId);
      const wallet = getWallet(resolved.chainId);
      const registry = new ethers.Contract(config.ID_REGISTRY, REGISTRY_ABI, wallet);

      const coinType = parseInt(opts.coinType);
      if (coinType === 60) {
        console.log(chalk.dim(`Setting ETH address on ${resolved.domain}...`));
        const tx = await registry.getFunction("setAddr(bytes32,address)").send(resolved.node, address);
        console.log(`Tx: ${chalk.dim(tx.hash)}`);
        await tx.wait();
        console.log(chalk.green(`Set ETH address to ${address}`));
      } else {
        console.log(chalk.dim(`Setting coin ${coinType} address on ${resolved.domain}...`));
        const addrBytes = ethers.getBytes(address);
        const tx = await registry.getFunction("setAddr(bytes32,uint256,bytes)").send(resolved.node, coinType, addrBytes);
        console.log(`Tx: ${chalk.dim(tx.hash)}`);
        await tx.wait();
        console.log(chalk.green(`Set coin ${coinType} address.`));
      }
    } catch (err: any) {
      console.error(chalk.red(err.message));
      process.exit(1);
    }
  });

export const setContenthashCommand = new Command("set-contenthash")
  .description("Set the content hash on a name")
  .argument("<name>", "Name (e.g., agent-0, neo.agent-0, agent-0.base.xid.eth)")
  .argument("<hash>", "Content hash (hex)")
  .option("-c, --chain <chain>", "Chain", "base")
  .action(async (name, hash, opts) => {
    try {
      const resolved = resolveName(name, opts.chain);
      const config = getChainConfig(resolved.chainId);
      const wallet = getWallet(resolved.chainId);
      const registry = new ethers.Contract(config.ID_REGISTRY, REGISTRY_ABI, wallet);

      console.log(chalk.dim(`Setting content hash on ${resolved.domain}...`));
      const tx = await registry.setContenthash(resolved.node, hash);
      console.log(`Tx: ${chalk.dim(tx.hash)}`);
      await tx.wait();
      console.log(chalk.green("Content hash updated."));
    } catch (err: any) {
      console.error(chalk.red(err.message));
      process.exit(1);
    }
  });
