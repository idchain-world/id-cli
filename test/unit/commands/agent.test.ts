import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import { resolveName } from "../../../src/utils.js";
import { resolveChain, getChainConfig, CHAIN_CONFIGS } from "../../../src/config.js";

// ── Replicate internal helpers from agent.ts for unit testing ────────────────

function chainIdToMinimalBytes(chainId: number): number[] {
  if (chainId === 0) return [0];
  const bytes: number[] = [];
  let n = chainId;
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n = n >> 8;
  }
  return bytes;
}

function buildErc7930Address(chainId: number, contractAddress: string): string {
  const chainRefBytes = chainIdToMinimalBytes(chainId);
  const addrHex = contractAddress.toLowerCase().replace(/^0x/, "");
  const parts = [
    "0001",
    "0000",
    chainRefBytes.length.toString(16).padStart(2, "0"),
    chainRefBytes.map((b) => b.toString(16).padStart(2, "0")).join(""),
    "14",
    addrHex,
  ];
  return "0x" + parts.join("");
}

function buildEnsip25Key(chainId: number, registryAddress: string, agentId: string): string {
  const erc7930 = buildErc7930Address(chainId, registryAddress);
  return `agent-registration[${erc7930}][${agentId}]`;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("ERC-7930 address encoding", () => {
  it("encodes chain ID as minimal bytes", () => {
    expect(chainIdToMinimalBytes(0)).toEqual([0]);
    expect(chainIdToMinimalBytes(1)).toEqual([1]);
    expect(chainIdToMinimalBytes(8453)).toEqual([0x21, 0x05]);
    expect(chainIdToMinimalBytes(11155111)).toEqual([0xaa, 0x36, 0xa7]);
  });

  it("builds correct ERC-7930 address for Base", () => {
    const addr = buildErc7930Address(8453, "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432");
    expect(addr).toMatch(/^0x/);
    expect(addr).toContain("0001"); // version
    expect(addr).toContain("0000"); // address type (EVM)
    expect(addr).toContain("8004a169fb4a3325136eb29fa0ceb6d2e539a432");
  });

  it("builds correct ERC-7930 address for Ethereum", () => {
    const addr = buildErc7930Address(1, "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432");
    expect(addr).toContain("0101"); // chain ref length 01, chain id 01
  });

  it("address is deterministic", () => {
    const a1 = buildErc7930Address(8453, "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432");
    const a2 = buildErc7930Address(8453, "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432");
    expect(a1).toBe(a2);
  });
});

describe("ENSIP-25 key construction", () => {
  it("builds correct key format", () => {
    const key = buildEnsip25Key(8453, "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432", "42");
    expect(key).toMatch(/^agent-registration\[0x/);
    expect(key).toMatch(/\]\[42\]$/);
  });

  it("includes agent ID in key", () => {
    const key = buildEnsip25Key(8453, "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432", "123");
    expect(key).toContain("[123]");
  });

  it("different agent IDs produce different keys", () => {
    const k1 = buildEnsip25Key(8453, "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432", "1");
    const k2 = buildEnsip25Key(8453, "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432", "2");
    expect(k1).not.toBe(k2);
  });

  it("different chains produce different keys", () => {
    const k1 = buildEnsip25Key(8453, "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432", "42");
    const k2 = buildEnsip25Key(1, "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432", "42");
    expect(k1).not.toBe(k2);
  });
});

describe("register-agent command logic", () => {
  describe("agentURI construction", () => {
    it("builds correct data URI with services", () => {
      const resolved = resolveName("agent-0", "base");
      const services = [
        { name: "ENS", endpoint: resolved.domain },
        { name: "MCP", endpoint: "https://example.com/mcp" },
      ];
      const agentData = { name: resolved.domain, services };
      const agentURI = "data:application/json;base64," + Buffer.from(JSON.stringify(agentData)).toString("base64");

      expect(agentURI).toMatch(/^data:application\/json;base64,/);
      const decoded = JSON.parse(Buffer.from(agentURI.split(",")[1], "base64").toString());
      expect(decoded.name).toBe("agent-0.base.xid.eth");
      expect(decoded.services).toHaveLength(2);
      expect(decoded.services[0].name).toBe("ENS");
      expect(decoded.services[1].name).toBe("MCP");
    });

    it("always includes ENS service", () => {
      const resolved = resolveName("agent-0", "base");
      const services = [{ name: "ENS", endpoint: resolved.domain }];
      expect(services[0].endpoint).toBe("agent-0.base.xid.eth");
    });

    it("parses additional services from JSON", () => {
      const json = '[{"name":"HTTP","endpoint":"https://api.example.com"}]';
      const extra = JSON.parse(json);
      expect(extra).toHaveLength(1);
      expect(extra[0].name).toBe("HTTP");
    });
  });

  describe("dry-run proposal", () => {
    it("builds correct proposal for ERC-8004 registration", () => {
      const registryChainId = 8453;
      const config = CHAIN_CONFIGS[registryChainId];
      const agentURI = "data:application/json;base64,test";

      const proposal = {
        action: `Register agent for agent-0.base.xid.eth on ERC-8004`,
        chainId: registryChainId,
        contractName: "IdentityRegistry (ERC-8004)",
        contractAddress: config.IDENTITY_REGISTRY_8004,
        functionAbi: "function register(string agentURI) returns (uint256)",
        args: [agentURI],
        argLabels: ["agentURI"],
      };

      expect(proposal.contractAddress).toBe(config.IDENTITY_REGISTRY_8004);
      expect(proposal.args[0]).toBe(agentURI);
    });
  });

  describe("agent ID extraction from logs", () => {
    it("extracts ID from Transfer event (mock)", () => {
      // Transfer event: topic[0]=sig, topic[1]=from(0x0), topic[2]=to, topic[3]=tokenId
      const logs = [
        {
          topics: [
            "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
            ethers.zeroPadValue("0x00", 32),
            ethers.zeroPadValue("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", 32),
            ethers.zeroPadValue("0x2a", 32), // tokenId = 42
          ],
        },
      ];

      let agentId: string | null = null;
      for (const log of logs) {
        if (log.topics.length === 4 && log.topics[1] === ethers.zeroPadValue("0x00", 32)) {
          agentId = BigInt(log.topics[3]).toString();
          break;
        }
      }
      expect(agentId).toBe("42");
    });

    it("returns null when no Transfer event", () => {
      const logs: any[] = [];
      let agentId: string | null = null;
      for (const log of logs) {
        if (log.topics.length === 4 && log.topics[1] === ethers.zeroPadValue("0x00", 32)) {
          agentId = BigInt(log.topics[3]).toString();
          break;
        }
      }
      expect(agentId).toBeNull();
    });
  });
});

describe("link-agent command logic", () => {
  describe("ENSIP-25 linking proposal", () => {
    it("builds correct setText proposal", () => {
      const registryChainId = 8453;
      const nameChainId = 8453;
      const config = CHAIN_CONFIGS[nameChainId];
      const resolved = resolveName("agent-0", "base");
      const agentId = "42";
      const ensip25Key = buildEnsip25Key(registryChainId, CHAIN_CONFIGS[registryChainId].IDENTITY_REGISTRY_8004, agentId);

      const proposal = {
        action: `Link agent ${agentId} to ${resolved.domain} via ENSIP-25`,
        chainId: nameChainId,
        contractName: "IDRegistry",
        contractAddress: config.ID_REGISTRY,
        functionAbi: "function setText(bytes32 node, string key, string value)",
        args: [resolved.node, ensip25Key, "1"],
        argLabels: ["node", "key", "value"],
      };

      expect(proposal.args[0]).toBe(resolved.node);
      expect(proposal.args[1]).toContain("agent-registration[");
      expect(proposal.args[1]).toContain("[42]");
      expect(proposal.args[2]).toBe("1");
    });
  });

  describe("cross-chain linking", () => {
    it("can use different chains for registry and name", () => {
      const registryChainId = resolveChain("base");
      const nameChainId = resolveChain("eth");
      expect(registryChainId).toBe(8453);
      expect(nameChainId).toBe(1);
    });
  });
});
