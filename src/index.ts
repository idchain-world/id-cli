#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import { registerCommand } from "./commands/register.js";
import { renewCommand } from "./commands/renew.js";
import { transferCommand } from "./commands/transfer.js";
import { infoCommand } from "./commands/info.js";
import { recordsCommand } from "./commands/records.js";
import { subnameCommand } from "./commands/subname.js";
import { exploreCommand } from "./commands/explore.js";
import { mintCommand } from "./commands/mint.js";

const program = new Command();

program
  .name("idcli")
  .description("CLI for ID Chain agent name registration and management")
  .version("0.1.0");

program.addCommand(registerCommand);
program.addCommand(renewCommand);
program.addCommand(transferCommand);
program.addCommand(infoCommand);
program.addCommand(recordsCommand);
program.addCommand(subnameCommand);
program.addCommand(exploreCommand);
program.addCommand(mintCommand);

program.parse();
