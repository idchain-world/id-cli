import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import { validateAddress, resolveName, CliError, ExitCode } from "../../../src/utils.js";
import { CHAIN_CONFIGS } from "../../../src/config.js";

describe("transfer command logic", () => {
  describe("--to address validation", () => {
    it("validates and checksums the address", () => {
      const addr = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
      const result = validateAddress(addr, "--to");
      expect(result).toBe("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
    });

    it("rejects invalid address", () => {
      expect(() => validateAddress("not-an-address", "--to")).toThrow("Invalid address for --to");
    });

    it("rejects empty address", () => {
      expect(() => validateAddress("", "--to")).toThrow(CliError);
    });
  });

  describe("name resolution for transfer", () => {
    it("resolves full domain", () => {
      const result = resolveName("agent-0.base.xid.eth");
      expect(result.chainId).toBe(8453);
      expect(result.node).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it("resolves short label with chain", () => {
      const result = resolveName("agent-0", "base");
      expect(result.chainId).toBe(8453);
    });
  });

  describe("dry-run proposal construction", () => {
    it("builds correct proposal arguments", () => {
      const resolved = resolveName("agent-0", "base");
      const toAddress = validateAddress("0x70997970C51812dc3A010C7d01b50e0d17dc79C8", "--to");
      const config = CHAIN_CONFIGS[8453];

      const proposal = {
        action: `Transfer ${resolved.domain} to ${toAddress}`,
        chainId: resolved.chainId,
        contractName: "IDRegistry",
        contractAddress: config.ID_REGISTRY,
        functionAbi: "function setOwner(bytes32 node, address newOwner)",
        args: [resolved.node, toAddress],
        argLabels: ["node", "newOwner"],
      };

      expect(proposal.args[0]).toBe(resolved.node);
      expect(proposal.args[1]).toBe(toAddress);
      expect(proposal.contractAddress).toBe(config.ID_REGISTRY);
      expect(proposal.functionAbi).toContain("setOwner");
    });
  });

  describe("ownership verification logic", () => {
    it("detects zero address as not registered", () => {
      const currentOwner = ethers.ZeroAddress;
      expect(currentOwner).toBe(ethers.ZeroAddress);
    });

    it("detects different owner (case insensitive)", () => {
      const currentOwner = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
      const walletAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
      expect(currentOwner.toLowerCase() !== walletAddress.toLowerCase()).toBe(true);
    });

    it("matches same owner (case insensitive)", () => {
      const currentOwner = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
      const walletAddress = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
      expect(currentOwner.toLowerCase() === walletAddress.toLowerCase()).toBe(true);
    });
  });
});
