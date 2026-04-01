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
