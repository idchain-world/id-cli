name: agent-cli-design
description: Design principles for making id-cli agent-friendly. Use when building new commands, modifying output formats, adding flags, or improving the CLI for AI agent consumption. Covers structured output, input validation, dry-run patterns, schema introspection, and context window discipline.

---

# Agent-First CLI Design for id-cli

Principles for ensuring id-cli works reliably for both AI agents and humans. Based on agent-first CLI design patterns adapted for onchain identity management.

**Core tension:** Human DX optimizes for discoverability and forgiveness. Agent DX optimizes for predictability and defense-in-depth. id-cli must serve both.

---

## 1. Machine-Readable Output

Every command should support structured output. Agents cannot reliably parse colored chalk text or free-form prose.

**Pattern:**
- Support `--output json` flag on all commands
- Auto-detect: default to JSON when stdout is not a TTY
- Use a stable envelope for all responses:

```json
{
  "status": "ok",
  "data": { ... },
  "metadata": { "chain": "base", "chainId": 8453 }
}
```

**Error envelope (same shape, always):**
```json
{
  "status": "error",
  "error": { "code": "INSUFFICIENT_BALANCE", "message": "..." },
  "metadata": { "chain": "base", "chainId": 8453 }
}
```

**id-cli specifics:**
- Human output (chalk colors, formatting) should go to stderr when `--output json` is set
- Transaction hashes, domain names, and node hashes must always be in the JSON data
- USDC amounts should include both raw (bigint string) and formatted values

---

## 2. Input Validation Against Hallucinations

Agents hallucinate in predictable patterns. Validate defensively — the agent is not a trusted operator.

| Hallucination pattern | Defense for id-cli |
|---|---|
| Invalid Ethereum addresses | Validate checksummed hex, reject non-0x prefixed |
| Invented chain names | Strict chain resolution — reject unknown with valid options listed |
| Path traversal in labels | Reject labels containing `.` `/` `\` or control chars |
| Wrong types (string for bigint) | Type-check all numeric inputs before contract calls |
| Non-existent domain names | Verify onchain ownership before mutations |
| Hallucinated contract addresses | Never accept contract addresses as input — use config only |

**Already implemented:**
- `resolveChain()` rejects unknown chain names with helpful error
- `resolveName()` validates domain suffixes against known chains
- USDC balance check before registration

**Also implemented:**
- `validateLabel()` — alphanumeric + hyphens only
- `validateAddress()` — checksum validation on `--to`, `--owner`, `--referrer`, `--address`
- `verifyOwnership()` — onchain ownership check before mutations
- `parsePositiveInt()` — type-safe numeric parsing for `--limit`, `--offset`, `--coin-type`

---

## 3. Dry-Run for All Mutations

Already implemented via `--dry-run` on write commands. This is critical for agent safety.

**Current dry-run commands:** register, transfer, set-text, set-addr, set-contenthash, create-subname, register-agent, link-agent, mint-usdc

**Dry-run output includes:**
- Contract name and address
- Function signature and selector
- All arguments with labels
- Encoded calldata
- Block explorer verification link

**Rule:** Every new write command MUST support `--dry-run`. No exceptions.

---

## 4. Context Window Discipline

Onchain data and indexer responses can be large. Protect the agent's token budget.

**Patterns to follow:**
- `explore` command already has `--limit` and `--offset` — good
- `records` command returns all records — consider `--select` for specific keys
- `info` command fetches multiple data sources — consider `--brief` for essentials only

**Guidelines for new commands:**
- Default `--limit` to a reasonable bound (20-50)
- Support field selection where applicable
- Never dump unbounded lists

---

## 5. Stable Exit Codes

Define consistent exit codes so agents can branch on failure type:

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | General error (contract revert, network failure) |
| 2 | Usage/input error (bad flags, invalid address) |
| 3 | Auth error (missing PRIVATE_KEY) |
| 4 | Not found (domain not registered) |
| 5 | Insufficient funds (USDC balance too low) |

**Implemented:** `ExitCode` enum and `CliError` class in `utils.ts`. All commands use `handleErrorJson()` which maps `CliError.exitCode` to the correct exit code.

---

## 6. Headless Authentication

Already implemented correctly:
- `PRIVATE_KEY` env var for write operations
- `RPC_URL_*` env vars for custom RPC endpoints
- `INDEXER_URL` env var for custom indexer
- Read-only commands (info, records, explore) work without PRIVATE_KEY
- No browser-based flows required

---

## 7. Schema Introspection

For agent discoverability, consider adding:

```bash
id-cli schema              # dump all commands as JSON
id-cli schema register     # describe register command
id-cli register --describe # same thing
```

**Output should include:**
- All flags with types, defaults, and descriptions
- Which flags are required vs optional
- Which commands need PRIVATE_KEY
- Valid chain names and their IDs

This eliminates the need for agents to have the README in their context.

---

## 8. Safety Invariants for Agent Skill Files

When agents use id-cli, they should know:

- **Always use `--dry-run` before any mutation** to verify the transaction
- **Always check `id-cli info <name>` before transferring** to verify ownership
- **Names are permanent** — there is no undo for registration
- **USDC permit signing is automatic** — no separate approve step needed
- **Default chain is Base** — always specify `--chain` explicitly to avoid mistakes
- **Labels are sequential** — you cannot choose a specific label, only get the next available
- **Referrer address earns 10%** — use `--referrer` to credit the referring agent

---

## Anti-Patterns to Avoid

- **Interactive prompts** — id-cli has none currently; keep it that way
- **Color in stdout when piped** — chalk should respect `NO_COLOR` and non-TTY detection
- **Changing JSON output shape between versions** — treat structured output as a contract
- **Unbounded indexer queries** — always enforce limits
- **Swallowing contract revert reasons** — surface the revert message, not just "transaction failed"
- **Mixing human text with data** — when `--output json` is set, only JSON goes to stdout

---

## Implementation Priority for id-cli

Current state and next steps:

- [x] `--dry-run` on all write commands
- [x] Headless auth via env vars
- [x] Bounded pagination on explore
- [x] Input validation on chains and names
- [x] `--output json` with stable envelope on all commands
- [x] Differentiated exit codes (`ExitCode` enum + `CliError`)
- [x] Schema/describe command for runtime introspection (`id-cli schema`)
- [x] `--select` field filtering on records, `--brief` on info
- [x] Address checksum validation (`validateAddress()`)
- [x] Label format validation (`validateLabel()`)
- [ ] MCP surface for typed tool invocation
