import { Command } from "commander";
import chalk from "chalk";
import { getConfig } from "../config.js";
import { indexerFetch, CliError, ExitCode, parseNonNegativeInt } from "../utils.js";
import { outputSuccess, handleErrorJson, humanLog } from "../output.js";

// Root/parent nodes that aren't agent names
const HIDDEN_NAMES = new Set([
  "xid.eth",
]);

export const exploreCommand = new Command("explore")
  .description("List registered agent names")
  .option("-s, --search <query>", "Search by name or label substring")
  .option("-l, --limit <n>", "Number of results", "20")
  .option("-o, --offset <n>", "Offset for pagination", "0")
  .option("--owner <address>", "Filter by owner address")
  .action(async (opts) => {
    try {
      const config = getConfig();

      // Request extra to account for filtered entries
      const limit = parseNonNegativeInt(opts.limit, "--limit");
      const offset = parseNonNegativeInt(opts.offset, "--offset");
      const requestLimit = limit + 50;
      let path: string;
      if (opts.owner) {
        path = `/api/domains/by-owner/${opts.owner}?limit=${requestLimit}&offset=${offset}`;
      } else {
        const params = new URLSearchParams();
        params.set("limit", requestLimit.toString());
        params.set("offset", offset.toString());
        if (opts.search) params.set("q", opts.search);
        params.set("chain", "base");
        path = `/api/domains?${params}`;
      }

      const res = await indexerFetch(path);
      if (!res.ok) {
        throw new CliError(`Indexer error: ${res.status}. Set INDEXER_API_KEY env var for protected endpoints.`, ExitCode.AUTH_ERROR);
      }

      const data = await res.json();
      const allDomains = data.domains || data || [];

      const filtered = allDomains.filter((d: any) => {
        const name: string = d.name || "";
        // Hide root/parent nodes
        if (HIDDEN_NAMES.has(name)) return false;
        // Hide null entries
        if (name.startsWith("null.")) return false;
        // Must end with .xid.eth
        if (!name.endsWith(config.suffix)) return false;
        return true;
      });

      const displayed = filtered.slice(0, limit);

      if (!displayed.length) {
        humanLog(chalk.dim("No names found."));
        outputSuccess({ names: [], count: 0 });
        return;
      }

      humanLog(chalk.bold("Agent names\n"));
      for (const d of displayed) {
        const name = d.name || d.label;
        const owner = d.owner ? chalk.dim(` ${d.owner.slice(0, 6)}...${d.owner.slice(-4)}`) : "";
        humanLog(`  ${name}${owner}`);
      }

      humanLog(chalk.dim(`\n${displayed.length} names shown`));
      outputSuccess({
        names: displayed.map((d: any) => ({ name: d.name || d.label, owner: d.owner || null })),
        count: displayed.length,
      });
    } catch (err: any) {
      handleErrorJson(err);
    }
  });
