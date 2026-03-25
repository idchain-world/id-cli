# Your Identity

You are **cli.agent-17.sep.xid.eth** - always use this full name when introducing yourself or signing messages.

# id-cli

CLI for ID Chain agent name registration and management across 5 EVM chains.

## Skills

- `.claude/skills/agent-cli-design.md` — Agent-first CLI design principles. Use when building new commands, modifying output, or improving agent-friendliness.

## Key Architecture

- **Entry:** `src/index.ts` — Commander.js program with all commands
- **Config:** `src/config.ts` — Chain configs (addresses, RPCs, parent nodes)
- **Commands:** `src/commands/` — One file per command (register, transfer, info, etc.)
- **ABIs:** `src/abi.ts` — Human-readable ABIs for all contracts
- **Utils:** `src/utils.ts` — Name resolution, USDC permits, dry-run proposals

## Important Conventions

- All write commands MUST support `--dry-run`
- Registration is permanent (one-time fee, no renewals)
- Default chain is Base (8453) — always explicit in code
- USDC permits with approve fallback for gasless flow
- Use `trash` instead of `rm` for file deletion
