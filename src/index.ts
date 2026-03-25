#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import { registerCommand } from "./commands/register.js";
import { transferCommand } from "./commands/transfer.js";
import { infoCommand } from "./commands/info.js";
import { recordsCommand, setTextCommand, setAddrCommand, setContenthashCommand } from "./commands/records.js";
import { createSubnameCommand, listSubnamesCommand } from "./commands/subname.js";
import { exploreCommand } from "./commands/explore.js";
import { mintCommand } from "./commands/mint.js";
import { registerAgentCommand, linkAgentCommand } from "./commands/agent.js";
import { schemaCommand } from "./commands/schema.js";
import { setAgentEndpointsCommand } from "./commands/agent-endpoints.js";
import { setRecordCommand } from "./commands/set-record.js";
import { setReverseCommand } from "./commands/set-reverse.js";
import { registerEnsCommand } from "./commands/register-ens.js";
import { linkEnsCommand } from "./commands/link-ens.js";
import { setHookCommand, getHooksCommand } from "./commands/hooks.js";

const program = new Command();

program
  .name("id-cli")
  .description("CLI for ID Chain agent name registration and management")
  .version("0.2.8")
  .option("--dry-run", "Show transaction proposal without executing")
  .option("--output <format>", "Output format: human or json (default: auto-detect by TTY)");

program.addCommand(registerCommand);
program.addCommand(transferCommand);
program.addCommand(infoCommand);
program.addCommand(recordsCommand);
program.addCommand(setTextCommand);
program.addCommand(setAddrCommand);
program.addCommand(setContenthashCommand);
program.addCommand(createSubnameCommand);
program.addCommand(listSubnamesCommand);
program.addCommand(registerAgentCommand);
program.addCommand(linkAgentCommand);
program.addCommand(setRecordCommand);
program.addCommand(setAgentEndpointsCommand);
program.addCommand(setReverseCommand);
program.addCommand(registerEnsCommand);
program.addCommand(linkEnsCommand);
program.addCommand(setHookCommand);
program.addCommand(getHooksCommand);
program.addCommand(exploreCommand);
program.addCommand(mintCommand);
program.addCommand(schemaCommand);

program.parse();
