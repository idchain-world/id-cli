/**
 * CLI Integration Tests
 *
 * Runs all CLI commands against a local Anvil fork of Base.
 * Expects environment:
 *   PRIVATE_KEY  — anvil default account 0
 *   RPC_URL      — http://127.0.0.1:8545 (anvil)
 */
import { execSync } from "child_process";

// ── Constants ─────────────────────────────────────────────────────────────────
const CLI_DIR = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const CLI = "npx tsx src/index.ts";
const CHAIN = "base";

const ANVIL_ACCOUNT_0 = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const ANVIL_ACCOUNT_1 = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

// ── State shared between tests ────────────────────────────────────────────────
let registeredLabel = "";
let agentId = "";

// ── Helpers ───────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
let skipped = 0;

/** Clear ERC-7702 delegation code from an address on the anvil fork. */
function clearAccountCode(address: string) {
  const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:8545";
  execSync(
    `curl -s -X POST -H "Content-Type: application/json" ` +
    `-d '{"jsonrpc":"2.0","method":"anvil_setCode","params":["${address}","0x"],"id":1}' ` +
    `${rpcUrl}`,
    { encoding: "utf-8" }
  );
}

function run(cmd: string, expectFail = false): string {
  const fullCmd = `${CLI} ${cmd}`;
  try {
    const output = execSync(fullCmd, {
      encoding: "utf-8",
      env: { ...process.env },
      cwd: CLI_DIR,
      timeout: 120_000,
    });
    if (expectFail) {
      throw new Error(`Expected failure but got success: ${fullCmd}`);
    }
    return output;
  } catch (err: any) {
    if (!expectFail) {
      const stderr = err.stderr || "";
      const stdout = err.stdout || "";
      throw new Error(
        `Command failed: ${fullCmd}\n` +
          `Exit code: ${err.status}\n` +
          `stdout: ${stdout.slice(0, 800)}\n` +
          `stderr: ${stderr.slice(0, 800)}`
      );
    }
    return err.stdout || err.stderr || "";
  }
}

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err.message.split("\n").join("\n        ")}`);
    process.exit(1);
  }
}

function testOptional(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err: any) {
    skipped++;
    console.log(`  SKIP  ${name}`);
    console.log(`        ${err.message.split("\n")[0]}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertIncludes(output: string, expected: string) {
  if (!output.includes(expected)) {
    throw new Error(
      `Expected output to include "${expected}" but got:\n${output.slice(0, 600)}`
    );
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log("CLI Integration Tests");
console.log("=====================");
console.log(`  CLI dir:  ${CLI_DIR}`);
console.log(`  RPC_URL:  ${process.env.RPC_URL}`);
console.log(`  Chain:    ${CHAIN}`);
console.log("");

// ─── Help & version ──────────────────────────────────────────────────────────

test("--help: shows all commands", () => {
  const output = run("--help");
  assertIncludes(output, "register");
  assertIncludes(output, "renew");
  assertIncludes(output, "transfer");
  assertIncludes(output, "info");
  assertIncludes(output, "records");
  assertIncludes(output, "set-text");
  assertIncludes(output, "set-addr");
  assertIncludes(output, "set-contenthash");
  assertIncludes(output, "create-subname");
  assertIncludes(output, "list-subnames");
  assertIncludes(output, "register-agent");
  assertIncludes(output, "link-agent");
  assertIncludes(output, "explore");
  assertIncludes(output, "mint-usdc");
});

test("--version: shows version", () => {
  const output = run("--version");
  assertIncludes(output, "0.1.0");
});

// ─── Mint USDC ───────────────────────────────────────────────────────────────

test("mint-usdc: mint 1000 USDC to test wallet", () => {
  const output = run(`mint-usdc --chain ${CHAIN} --amount 1000`);
  assertIncludes(output, "Minted 1000 USDC");
  assertIncludes(output, "Balance:");
});

// ─── Info (existing name) ────────────────────────────────────────────────────

test("info: look up existing name (agent-0)", () => {
  const output = run(`info agent-0 --chain ${CHAIN}`);
  assertIncludes(output, "agent-0.base.xid.eth");
  assertIncludes(output, "Owner:");
  assertIncludes(output, "Node:");
});

test("info: full domain path works", () => {
  const output = run("info agent-0.base.xid.eth");
  assertIncludes(output, "agent-0.base.xid.eth");
  assertIncludes(output, "Owner:");
});

test("help: chain aliases shown in register help", () => {
  const output = run("register --help");
  assertIncludes(output, "--chain");
});

test("error: invalid chain name rejected", () => {
  const output = run("info agent-0 --chain fakenet", true);
  assertIncludes(output, "Unknown chain");
});

test("info: nonexistent name shows not registered", () => {
  const output = run(`info nonexistent-name-xyz123 --chain ${CHAIN}`);
  assertIncludes(output, "not registered");
});

// ─── Explore ─────────────────────────────────────────────────────────────────

test("explore: lists names (no chain filter)", () => {
  const output = run("explore --limit 5");
  assertIncludes(output, "Agent names");
  // Should show at least one name
  assertIncludes(output, ".xid.eth");
});

test("explore: filter by chain", () => {
  const output = run("explore --chain base --limit 5");
  assertIncludes(output, "Agent names on Base");
  assertIncludes(output, ".base.xid.eth");
});

test("explore: --owner filter", () => {
  // Look up names by the existing owner on the fork
  const output = run(`explore --owner 0x9a704664009d615A90ddDf9345B6b8B2A214cFb2 --limit 5`);
  assertIncludes(output, ".xid.eth");
});

// ─── Register ────────────────────────────────────────────────────────────────

test("register: register a new agent name", () => {
  const output = run(`register --chain ${CHAIN} --duration 1y`);
  assertIncludes(output, "Registered");
  assertIncludes(output, "Next label:");

  const labelMatch = output.match(/Next label:\s*(\S+)/);
  assert(!!labelMatch, "Could not extract label from register output");
  registeredLabel = labelMatch![1];
  console.log(`        (registered label: ${registeredLabel})`);
});

test("register: register with text records", () => {
  const output = run(
    `register --chain ${CHAIN} --duration 1y --text description="text-record-test"`
  );
  assertIncludes(output, "Registered");
});

test("register: register with --address flag", () => {
  const output = run(
    `register --chain ${CHAIN} --duration 1y --address ${ANVIL_ACCOUNT_0}`
  );
  assertIncludes(output, "Registered");
});

test("register: register with --sublabel creates subname", () => {
  const output = run(
    `register --chain ${CHAIN} --duration 1y --sublabel mysub`
  );
  assertIncludes(output, "Registered");
  assertIncludes(output, "mysub");
});

// ─── Info on newly registered name ───────────────────────────────────────────

test("info: verify newly registered name exists", () => {
  const output = run(`info ${registeredLabel} --chain ${CHAIN}`);
  assertIncludes(output, registeredLabel);
  assertIncludes(output, "Owner:");
  assertIncludes(output, ANVIL_ACCOUNT_0);
});

// ─── Records ─────────────────────────────────────────────────────────────────

test("records: check records of new name", () => {
  const output = run(`records ${registeredLabel} --chain ${CHAIN}`);
  assertIncludes(output, registeredLabel);
});

// ─── Set-text ────────────────────────────────────────────────────────────────

test("set-text: set description on new name", () => {
  const output = run(
    `set-text ${registeredLabel} description "test agent" --chain ${CHAIN}`
  );
  assertIncludes(output, "Set");
  assertIncludes(output, "description");
});

test("set-text: set agent-context record", () => {
  const output = run(
    `set-text ${registeredLabel} agent-context '{"type":"agent"}' --chain ${CHAIN}`
  );
  assertIncludes(output, "Set");
  assertIncludes(output, "agent-context");
});

// ─── Set-addr ────────────────────────────────────────────────────────────────

test("set-addr: set ETH address on new name", () => {
  const output = run(
    `set-addr ${registeredLabel} ${ANVIL_ACCOUNT_0} --chain ${CHAIN}`
  );
  assertIncludes(output, "Set ETH address");
  assertIncludes(output, ANVIL_ACCOUNT_0);
});

test("set-addr: set multi-coin address (coin type 0 = BTC)", () => {
  // Use a dummy hex bytes value for BTC address
  const btcAddrHex = "0x76a91489abcdefabbaabbaabbaabbaabbaabbaabbaabba88ac";
  const output = run(
    `set-addr ${registeredLabel} ${btcAddrHex} --chain ${CHAIN} --coin-type 0`
  );
  assertIncludes(output, "Set coin 0 address");
});

// ─── Set-contenthash ─────────────────────────────────────────────────────────

test("set-contenthash: set content hash on new name", () => {
  // IPFS CIDv0 content hash (example encoded)
  const contentHash = "0xe301017012200000000000000000000000000000000000000000000000000000000000000000";
  const output = run(
    `set-contenthash ${registeredLabel} ${contentHash} --chain ${CHAIN}`
  );
  assertIncludes(output, "Content hash updated");
});

// ─── Info (verify records) ───────────────────────────────────────────────────

test("info: verify text and address records appear", () => {
  const output = run(`info ${registeredLabel} --chain ${CHAIN}`);
  assertIncludes(output, "Owner:");
  assertIncludes(output, "ETH:");
});

// ─── Renew ───────────────────────────────────────────────────────────────────

test("renew: renew registered name for 1 year", () => {
  const output = run(
    `renew ${registeredLabel} --chain ${CHAIN} --duration 1y`
  );
  assertIncludes(output, "Renewed");
  assertIncludes(output, registeredLabel);
});

test("renew: renew with custom duration (90d)", () => {
  const output = run(
    `renew ${registeredLabel} --chain ${CHAIN} --duration 90d`
  );
  assertIncludes(output, "Renewed");
});

test("renew: renew using full domain path", () => {
  const output = run(
    `renew ${registeredLabel}.base.xid.eth --duration 30d`
  );
  assertIncludes(output, "Renewed");
});

// ─── Create-subname ──────────────────────────────────────────────────────────

test("create-subname: create test-sub under registered name", () => {
  const output = run(
    `create-subname test-sub --parent ${registeredLabel} --chain ${CHAIN}`
  );
  assertIncludes(output, "Created");
  assertIncludes(output, `test-sub.${registeredLabel}`);
});

test("create-subname: create with custom owner", () => {
  const output = run(
    `create-subname owned-sub --parent ${registeredLabel} --chain ${CHAIN} --owner ${ANVIL_ACCOUNT_1}`
  );
  assertIncludes(output, "Created");
  assertIncludes(output, ANVIL_ACCOUNT_1);
});

test("create-subname: using full domain path for parent", () => {
  const output = run(
    `create-subname path-sub --parent ${registeredLabel}.base.xid.eth`
  );
  assertIncludes(output, "Created");
  assertIncludes(output, `path-sub.${registeredLabel}.base.xid.eth`);
});

// ─── Info on subname ─────────────────────────────────────────────────────────

test("info: verify subname exists", () => {
  const output = run(`info test-sub.${registeredLabel} --chain ${CHAIN}`);
  assertIncludes(output, `test-sub.${registeredLabel}`);
  assertIncludes(output, "Owner:");
});

test("info: verify subname with custom owner", () => {
  const output = run(`info owned-sub.${registeredLabel} --chain ${CHAIN}`);
  assertIncludes(output, ANVIL_ACCOUNT_1);
});

// ─── Set-text on subname ─────────────────────────────────────────────────────

test("set-text: set text record on subname", () => {
  const output = run(
    `set-text test-sub.${registeredLabel} role "sub-agent" --chain ${CHAIN}`
  );
  assertIncludes(output, "Set");
  assertIncludes(output, "role");
});

// ─── List-subnames ───────────────────────────────────────────────────────────

test("list-subnames: list subnames (may need indexer)", () => {
  // This calls the indexer, which may not have the forked data
  // Just verify it doesn't crash
  const output = run(`list-subnames ${registeredLabel} --chain ${CHAIN}`);
  // Output will say "No subnames found" or list them — either is fine
  assert(
    output.includes("Subnames of") || output.includes("No subnames") || output.includes("Could not fetch"),
    "Expected valid list-subnames response"
  );
});

// ─── Register-agent (ERC-8004) ───────────────────────────────────────────────

// Clear ERC-7702 delegation code from anvil account 0 — on Base mainnet this
// address has delegation code that interferes with ERC-721 safeMint callbacks.
clearAccountCode(ANVIL_ACCOUNT_0);

test(
  "register-agent: register on ERC-8004 IdentityRegistry",
  () => {
    const output = run(
      `register-agent ${registeredLabel} --chain ${CHAIN}`
    );
    assertIncludes(output, "Registered");
    assertIncludes(output, "Agent ID:");

    // Extract agent ID for link-agent test
    const idMatch = output.match(/Agent ID:\s*(\d+)/);
    if (idMatch) {
      agentId = idMatch[1];
      console.log(`        (agent ID: ${agentId})`);
    }
  }
);

// ─── Link-agent (ENSIP-25) ───────────────────────────────────────────────────

test(
  "link-agent: link ERC-8004 agent to name via ENSIP-25",
  () => {
    assert(!!agentId, "No agent ID from register-agent");
    const output = run(
      `link-agent ${registeredLabel} ${agentId} --chain ${CHAIN}`
    );
    assertIncludes(output, "Linked");
    assertIncludes(output, "ENSIP-25");
  }
);

// ─── Transfer ────────────────────────────────────────────────────────────────

test("transfer: transfer name to anvil account 1", () => {
  const output = run(
    `transfer ${registeredLabel} --to ${ANVIL_ACCOUNT_1} --chain ${CHAIN}`
  );
  assertIncludes(output, "Transferred");
  assertIncludes(output, ANVIL_ACCOUNT_1);
});

test("info: verify new owner after transfer", () => {
  const output = run(`info ${registeredLabel} --chain ${CHAIN}`);
  assertIncludes(output, "Owner:");
  assertIncludes(output, ANVIL_ACCOUNT_1);
});

// ─── Error cases ─────────────────────────────────────────────────────────────

test("transfer: fails when not owner", () => {
  // We just transferred, so we no longer own this name
  const output = run(
    `transfer ${registeredLabel} --to ${ANVIL_ACCOUNT_0} --chain ${CHAIN}`,
    true // expect failure
  );
  assertIncludes(output, "don't own");
});

test("register: fails with invalid chain", () => {
  const output = run("register --chain fakenet", true);
  assertIncludes(output, "Unknown chain");
});

test("renew: fails on nonexistent name", () => {
  const output = run(
    `renew nonexistent-name-xyz --chain ${CHAIN} --duration 1y`,
    true
  );
  // Should fail with a contract error
  assert(output.length > 0, "Expected error output");
});

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log("");
console.log("=====================");
const parts = [`${passed} passed`];
if (skipped > 0) parts.push(`${skipped} skipped`);
if (failed > 0) parts.push(`${failed} failed`);
console.log(`  ${parts.join(", ")}`);
console.log("=====================");

process.exit(failed > 0 ? 1 : 0);
