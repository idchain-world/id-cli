import { describe, it, expect, afterEach } from "vitest";
import { getConfig, CHAIN_ID } from "../../src/config.js";

describe("CHAIN_ID", () => {
  it("is Base (8453)", () => {
    expect(CHAIN_ID).toBe(8453);
  });
});

describe("getConfig", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns Base config", () => {
    const config = getConfig();
    expect(config.chainId).toBe(8453);
    expect(config.name).toBe("Base");
    expect(config.shortName).toBe("base");
  });

  it("has required fields", () => {
    const config = getConfig();
    expect(config.suffix).toBe(".xid.eth");
    expect(config.rpc).toMatch(/^https?:\/\//);
    expect(config.explorer).toMatch(/^https?:\/\//);
    expect(config.PARENT_NODE).toMatch(/^0x[0-9a-f]{64}$/);
    expect(config.ID_REGISTRY).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(config.ID_AGENT_REGISTRAR).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(config.IDENTITY_REGISTRY_8004).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("uses RPC_URL_BASE override", () => {
    process.env.RPC_URL_BASE = "http://custom:8545";
    const config = getConfig();
    expect(config.rpc).toBe("http://custom:8545");
  });

  it("uses global RPC_URL as fallback", () => {
    process.env.RPC_URL = "http://global:8545";
    const config = getConfig();
    expect(config.rpc).toBe("http://global:8545");
  });

  it("per-chain override takes priority over global", () => {
    process.env.RPC_URL = "http://global:8545";
    process.env.RPC_URL_BASE = "http://per-chain:8545";
    const config = getConfig();
    expect(config.rpc).toBe("http://per-chain:8545");
  });

  it("returns default RPC when no env overrides", () => {
    delete process.env.RPC_URL;
    delete process.env.RPC_URL_BASE;
    const config = getConfig();
    expect(config.rpc).toBe("https://mainnet.base.org");
  });
});
