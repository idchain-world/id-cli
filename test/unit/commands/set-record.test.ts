import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import { resolveName, CliError, ExitCode } from "../../../src/utils.js";
import { getConfig } from "../../../src/config.js";

function parseTextPairs(pairs: string[]): { keys: string[]; values: string[] } {
  const keys: string[] = [];
  const values: string[] = [];
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    if (eq === -1) throw new CliError(`Invalid text record: "${pair}". Use key=value format.`, ExitCode.INPUT_ERROR);
    keys.push(pair.slice(0, eq));
    values.push(pair.slice(eq + 1));
  }
  return { keys, values };
}

function parseAddrPairs(pairs: string[]): { coinTypes: bigint[]; addresses: string[] } {
  const coinTypes: bigint[] = [];
  const addresses: string[] = [];
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    if (eq === -1) throw new CliError(`Invalid addr record: "${pair}". Use coinType=address format.`, ExitCode.INPUT_ERROR);
    const ct = parseInt(pair.slice(0, eq), 10);
    if (isNaN(ct) || ct < 0) throw new CliError(`Invalid coin type: "${pair.slice(0, eq)}".`, ExitCode.INPUT_ERROR);
    coinTypes.push(BigInt(ct));
    if (ct === 60) {
      addresses.push(ethers.getAddress(pair.slice(eq + 1)));
    } else {
      addresses.push(pair.slice(eq + 1));
    }
  }
  return { coinTypes, addresses };
}

function parseDataPairs(pairs: string[]): { keys: string[]; values: string[] } {
  const keys: string[] = [];
  const values: string[] = [];
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    if (eq === -1) throw new CliError(`Invalid data record: "${pair}". Use key=hexvalue format.`, ExitCode.INPUT_ERROR);
    keys.push(pair.slice(0, eq));
    values.push(pair.slice(eq + 1));
  }
  return { keys, values };
}

describe("set-record command logic", () => {
  describe("text record pair parsing", () => {
    it("parses valid key=value pair", () => {
      const { keys, values } = parseTextPairs(["description=my agent"]);
      expect(keys).toEqual(["description"]);
      expect(values).toEqual(["my agent"]);
    });

    it("handles values containing = signs", () => {
      const { keys, values } = parseTextPairs(["url=https://example.com?a=1&b=2"]);
      expect(keys).toEqual(["url"]);
      expect(values).toEqual(["https://example.com?a=1&b=2"]);
    });

    it("handles empty values", () => {
      const { keys, values } = parseTextPairs(["description="]);
      expect(keys).toEqual(["description"]);
      expect(values).toEqual([""]);
    });

    it("parses multiple pairs", () => {
      const { keys, values } = parseTextPairs(["name=agent", "url=https://x.com"]);
      expect(keys).toEqual(["name", "url"]);
      expect(values).toEqual(["agent", "https://x.com"]);
    });

    it("throws on missing separator", () => {
      expect(() => parseTextPairs(["nodescription"])).toThrow(CliError);
      expect(() => parseTextPairs(["nodescription"])).toThrow("key=value");
    });
  });

  describe("addr record pair parsing", () => {
    it("parses ETH address (coin type 60)", () => {
      const addr = "0x1234567890abcdef1234567890abcdef12345678";
      const { coinTypes, addresses } = parseAddrPairs([`60=${addr}`]);
      expect(coinTypes).toEqual([60n]);
      expect(addresses[0]).toBe(ethers.getAddress(addr));
    });

    it("parses non-ETH coin type", () => {
      const { coinTypes, addresses } = parseAddrPairs(["0=0x76a914abcdef"]);
      expect(coinTypes).toEqual([0n]);
      expect(addresses[0]).toBe("0x76a914abcdef");
    });

    it("throws on missing separator", () => {
      expect(() => parseAddrPairs(["60-0xabc"])).toThrow(CliError);
    });

    it("throws on invalid coin type", () => {
      expect(() => parseAddrPairs(["abc=0x123"])).toThrow("Invalid coin type");
    });

    it("throws on negative coin type", () => {
      expect(() => parseAddrPairs(["-1=0x123"])).toThrow(CliError);
    });
  });

  describe("data record pair parsing", () => {
    it("parses valid key=hexvalue pair", () => {
      const { keys, values } = parseDataPairs(["avatar=0xdeadbeef"]);
      expect(keys).toEqual(["avatar"]);
      expect(values).toEqual(["0xdeadbeef"]);
    });

    it("throws on missing separator", () => {
      expect(() => parseDataPairs(["nohex"])).toThrow(CliError);
    });
  });

  describe("ETH address encoding with zeroPadValue", () => {
    it("encodes ETH address to 20 bytes via zeroPadValue", () => {
      const addr = ethers.getAddress("0x1234567890abcdef1234567890abcdef12345678");
      const padded = ethers.zeroPadValue(addr, 20);
      const bytes = ethers.getBytes(padded);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(20);
    });
  });

  describe("data record byte conversion", () => {
    it("converts hex string to bytes", () => {
      const bytes = ethers.getBytes("0xdeadbeef");
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(4);
    });

    it("throws on invalid hex", () => {
      expect(() => ethers.getBytes("not-hex")).toThrow();
    });
  });

  describe("total record count and validation", () => {
    it("counts all record types", () => {
      const textKeys = ["name"];
      const coinTypes = [60n, 0n];
      const dataKeys = ["avatar"];
      const contentHash = "0xe301";
      const total = textKeys.length + coinTypes.length + dataKeys.length + (contentHash !== "0x" ? 1 : 0);
      expect(total).toBe(5);
    });

    it("excludes default contenthash from count", () => {
      const textKeys = ["name"];
      const coinTypes: bigint[] = [];
      const dataKeys: string[] = [];
      const contentHash = "0x";
      const total = textKeys.length + coinTypes.length + dataKeys.length + (contentHash !== "0x" ? 1 : 0);
      expect(total).toBe(1);
    });

    it("throws when no records specified", () => {
      const totalRecords = 0;
      expect(() => {
        if (totalRecords === 0) {
          throw new CliError("No records specified.", ExitCode.INPUT_ERROR);
        }
      }).toThrow(CliError);
    });
  });

  describe("dry-run proposal construction", () => {
    it("builds correct bulk set proposal", () => {
      const resolved = resolveName("agent-0");
      const config = getConfig();
      const textKeys = ["description"];
      const textValues = ["test agent"];
      const coinTypes = [60n];
      const addresses = [ethers.getAddress("0x1234567890abcdef1234567890abcdef12345678")];
      const contentHash = "0xe301";
      const dataKeys = ["avatar"];
      const dataValues = ["0xdeadbeef"];
      const totalRecords = textKeys.length + coinTypes.length + dataKeys.length + 1;

      const addrBytes = addresses.map((addr, i) =>
        coinTypes[i] === 60n ? ethers.getBytes(ethers.zeroPadValue(addr, 20)) : ethers.getBytes(addr)
      );
      const dataValueBytes = dataValues.map((v) => ethers.getBytes(v));

      const proposal = {
        action: `Bulk set ${totalRecords} record(s) on ${resolved.domain}`,
        contractName: "IDRegistry",
        contractAddress: config.ID_REGISTRY,
        functionAbi: "function setRecord(bytes32 node, string[] keys, string[] values, uint256[] coinTypes, bytes[] addresses, bytes contentHash, string[] dataKeys, bytes[] dataValues)",
        args: [resolved.node, textKeys, textValues, coinTypes, addrBytes, contentHash, dataKeys, dataValueBytes],
        argLabels: ["node", "textKeys", "textValues", "coinTypes", "addresses", "contentHash", "dataKeys", "dataValues"],
      };

      expect(proposal.action).toBe(`Bulk set 4 record(s) on ${resolved.domain}`);
      expect(proposal.args[0]).toBe(resolved.node);
      expect(proposal.args[1]).toEqual(["description"]);
      expect(addrBytes[0]).toBeInstanceOf(Uint8Array);
      expect(addrBytes[0].length).toBe(20);
    });
  });
});
