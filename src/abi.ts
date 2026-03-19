export const REGISTRAR_ABI = [
  "function register(address owner, address referrer, string[] keys, string[] values, uint256[] coinTypes, bytes[] addresses, bytes contentHash, string[] dataKeys, bytes[] dataValues, uint256 permitValue, uint256 permitDeadline, uint8 permitV, bytes32 permitR, bytes32 permitS) returns (bytes32)",
  "function registerWithParent(address owner, address referrer, string sublabel, string[] keys, string[] values, uint256[] coinTypes, bytes[] addresses, bytes contentHash, string[] dataKeys, bytes[] dataValues, uint256 permitValue, uint256 permitDeadline, uint8 permitV, bytes32 permitR, bytes32 permitS) returns (bytes32)",
  "function price() view returns (uint256)",
  "function nextLabel() view returns (string)",
  "function nextAgentId() view returns (uint256)",
];

export const REGISTRY_ABI = [
  "function owner(bytes32 node) view returns (address)",
  "function text(bytes32 node, string key) view returns (string)",
  "function addr(bytes32 node) view returns (address)",
  "function addr(bytes32 node, uint256 coinType) view returns (bytes)",
  "function contenthash(bytes32 node) view returns (bytes)",
  "function isLocked(bytes32 node) view returns (bool)",
  "function setText(bytes32 node, string key, string value)",
  "function setAddr(bytes32 node, address addr)",
  "function setAddr(bytes32 node, uint256 coinType, bytes newAddress)",
  "function setContenthash(bytes32 node, bytes hash)",
  "function setData(bytes32 node, string key, bytes value)",
  "function setRecord(bytes32 node, string[] keys, string[] values, uint256[] coinTypes, bytes[] addresses, bytes contentHash, string[] dataKeys, bytes[] dataValues)",
  "function setOwner(bytes32 node, address newOwner)",
  "function setSubnodeOwner(bytes32 node, string label, address newOwner) returns (bytes32)",
  "function setSubnodeRecord(bytes32 parentNode, string label, address newOwner, string[] keys, string[] values, uint256[] coinTypes, bytes[] addresses, bytes contentHash, string[] dataKeys, bytes[] dataValues) returns (bytes32)",
  "event TextChanged(bytes32 indexed node, string key, string value)",
  "event AddressChanged(bytes32 indexed node, uint256 coinType, bytes newAddress)",
  "event ContenthashChanged(bytes32 indexed node, bytes hash)",
  "event Transfer(bytes32 indexed node, address owner)",
  "event NewSubnodeOwner(bytes32 indexed node, string indexed label, address owner)",
];

export const USDC_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function nonces(address owner) view returns (uint256)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
  "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
  "function mint(address to, uint256 amount)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

export const REVERSE_REGISTRAR_ABI = [
  "function setName(string name) returns (bytes32)",
  "function setNameForAddr(address addr, string name) returns (bytes32)",
];

// ENS core contracts (L1 / Sepolia)
export const ENS_REGISTRY_ABI = [
  "function resolver(bytes32 node) view returns (address)",
  "function owner(bytes32 node) view returns (address)",
  "function setResolver(bytes32 node, address resolver)",
];

export const ENS_NAME_WRAPPER_ABI = [
  "function ownerOf(uint256 id) view returns (address)",
  "function setResolver(bytes32 node, address resolver)",
];

export const ENS_REGISTRAR_CONTROLLER_ABI = [
  "function available(string name) view returns (bool)",
  "function rentPrice(string name, uint256 duration) view returns (tuple(uint256 base, uint256 premium))",
  "function makeCommitment(string name, address owner, uint256 duration, bytes32 secret, address resolver, bytes[] data, bool reverseRecord, uint16 ownerControlledFuses) pure returns (bytes32)",
  "function commit(bytes32 commitment)",
  "function register(string name, address owner, uint256 duration, bytes32 secret, address resolver, bytes[] data, bool reverseRecord, uint16 ownerControlledFuses) payable",
];

// IDLinkedResolver — on-chain linking for eth.xid.eth / sep.xid.eth
export const ID_LINKED_RESOLVER_ABI = [
  "function setLink(bytes32 ensNode, bytes32 agentNode)",
  "function links(bytes32 ensNode) view returns (bytes32)",
];

// IDUnifiedResolver — CCIP-Read linking for base/arb/op.xid.eth
export const ID_UNIFIED_RESOLVER_ABI = [
  "function setLink(bytes32 ensNode, uint256 chainId, bytes32 agentNode)",
  "function links(bytes32 ensNode) view returns (uint256 chainId, bytes32 agentNode)",
];

export const IDENTITY_REGISTRY_ABI = [
  "function register(string agentURI) returns (uint256)",
  "function agentURI(uint256 agentId) view returns (string)",
  "function ownerOf(uint256 agentId) view returns (address)",
  "event Registered(uint256 indexed agentId, address indexed owner, string agentURI)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
];
