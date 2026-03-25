import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import { parseHook } from "../../../src/commands/hooks.js";
import { resolveName, CliError } from "../../../src/utils.js";
import { CHAIN_CONFIGS } from "../../../src/config.js";

describe("parseHook", () => {
  // Build a valid hook for testing
  const sig = "transfer(address,address,uint256)";
  const selector = ethers.keccak256(ethers.toUtf8Bytes(sig)).slice(0, 10);
  const target = "0x1234567890abcdef1234567890abcdef12345678";

  it("parses a valid 4-param hook", () => {
    const hook = `hook(${selector},${sig},(bool),${target})`;
    const parsed = parseHook(hook);
    expect(parsed.selector).toBe(selector);
    expect(parsed.signature).toBe(sig);
    expect(parsed.returnType).toBe("(bool)");
    expect(parsed.target).toBe(target);
    expect(parsed.extra).toBeUndefined();
  });

  it("parses a valid 5-param hook", () => {
    const hook = `hook(${selector},${sig},(bool),${target},0x01)`;
    const parsed = parseHook(hook);
    expect(parsed.selector).toBe(selector);
    expect(parsed.extra).toBe("0x01");
  });

  it("handles spaces in params", () => {
    const hook = `hook( ${selector} , ${sig} , (bool) , ${target} )`;
    const parsed = parseHook(hook);
    expect(parsed.selector).toBe(selector);
    expect(parsed.signature).toBe(sig);
  });

  it("rejects hook not starting with hook(", () => {
    expect(() => parseHook(`notHook(${selector},${sig},(bool),${target})`)).toThrow(CliError);
    expect(() => parseHook(`notHook(${selector},${sig},(bool),${target})`)).toThrow('Hook must start with "hook("');
  });

  it("rejects hook not ending with )", () => {
    expect(() => parseHook(`hook(${selector},${sig},(bool),${target}`)).toThrow(CliError);
  });

  it("rejects too few params", () => {
    expect(() => parseHook(`hook(${selector},${sig},(bool))`)).toThrow("4 or 5 parameters");
  });

  it("rejects too many params (6+)", () => {
    expect(() => parseHook(`hook(${selector},${sig},(bool),${target},0x01,0x02)`)).toThrow("4 or 5 parameters");
  });

  it("rejects invalid selector format", () => {
    expect(() => parseHook(`hook(0xinvalid,${sig},(bool),${target})`)).toThrow("Invalid selector");
  });

  it("rejects selector that doesn't match signature", () => {
    expect(() => parseHook(`hook(0xdeadbeef,${sig},(bool),${target})`)).toThrow("Selector mismatch");
  });

  it("rejects invalid signature format", () => {
    expect(() => parseHook(`hook(${selector},notafunc,(bool),${target})`)).toThrow("Invalid signature");
  });

  it("rejects return type without parens", () => {
    const badHook = `hook(${selector},${sig},bool,${target})`;
    expect(() => parseHook(badHook)).toThrow("parentheses");
  });

  it("rejects target not starting with 0x", () => {
    expect(() => parseHook(`hook(${selector},${sig},(bool),noprefix)`)).toThrow("Must start with 0x");
  });

  it("handles empty return type ()", () => {
    const hook = `hook(${selector},${sig},(),${target})`;
    const parsed = parseHook(hook);
    expect(parsed.returnType).toBe("()");
  });

  it("handles multi-return types", () => {
    const hook = `hook(${selector},${sig},(bool,uint256),${target})`;
    const parsed = parseHook(hook);
    expect(parsed.returnType).toBe("(bool,uint256)");
  });
});

describe("set-hook command logic", () => {
  it("builds correct text record key from selector", () => {
    const sig = "transfer(address,address,uint256)";
    const selector = ethers.keccak256(ethers.toUtf8Bytes(sig)).slice(0, 10);
    const key = `erc8121-hook[${selector}]`;
    expect(key).toMatch(/^erc8121-hook\[0x[0-9a-f]{8}\]$/);
  });

  it("builds correct dry-run proposal", () => {
    const sig = "transfer(address,address,uint256)";
    const selector = ethers.keccak256(ethers.toUtf8Bytes(sig)).slice(0, 10);
    const target = "0x1234567890abcdef1234567890abcdef12345678";
    const hookValue = `hook(${selector},${sig},(bool),${target})`;
    const key = `erc8121-hook[${selector}]`;

    const resolved = resolveName("agent-0", "base");
    const config = CHAIN_CONFIGS[8453];

    const proposal = {
      action: `Set ERC-8121 hook ${selector} on ${resolved.domain}`,
      chainId: resolved.chainId,
      contractName: "IDRegistry",
      contractAddress: config.ID_REGISTRY,
      functionAbi: "function setText(bytes32 node, string key, string value)",
      args: [resolved.node, key, hookValue],
      argLabels: ["node", "key", "value"],
    };

    expect(proposal.args[1]).toBe(key);
    expect(proposal.args[2]).toBe(hookValue);
  });
});

describe("get-hooks command logic", () => {
  it("filters hook records from text records", () => {
    const textRecords = [
      { key: "description", value: "test agent" },
      { key: "erc8121-hook[0xbeabacc8]", value: "hook(0xbeabacc8,...)" },
      { key: "url", value: "https://example.com" },
      { key: "erc8121-hook[0x12345678]", value: "hook(0x12345678,...)" },
    ];

    const hooks = textRecords.filter(r => r.key.startsWith("erc8121-hook["));
    expect(hooks).toHaveLength(2);
    expect(hooks[0].key).toBe("erc8121-hook[0xbeabacc8]");
    expect(hooks[1].key).toBe("erc8121-hook[0x12345678]");
  });

  it("extracts selector from key", () => {
    const key = "erc8121-hook[0xbeabacc8]";
    const match = key.match(/^erc8121-hook\[([^\]]+)\]$/);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("0xbeabacc8");
  });

  it("returns empty when no hooks", () => {
    const textRecords = [
      { key: "description", value: "test agent" },
      { key: "url", value: "https://example.com" },
    ];

    const hooks = textRecords.filter(r => r.key.startsWith("erc8121-hook["));
    expect(hooks).toHaveLength(0);
  });
});
