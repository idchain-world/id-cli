export interface ChainConfig {
  chainId: number;
  name: string;
  shortName: string;
  suffix: string;
  rpc: string;
  PARENT_NODE: string;
  ID_REGISTRY: string;
  ID_RESOLVER: string;
  ID_LOCK_CONTROLLER: string;
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
    PARENT_NODE: "0xa273a9509b9d0b02e78cd5d8e1007180d352e876988223ec1f0121ef98cdc15c",
    ID_REGISTRY: "0x09B4E31944DBa5608861ea5C5D40a677774F8723",
    ID_RESOLVER: "0x6F48C14C0C8426560B2b64240D17dB5f4F96FB27",
    ID_LOCK_CONTROLLER: "0xFAA30e808422A0d2BaCcd24946EA0E9FC541Ed5a",
    MOCK_USDC: "0x97cE28f5f432eb442020aAB045A979920d2162b6",
    ID_AGENT_REGISTRAR: "0x37d85344d9c218B5C3FEAdc3632dA7996Bd8b195",
    IDENTITY_REGISTRY_8004: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
  },
  8453: {
    chainId: 8453,
    name: "Base",
    shortName: "base",
    suffix: ".base.xid.eth",
    rpc: "https://mainnet.base.org",
    PARENT_NODE: "0xc57c8eec953c0f2a914d97440b1218fec428fb73110e2ebf4cb01b1a097dcba8",
    ID_REGISTRY: "0x531e8Cf562eBa0631d0D1e97B747D6468674743B",
    ID_RESOLVER: "0x37d85344d9c218B5C3FEAdc3632dA7996Bd8b195",
    ID_LOCK_CONTROLLER: "0xA174ce486Ff42265f52920F266d43AE1c9A2d1C4",
    MOCK_USDC: "0xF4ee3eFbd6CA123255c8c765eE80214E6dD17a87",
    ID_AGENT_REGISTRAR: "0x74798A78c503255DA6C9e099658C6b5af6790586",
    IDENTITY_REGISTRY_8004: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
  },
  10: {
    chainId: 10,
    name: "Optimism",
    shortName: "op",
    suffix: ".op.xid.eth",
    rpc: "https://mainnet.optimism.io",
    PARENT_NODE: "0xca47f342df0708ed660b4ef4839ed09cc88126102bffd13201a62883f4c8d1a6",
    ID_REGISTRY: "0xACE37c9260F529933287ce04cb9f10F3C1D64E63",
    ID_RESOLVER: "0x030fEB2DfcA65628Ae7AD72770a262593Be4265d",
    ID_LOCK_CONTROLLER: "0xFd73E64038905743266cb96d99E999474a81B17f",
    MOCK_USDC: "0xeaF7aC99F4667804c40D171c82e4CB2C93DeF299",
    ID_AGENT_REGISTRAR: "0x474E2193c25F74C824819ffCb60572fC0Ea00358",
    IDENTITY_REGISTRY_8004: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
  },
  42161: {
    chainId: 42161,
    name: "Arbitrum",
    shortName: "arb",
    suffix: ".arb.xid.eth",
    rpc: "https://arb1.arbitrum.io/rpc",
    PARENT_NODE: "0x4f382ff48d51a837301d5e3b5190ba3b3c336089d11a48d7e48c8ef4c0c2e367",
    ID_REGISTRY: "0xACE37c9260F529933287ce04cb9f10F3C1D64E63",
    ID_RESOLVER: "0x030fEB2DfcA65628Ae7AD72770a262593Be4265d",
    ID_LOCK_CONTROLLER: "0xFd73E64038905743266cb96d99E999474a81B17f",
    MOCK_USDC: "0xeaF7aC99F4667804c40D171c82e4CB2C93DeF299",
    ID_AGENT_REGISTRAR: "0x474E2193c25F74C824819ffCb60572fC0Ea00358",
    IDENTITY_REGISTRY_8004: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
  },
  11155111: {
    chainId: 11155111,
    name: "Sepolia",
    shortName: "sepolia",
    suffix: ".eth.xid.eth",
    rpc: "https://ethereum-sepolia-rpc.publicnode.com",
    PARENT_NODE: "0xa273a9509b9d0b02e78cd5d8e1007180d352e876988223ec1f0121ef98cdc15c",
    ID_REGISTRY: "0xe55bEde85c78Af52A5F261DF1A60cb9A46d6d7D8",
    ID_RESOLVER: "0x040cFE01B595a047C2401BB9e3fF2AeccF64cdCd",
    ID_LOCK_CONTROLLER: "0x3CD02eD656D2690C8388F9d264456b79Ce3Acd93",
    MOCK_USDC: "0x394532803C4dCEfA21c260790C5F119D0fb3B5BD",
    ID_AGENT_REGISTRAR: "0x3FfEE58Dbf5d1FA87C944EB3a9F958F056106367",
    IDENTITY_REGISTRY_8004: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  },
};

export const DEFAULT_CHAIN = 8453;
export const INDEXER_BASE_URL = "https://idx-indexer.onrender.com";

export function getChainConfig(chainId: number): ChainConfig {
  const config = CHAIN_CONFIGS[chainId];
  if (!config) throw new Error(`Unsupported chain: ${chainId}. Supported: ${Object.keys(CHAIN_CONFIGS).join(", ")}`);

  // Allow RPC_URL env var to override the chain's default RPC (useful for local fork testing)
  const rpcOverride = process.env.RPC_URL;
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
  const id = parseInt(chain);
  if (CHAIN_CONFIGS[id]) return id;
  throw new Error(`Unknown chain: ${chain}. Use: base, eth, op, arb, sepolia`);
}
