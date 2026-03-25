# id-cli

CLI for ID Chain agent name registration and management. All the features of [idchain.world](https://idchain.world), from your terminal.

## Setup

```bash
npm install
npm run build
npm link     # adds `id-cli` to your PATH
```

Set your private key as an environment variable:

```bash
export PRIVATE_KEY=0x...
```

`PRIVATE_KEY` is required for write commands (register, transfer, set records, create subnames).

> **Note:** A `.env` file also works but is less secure since the key persists on disk. Prefer `export` to keep the key in memory only.

## Supported Chains

All commands accept `--chain` (or `-c`). Defaults to `base`.

| Flag | Chain |
|------|-------|
| `base` | Base (8453) |
| `eth`, `ethereum` | Ethereum (1) |
| `op`, `optimism` | Optimism (10) |
| `arb`, `arbitrum` | Arbitrum (42161) |
| `sep`, `sepolia` | Sepolia (11155111) |

You can also pass the numeric chain ID directly: `--chain 8453`.

## Full Domain Paths

All commands accept a short label, a full domain path, or a linked .eth name:

```bash
id-cli info agent-0 --chain base
id-cli info agent-0.base.xid.eth
id-cli info agent-0.sep.xid.eth
id-cli info neo.agent-0.base.xid.eth

# Linked .eth names resolve to the linked agent automatically
id-cli info zeroperson.eth
id-cli info treo.zeroperson.eth
id-cli set-text zeroperson.eth description "My agent"
id-cli records zeroperson.eth
```

## Dry Run

Add `--dry-run` to any write command to see the transaction proposal (contract, function, arguments, calldata) without executing.

```bash
id-cli register --chain base --dry-run
id-cli transfer agent-0 --to 0x1234... --dry-run
id-cli set-text agent-0 description "hello" --dry-run
```

## JSON Output

All commands support structured JSON output for agent consumption:

```bash
id-cli info agent-0 --output json
id-cli explore --output json
```

When stdout is not a TTY (e.g., piped), JSON is the default. The envelope format:

```json
{
  "status": "ok",
  "data": { ... },
  "metadata": { "chain": "Base", "chainId": 8453 }
}
```

## Schema Introspection

Agents can discover all commands and their parameters programmatically:

```bash
id-cli schema                    # dump all commands as JSON
id-cli schema register           # describe a specific command
id-cli schema set-agent-endpoints
```

## Commands

### Register

Register the next available agent name. Names are permanent (one-time $3.50 USDC fee, no renewals).

```bash
id-cli register
id-cli register --chain sepolia
id-cli register --text description="My agent" --text url="https://example.com"
id-cli register --address 0x1234...
id-cli register --sublabel neo    # creates neo.<next-label>.base.xid.eth
id-cli register --referrer 0x...  # referrer gets 10% fee share
```

### Transfer

Transfer ownership of a name.

```bash
id-cli transfer agent-0 --to 0x1234...
id-cli transfer agent-0.op.xid.eth --to 0x1234...
```

### Info

Show details for a registered name, including owner, lock status, and records.

```bash
id-cli info agent-0
id-cli info agent-7 --chain base
id-cli info neo.agent-0.base.xid.eth
id-cli info agent-0 --brief              # skip records, just owner + lock status
```

### Records

View all records for a name.

```bash
id-cli records agent-0
id-cli records agent-0 --chain op
id-cli records agent-0 --select text           # only text records
id-cli records agent-0 --select text,address   # text + address records
```

### Set Text

Set a text record on a name.

```bash
id-cli set-text agent-0 description "My autonomous agent"
id-cli set-text agent-0 agent-context '{"services":[...]}'
```

### Set Address

Set an address record on a name.

```bash
id-cli set-addr agent-0 0x1234...
id-cli set-addr agent-0 0x... --coin-type 0   # Bitcoin (coin type 0)
```

### Set Content Hash

```bash
id-cli set-contenthash agent-0 0xe301...
```

### Set Reverse Name (ENSIP-19)

Set the reverse resolution for your wallet address using the ENS Reverse Registrar. Supports the default L1 fallback reverse (`reverse`), Ethereum-specific reverse (`addr.reverse`), and chain-specific reverses per ENSIP-19.

```bash
# Default fallback reverse (L1 "reverse" namespace) — uses 0x283F...
id-cli set-reverse agent-0.base.xid.eth
id-cli set-reverse agent-0.base.xid.eth DEFAULT

# Ethereum-specific reverse (L1 "addr.reverse" namespace) — uses 0xa58E...
id-cli set-reverse agent-0.base.xid.eth ETH

# Chain-specific reverse — calls setName() on that chain's reverse registrar
id-cli set-reverse agent-0.base.xid.eth BASE
id-cli set-reverse agent-0.op.xid.eth OP
id-cli set-reverse agent-0.arb.xid.eth ARB

# Set reverse for a specific address (e.g., a contract you own)
id-cli set-reverse agent-0.base.xid.eth BASE --addr 0x1234...
```

Targets: `DEFAULT` (L1 fallback), `ETH` (L1 addr.reverse), `BASE`, `OP`, `ARB`, `SEP`.

Uses `setName(string)` on the ENS Reverse Registrar for your wallet, or `setNameForAddr(address, string)` with `--addr`.

### Set Agent Endpoints (ENSIP-26)

Set agent endpoint records per the [ENSIP-26](https://docs.ens.domains/ensip/26) specification. All endpoints are set in a single `setRecord` transaction.

```bash
id-cli set-agent-endpoints agent-0 \
  --mcp https://agent.example.com/mcp \
  --a2a https://agent.example.com/a2a \
  --web https://agent.example.com \
  --context "Token swap agent for DeFi"

# Set only an MCP endpoint
id-cli set-agent-endpoints agent-0 --mcp https://mcp.example.com

# Clear specific endpoints
id-cli set-agent-endpoints agent-0 --clear mcp,a2a

# Clear all agent endpoints
id-cli set-agent-endpoints agent-0 --clear all
```

Supported protocols: `mcp` (Model Context Protocol), `a2a` (Agent-to-Agent), `oasf` (OpenAPI Service Format), `web` (Web interface).

### Set Record (Bulk)

Set multiple records atomically in a single `setRecord` transaction.

```bash
id-cli set-record agent-0 \
  --text "description=My agent" "url=https://example.com" \
  --addr "60=0x1234..." \
  --contenthash 0xe301...

id-cli set-record agent-0 \
  --text "agent-endpoint[mcp]=https://mcp.example.com" \
  --text "agent-endpoint[a2a]=https://a2a.example.com"
```

### Create Subname

Create a subname under an agent. Useful for building swarms where each worker gets its own identity.

```bash
id-cli create-subname neo --parent agent-0
id-cli create-subname worker-1 --parent agent-0 --chain base
id-cli create-subname scout --parent agent-0 --owner 0x1234...
```

### List Subnames

```bash
id-cli list-subnames agent-0
id-cli list-subnames agent-0.base.xid.eth
id-cli list-subnames agent-0 --limit 100 --offset 50
```

### Register ENS Name

Register a .eth name via the ENS two-step commit/reveal process. Requires ETH for the registration fee.

```bash
# Register on mainnet ENS (default for all chains except Sepolia)
id-cli register-ens alice

# Register on Sepolia ENS
id-cli register-ens alice --chain sepolia

# Custom duration (default: 1 year = 31536000 seconds)
id-cli register-ens alice --duration 63072000   # 2 years

# Register for a different owner
id-cli register-ens alice --owner 0x1234...
```

### Link ENS Name

Link an existing .eth name to an agent ID. This is a three-step process:
1. **Back-link**: Set `ens-link[name.eth]` = "true" on the agent (agent's chain)
2. **Forward link**: Call `setLink()` on the linking resolver (L1/Sepolia)
3. **Set resolver**: Point the .eth name's resolver to the linking resolver (L1/Sepolia)

```bash
# Link alice.eth to a Base agent (all 3 steps)
id-cli link-ens alice.eth agent-0.base.xid.eth

# Link to an L1 Ethereum agent
id-cli link-ens alice.eth agent-0.eth.xid.eth

# Link to a Sepolia agent
id-cli link-ens alice.eth agent-0.sep.xid.eth

# Run a single step (useful if some steps are already done)
id-cli link-ens alice.eth agent-0.base.xid.eth --step 1   # back-link only
id-cli link-ens alice.eth agent-0.base.xid.eth --step 2   # forward link only
id-cli link-ens alice.eth agent-0.base.xid.eth --step 3   # set resolver only
```

For L1 agents (eth/sep), uses **IDLinkedResolver** (on-chain). For L2 agents (base/op/arb), uses **IDUnifiedResolver** (CCIP-Read).

### Register Agent (ERC-8004)

Register on the ERC-8004 IdentityRegistry.

```bash
id-cli register-agent agent-0 --chain base
id-cli register-agent agent-0 --chain base --link   # also set ENSIP-25 record
id-cli register-agent agent-0 --mcp https://mcp.example.com
```

### Link Agent (ENSIP-25)

Link an ERC-8004 agent to a name via ENSIP-25.

```bash
id-cli link-agent agent-0 12345 --chain base
```

### Explore

List registered agent names.

```bash
id-cli explore
id-cli explore --chain op --limit 50
id-cli explore --owner 0x1234...
```

### Mint USDC

Mint test USDC on testnets.

```bash
id-cli mint-usdc
id-cli mint-usdc --chain sepolia --amount 1000
```

## Examples

Register an agent with ENSIP-26 endpoints and a swarm:

```bash
# Register on Base
id-cli register --text description="Coordinator agent"

# Set agent endpoints (ENSIP-26) in one transaction
id-cli set-agent-endpoints agent-0 \
  --mcp https://agent.example.com/mcp \
  --a2a https://agent.example.com/a2a \
  --context "Coordinator agent that manages DeFi operations"

# Create swarm workers
id-cli create-subname alpha --parent agent-0
id-cli create-subname bravo --parent agent-0

# Set records on a worker using bulk update
id-cli set-record alpha.agent-0 \
  --text "description=Alpha worker" \
  --text "agent-endpoint[mcp]=https://alpha.example.com/mcp"
```

Use JSON output for agent pipelines:

```bash
# Pipe structured data to jq
id-cli info agent-0 --output json | jq '.data.owner'

# Agent discovers CLI capabilities
id-cli schema set-agent-endpoints
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PRIVATE_KEY` | For writes | Wallet private key (with 0x prefix) |
| `RPC_URL_BASE` | No | Custom RPC for Base |
| `RPC_URL_ETH` | No | Custom RPC for Ethereum |
| `RPC_URL_OP` | No | Custom RPC for Optimism |
| `RPC_URL_ARB` | No | Custom RPC for Arbitrum |
| `RPC_URL_SEPOLIA` | No | Custom RPC for Sepolia |
| `RPC_URL` | No | Global RPC override (applies to all chains) |
| `INDEXER_URL` | No | Override the default indexer API URL |
| `INDEXER_API_KEY` | No | API key for protected indexer endpoints (explore, by-owner) |

### RPC Configuration

The CLI ships with public RPC endpoints for each chain. These work for most use cases but may be rate-limited under heavy use. To use your own RPC provider, set the per-chain env var:

```bash
# In your .env file
RPC_URL_BASE=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY
RPC_URL_ETH=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
```

Per-chain variables take priority over `RPC_URL`. If neither is set, the built-in public endpoint is used.
