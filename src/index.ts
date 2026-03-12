#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import { registerCommand } from "./commands/register.js";
import { renewCommand } from "./commands/renew.js";
import { transferCommand } from "./commands/transfer.js";
import { infoCommand } from "./commands/info.js";
import { recordsCommand, setTextCommand, setAddrCommand, setContenthashCommand } from "./commands/records.js";
import { createSubnameCommand, listSubnamesCommand } from "./commands/subname.js";
import { exploreCommand } from "./commands/explore.js";
import { mintCommand } from "./commands/mint.js";
import { registerAgentCommand, linkAgentCommand } from "./commands/agent.js";

const program = new Command();

program
  .name("idcli")
  .description(
    "CLI for ID Chain agent name registration and management\n\n" +
    "Add --dry-run to any write command to see the transaction\n" +
    "proposal (calldata, contract, function) without executing."
  )
  .version("0.1.0");

program.addCommand(registerCommand);
program.addCommand(renewCommand);
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
program.addCommand(exploreCommand);
program.addCommand(mintCommand);

program.parse();
