import { Command } from "commander";
import { ethers } from "ethers";
import chalk from "chalk";
import { getConfig } from "../config.js";
import { getWallet } from "../provider.js";
import { REGISTRY_ABI } from "../abi.js";
import { resolveNameAsync, isDryRun, proposeTx, verifyOwnership, CliError, ExitCode } from "../utils.js";
import { outputSuccess, handleErrorJson, humanLog, statusLog } from "../output.js";
import { encodeAddressToBytes } from "../address-encoding.js";

export const setRecordCommand = new Command("set-record")
  .description("Bulk update records in a single transaction via setRecord")
  .argument("<name>", "Name (e.g., agent-0, neo.agent-0, agent-0.xid.eth)")
  .option("--text <pairs...>", "Text records as key=value pairs")
  .option("--addr <pairs...>", "Address records as coinType=address pairs (e.g., 60=0x...)")
  .option("--contenthash <hash>", "Content hash (hex)")
  .option("--data <pairs...>", "Data records as key=hexvalue pairs")
  .option("--dry-run", "Show transaction proposal without executing")
  .action(async (name, opts) => {
    try {
      const resolved = await resolveNameAsync(name);
      const config = getConfig();

      // Parse text records
      const textKeys: string[] = [];
      const textValues: string[] = [];
      if (opts.text) {
        for (const pair of opts.text) {
          const eq = pair.indexOf("=");
          if (eq === -1) throw new CliError(`Invalid text record: "${pair}". Use key=value format.`, ExitCode.INPUT_ERROR);
          textKeys.push(pair.slice(0, eq));
          textValues.push(pair.slice(eq + 1));
        }
      }

      // Parse address records
      const coinTypes: bigint[] = [];
      const addresses: string[] = [];
      const addrBytesEncoded: Uint8Array[] = [];
      if (opts.addr) {
        for (const pair of opts.addr) {
          const eq = pair.indexOf("=");
          if (eq === -1) throw new CliError(`Invalid addr record: "${pair}". Use coinType=address format.`, ExitCode.INPUT_ERROR);
          const ct = parseInt(pair.slice(0, eq), 10);
          if (isNaN(ct) || ct < 0) throw new CliError(`Invalid coin type: "${pair.slice(0, eq)}".`, ExitCode.INPUT_ERROR);
          coinTypes.push(BigInt(ct));
          const addrStr = pair.slice(eq + 1);
          addresses.push(addrStr);
          addrBytesEncoded.push(encodeAddressToBytes(addrStr, ct));
        }
      }

      // Parse data records
      const dataKeys: string[] = [];
      const dataValues: string[] = [];
      if (opts.data) {
        for (const pair of opts.data) {
          const eq = pair.indexOf("=");
          if (eq === -1) throw new CliError(`Invalid data record: "${pair}". Use key=hexvalue format.`, ExitCode.INPUT_ERROR);
          dataKeys.push(pair.slice(0, eq));
          dataValues.push(pair.slice(eq + 1));
        }
      }

      const contentHash = opts.contenthash || "0x";

      const totalRecords = textKeys.length + coinTypes.length + dataKeys.length + (contentHash !== "0x" ? 1 : 0);
      if (totalRecords === 0) {
        throw new CliError("No records specified. Use --text, --addr, --contenthash, or --data.", ExitCode.INPUT_ERROR);
      }

      // Addresses already encoded to bytes during parsing
      const addrBytes = addrBytesEncoded;

      const dataValueBytes = dataValues.map((v) => ethers.getBytes(v));

      if (isDryRun()) {
        proposeTx({
          action: `Bulk set ${totalRecords} record(s) on ${resolved.domain}`,
          contractName: "IDRegistry",
          contractAddress: config.ID_REGISTRY,
          functionAbi: "function setRecord(bytes32 node, string[] keys, string[] values, uint256[] coinTypes, bytes[] addresses, bytes contentHash, string[] dataKeys, bytes[] dataValues)",
          args: [resolved.node, textKeys, textValues, coinTypes, addrBytes, contentHash, dataKeys, dataValueBytes],
          argLabels: ["node", "textKeys", "textValues", "coinTypes", "addresses", "contentHash", "dataKeys", "dataValues"],
          notes: [
            ...textKeys.map((k, i) => `text: ${k} = ${textValues[i]}`),
            ...coinTypes.map((ct, i) => `addr: coin ${ct} = ${addresses[i]}`),
            ...(contentHash !== "0x" ? [`contenthash: ${contentHash}`] : []),
            ...dataKeys.map((k, i) => `data: ${k} = ${dataValues[i]}`),
          ],
        });
        return;
      }

      const wallet = getWallet();
      const registry = new ethers.Contract(config.ID_REGISTRY, REGISTRY_ABI, wallet);
      await verifyOwnership(registry, resolved.node, wallet, resolved.domain);

      statusLog(chalk.dim(`Setting ${totalRecords} record(s) on ${resolved.domain}...`));
      const tx = await registry.setRecord(
        resolved.node,
        textKeys, textValues,
        coinTypes, addrBytes,
        contentHash,
        dataKeys, dataValueBytes,
      );
      humanLog(`Tx: ${chalk.dim(tx.hash)}`);
      await tx.wait();

      for (let i = 0; i < textKeys.length; i++) {
        humanLog(chalk.green(`  text: ${textKeys[i]} = ${textValues[i]}`));
      }
      for (let i = 0; i < coinTypes.length; i++) {
        humanLog(chalk.green(`  addr: coin ${coinTypes[i]} = ${addresses[i]}`));
      }
      if (contentHash !== "0x") {
        humanLog(chalk.green(`  contenthash: ${contentHash}`));
      }
      for (let i = 0; i < dataKeys.length; i++) {
        humanLog(chalk.green(`  data: ${dataKeys[i]} = ${dataValues[i]}`));
      }

      outputSuccess({
        domain: resolved.domain,
        textRecords: textKeys.map((k, i) => ({ key: k, value: textValues[i] })),
        addressRecords: coinTypes.map((ct, i) => ({ coinType: ct.toString(), address: addresses[i] })),
        contenthash: contentHash !== "0x" ? contentHash : null,
        dataRecords: dataKeys.map((k, i) => ({ key: k, value: dataValues[i] })),
        txHash: tx.hash,
      });
    } catch (err: any) {
      handleErrorJson(err);
    }
  });
