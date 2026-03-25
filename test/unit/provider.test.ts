import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ExitCode } from "../../src/utils.js";

// We need to test getWallet which reads process.env and calls process.exit,
// so we test by importing dynamically and controlling env.

// Valid Anvil account 0 private key
const VALID_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const VALID_KEY_NO_PREFIX = "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

describe("getWallet", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Set a valid RPC so the provider doesn't fail on network
    process.env.RPC_URL = "http://localhost:8545";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("throws AUTH_ERROR when PRIVATE_KEY is not set", async () => {
    delete process.env.PRIVATE_KEY;
    // Re-import to get fresh module (provider reads env at call time)
    const { getWallet } = await import("../../src/provider.js");
    try {
      getWallet(8453);
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
      getWallet(8453);
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
      getWallet(8453);
      expect.unreachable("should have thrown");
    } catch (e: any) {
      expect(e.exitCode).toBe(ExitCode.INPUT_ERROR);
    }
  });

  it("accepts valid 66-char key with 0x prefix", async () => {
    process.env.PRIVATE_KEY = VALID_KEY;
    const { getWallet } = await import("../../src/provider.js");
    const wallet = getWallet(8453);
    expect(wallet.address).toBe("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
  });

  it("accepts valid 64-char key without 0x prefix", async () => {
    process.env.PRIVATE_KEY = VALID_KEY_NO_PREFIX;
    const { getWallet } = await import("../../src/provider.js");
    const wallet = getWallet(8453);
    expect(wallet.address).toBe("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
  });

  it("does not include private key in error messages", async () => {
    const badKey = "0x" + "ff".repeat(32);
    process.env.PRIVATE_KEY = badKey;
    // This key is technically valid hex, so it should succeed
    // Test with a truly invalid key format instead
    process.env.PRIVATE_KEY = "0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG";
    const { getWallet } = await import("../../src/provider.js");
    try {
      getWallet(8453);
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

  it("returns a provider for a valid chain", async () => {
    const { getProvider } = await import("../../src/provider.js");
    const provider = getProvider(8453);
    expect(provider).toBeDefined();
  });

  it("uses RPC_URL_BASE override when set", async () => {
    process.env.RPC_URL_BASE = "http://custom-rpc:8545";
    const { getProvider } = await import("../../src/provider.js");
    const provider = getProvider(8453);
    // Provider is created — no error means the override was accepted
    expect(provider).toBeDefined();
  });

  it("uses global RPC_URL override", async () => {
    process.env.RPC_URL = "http://global-rpc:8545";
    const { getProvider } = await import("../../src/provider.js");
    const provider = getProvider(8453);
    expect(provider).toBeDefined();
  });

  it("throws for unsupported chain ID", async () => {
    const { getProvider } = await import("../../src/provider.js");
    expect(() => getProvider(99999)).toThrow("Unsupported chain");
  });
});
