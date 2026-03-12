import { Command } from "commander";
import chalk from "chalk";
import { resolveChain, getChainConfig } from "../config.js";
import { indexerFetch } from "../utils.js";

export const exploreCommand = new Command("explore")
  .description("List registered agent names")
  .option("-c, --chain <chain>", "Chain", "base")
  .option("-l, --limit <n>", "Number of results", "20")
  .option("-o, --offset <n>", "Offset for pagination", "0")
  .option("--owner <address>", "Filter by owner address")
  .action(async (opts) => {
    try {
      const chainId = resolveChain(opts.chain);
      const config = getChainConfig(chainId);

      let path: string;
      if (opts.owner) {
        path = `/api/domains/by-owner/${opts.owner}?limit=${opts.limit}&offset=${opts.offset}&chain=${chainId}`;
      } else {
        path = `/api/domains?limit=${opts.limit}&offset=${opts.offset}&chain=${chainId}`;
      }

      const res = await indexerFetch(path);
      if (!res.ok) {
        console.error(chalk.red(`Indexer error: ${res.status}. Set INDEXER_API_KEY env var for protected endpoints.`));
        process.exit(1);
      }

      const data = await res.json();
      const domains = data.domains || data || [];

      if (!domains.length) {
        console.log(chalk.dim("No names found."));
        return;
      }

      console.log(chalk.bold(`Agent names on ${config.name}\n`));
      for (const d of domains) {
        const name = d.name || `${d.label}${config.suffix}`;
        const owner = d.owner ? chalk.dim(` ${d.owner.slice(0, 6)}...${d.owner.slice(-4)}`) : "";
        console.log(`  ${name}${owner}`);
      }

      if (data.total) {
        console.log(chalk.dim(`\nShowing ${domains.length} of ${data.total}`));
      }
    } catch (err: any) {
      console.error(chalk.red(err.message));
      process.exit(1);
    }
  });
