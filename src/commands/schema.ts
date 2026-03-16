import { Command } from "commander";

interface ParamSchema {
  name: string;
  type: string;
  required: boolean;
  description: string;
  default?: string;
}

interface CommandSchema {
  name: string;
  description: string;
  arguments: ParamSchema[];
  options: ParamSchema[];
}

function extractSchema(cmd: Command): CommandSchema {
  const args: ParamSchema[] = (cmd as any)._args?.map((a: any) => ({
    name: a.name(),
    type: "string",
    required: a.required,
    description: a.description || "",
  })) || [];

  const options: ParamSchema[] = (cmd.options || [])
    .filter((o: any) => o.long !== "--help")
    .map((o: any) => ({
      name: o.long?.replace(/^--/, "") || o.short?.replace(/^-/, ""),
      type: o.optional || o.required ? "string" : "boolean",
      required: o.mandatory || false,
      description: o.description || "",
      ...(o.defaultValue !== undefined ? { default: String(o.defaultValue) } : {}),
    }));

  return {
    name: cmd.name(),
    description: cmd.description(),
    arguments: args,
    options,
  };
}

export const schemaCommand = new Command("schema")
  .description("Show CLI schema for agent introspection")
  .argument("[command]", "Show schema for a specific command")
  .action((_cmdName, _opts, cmd) => {
    const parent = cmd.parent as Command;
    const commands = parent.commands
      .filter((c: Command) => c.name() !== "schema" && c.name() !== "help")
      .map(extractSchema);

    if (_cmdName) {
      const match = commands.find(c => c.name === _cmdName);
      if (!match) {
        console.log(JSON.stringify({ error: `Unknown command: ${_cmdName}` }));
        process.exit(1);
      }
      console.log(JSON.stringify(match, null, 2));
      return;
    }

    console.log(JSON.stringify({
      cli: "id-cli",
      version: parent.version(),
      commands,
    }, null, 2));
  });
