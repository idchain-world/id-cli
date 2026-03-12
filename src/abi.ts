export const REGISTRAR_ABI = [
  "function register(address owner, address referrer, uint256 duration, string[] keys, string[] values, uint256[] coinTypes, bytes[] addresses, bytes contentHash, string[] dataKeys, bytes[] dataValues, uint256 permitValue, uint256 permitDeadline, uint8 permitV, bytes32 permitR, bytes32 permitS) returns (bytes32)",
  "function registerWithParent(address owner, address referrer, uint256 duration, string sublabel, string[] keys, string[] values, uint256[] coinTypes, bytes[] addresses, bytes contentHash, string[] dataKeys, bytes[] dataValues, uint256 permitValue, uint256 permitDeadline, uint8 permitV, bytes32 permitR, bytes32 permitS) returns (bytes32)",
  "function rentPrice(uint256 duration) view returns (uint256)",
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
  "function setOwner(bytes32 node, address newOwner)",
  "function setSubnodeOwner(bytes32 node, string label, address newOwner) returns (bytes32)",
  "event TextChanged(bytes32 indexed node, string key, string value)",
  "event AddressChanged(bytes32 indexed node, uint256 coinType, bytes newAddress)",
  "event ContenthashChanged(bytes32 indexed node, bytes hash)",
  "event Transfer(bytes32 indexed node, address owner)",
  "event NewSubnodeOwner(bytes32 indexed node, string indexed label, address owner)",
];

export const LOCK_CONTROLLER_ABI = [
  "function rentPrice(uint256 duration) view returns (uint256)",
  "function paused() view returns (bool)",
  "function renew(bytes32 parentNode, string label, address referrer, uint256 duration, uint256 permitValue, uint256 permitDeadline, uint8 permitV, bytes32 permitR, bytes32 permitS)",
  "event SubdomainRenewed(bytes32 indexed node, string label, uint256 cost, uint256 duration, uint256 newExpiration)",
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

export const IDENTITY_REGISTRY_ABI = [
  "function register(string agentURI) returns (uint256)",
  "function agentURI(uint256 agentId) view returns (string)",
  "function ownerOf(uint256 agentId) view returns (address)",
  "event Registered(uint256 indexed agentId, address indexed owner, string agentURI)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
];
