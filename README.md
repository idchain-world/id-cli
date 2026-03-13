# id-cli

CLI for ID Chain agent name registration and management. All the features of [idchain.world](https://idchain.world), from your terminal.

## Setup

```bash
npm install
npm run build
npm link     # adds `id-cli` to your PATH
```

Create a `.env` file in the project directory:

```
PRIVATE_KEY=0x...
```

`PRIVATE_KEY` is required for write commands (register, renew, transfer, set records, create subnames).

## Supported Chains

All commands accept `--chain` (or `-c`). Defaults to `base`.

| Flag | Chain |
|------|-------|
| `base` | Base (8453) |
| `eth`, `ethereum` | Ethereum (1) |
| `op`, `optimism` | Optimism (10) |
| `arb`, `arbitrum` | Arbitrum (42161) |
| `sepolia` | Sepolia (11155111) |

You can also pass the numeric chain ID directly: `--chain 8453`.

## Full Domain Paths

All commands accept either a short label or a full domain path:

```bash
id-cli info agent-0 --chain base
id-cli info agent-0.base.xid.eth
id-cli info neo.agent-0.base.xid.eth
```

## Dry Run

Add `--dry-run` to any write command to see the transaction proposal (contract, function, arguments, calldata) without executing.

```bash
id-cli register --chain base --dry-run
id-cli transfer agent-0 --to 0x1234... --dry-run
id-cli set-text agent-0 description "hello" --dry-run
```

## Commands

### Register

Register the next available agent name.

```bash
id-cli register
id-cli register --chain sepolia
id-cli register --duration 2y
id-cli register --text description="My agent" --text url="https://example.com"
id-cli register --address 0x1234...
id-cli register --sublabel neo    # creates neo.<next-label>.base.xid.eth
id-cli register --referrer 0x...  # referrer gets 10% fee share
```

### Renew

Extend a name's registration.

```bash
id-cli renew agent-0
id-cli renew agent-0 --chain eth --duration 2y
id-cli renew agent-0.base.xid.eth --duration 90d
```

### Transfer

Transfer ownership of a name.

```bash
id-cli transfer agent-0 --to 0x1234...
id-cli transfer agent-0.op.xid.eth --to 0x1234...
```

### Info

Show details for a registered name, including owner, lock status, expiry, and records.

```bash
id-cli info agent-0
id-cli info agent-7 --chain base
id-cli info neo.agent-0.base.xid.eth
```

### Records

View all records for a name.

```bash
id-cli records agent-0
id-cli records agent-0 --chain op
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
```

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

Register an agent on Sepolia with metadata, then create a swarm:

```bash
# Register
id-cli register --chain sepolia --text description="Coordinator agent"

# Create swarm workers
id-cli create-subname alpha --parent agent-0 --chain sepolia
id-cli create-subname bravo --parent agent-0 --chain sepolia
id-cli create-subname charlie --parent agent-0 --chain sepolia

# Set records on a worker
id-cli set-text alpha.agent-0 description "Alpha worker" --chain sepolia
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PRIVATE_KEY` | For writes | Wallet private key (with 0x prefix) |
| `INDEXER_URL` | No | Override the default indexer API URL |
