# idcli

CLI for ID Chain agent name registration and management. All the features of [idchain.world](https://idchain.world), from your terminal.

## Setup

```bash
cd cli
npm install
npm run build
npm link     # adds `idcli` to your PATH
```

Create a `.env` file in the `cli/` directory:

```
PRIVATE_KEY=0x...
API_KEY=sk-idx-...
```

`PRIVATE_KEY` is required for write commands (register, renew, transfer, set records, create subnames). `API_KEY` is required for the `explore` command and enriched `info` output.

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

## Commands

### Register

Register the next available agent name.

```bash
idcli register
idcli register --chain sepolia
idcli register --duration 2y
idcli register --text description="My agent" --text url="https://example.com"
idcli register --address 0x1234...
idcli register --sublabel neo    # creates neo.<next-label>.base.xid.eth
idcli register --referrer 0x...  # referrer gets 10% fee share
```

### Renew

Extend a name's registration.

```bash
idcli renew agent-0
idcli renew agent-0 --chain eth --duration 2y
idcli renew agent-0 --duration 90d
```

### Transfer

Transfer ownership of a name.

```bash
idcli transfer agent-0 --to 0x1234...
idcli transfer agent-0 --to 0x1234... --chain op
```

### Info

Show details for a registered name, including owner, lock status, expiry, and records.

```bash
idcli info agent-0
idcli info agent-7 --chain base
```

### Records

View and set text records, address records, and content hashes.

```bash
# View all records
idcli records get agent-0
idcli records get agent-0 --chain op

# Set a text record
idcli records set-text agent-0 description "My autonomous agent"
idcli records set-text agent-0 agent-context '{"services":[...]}'

# Set an address record (ETH by default)
idcli records set-addr agent-0 0x1234...

# Set a multi-coin address (e.g., Bitcoin = coin type 0)
idcli records set-addr agent-0 0x... --coin-type 0

# Set content hash
idcli records set agent-0 --contenthash 0xe301...
```

### Subnames

Create and list subnames under an agent. Useful for building swarms where each worker gets its own identity.

```bash
# Create a subname
idcli subname create neo --parent agent-0
idcli subname create worker-1 --parent agent-0 --chain base
idcli subname create scout --parent agent-0 --owner 0x1234...

# List subnames
idcli subname list agent-0
```

### Explore

List registered agent names from the indexer. Requires `API_KEY`.

```bash
idcli explore
idcli explore --chain op --limit 50
idcli explore --owner 0x1234...
```

### Mint USDC

Mint test USDC on testnets.

```bash
idcli mint-usdc
idcli mint-usdc --chain sepolia --amount 1000
```

## Examples

Register an agent on Sepolia with metadata, then create a swarm:

```bash
# Register
idcli register --chain sepolia --text description="Coordinator agent"

# Create swarm workers
idcli subname create alpha --parent agent-0 --chain sepolia
idcli subname create bravo --parent agent-0 --chain sepolia
idcli subname create charlie --parent agent-0 --chain sepolia

# Set records on a worker
idcli records set-text alpha.agent-0 description "Alpha worker" --chain sepolia
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PRIVATE_KEY` | For writes | Wallet private key (with 0x prefix) |
| `API_KEY` or `INDEXER_API_KEY` | For explore | Indexer API key for protected endpoints |
