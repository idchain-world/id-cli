import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ExitCode } from "../../src/utils.js";

// Valid Anvil account 0 private key
const VALID_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const VALID_KEY_NO_PREFIX = "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

describe("getWallet", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.RPC_URL = "http://localhost:8545";
    delete process.env.OWS_WALLET;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("throws AUTH_ERROR when PRIVATE_KEY is not set", async () => {
    delete process.env.PRIVATE_KEY;
    const { getWallet } = await import("../../src/provider.js");
    try {
      getWallet();
      expect.unreachable("should have thrown");
    } catch (e: any) {
      expect(e.exitCode).toBe(ExitCode.AUTH_ERROR);
      expect(e.message).toContain("PRIVATE_KEY");
    }
  });

  it("throws INPUT_ERROR for too-short key", async () => {
    process.env.PRIVATE_KEY = "0x1234";
    const { getWallet } = await import("../../src/provider.js");
    try {
      getWallet();
      expect.unreachable("should have thrown");
    } catch (e: any) {
      expect(e.exitCode).toBe(ExitCode.INPUT_ERROR);
      expect(e.message).toContain("64-character hex");
    }
  });

  it("throws INPUT_ERROR for non-hex key", async () => {
    process.env.PRIVATE_KEY = "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz";
    const { getWallet } = await import("../../src/provider.js");
    try {
      getWallet();
      expect.unreachable("should have thrown");
    } catch (e: any) {
      expect(e.exitCode).toBe(ExitCode.INPUT_ERROR);
    }
  });

  it("accepts valid 66-char key with 0x prefix", async () => {
    process.env.PRIVATE_KEY = VALID_KEY;
    const { getWallet } = await import("../../src/provider.js");
    const wallet = getWallet();
    expect(wallet.address).toBe("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
  });

  it("accepts valid 64-char key without 0x prefix", async () => {
    process.env.PRIVATE_KEY = VALID_KEY_NO_PREFIX;
    const { getWallet } = await import("../../src/provider.js");
    const wallet = getWallet();
    expect(wallet.address).toBe("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
  });

  it("does not include private key in error messages", async () => {
    process.env.PRIVATE_KEY = "0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG";
    const { getWallet } = await import("../../src/provider.js");
    try {
      getWallet();
      expect.unreachable("should have thrown");
    } catch (e: any) {
      expect(e.message).not.toContain("GGGG");
    }
  });
});

describe("getProvider", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns a provider", async () => {
    const { getProvider } = await import("../../src/provider.js");
    const provider = getProvider();
    expect(provider).toBeDefined();
  });

  it("uses RPC_URL_BASE override when set", async () => {
    process.env.RPC_URL_BASE = "http://custom-rpc:8545";
    const { getProvider } = await import("../../src/provider.js");
    const provider = getProvider();
    expect(provider).toBeDefined();
  });

  it("uses global RPC_URL override", async () => {
    process.env.RPC_URL = "http://global-rpc:8545";
    const { getProvider } = await import("../../src/provider.js");
    const provider = getProvider();
    expect(provider).toBeDefined();
  });
});
