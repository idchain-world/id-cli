import { Command } from "commander";
import chalk from "chalk";
import { resolveChain, getChainConfig, CHAIN_CONFIGS } from "../config.js";
import { indexerFetch } from "../utils.js";

// Root/parent nodes that aren't agent names
const HIDDEN_NAMES = new Set([
  "eth", "xid.eth", "eth.xid.eth", "base.xid.eth", "op.xid.eth", "arb.xid.eth",
]);

export const exploreCommand = new Command("explore")
  .description("List registered agent names")
  .option("-c, --chain <chain>", "Filter by chain (e.g., base, op, eth, arb, sepolia)")
  .option("-l, --limit <n>", "Number of results", "20")
  .option("-o, --offset <n>", "Offset for pagination", "0")
  .option("--owner <address>", "Filter by owner address")
  .action(async (opts) => {
    try {
      const filterByChain = !!opts.chain;
      const chainId = opts.chain ? resolveChain(opts.chain) : undefined;
      const config = chainId ? getChainConfig(chainId) : undefined;

      // Request extra to account for filtered entries
      const requestLimit = parseInt(opts.limit) + 50;
      let path: string;
      if (opts.owner) {
        path = `/api/domains/by-owner/${opts.owner}?limit=${requestLimit}&offset=${opts.offset}`;
      } else {
        path = `/api/domains?limit=${requestLimit}&offset=${opts.offset}`;
      }

      const res = await indexerFetch(path);
      if (!res.ok) {
        console.error(chalk.red(`Indexer error: ${res.status}. Set INDEXER_API_KEY env var for protected endpoints.`));
        process.exit(1);
      }

      const data = await res.json();
      const allDomains = data.domains || data || [];

      const suffixes = Object.values(CHAIN_CONFIGS).map(c => c.suffix);

      const filtered = allDomains.filter((d: any) => {
        const name: string = d.name || "";
        // Hide root/parent nodes
        if (HIDDEN_NAMES.has(name)) return false;
        // Hide null entries
        if (name.startsWith("null.")) return false;
        // Must end with a known chain suffix
        if (!suffixes.some(s => name.endsWith(s))) return false;
        // Chain filter if specified
        if (filterByChain && config) {
          return name.endsWith(config.suffix);
        }
        return true;
      });

      const limit = parseInt(opts.limit);
      const displayed = filtered.slice(0, limit);

      if (!displayed.length) {
        console.log(chalk.dim("No names found."));
        return;
      }

      const heading = filterByChain && config
        ? `Agent names on ${config.name}`
        : "Agent names";
      console.log(chalk.bold(`${heading}\n`));
      for (const d of displayed) {
        const name = d.name || d.label;
        const owner = d.owner ? chalk.dim(` ${d.owner.slice(0, 6)}...${d.owner.slice(-4)}`) : "";
        console.log(`  ${name}${owner}`);
      }

      console.log(chalk.dim(`\n${displayed.length} names shown`));
    } catch (err: any) {
      console.error(chalk.red(err.message));
      process.exit(1);
    }
  });
