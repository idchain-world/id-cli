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

const BASE_CONFIG: ChainConfig = {
  chainId: 8453,
  name: "Base",
  shortName: "base",
  suffix: ".xid.eth",
  rpc: "https://mainnet.base.org",
  explorer: "https://basescan.org",
  PARENT_NODE: "0x23c84b3a246ebe330d85cccac0658bb20a597ac33b02c75e8be7f32b57776216",
  ID_REGISTRY: "0x92DF3A4CB6827Bf199FdAd429B36622f0C8167F0",
  MOCK_USDC: "0xF4ee3eFbd6CA123255c8c765eE80214E6dD17a87",
  ID_AGENT_REGISTRAR: "0xa6D23f27D3b1780B12488482a008cB3c3787135f",
  IDENTITY_REGISTRY_8004: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
};

export const CHAIN_ID = 8453;
export const INDEXER_BASE_URL = process.env.INDEXER_URL || "https://idchain.world/api/indexer";

export function getConfig(): ChainConfig {
  const rpcOverride = process.env.RPC_URL_BASE || process.env.RPC_URL;
  if (rpcOverride) {
    return { ...BASE_CONFIG, rpc: rpcOverride };
  }
  return BASE_CONFIG;
}
