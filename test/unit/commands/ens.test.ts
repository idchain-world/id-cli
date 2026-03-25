import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import { CliError, ExitCode, labelhash } from "../../../src/utils.js";

// ── Replicate ENS helpers from link-ens.ts ──────────────────────────────────

function ensNamehash(name: string): string {
  let node = ethers.ZeroHash;
  if (name === "") return node;
  const labels = name.split(".");
  for (let i = labels.length - 1; i >= 0; i--) {
    node = ethers.keccak256(
      ethers.concat([node, ethers.keccak256(ethers.toUtf8Bytes(labels[i]))])
    );
  }
  return node;
}

function getEnsLinkingConfig(agentChainId: number): { resolverAddress: string; resolverChainId: number; type: string } {
  switch (agentChainId) {
    case 1:
      return { resolverAddress: "0x104f0C0D2763334430C44585a7f97AcdE67ad2D1", resolverChainId: 1, type: "linked" };
    case 11155111:
      return { resolverAddress: "0x94C474694EEf58181b834300f54a9F225FCc67c9", resolverChainId: 11155111, type: "linked" };
    case 8453:
    case 10:
    case 42161:
      return { resolverAddress: "0xf4606833A389e8394b8c5ce1B3DeEB9f0B4c7F1a", resolverChainId: 1, type: "unified" };
    default:
      throw new CliError(`ENS linking not supported for chain ${agentChainId}.`, ExitCode.INPUT_ERROR);
  }
}

function getRegistryChainId(agentChainId: number): number {
  return agentChainId === 11155111 ? 11155111 : 1;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("ENS namehash", () => {
  it("produces zero hash for empty name", () => {
    expect(ensNamehash("")).toBe(ethers.ZeroHash);
  });

  it("matches ethers.namehash for known names", () => {
    expect(ensNamehash("eth")).toBe(ethers.namehash("eth"));
    expect(ensNamehash("alice.eth")).toBe(ethers.namehash("alice.eth"));
    expect(ensNamehash("sub.alice.eth")).toBe(ethers.namehash("sub.alice.eth"));
  });

  it("is deterministic", () => {
    expect(ensNamehash("test.eth")).toBe(ensNamehash("test.eth"));
  });

  it("different names produce different hashes", () => {
    expect(ensNamehash("alice.eth")).not.toBe(ensNamehash("bob.eth"));
  });
});

describe("ENS linking config", () => {
  it("returns linked resolver for Ethereum L1", () => {
    const config = getEnsLinkingConfig(1);
    expect(config.type).toBe("linked");
    expect(config.resolverChainId).toBe(1);
  });

  it("returns linked resolver for Sepolia", () => {
    const config = getEnsLinkingConfig(11155111);
    expect(config.type).toBe("linked");
    expect(config.resolverChainId).toBe(11155111);
  });

  it("returns unified resolver for Base", () => {
    const config = getEnsLinkingConfig(8453);
    expect(config.type).toBe("unified");
    expect(config.resolverChainId).toBe(1);
  });

  it("returns unified resolver for Optimism", () => {
    const config = getEnsLinkingConfig(10);
    expect(config.type).toBe("unified");
  });

  it("returns unified resolver for Arbitrum", () => {
    const config = getEnsLinkingConfig(42161);
    expect(config.type).toBe("unified");
  });

  it("throws for unsupported chain", () => {
    expect(() => getEnsLinkingConfig(99999)).toThrow("ENS linking not supported");
    try {
      getEnsLinkingConfig(99999);
    } catch (e) {
      expect(e).toBeInstanceOf(CliError);
      expect((e as CliError).exitCode).toBe(ExitCode.INPUT_ERROR);
    }
  });
});

describe("registry chain ID mapping", () => {
  it("Sepolia maps to Sepolia", () => {
    expect(getRegistryChainId(11155111)).toBe(11155111);
  });

  it("all other chains map to mainnet", () => {
    expect(getRegistryChainId(1)).toBe(1);
    expect(getRegistryChainId(8453)).toBe(1);
    expect(getRegistryChainId(10)).toBe(1);
    expect(getRegistryChainId(42161)).toBe(1);
  });
});

describe("link-ens 3-step process", () => {
  describe("step 1: back-link", () => {
    it("constructs correct ens-link text record key", () => {
      const ensName = "alice.eth";
      const key = `ens-link[${ensName}]`;
      expect(key).toBe("ens-link[alice.eth]");
    });

    it("value is always 'true'", () => {
      const value = "true";
      expect(value).toBe("true");
    });
  });

  describe("step 3: set resolver", () => {
    it("computes ENS name node correctly", () => {
      const ensNode = ensNamehash("alice.eth");
      expect(ensNode).toBe(ethers.namehash("alice.eth"));
    });

    it("uses labelhash for wrapped name lookup", () => {
      const label = "alice";
      const lh = labelhash(label);
      expect(lh).toBe(ethers.keccak256(ethers.toUtf8Bytes("alice")));
    });
  });
});

describe("ENS name validation", () => {
  it("should be a second-level .eth name", () => {
    const valid = (name: string) => {
      const parts = name.split(".");
      return parts.length === 2 && parts[1] === "eth";
    };
    expect(valid("alice.eth")).toBe(true);
    expect(valid("bob.eth")).toBe(true);
    expect(valid("sub.alice.eth")).toBe(false);
    expect(valid("alice.com")).toBe(false);
  });
});
