export interface ChainConfig {
  chainId: number;
  name: string;
  shortName: string;
  suffix: string;
  rpc: string;
  explorer: string;
  PARENT_NODE: string;
  ID_REGISTRY: string;
  MOCK_USDC: string;
  ID_AGENT_REGISTRAR: string;
  IDENTITY_REGISTRY_8004: string;
}

export const CHAIN_CONFIGS: Record<number, ChainConfig> = {
  1: {
    chainId: 1,
    name: "Ethereum",
    shortName: "eth",
    suffix: ".eth.xid.eth",
    rpc: "https://ethereum-rpc.publicnode.com",
    explorer: "https://etherscan.io",
    PARENT_NODE: "0xa273a9509b9d0b02e78cd5d8e1007180d352e876988223ec1f0121ef98cdc15c",
    ID_REGISTRY: "0xD33beAb8741AfF38ff8F4F38293872479c6F80d6",
    MOCK_USDC: "0x97cE28f5f432eb442020aAB045A979920d2162b6",
    ID_AGENT_REGISTRAR: "0xF99992523D3602004b0affB74313466d2B4798b6",
    IDENTITY_REGISTRY_8004: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
  },
  8453: {
    chainId: 8453,
    name: "Base",
    shortName: "base",
    suffix: ".base.xid.eth",
    rpc: "https://mainnet.base.org",
    explorer: "https://basescan.org",
    PARENT_NODE: "0xc57c8eec953c0f2a914d97440b1218fec428fb73110e2ebf4cb01b1a097dcba8",
    ID_REGISTRY: "0xf4606833A389e8394b8c5ce1B3DeEB9f0B4c7F1a",
    MOCK_USDC: "0xF4ee3eFbd6CA123255c8c765eE80214E6dD17a87",
    ID_AGENT_REGISTRAR: "0xC85c4FDec63de86087Ffa94F910F060ecb7E5c08",
    IDENTITY_REGISTRY_8004: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
  },
  10: {
    chainId: 10,
    name: "Optimism",
    shortName: "op",
    suffix: ".op.xid.eth",
    rpc: "https://mainnet.optimism.io",
    explorer: "https://optimistic.etherscan.io",
    PARENT_NODE: "0xca47f342df0708ed660b4ef4839ed09cc88126102bffd13201a62883f4c8d1a6",
    ID_REGISTRY: "0xb007CF47B897e8631f32dB61bAf923c9B98A4c66",
    MOCK_USDC: "0xeaF7aC99F4667804c40D171c82e4CB2C93DeF299",
    ID_AGENT_REGISTRAR: "0xFAA30e808422A0d2BaCcd24946EA0E9FC541Ed5a",
    IDENTITY_REGISTRY_8004: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
  },
  42161: {
    chainId: 42161,
    name: "Arbitrum",
    shortName: "arb",
    suffix: ".arb.xid.eth",
    rpc: "https://arb1.arbitrum.io/rpc",
    explorer: "https://arbiscan.io",
    PARENT_NODE: "0x4f382ff48d51a837301d5e3b5190ba3b3c336089d11a48d7e48c8ef4c0c2e367",
    ID_REGISTRY: "0x6b2065fbeB9d0240D79C15b006194548f99a8727",
    MOCK_USDC: "0xeaF7aC99F4667804c40D171c82e4CB2C93DeF299",
    ID_AGENT_REGISTRAR: "0x3C12104940837F54253E26f434DF1e1CFd733676",
    IDENTITY_REGISTRY_8004: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
  },
  11155111: {
    chainId: 11155111,
    name: "Sepolia",
    shortName: "sep",
    suffix: ".sep.xid.eth",
    rpc: "https://ethereum-sepolia-rpc.publicnode.com",
    explorer: "https://sepolia.etherscan.io",
    PARENT_NODE: "0xee0c1cf4eda8249447a6b278d951deaff717d70a1b779279270252d4db821206",
    ID_REGISTRY: "0xceb79FcAfe0E9F3513fb70fB8A3841302dB4f477",
    MOCK_USDC: "0x394532803C4dCEfA21c260790C5F119D0fb3B5BD",
    ID_AGENT_REGISTRAR: "0xB196d2e73fcee95F4b440E9972881c2470b1f0dC",
    IDENTITY_REGISTRY_8004: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  },
};

export const DEFAULT_CHAIN = 8453;
export const INDEXER_BASE_URL = process.env.INDEXER_URL || "https://idchain.world/api/indexer";

// Per-chain RPC env var names: RPC_URL_BASE, RPC_URL_ETH, etc.
const RPC_ENV_KEYS: Record<number, string> = {
  1: "RPC_URL_ETH",
  8453: "RPC_URL_BASE",
  10: "RPC_URL_OP",
  42161: "RPC_URL_ARB",
  11155111: "RPC_URL_SEPOLIA",
};

export function getChainConfig(chainId: number): ChainConfig {
  const config = CHAIN_CONFIGS[chainId];
  if (!config) throw new Error(`Unsupported chain: ${chainId}. Supported: ${Object.keys(CHAIN_CONFIGS).join(", ")}`);

  // Per-chain override > global override > built-in default
  const perChain = RPC_ENV_KEYS[chainId] ? process.env[RPC_ENV_KEYS[chainId]] : undefined;
  const rpcOverride = perChain || process.env.RPC_URL;
  if (rpcOverride) {
    return { ...config, rpc: rpcOverride };
  }

  return config;
}

export function resolveChain(chain: string): number {
  // Accept chain name, shortName, or ID
  const byName = Object.values(CHAIN_CONFIGS).find(
    c => c.shortName === chain.toLowerCase() || c.name.toLowerCase() === chain.toLowerCase()
  );
  if (byName) return byName.chainId;
  // Also accept "sepolia" as alias for sep
  if (chain.toLowerCase() === "sepolia") return 11155111;
  const id = parseInt(chain);
  if (CHAIN_CONFIGS[id]) return id;
  throw new Error(`Unknown chain: ${chain}. Use: base, eth, op, arb, sep (sepolia)`);
}
