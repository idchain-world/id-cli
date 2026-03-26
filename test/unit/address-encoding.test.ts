import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import { bech32 } from "@scure/base";
import { encodeAddressToBytes } from "../../src/address-encoding.js";

describe("encodeAddressToBytes", () => {
  describe("ETH addresses (coinType 60)", () => {
    it("encodes checksummed ETH address to 20 bytes", () => {
      const addr = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
      const bytes = encodeAddressToBytes(addr, 60);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(20);
      expect(ethers.hexlify(bytes)).toBe(addr.toLowerCase());
    });

    it("validates and checksums lowercase ETH address", () => {
      const addr = "0x1234567890abcdef1234567890abcdef12345678";
      const bytes = encodeAddressToBytes(addr, 60);
      expect(bytes.length).toBe(20);
    });

    it("throws on invalid ETH address", () => {
      expect(() => encodeAddressToBytes("0xinvalid", 60)).toThrow();
    });
  });

  describe("hex addresses for non-ETH chains", () => {
    it("decodes hex bytes for Sui (coinType 784)", () => {
      // Sui address: 32 bytes hex
      const addr = "0x" + "ab".repeat(32);
      const bytes = encodeAddressToBytes(addr, 784);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(32);
    });

    it("passes through arbitrary hex bytes", () => {
      const addr = "0xdeadbeef";
      const bytes = encodeAddressToBytes(addr, 999);
      expect(bytes.length).toBe(4);
      expect(ethers.hexlify(bytes)).toBe("0xdeadbeef");
    });
  });

  describe("Bitcoin bech32 addresses (coinType 0)", () => {
    it("decodes P2WPKH address (bc1q...) to scriptPubKey", () => {
      // Known test vector: bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4
      // Witness version 0, program = 751e76e8199196d454941c45d1b3a323f1433bd6
      const addr = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";
      const bytes = encodeAddressToBytes(addr, 0);
      expect(bytes).toBeInstanceOf(Uint8Array);
      // scriptPubKey: OP_0 (0x00) + push_len (0x14 = 20) + 20-byte program
      expect(bytes[0]).toBe(0x00); // OP_0
      expect(bytes[1]).toBe(0x14); // push 20 bytes
      expect(bytes.length).toBe(22); // 2 + 20
    });

    it("decodes P2TR address (bc1p...) to scriptPubKey", () => {
      // Taproot address uses bech32m
      const addr = "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0";
      const bytes = encodeAddressToBytes(addr, 0);
      expect(bytes[0]).toBe(0x51); // OP_1
      expect(bytes[1]).toBe(0x20); // push 32 bytes
      expect(bytes.length).toBe(34); // 2 + 32
    });

    it("decodes testnet bech32 address (tb1...)", () => {
      const addr = "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx";
      const bytes = encodeAddressToBytes(addr, 0);
      expect(bytes[0]).toBe(0x00); // OP_0
      expect(bytes[1]).toBe(0x14); // push 20 bytes
      expect(bytes.length).toBe(22);
    });
  });

  describe("Cosmos bech32 addresses (coinType 118)", () => {
    it("decodes cosmos1... address to 20 raw bytes", () => {
      // cosmos1... addresses are bech32-encoded 20-byte addresses
      const addr = "cosmos1hsk6jryyqjfhp5dhc55tc9jtckygx0eph6dd02";
      const bytes = encodeAddressToBytes(addr, 118);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(20);
    });

    it("decodes osmo1... address to 20 raw bytes", () => {
      // Encode a known 20-byte address with osmo prefix to get valid bech32
      const rawBytes = new Uint8Array(20).fill(0xab);
      const words = bech32.toWords(rawBytes);
      const addr = bech32.encode("osmo", words);
      const bytes = encodeAddressToBytes(addr, 118);
      expect(bytes.length).toBe(20);
      expect(ethers.hexlify(bytes)).toBe(ethers.hexlify(rawBytes));
    });
  });

  describe("Tron base58check addresses (coinType 195)", () => {
    it("decodes Tron T... address to 21 bytes", () => {
      // Tron mainnet addresses start with T and are 34 chars
      const addr = "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW";
      const bytes = encodeAddressToBytes(addr, 195);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(21); // version byte (0x41) + 20-byte address
      expect(bytes[0]).toBe(0x41); // Tron version byte
    });
  });

  describe("TON addresses (coinType 607)", () => {
    it("decodes TON UQ... address to 33 bytes (workchain + hash)", () => {
      // TON user-friendly address (base64url)
      // UQ... = bounceable, workchain 0
      // This is a well-known TON address format (48 chars base64url = 36 raw bytes)
      const addr = "UQBvW8Z5huBkMJYdnfAEM5JqTNyQ0sMd-GUipWGW7EZ4oIAg";
      const bytes = encodeAddressToBytes(addr, 607);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(33); // 1 workchain + 32 hash
    });
  });

  describe("Filecoin addresses (coinType 461)", () => {
    it("decodes f0 (ID) address", () => {
      const addr = "f01234";
      const bytes = encodeAddressToBytes(addr, 461);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes[0]).toBe(0); // protocol 0
      // LEB128 encoding of 1234: 0xD2 0x09
      expect(bytes[1]).toBe(0xd2);
      expect(bytes[2]).toBe(0x09);
      expect(bytes.length).toBe(3);
    });

    it("decodes t0 (testnet ID) address", () => {
      const addr = "t0100";
      const bytes = encodeAddressToBytes(addr, 461);
      expect(bytes[0]).toBe(0); // protocol 0
      // LEB128 of 100 = 0x64
      expect(bytes[1]).toBe(0x64);
      expect(bytes.length).toBe(2);
    });
  });

  describe("fallback hex encoding", () => {
    it("treats unrecognized addresses as hex bytes", () => {
      const addr = "0xabcdef";
      const bytes = encodeAddressToBytes(addr, 999);
      expect(bytes.length).toBe(3);
    });
  });

  describe("format detection priority", () => {
    it("treats 0x-prefixed address with coinType 60 as ETH", () => {
      const addr = "0x1234567890abcdef1234567890abcdef12345678";
      const bytes = encodeAddressToBytes(addr, 60);
      expect(bytes.length).toBe(20);
    });

    it("treats bc1... as Bitcoin regardless of coinType", () => {
      const addr = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";
      const bytes = encodeAddressToBytes(addr, 0);
      expect(bytes[0]).toBe(0x00);
      expect(bytes.length).toBe(22);
    });
  });
});
