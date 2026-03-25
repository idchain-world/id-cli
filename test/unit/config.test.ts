import { describe, it, expect, afterEach, vi } from "vitest";
import { getChainConfig, resolveChain, CHAIN_CONFIGS, DEFAULT_CHAIN } from "../../src/config.js";

describe("CHAIN_CONFIGS", () => {
  it("defines 5 chains", () => {
    const chainIds = Object.keys(CHAIN_CONFIGS).map(Number);
    expect(chainIds).toEqual(expect.arrayContaining([1, 8453, 10, 42161, 11155111]));
    expect(chainIds).toHaveLength(5);
  });

  it("each chain has required fields", () => {
    for (const config of Object.values(CHAIN_CONFIGS)) {
      expect(config.chainId).toBeTypeOf("number");
      expect(config.name).toBeTypeOf("string");
      expect(config.shortName).toBeTypeOf("string");
      expect(config.suffix).toMatch(/\.xid\.eth$/);
      expect(config.rpc).toMatch(/^https?:\/\//);
      expect(config.explorer).toMatch(/^https?:\/\//);
      expect(config.PARENT_NODE).toMatch(/^0x[0-9a-f]{64}$/);
      expect(config.ID_REGISTRY).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(config.ID_AGENT_REGISTRAR).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(config.IDENTITY_REGISTRY_8004).toMatch(/^0x[0-9a-fA-F]{40}$/);
    }
  });

  it("each chain has a unique suffix", () => {
    const suffixes = Object.values(CHAIN_CONFIGS).map(c => c.suffix);
    expect(new Set(suffixes).size).toBe(suffixes.length);
  });

  it("each chain has a unique PARENT_NODE", () => {
    const nodes = Object.values(CHAIN_CONFIGS).map(c => c.PARENT_NODE);
    expect(new Set(nodes).size).toBe(nodes.length);
  });
});

describe("DEFAULT_CHAIN", () => {
  it("is Base (8453)", () => {
    expect(DEFAULT_CHAIN).toBe(8453);
  });
});

describe("getChainConfig", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns config for each valid chain ID", () => {
    expect(getChainConfig(1).name).toBe("Ethereum");
    expect(getChainConfig(8453).name).toBe("Base");
    expect(getChainConfig(10).name).toBe("Optimism");
    expect(getChainConfig(42161).name).toBe("Arbitrum");
    expect(getChainConfig(11155111).name).toBe("Sepolia");
  });

  it("throws for unsupported chain ID", () => {
    expect(() => getChainConfig(99999)).toThrow("Unsupported chain");
  });

  it("uses per-chain RPC_URL_BASE override", () => {
    process.env.RPC_URL_BASE = "http://custom:8545";
    const config = getChainConfig(8453);
    expect(config.rpc).toBe("http://custom:8545");
  });

  it("uses per-chain RPC_URL_ETH override", () => {
    process.env.RPC_URL_ETH = "http://custom-eth:8545";
    const config = getChainConfig(1);
    expect(config.rpc).toBe("http://custom-eth:8545");
  });

  it("uses global RPC_URL as fallback", () => {
    process.env.RPC_URL = "http://global:8545";
    const config = getChainConfig(8453);
    expect(config.rpc).toBe("http://global:8545");
  });

  it("per-chain override takes priority over global", () => {
    process.env.RPC_URL = "http://global:8545";
    process.env.RPC_URL_BASE = "http://per-chain:8545";
    const config = getChainConfig(8453);
    expect(config.rpc).toBe("http://per-chain:8545");
  });

  it("returns default RPC when no env overrides", () => {
    delete process.env.RPC_URL;
    delete process.env.RPC_URL_BASE;
    const config = getChainConfig(8453);
    expect(config.rpc).toBe("https://mainnet.base.org");
  });

  it("does not mutate the original config", () => {
    process.env.RPC_URL_BASE = "http://mutant:8545";
    getChainConfig(8453);
    expect(CHAIN_CONFIGS[8453].rpc).toBe("https://mainnet.base.org");
  });
});

describe("resolveChain", () => {
  it("resolves short names", () => {
    expect(resolveChain("base")).toBe(8453);
    expect(resolveChain("eth")).toBe(1);
    expect(resolveChain("op")).toBe(10);
    expect(resolveChain("arb")).toBe(42161);
    expect(resolveChain("sep")).toBe(11155111);
  });

  it("resolves full names", () => {
    expect(resolveChain("ethereum")).toBe(1);
    expect(resolveChain("optimism")).toBe(10);
    expect(resolveChain("arbitrum")).toBe(42161);
  });

  it("resolves 'sepolia' alias", () => {
    expect(resolveChain("sepolia")).toBe(11155111);
  });

  it("is case insensitive", () => {
    expect(resolveChain("Base")).toBe(8453);
    expect(resolveChain("BASE")).toBe(8453);
    expect(resolveChain("Ethereum")).toBe(1);
  });

  it("resolves numeric chain IDs as strings", () => {
    expect(resolveChain("8453")).toBe(8453);
    expect(resolveChain("1")).toBe(1);
    expect(resolveChain("11155111")).toBe(11155111);
  });

  it("throws for unknown chain name", () => {
    expect(() => resolveChain("fakenet")).toThrow("Unknown chain");
  });

  it("throws for unknown numeric ID", () => {
    expect(() => resolveChain("99999")).toThrow("Unknown chain");
  });
});
