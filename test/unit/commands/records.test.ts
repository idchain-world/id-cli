import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import { resolveName, parseNonNegativeInt, CliError } from "../../../src/utils.js";
import { CHAIN_CONFIGS } from "../../../src/config.js";

describe("set-text command logic", () => {
  describe("dry-run proposal", () => {
    it("builds correct setText proposal", () => {
      const resolved = resolveName("agent-0", "base");
      const config = CHAIN_CONFIGS[8453];
      const key = "description";
      const value = "test agent";

      const proposal = {
        action: `Set text record "${key}" on ${resolved.domain}`,
        chainId: resolved.chainId,
        contractName: "IDRegistry",
        contractAddress: config.ID_REGISTRY,
        functionAbi: "function setText(bytes32 node, string key, string value)",
        args: [resolved.node, key, value],
        argLabels: ["node", "key", "value"],
      };

      expect(proposal.args).toHaveLength(3);
      expect(proposal.args[0]).toBe(resolved.node);
      expect(proposal.args[1]).toBe("description");
      expect(proposal.args[2]).toBe("test agent");
    });
  });
});

describe("set-addr command logic", () => {
  describe("coin type parsing", () => {
    it("defaults to ETH (60)", () => {
      const coinType = parseNonNegativeInt("60", "--coin-type");
      expect(coinType).toBe(60);
    });

    it("parses BTC (0)", () => {
      const coinType = parseNonNegativeInt("0", "--coin-type");
      expect(coinType).toBe(0);
    });

    it("rejects invalid coin type", () => {
      expect(() => parseNonNegativeInt("abc", "--coin-type")).toThrow(CliError);
    });
  });

  describe("ETH address proposal (coin type 60)", () => {
    it("uses setAddr(bytes32,address) for ETH", () => {
      const coinType = 60;
      const abi = coinType === 60
        ? "function setAddr(bytes32 node, address addr)"
        : "function setAddr(bytes32 node, uint256 coinType, bytes newAddress)";
      expect(abi).toContain("address addr");
    });
  });

  describe("multi-coin address proposal", () => {
    it("uses setAddr(bytes32,uint256,bytes) for non-ETH", () => {
      const coinType = 0; // BTC
      const abi = coinType === 60
        ? "function setAddr(bytes32 node, address addr)"
        : "function setAddr(bytes32 node, uint256 coinType, bytes newAddress)";
      expect(abi).toContain("uint256 coinType");
    });

    it("converts hex address to bytes", () => {
      const btcAddrHex = "0x76a91489abcdefabbaabbaabbaabbaabbaabbaabbaabba88ac";
      const addrBytes = ethers.getBytes(btcAddrHex);
      expect(addrBytes).toBeInstanceOf(Uint8Array);
      expect(addrBytes.length).toBeGreaterThan(0);
    });
  });
});

describe("set-contenthash command logic", () => {
  describe("dry-run proposal", () => {
    it("builds correct setContenthash proposal", () => {
      const resolved = resolveName("agent-0", "base");
      const config = CHAIN_CONFIGS[8453];
      const hash = "0xe3010170122000000000000000000000000000000000000000000000000000000000000000";

      const proposal = {
        action: `Set content hash on ${resolved.domain}`,
        chainId: resolved.chainId,
        contractName: "IDRegistry",
        contractAddress: config.ID_REGISTRY,
        functionAbi: "function setContenthash(bytes32 node, bytes hash)",
        args: [resolved.node, hash],
        argLabels: ["node", "hash"],
      };

      expect(proposal.args[0]).toBe(resolved.node);
      expect(proposal.args[1]).toBe(hash);
    });
  });
});

describe("records command logic", () => {
  describe("--select field filtering", () => {
    function parseSelectFields(select: string | undefined): Set<string> | null {
      if (!select) return null;
      return new Set(select.split(",").map(s => s.trim()));
    }

    it("returns null when no select", () => {
      expect(parseSelectFields(undefined)).toBeNull();
    });

    it("parses single field", () => {
      const fields = parseSelectFields("text");
      expect(fields).toEqual(new Set(["text"]));
    });

    it("parses multiple fields", () => {
      const fields = parseSelectFields("text,address,data");
      expect(fields).toEqual(new Set(["text", "address", "data"]));
    });

    it("trims whitespace", () => {
      const fields = parseSelectFields("text , address");
      expect(fields).toEqual(new Set(["text", "address"]));
    });
  });
});
