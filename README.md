# id-cli

CLI for ID Chain agent name registration and management on Base. All the features of [idchain.world](https://idchain.world), from your terminal.

## Setup

```bash
npm install
npm run build
npm link     # adds `id-cli` to your PATH
```

### Signing

Write commands (register, transfer, set records, create subnames) require a signer. Two options:

**Option 1: OWS wallet (recommended)** — private key stays encrypted in the [OWS](https://github.com/open-wallet-standard/core) vault:

```bash
id-cli register --wallet my-wallet
# Or via env var:
export OWS_WALLET=my-wallet
```

OWS policies can restrict which chains and contracts the wallet can interact with. Set `OWS_PASSPHRASE` to an API key for scoped access with policy enforcement.

**Option 2: Raw private key:**

```bash
export PRIVATE_KEY=0x...
```

> **Note:** A `.env` file also works but is less secure since the key persists on disk. Prefer OWS or `export` to keep the key out of files.

## Full Domain Paths

All commands accept a short label, a full domain path, or a linked .eth name:

```bash
id-cli info agent-0
id-cli info agent-0.xid.eth
id-cli info neo.agent-0.xid.eth

# Linked .eth names resolve to the linked agent automatically
id-cli info zeroperson.eth
id-cli set-text zeroperson.eth description "My agent"
id-cli records zeroperson.eth
```

## Dry Run

Add `--dry-run` to any write command to see the transaction proposal (contract, function, arguments, calldata) without executing.

```bash
id-cli register --dry-run
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
  "metadata": {}
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
id-cli register --text description="My agent" --text url="https://example.com"
id-cli register --address 0x1234...
id-cli register --sublabel neo    # creates neo.<next-label>.xid.eth
id-cli register --referrer 0x...  # referrer gets 10% fee share
```

### Transfer

Transfer ownership of a name.

```bash
id-cli transfer agent-0 --to 0x1234...
id-cli transfer agent-0.xid.eth --to 0x1234...
```

### Info

Show details for a registered name, including owner, lock status, and records.

```bash
id-cli info agent-0
id-cli info neo.agent-0.xid.eth
id-cli info agent-0 --brief              # skip records, just owner + lock status
```

### Records

View all records for a name.

```bash
id-cli records agent-0
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

Set the reverse resolution for your wallet address using the ENS Reverse Registrar.

```bash
# Default fallback reverse (L1 "reverse" namespace)
id-cli set-reverse agent-0.xid.eth
id-cli set-reverse agent-0.xid.eth DEFAULT

# Base-specific reverse
id-cli set-reverse agent-0.xid.eth BASE

# Set reverse for a specific address (e.g., a contract you own)
id-cli set-reverse agent-0.xid.eth BASE --addr 0x1234...
```

Targets: `DEFAULT` (L1 fallback), `BASE`.

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
id-cli create-subname worker-1 --parent agent-0
id-cli create-subname scout --parent agent-0 --owner 0x1234...
```

### List Subnames

```bash
id-cli list-subnames agent-0
id-cli list-subnames agent-0.xid.eth
id-cli list-subnames agent-0 --limit 100 --offset 50
```

### Register ENS Name

Register a .eth name via the ENS two-step commit/reveal process on Ethereum L1. Requires ETH for the registration fee.

```bash
id-cli register-ens alice

# Custom duration (default: 1 year = 31536000 seconds)
id-cli register-ens alice --duration 63072000   # 2 years

# Register for a different owner
id-cli register-ens alice --owner 0x1234...
```

### Link ENS Name

Link an existing .eth name to an agent ID. This is a three-step process:
1. **Back-link**: Set `ens-link[name.eth]` = "true" on the agent (Base)
2. **Forward link**: Call `setLink()` on the IDUnifiedResolver (L1)
3. **Set resolver**: Point the .eth name's resolver to the IDUnifiedResolver (L1)

```bash
# Link alice.eth to an agent (all 3 steps)
id-cli link-ens alice.eth agent-0.xid.eth

# Run a single step (useful if some steps are already done)
id-cli link-ens alice.eth agent-0.xid.eth --step 1   # back-link only
id-cli link-ens alice.eth agent-0.xid.eth --step 2   # forward link only
id-cli link-ens alice.eth agent-0.xid.eth --step 3   # set resolver only
```

### Register Agent (ERC-8004)

Register on the ERC-8004 IdentityRegistry.

```bash
id-cli register-agent agent-0
id-cli register-agent agent-0 --link   # also set ENSIP-25 record
id-cli register-agent agent-0 --mcp https://mcp.example.com
```

### Link Agent (ENSIP-25)

Link an ERC-8004 agent to a name via ENSIP-25.

```bash
id-cli link-agent agent-0 12345
```

### Explore

List registered agent names.

```bash
id-cli explore
id-cli explore --limit 50
id-cli explore --owner 0x1234...
```

### Mint USDC

Mint test USDC.

```bash
id-cli mint-usdc
id-cli mint-usdc --amount 1000
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
| `OWS_WALLET` | For writes | OWS wallet name (alternative to PRIVATE_KEY — key stays in vault) |
| `OWS_PASSPHRASE` | No | OWS API key for scoped access with policy enforcement |
| `PRIVATE_KEY` | For writes | Wallet private key with 0x prefix (fallback if OWS not used) |
| `RPC_URL_BASE` | No | Custom RPC for Base |
| `RPC_URL` | No | Global RPC override |
| `RPC_URL_ETH` | No | Custom RPC for Ethereum L1 (used by register-ens, link-ens) |
| `INDEXER_URL` | No | Override the default indexer API URL |
| `INDEXER_API_KEY` | No | API key for protected indexer endpoints (explore, by-owner) |

### RPC Configuration

The CLI ships with a public RPC endpoint for Base. To use your own RPC provider:

```bash
RPC_URL_BASE=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY
```

`RPC_URL_BASE` takes priority over `RPC_URL`. If neither is set, the built-in public endpoint is used.

For ENS commands (`register-ens`, `link-ens`), set `RPC_URL_ETH` for a custom Ethereum L1 endpoint.
