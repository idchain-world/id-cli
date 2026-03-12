import { Command } from "commander";
import { ethers } from "ethers";
import chalk from "chalk";
import { resolveChain, getChainConfig } from "../config.js";
import { getWallet, getProvider } from "../provider.js";
import { REGISTRY_ABI } from "../abi.js";
import { getNodeForLabel, formatDomainName, indexerFetch } from "../utils.js";

const getCmd = new Command("get")
  .description("Get records for a name")
  .argument("<label>", "Agent label")
  .option("-c, --chain <chain>", "Chain", "base")
  .action(async (label, opts) => {
    try {
      const chainId = resolveChain(opts.chain);
      const node = getNodeForLabel(label, chainId);
      const domain = formatDomainName(label, chainId);

      console.log(chalk.bold(`Records for ${domain}\n`));

      const res = await indexerFetch(`/api/domains/${node}/records`);
      if (!res.ok) {
        // Fallback to onchain
        const config = getChainConfig(chainId);
        const provider = getProvider(chainId);
        const registry = new ethers.Contract(config.ID_REGISTRY, REGISTRY_ABI, provider);
        const ethAddr = await registry.getFunction("addr(bytes32)").staticCall(node).catch(() => null);
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

const setCmd = new Command("set")
  .description("Set a record on a name")
  .argument("<label>", "Agent label")
  .option("-c, --chain <chain>", "Chain", "base")
  .option("--text <key> <value>", "Set text record")
  .option("--address <address>", "Set ETH address record")
  .option("--contenthash <hash>", "Set content hash")
  .action(async (label, opts) => {
    try {
      const chainId = resolveChain(opts.chain);
      const config = getChainConfig(chainId);
      const wallet = getWallet(chainId);
      const node = getNodeForLabel(label, chainId);
      const domain = formatDomainName(label, chainId);

      const registry = new ethers.Contract(config.ID_REGISTRY, REGISTRY_ABI, wallet);

      if (opts.text) {
        // --text is consumed as the next two args
        const args = opts.text;
        // Commander handles this as a single value; we need to parse from rawArgs
        console.error(chalk.red("Use: xid records set-text <label> <key> <value>"));
        process.exit(1);
      }

      if (opts.address) {
        console.log(chalk.dim(`Setting ETH address on ${domain}...`));
        const tx = await registry.getFunction("setAddr(bytes32,address)").send(node, opts.address);
        console.log(`Tx: ${chalk.dim(tx.hash)}`);
        await tx.wait();
        console.log(chalk.green(`Set ETH address to ${opts.address}`));
      }

      if (opts.contenthash) {
        console.log(chalk.dim(`Setting content hash on ${domain}...`));
        const tx = await registry.setContenthash(node, opts.contenthash);
        console.log(`Tx: ${chalk.dim(tx.hash)}`);
        await tx.wait();
        console.log(chalk.green("Content hash updated."));
      }
    } catch (err: any) {
      console.error(chalk.red(err.message));
      process.exit(1);
    }
  });

const setTextCmd = new Command("set-text")
  .description("Set a text record")
  .argument("<label>", "Agent label")
  .argument("<key>", "Record key")
  .argument("<value>", "Record value")
  .option("-c, --chain <chain>", "Chain", "base")
  .action(async (label, key, value, opts) => {
    try {
      const chainId = resolveChain(opts.chain);
      const config = getChainConfig(chainId);
      const wallet = getWallet(chainId);
      const node = getNodeForLabel(label, chainId);
      const domain = formatDomainName(label, chainId);

      const registry = new ethers.Contract(config.ID_REGISTRY, REGISTRY_ABI, wallet);

      console.log(chalk.dim(`Setting ${key} on ${domain}...`));
      const tx = await registry.setText(node, key, value);
      console.log(`Tx: ${chalk.dim(tx.hash)}`);
      await tx.wait();
      console.log(chalk.green(`Set ${chalk.bold(key)} = ${value}`));
    } catch (err: any) {
      console.error(chalk.red(err.message));
      process.exit(1);
    }
  });

const setAddrCmd = new Command("set-addr")
  .description("Set an address record")
  .argument("<label>", "Agent label")
  .argument("<address>", "Address value")
  .option("-c, --chain <chain>", "Chain", "base")
  .option("--coin-type <type>", "Coin type (default: 60 for ETH)", "60")
  .action(async (label, address, opts) => {
    try {
      const chainId = resolveChain(opts.chain);
      const config = getChainConfig(chainId);
      const wallet = getWallet(chainId);
      const node = getNodeForLabel(label, chainId);
      const domain = formatDomainName(label, chainId);

      const registry = new ethers.Contract(config.ID_REGISTRY, REGISTRY_ABI, wallet);

      const coinType = parseInt(opts.coinType);
      if (coinType === 60) {
        console.log(chalk.dim(`Setting ETH address on ${domain}...`));
        const tx = await registry.getFunction("setAddr(bytes32,address)").send(node, address);
        console.log(`Tx: ${chalk.dim(tx.hash)}`);
        await tx.wait();
        console.log(chalk.green(`Set ETH address to ${address}`));
      } else {
        console.log(chalk.dim(`Setting coin ${coinType} address on ${domain}...`));
        const addrBytes = ethers.getBytes(address);
        const tx = await registry.getFunction("setAddr(bytes32,uint256,bytes)").send(node, coinType, addrBytes);
        console.log(`Tx: ${chalk.dim(tx.hash)}`);
        await tx.wait();
        console.log(chalk.green(`Set coin ${coinType} address.`));
      }
    } catch (err: any) {
      console.error(chalk.red(err.message));
      process.exit(1);
    }
  });

export const recordsCommand = new Command("records")
  .description("Get or set records for a name")
  .addCommand(getCmd)
  .addCommand(setCmd)
  .addCommand(setTextCmd)
  .addCommand(setAddrCmd);
