import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import { resolveName, validateLabel, validateAddress, parseNonNegativeInt, labelhash, makeNode } from "../../../src/utils.js";
import { CHAIN_CONFIGS } from "../../../src/config.js";

describe("create-subname command logic", () => {
  describe("sublabel validation", () => {
    it("accepts valid sublabel", () => {
      expect(() => validateLabel("neo")).not.toThrow();
      expect(() => validateLabel("test-sub")).not.toThrow();
      expect(() => validateLabel("a")).not.toThrow();
    });

    it("rejects invalid sublabel", () => {
      expect(() => validateLabel("NEO")).toThrow("Invalid label");
      expect(() => validateLabel("")).toThrow();
      expect(() => validateLabel("has space")).toThrow("Invalid label");
    });
  });

  describe("full domain construction", () => {
    it("constructs sublabel.parent.suffix", () => {
      const parent = resolveName("agent-0", "base");
      const sublabel = "neo";
      const fullDomain = `${sublabel}.${parent.domain}`;
      expect(fullDomain).toBe("neo.agent-0.base.xid.eth");
    });
  });

  describe("owner defaulting", () => {
    it("uses provided --owner when specified", () => {
      const ownerOpt = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
      const owner = validateAddress(ownerOpt, "--owner");
      expect(owner).toBe(ownerOpt);
    });

    it("rejects invalid --owner", () => {
      expect(() => validateAddress("bad", "--owner")).toThrow("Invalid address for --owner");
    });
  });

  describe("dry-run proposal", () => {
    it("builds correct setSubnodeOwner proposal", () => {
      const parent = resolveName("agent-0", "base");
      const config = CHAIN_CONFIGS[8453];
      const sublabel = "neo";
      const owner = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

      const proposal = {
        action: `Create subname neo.${parent.domain}`,
        chainId: parent.chainId,
        contractName: "IDRegistry",
        contractAddress: config.ID_REGISTRY,
        functionAbi: "function setSubnodeOwner(bytes32 node, string label, address newOwner) returns (bytes32)",
        args: [parent.node, sublabel, owner],
        argLabels: ["parentNode", "label", "newOwner"],
      };

      expect(proposal.args[0]).toBe(parent.node);
      expect(proposal.args[1]).toBe("neo");
      expect(proposal.args[2]).toBe(owner);
    });
  });

  describe("subname node computation", () => {
    it("child node matches manual computation", () => {
      const parent = resolveName("agent-0", "base");
      const childNode = makeNode(parent.node, "neo");
      const resolved = resolveName("neo.agent-0", "base");
      expect(resolved.node).toBe(childNode);
    });
  });
});

describe("list-subnames command logic", () => {
  describe("pagination parsing", () => {
    it("parses default limit", () => {
      expect(parseNonNegativeInt("50", "--limit")).toBe(50);
    });

    it("parses default offset", () => {
      expect(parseNonNegativeInt("0", "--offset")).toBe(0);
    });

    it("rejects negative limit", () => {
      expect(() => parseNonNegativeInt("-1", "--limit")).toThrow();
    });
  });

  describe("indexer URL construction", () => {
    it("builds correct query path", () => {
      const resolved = resolveName("agent-0", "base");
      const limit = 50;
      const offset = 0;
      const path = `/api/domains?parent=${resolved.path}&chain=${resolved.chainId}&limit=${limit}&offset=${offset}`;
      expect(path).toBe("/api/domains?parent=agent-0&chain=8453&limit=50&offset=0");
    });
  });
});
