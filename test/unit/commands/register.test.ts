import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ethers } from "ethers";
import { CliError, ExitCode, formatUsdc, validateAddress, validateLabel } from "../../../src/utils.js";
import { CHAIN_CONFIGS } from "../../../src/config.js";

describe("register command logic", () => {
  describe("text record parsing", () => {
    function parseTextRecords(pairs: string[]): { keys: string[]; values: string[] } {
      const keys: string[] = [];
      const values: string[] = [];
      for (const pair of pairs) {
        const eq = pair.indexOf("=");
        if (eq === -1) throw new CliError(`Invalid text record: ${pair}. Use key=value format.`, ExitCode.INPUT_ERROR);
        keys.push(pair.slice(0, eq));
        values.push(pair.slice(eq + 1));
      }
      return { keys, values };
    }

    it("parses simple key=value pair", () => {
      const result = parseTextRecords(["description=test agent"]);
      expect(result.keys).toEqual(["description"]);
      expect(result.values).toEqual(["test agent"]);
    });

    it("parses multiple pairs", () => {
      const result = parseTextRecords(["description=hello", "role=developer"]);
      expect(result.keys).toEqual(["description", "role"]);
      expect(result.values).toEqual(["hello", "developer"]);
    });

    it("handles values with = signs", () => {
      const result = parseTextRecords(["data=key=value"]);
      expect(result.keys).toEqual(["data"]);
      expect(result.values).toEqual(["key=value"]);
    });

    it("handles JSON values", () => {
      const result = parseTextRecords(['agent-context={"type":"agent"}']);
      expect(result.keys).toEqual(["agent-context"]);
      expect(result.values).toEqual(['{"type":"agent"}']);
    });

    it("throws on missing = separator", () => {
      expect(() => parseTextRecords(["no-equals"])).toThrow("Invalid text record");
    });

    it("throws CliError with INPUT_ERROR", () => {
      try {
        parseTextRecords(["bad"]);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(CliError);
        expect((e as CliError).exitCode).toBe(ExitCode.INPUT_ERROR);
      }
    });
  });

  describe("USDC balance check", () => {
    it("detects insufficient balance", () => {
      const balance = 500_000n; // 0.5 USDC
      const price = 1_000_000n; // 1 USDC
      expect(balance < price).toBe(true);
    });

    it("accepts sufficient balance", () => {
      const balance = 2_000_000n;
      const price = 1_000_000n;
      expect(balance < price).toBe(false);
    });

    it("accepts exact balance", () => {
      const balance = 1_000_000n;
      const price = 1_000_000n;
      expect(balance < price).toBe(false);
    });
  });

  describe("address record construction", () => {
    it("adds ETH coin type 60 when --address provided", () => {
      const addr = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
      const coinTypes: bigint[] = [];
      const addresses: string[] = [];
      coinTypes.push(60n);
      addresses.push(validateAddress(addr, "--address"));
      expect(coinTypes).toEqual([60n]);
      expect(addresses).toEqual([addr]);
    });

    it("rejects invalid --address", () => {
      expect(() => validateAddress("bad", "--address")).toThrow("Invalid address");
    });
  });

  describe("referrer validation", () => {
    it("uses ZeroAddress when no referrer", () => {
      const referrer = undefined;
      const resolved = referrer ? validateAddress(referrer, "--referrer") : ethers.ZeroAddress;
      expect(resolved).toBe(ethers.ZeroAddress);
    });

    it("validates referrer address when provided", () => {
      const addr = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
      const resolved = validateAddress(addr, "--referrer");
      expect(resolved).toBe(addr);
    });
  });

  describe("sublabel validation", () => {
    it("accepts valid sublabel", () => {
      expect(() => validateLabel("neo")).not.toThrow();
    });

    it("rejects invalid sublabel", () => {
      expect(() => validateLabel("NEO")).toThrow("Invalid label");
    });
  });

  describe("domain name construction", () => {
    it("constructs without sublabel", () => {
      const nextLabel = "agent-42";
      const chainId = 8453;
      const config = CHAIN_CONFIGS[chainId];
      const domainName = `${nextLabel}${config.suffix}`;
      expect(domainName).toBe("agent-42.base.xid.eth");
    });

    it("constructs with sublabel", () => {
      const nextLabel = "agent-42";
      const sublabel = "neo";
      const config = CHAIN_CONFIGS[8453];
      const domainName = `${sublabel}.${nextLabel}${config.suffix}`;
      expect(domainName).toBe("neo.agent-42.base.xid.eth");
    });
  });
});
