# id-cli Test Plan

## 1. Current Testing Infrastructure

### What exists

| Component | Status | Details |
|-----------|--------|---------|
| **Test runner** | Custom bash + tsx | `test/run-tests.sh` starts Anvil fork, runs `test/test.ts` |
| **Test file** | `test/test.ts` | ~40 integration tests, 532 lines |
| **Test framework** | Hand-rolled | Custom `test()`, `assert()`, `assertIncludes()` helpers |
| **npm script** | `npm test` | Runs `bash test/run-tests.sh` |
| **CI/CD** | None | No GitHub Actions or pipeline config |
| **Unit tests** | None | All tests are integration (require Anvil + RPC) |

### Current coverage (integration tests only)

| Area | Tests | Notes |
|------|-------|-------|
| Help/version | 2 | `--help`, `--version` |
| Mint USDC | 1 | Mints test tokens |
| Info | 5 | Existing, nonexistent, full domain, chain validation |
| Explore | 3 | List, chain filter, owner filter |
| Register | 4 | Basic, text records, address, sublabel |
| Records | 1 | Check records |
| Set-text | 2 | Description, agent-context |
| Set-addr | 2 | ETH address, multi-coin |
| Set-contenthash | 1 | IPFS content hash |
| Renew | 3 | Basic, custom duration, full domain |
| Create-subname | 3 | Basic, custom owner, full domain parent |
| List-subnames | 1 | Basic listing |
| Register-agent | 1 | ERC-8004 registration |
| Link-agent | 1 | ENSIP-25 linking |
| Transfer | 2 | Transfer + verify new owner |
| Error cases | 3 | Not-owner, invalid chain, nonexistent name |
| Dry-run mode | 5 | Transfer, set-text, create-subname, register, renew |

### Gaps in current tests

- **No unit tests** -- every test needs a live Anvil fork
- **No input validation tests** -- validateLabel, validateAddress, parseNonNegativeInt untested in isolation
- **No name resolution tests** -- resolveName, resolvePathOnChain not tested for edge cases
- **No output format tests** -- JSON vs human output untested
- **No provider/wallet tests** -- key validation, .env warning untested
- **No error code tests** -- CliError exit codes not verified
- **Missing commands** -- set-record, set-agent-endpoints, set-reverse, register-ens, link-ens, schema

---

## 2. Recommended Framework Stack

### Vitest (recommended)

| Choice | Why |
|--------|-----|
| **Vitest** | Native ESM support (id-cli uses `"type": "module"`), fast, built-in TypeScript, compatible with ethers.js |
| **vitest/vi** | Mocking for ethers provider/wallet, process.env, fetch, process.exit |
| **anvil** (keep) | Keep existing Anvil-based integration tests as-is |

### Why not Jest

- id-cli is ESM (`"type": "module"`) -- Jest's ESM support is experimental and fragile
- Vitest handles ESM natively with zero config
- Vitest API is Jest-compatible, so migration is easy

### Setup

```
devDependencies:
  vitest: ^3.x
  @vitest/coverage-v8: ^3.x (optional, for coverage reports)
```

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/unit/**/*.test.ts"],
    testTimeout: 10_000,
  },
});
```

```json
// package.json scripts
{
  "test": "bash test/run-tests.sh",
  "test:unit": "vitest run",
  "test:unit:watch": "vitest",
  "test:all": "vitest run && bash test/run-tests.sh"
}
```

### Test directory structure

```
test/
  run-tests.sh          # existing integration runner (keep)
  test.ts               # existing integration tests (keep)
  unit/
    utils.test.ts       # input validation, name resolution, hashing
    provider.test.ts    # wallet/key validation
    output.test.ts      # output formatting, error handling
    config.test.ts      # chain config resolution
    commands/
      register.test.ts  # register command logic
      transfer.test.ts  # transfer command logic
      info.test.ts      # info command logic
      records.test.ts   # record management commands
      agent.test.ts     # register-agent, link-agent
      subname.test.ts   # create-subname, list-subnames
      ens.test.ts       # register-ens, link-ens
```

---

## 3. Test Coverage Plan (by priority)

### P0 -- Input Validation & Key Safety (write first)

These are pure functions with zero external dependencies. Highest ROI, fastest to write, catch real bugs.

#### `test/unit/utils.test.ts` -- ~30 tests

**validateLabel()**
- Accepts: `"agent-0"`, `"a"`, `"abc-123"`, `"0-test"`
- Rejects: `""`, `"Agent-0"` (uppercase), `"agent_0"` (underscore), `"agent 0"` (space), `"agent.0"` (dot), `"émoji"` (unicode), `"--double"` (valid per regex but worth documenting)
- Throws CliError with ExitCode.INPUT_ERROR

**validateAddress()**
- Accepts: valid checksummed address, lowercase address, mixed-case address
- Rejects: `""`, `"0xinvalid"`, `"not-an-address"`, too-short hex, too-long hex
- Returns checksummed address
- Throws CliError with ExitCode.INPUT_ERROR

**parseNonNegativeInt()**
- Accepts: `"0"`, `"1"`, `"999"`
- Rejects: `"-1"`, `"abc"`, `"1.5"`, `""`, `"Infinity"`
- Throws CliError with ExitCode.INPUT_ERROR
- Note: function name says "positive" but accepts 0 -- document or fix

**labelhash() / makeNode() / getNodeForLabel()**
- labelhash("agent-0") matches ethers.keccak256(toUtf8Bytes("agent-0"))
- makeNode with known parent and label produces expected hash
- getNodeForLabel with chainId=8453 uses Base PARENT_NODE
- Deterministic: same input always produces same output

**resolveName()**
- Full domain: `"agent-0.base.xid.eth"` -> chainId 8453, path "agent-0"
- Full domain with subname: `"neo.agent-0.base.xid.eth"` -> path "neo.agent-0"
- Short label + chain flag: `"agent-0"` + `"base"` -> chainId 8453
- Short path + chain flag: `"neo.agent-0"` + `"base"` -> multi-level hash
- Default chain (no flag): uses Base (8453)
- Unknown suffix: throws error
- Each chain suffix: `.eth.xid.eth`, `.base.xid.eth`, `.op.xid.eth`, `.arb.xid.eth`, `.sep.xid.eth`
- Labels validated within path (rejects invalid segments)

**formatDomainName() / formatUsdc()**
- Format functions produce expected output
- formatUsdc handles edge cases (0, large numbers)

#### `test/unit/provider.test.ts` -- ~12 tests

**getWallet()**
- Missing PRIVATE_KEY: throws CliError(AUTH_ERROR)
- Invalid format (too short, non-hex, random string): throws CliError(INPUT_ERROR)
- Valid 64-char hex without 0x prefix: succeeds
- Valid 66-char hex with 0x prefix: succeeds
- Loaded from .env: prints warning to stderr (mock console.warn)

**getProvider()**
- Returns JsonRpcProvider for each chain
- Uses chain-specific RPC_URL_* env var when set
- Falls back to default public endpoint

### P1 -- Output & Config (write second)

#### `test/unit/output.test.ts` -- ~10 tests

**CliError**
- Default exitCode is GENERAL_ERROR (1)
- Custom exitCode preserved
- Message preserved

**handleError()**
- CliError: uses its exitCode (mock process.exit)
- Generic Error: uses GENERAL_ERROR
- Outputs message to stderr (mock console.error)

**getOutputFormat() (if exported)**
- TTY -> "human"
- Non-TTY (piped) -> "json"
- Explicit --output json -> "json"
- Explicit --output human -> "human"

**outputSuccess() / handleErrorJson()**
- JSON envelope structure: { ok: true, data: ... }
- Error envelope: { ok: false, error: { message, code } }

#### `test/unit/config.test.ts` -- ~10 tests

**getChainConfig()**
- Each chain ID returns correct config (1, 8453, 10, 42161, 11155111)
- Unknown chain ID throws

**resolveChain()**
- Aliases: "base" -> 8453, "eth" -> 1, "ethereum" -> 1, "sepolia" -> 11155111, etc.
- Unknown alias throws with "Unknown chain"
- Case sensitivity behavior documented

**RPC resolution**
- RPC_URL_BASE env var overrides default
- RPC_URL global fallback
- Default public endpoints

### P2 -- Command Logic (write third)

These tests mock ethers contracts and verify the command logic (argument parsing, contract call construction, output formatting).

#### `test/unit/commands/register.test.ts` -- ~8 tests
- Correct contract call: `registerWithPermit(...)` with expected args
- --duration parsing: "1y" = 365 days, "90d" = 90 days, "30d" = 30 days
- --text records parsed and passed correctly
- --address validated before use
- --sublabel creates subname after registration
- --dry-run calls proposeTx instead of sending tx
- Missing PRIVATE_KEY: fails with AUTH_ERROR
- USDC permit signing constructs correct EIP-712 typed data

#### `test/unit/commands/transfer.test.ts` -- ~6 tests
- Calls registry.setOwner with correct node and new owner
- Validates --to address
- Verifies ownership before transfer
- --dry-run shows proposal
- Not-owner error path
- Name not registered error path

#### `test/unit/commands/records.test.ts` -- ~8 tests
- set-text: calls resolver.setText(node, key, value)
- set-addr: calls resolver.setAddr(node, coinType, value)
- set-addr: default coinType = 60 (ETH)
- set-contenthash: calls resolver.setContenthash(node, hash)
- set-record: bulk update constructs correct multicall
- set-agent-endpoints: ENSIP-26 protocol keys constructed correctly
- All write commands check ownership first
- All write commands support --dry-run

#### `test/unit/commands/agent.test.ts` -- ~6 tests
- register-agent: calls identityRegistry.register(node)
- register-agent: extracts agentId from event logs
- link-agent: calls resolver.setText with ENSIP-25 key format
- link-agent: validates agentId is positive integer
- --chain flag resolved correctly
- --dry-run shows proposal

#### `test/unit/commands/subname.test.ts` -- ~5 tests
- create-subname: calls registry.setSubnodeOwner(parentNode, labelhash, owner)
- create-subname: --owner defaults to caller
- list-subnames: calls indexer API
- Parent name validated (exists + owned)
- Subname label validated

#### `test/unit/commands/ens.test.ts` -- ~6 tests
- register-ens: two-step commit/reveal timing
- register-ens: commitment hash computed correctly
- link-ens: 3-step process (back-link, forward-link, set-resolver)
- link-ens: --step flag selects individual step
- Chain validation (register-ens only on L1/Sepolia)
- --dry-run shows proposal for each step

### P3 -- Edge Cases & Security (write fourth)

#### `test/unit/security.test.ts` -- ~8 tests

**Private key safety**
- PRIVATE_KEY not included in error messages
- PRIVATE_KEY not logged (capture console output)
- Invalid key formats don't leak partial key in error

**Command injection**
- Labels with shell metacharacters rejected: `"; rm -rf /"`, `` "`whoami`" ``, `"$(cat /etc/passwd)"`
- Address fields with shell metacharacters rejected

**Transaction safety**
- proposeTx calldata matches expected encoding
- signUsdcPermit deadline is ~1 hour in future
- signUsdcPermit uses correct EIP-712 domain

**API/indexer safety**
- indexerFetch uses encodeURIComponent for user input in URL paths
- INDEXER_API_KEY not leaked in error responses

---

## 4. Estimated Test Count

| File | Tests | Priority | Dependencies |
|------|-------|----------|-------------|
| `test/unit/utils.test.ts` | ~30 | P0 | None (pure functions) |
| `test/unit/provider.test.ts` | ~12 | P0 | Mock process.env, console.warn |
| `test/unit/output.test.ts` | ~10 | P1 | Mock process.exit, console.error, process.stdout.isTTY |
| `test/unit/config.test.ts` | ~10 | P1 | Mock process.env for RPC overrides |
| `test/unit/commands/register.test.ts` | ~8 | P2 | Mock ethers contracts |
| `test/unit/commands/transfer.test.ts` | ~6 | P2 | Mock ethers contracts |
| `test/unit/commands/records.test.ts` | ~8 | P2 | Mock ethers contracts |
| `test/unit/commands/agent.test.ts` | ~6 | P2 | Mock ethers contracts |
| `test/unit/commands/subname.test.ts` | ~5 | P2 | Mock ethers contracts + fetch |
| `test/unit/commands/ens.test.ts` | ~6 | P2 | Mock ethers contracts |
| `test/unit/security.test.ts` | ~8 | P3 | Mock various |
| **Total unit tests** | **~109** | | |
| `test/test.ts` (existing) | ~40 | -- | Anvil fork (keep as-is) |
| **Grand total** | **~149** | | |

---

## 5. Implementation Order

```
Phase 1 (P0):  utils.test.ts + provider.test.ts      ~42 tests, ~1 session
Phase 2 (P1):  output.test.ts + config.test.ts        ~20 tests, ~1 session
Phase 3 (P2):  commands/*.test.ts                      ~39 tests, ~2 sessions
Phase 4 (P3):  security.test.ts                        ~8 tests,  ~1 session
```

### Setup required before Phase 1
1. `npm install -D vitest` (add to devDependencies)
2. Create `vitest.config.ts`
3. Add `"test:unit"` script to package.json
4. Create `test/unit/` directory

### What stays unchanged
- `test/run-tests.sh` -- keep as the integration test runner
- `test/test.ts` -- keep as-is, these are valuable end-to-end tests
- `npm test` -- keep pointing to integration tests (or change to run both)
