import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import {
  validateLabel,
  validateAddress,
  parseNonNegativeInt,
  labelhash,
  makeNode,
  getNodeForLabel,
  resolveName,
  formatDomainName,
  formatUsdc,
  CliError,
  ExitCode,
} from "../../src/utils.js";
import { CHAIN_CONFIGS } from "../../src/config.js";

// ── validateLabel ────────────────────────────────────────────────────────────

describe("validateLabel", () => {
  it("accepts lowercase alphanumeric labels", () => {
    expect(() => validateLabel("agent-0")).not.toThrow();
    expect(() => validateLabel("a")).not.toThrow();
    expect(() => validateLabel("abc-123")).not.toThrow();
    expect(() => validateLabel("0-test")).not.toThrow();
    expect(() => validateLabel("hello")).not.toThrow();
  });

  it("rejects empty string", () => {
    expect(() => validateLabel("")).toThrow(CliError);
    expect(() => validateLabel("")).toThrow("empty");
  });

  it("rejects uppercase letters", () => {
    expect(() => validateLabel("Agent-0")).toThrow(CliError);
    expect(() => validateLabel("HELLO")).toThrow("Invalid label");
  });

  it("rejects underscores", () => {
    expect(() => validateLabel("agent_0")).toThrow("Invalid label");
  });

  it("rejects spaces", () => {
    expect(() => validateLabel("agent 0")).toThrow("Invalid label");
  });

  it("rejects dots", () => {
    expect(() => validateLabel("agent.0")).toThrow("Invalid label");
  });

  it("rejects unicode/emoji", () => {
    expect(() => validateLabel("émoji")).toThrow("Invalid label");
    expect(() => validateLabel("hello🔥")).toThrow("Invalid label");
  });

  it("rejects special characters", () => {
    expect(() => validateLabel("agent@0")).toThrow("Invalid label");
    expect(() => validateLabel("agent!")).toThrow("Invalid label");
    expect(() => validateLabel("agent/0")).toThrow("Invalid label");
  });

  it("throws CliError with INPUT_ERROR exit code", () => {
    try {
      validateLabel("INVALID");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(CliError);
      expect((e as CliError).exitCode).toBe(ExitCode.INPUT_ERROR);
    }
  });
});

// ── validateAddress ──────────────────────────────────────────────────────────

describe("validateAddress", () => {
  const valid = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  const validLower = valid.toLowerCase();

  it("accepts a valid checksummed address", () => {
    const result = validateAddress(valid, "--to");
    expect(result).toBe(valid);
  });

  it("accepts lowercase and returns checksummed", () => {
    const result = validateAddress(validLower, "--to");
    expect(result).toBe(valid);
  });

  it("rejects empty string", () => {
    expect(() => validateAddress("", "--to")).toThrow(CliError);
  });

  it("rejects non-hex string", () => {
    expect(() => validateAddress("not-an-address", "--to")).toThrow("Invalid address");
  });

  it("rejects too-short hex", () => {
    expect(() => validateAddress("0x1234", "--to")).toThrow("Invalid address");
  });

  it("rejects missing 0x prefix with wrong length", () => {
    expect(() => validateAddress("hello", "--to")).toThrow("Invalid address");
  });

  it("includes flag name in error message", () => {
    expect(() => validateAddress("bad", "--owner")).toThrow("--owner");
  });

  it("throws CliError with INPUT_ERROR exit code", () => {
    try {
      validateAddress("bad", "--to");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(CliError);
      expect((e as CliError).exitCode).toBe(ExitCode.INPUT_ERROR);
    }
  });
});

// ── parseNonNegativeInt ─────────────────────────────────────────────────────────

describe("parseNonNegativeInt", () => {
  it("parses zero", () => {
    expect(parseNonNegativeInt("0", "--limit")).toBe(0);
  });

  it("parses positive integers", () => {
    expect(parseNonNegativeInt("1", "--limit")).toBe(1);
    expect(parseNonNegativeInt("999", "--limit")).toBe(999);
  });

  it("rejects negative numbers", () => {
    expect(() => parseNonNegativeInt("-1", "--limit")).toThrow(CliError);
  });

  it("rejects non-numeric strings", () => {
    expect(() => parseNonNegativeInt("abc", "--limit")).toThrow("non-negative integer");
  });

  it("rejects floats (parses as int, but 1.5 -> 1)", () => {
    // parseInt("1.5") returns 1, which is valid
    expect(parseNonNegativeInt("1.5", "--limit")).toBe(1);
  });

  it("rejects empty string", () => {
    expect(() => parseNonNegativeInt("", "--limit")).toThrow(CliError);
  });

  it("includes flag name in error message", () => {
    expect(() => parseNonNegativeInt("bad", "--coin-type")).toThrow("--coin-type");
  });

  it("throws CliError with INPUT_ERROR exit code", () => {
    try {
      parseNonNegativeInt("bad", "--limit");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(CliError);
      expect((e as CliError).exitCode).toBe(ExitCode.INPUT_ERROR);
    }
  });
});

// ── labelhash ────────────────────────────────────────────────────────────────

describe("labelhash", () => {
  it("matches ethers keccak256", () => {
    const label = "agent-0";
    const expected = ethers.keccak256(ethers.toUtf8Bytes(label));
    expect(labelhash(label)).toBe(expected);
  });

  it("is deterministic", () => {
    expect(labelhash("test")).toBe(labelhash("test"));
  });

  it("produces different hashes for different labels", () => {
    expect(labelhash("agent-0")).not.toBe(labelhash("agent-1"));
  });

  it("returns a 66-char hex string (0x + 64)", () => {
    const hash = labelhash("test");
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

// ── makeNode ─────────────────────────────────────────────────────────────────

describe("makeNode", () => {
  it("computes child node from parent and label", () => {
    const parent = "0x" + "00".repeat(32);
    const label = "test";
    const expected = ethers.keccak256(
      ethers.concat([parent, labelhash(label)])
    );
    expect(makeNode(parent, label)).toBe(expected);
  });

  it("is deterministic", () => {
    const parent = CHAIN_CONFIGS[8453].PARENT_NODE;
    expect(makeNode(parent, "agent-0")).toBe(makeNode(parent, "agent-0"));
  });

  it("different labels produce different nodes", () => {
    const parent = CHAIN_CONFIGS[8453].PARENT_NODE;
    expect(makeNode(parent, "agent-0")).not.toBe(makeNode(parent, "agent-1"));
  });
});

// ── getNodeForLabel ──────────────────────────────────────────────────────────

describe("getNodeForLabel", () => {
  it("uses the chain's PARENT_NODE", () => {
    const baseParent = CHAIN_CONFIGS[8453].PARENT_NODE;
    const expected = makeNode(baseParent, "agent-0");
    expect(getNodeForLabel("agent-0", 8453)).toBe(expected);
  });

  it("different chains produce different nodes for same label", () => {
    const baseNode = getNodeForLabel("agent-0", 8453);
    const ethNode = getNodeForLabel("agent-0", 1);
    expect(baseNode).not.toBe(ethNode);
  });
});

// ── resolveName ──────────────────────────────────────────────────────────────

describe("resolveName", () => {
  it("resolves full domain with .base.xid.eth suffix", () => {
    const result = resolveName("agent-0.base.xid.eth");
    expect(result.chainId).toBe(8453);
    expect(result.path).toBe("agent-0");
    expect(result.domain).toBe("agent-0.base.xid.eth");
    expect(result.topLabel).toBe("agent-0");
  });

  it("resolves full domain with .eth.xid.eth suffix", () => {
    const result = resolveName("agent-0.eth.xid.eth");
    expect(result.chainId).toBe(1);
    expect(result.path).toBe("agent-0");
  });

  it("resolves full domain with .op.xid.eth suffix", () => {
    const result = resolveName("agent-0.op.xid.eth");
    expect(result.chainId).toBe(10);
  });

  it("resolves full domain with .arb.xid.eth suffix", () => {
    const result = resolveName("agent-0.arb.xid.eth");
    expect(result.chainId).toBe(42161);
  });

  it("resolves full domain with .sep.xid.eth suffix", () => {
    const result = resolveName("agent-0.sep.xid.eth");
    expect(result.chainId).toBe(11155111);
  });

  it("resolves multi-level path in full domain", () => {
    const result = resolveName("neo.agent-0.base.xid.eth");
    expect(result.chainId).toBe(8453);
    expect(result.path).toBe("neo.agent-0");
    expect(result.topLabel).toBe("agent-0");
    expect(result.domain).toBe("neo.agent-0.base.xid.eth");
  });

  it("resolves short label with --chain flag", () => {
    const result = resolveName("agent-0", "base");
    expect(result.chainId).toBe(8453);
    expect(result.path).toBe("agent-0");
    expect(result.domain).toBe("agent-0.base.xid.eth");
  });

  it("resolves short path with --chain flag", () => {
    const result = resolveName("neo.agent-0", "base");
    expect(result.chainId).toBe(8453);
    expect(result.path).toBe("neo.agent-0");
    expect(result.topLabel).toBe("agent-0");
  });

  it("defaults to Base (8453) when no chain flag", () => {
    const result = resolveName("agent-0");
    expect(result.chainId).toBe(8453);
  });

  it("computes correct node for single label", () => {
    const result = resolveName("agent-0", "base");
    const expected = getNodeForLabel("agent-0", 8453);
    expect(result.node).toBe(expected);
  });

  it("computes correct node for multi-level path", () => {
    const result = resolveName("neo.agent-0", "base");
    // Hash right to left: agent-0 under PARENT_NODE, then neo under that
    const baseParent = CHAIN_CONFIGS[8453].PARENT_NODE;
    const agentNode = makeNode(baseParent, "agent-0");
    const expected = makeNode(agentNode, "neo");
    expect(result.node).toBe(expected);
  });

  it("validates labels in path", () => {
    expect(() => resolveName("INVALID.base.xid.eth")).toThrow("Invalid label");
  });

  it("validates each segment of multi-level path", () => {
    expect(() => resolveName("good.BAD", "base")).toThrow("Invalid label");
  });
});

// ── formatDomainName ─────────────────────────────────────────────────────────

describe("formatDomainName", () => {
  it("appends correct suffix for Base", () => {
    expect(formatDomainName("agent-0", 8453)).toBe("agent-0.base.xid.eth");
  });

  it("appends correct suffix for Ethereum", () => {
    expect(formatDomainName("agent-0", 1)).toBe("agent-0.eth.xid.eth");
  });

  it("appends correct suffix for Sepolia", () => {
    expect(formatDomainName("agent-0", 11155111)).toBe("agent-0.sep.xid.eth");
  });
});

// ── formatUsdc ───────────────────────────────────────────────────────────────

describe("formatUsdc", () => {
  it("formats 1 USDC (6 decimals)", () => {
    expect(formatUsdc(1_000_000n)).toBe("1.0");
  });

  it("formats zero", () => {
    expect(formatUsdc(0n)).toBe("0.0");
  });

  it("formats fractional amounts", () => {
    expect(formatUsdc(500_000n)).toBe("0.5");
  });

  it("formats large amounts", () => {
    expect(formatUsdc(1_000_000_000_000n)).toBe("1000000.0");
  });
});

// ── CliError ─────────────────────────────────────────────────────────────────

describe("CliError", () => {
  it("default exit code is GENERAL_ERROR", () => {
    const err = new CliError("test");
    expect(err.exitCode).toBe(ExitCode.GENERAL_ERROR);
  });

  it("preserves custom exit code", () => {
    const err = new CliError("test", ExitCode.AUTH_ERROR);
    expect(err.exitCode).toBe(ExitCode.AUTH_ERROR);
  });

  it("preserves message", () => {
    const err = new CliError("something went wrong");
    expect(err.message).toBe("something went wrong");
  });

  it("is an instance of Error", () => {
    const err = new CliError("test");
    expect(err).toBeInstanceOf(Error);
  });
});
