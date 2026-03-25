# id-cli System Items Audit

## Commands

1. `register` — Register new agent name (permanent, one-time fee) [src/commands/register.ts]
2. `transfer` — Transfer ownership of an agent name [src/commands/transfer.ts]
3. `info` — Show details for an agent name [src/commands/info.ts] STATUS:REVIEW non-brief mode drops dataRecords and contenthash from indexer response
4. `records` — Show all records for a name [src/commands/records.ts]
5. `set-text` — Set a text record on a name [src/commands/records.ts]
6. `set-addr` — Set an address record on a name [src/commands/records.ts] STATUS:REVIEW missing validateAddress() for coinType 60 ETH addresses
7. `set-contenthash` — Set content hash on a name [src/commands/records.ts]
8. `create-subname` — Create subname under a parent [src/commands/subname.ts]
9. `list-subnames` — List subnames under a parent [src/commands/subname.ts]
10. `register-agent` — Register on ERC-8004 IdentityRegistry [src/commands/agent.ts]
11. `link-agent` — Link ERC-8004 agent to name via ENSIP-25 [src/commands/agent.ts]
12. `set-record` — Bulk update text/address/data/contenthash records [src/commands/set-record.ts]
13. `set-agent-endpoints` — Set ENSIP-26 agent endpoint records [src/commands/agent-endpoints.ts]
14. `set-reverse` — Set ENS reverse name (ENSIP-19) [src/commands/set-reverse.ts]
15. `register-ens` — Register .eth name via ENS (two-step commit/reveal) [src/commands/register-ens.ts]
16. `link-ens` — Link .eth name to agent (3-step process) [src/commands/link-ens.ts]
17. `explore` — List registered agent names from indexer [src/commands/explore.ts] [STATUS: REVIEW] --offset not validated with parseNonNegativeInt (unlike subname.ts); limit parsed twice
18. `mint-usdc` — Mint test USDC on testnet [src/commands/mint.ts]
19. `schema` — Dump CLI structure as JSON for introspection [src/commands/schema.ts]

## Exported Utility Functions (src/utils.ts)

20. `validateLabel(label)` — Enforce lowercase alphanumeric + hyphens [line 32]
21. `validateAddress(addr, flagName)` — Validate & checksum Ethereum address [line 42]
22. `parseNonNegativeInt(value, flagName)` — Parse non-negative integer from string [line 50]
23. `verifyOwnership(registry, node, wallet, domain)` — Check caller owns the name [line 58]
24. `labelhash(label)` — keccak256 of UTF-8 label [line 73]
25. `makeNode(parentNode, label)` — Compute child namehash node [line 77]
26. `getNodeForLabel(label, chainId)` — Get node using chain's PARENT_NODE [line 83]
27. `formatDomainName(label, chainId)` — Append chain suffix to label [line 88]
28. `resolveName(input, chainFlag?)` — Sync name resolution (label/path/full domain) [line 112]
29. `resolveNameAsync(input, chainFlag?)` — Async resolution supporting linked .eth names [line 159]
30. `formatUsdc(amount)` — Format bigint to USDC string (6 decimals) [line 210]
31. `signUsdcPermit(wallet, usdc, spender, value, chainId)` — Sign EIP-2612 USDC permit [line 214]
32. `indexerFetch(path)` — Fetch from indexer API with auth headers [line 249]
33. `isDryRun()` — Check if --dry-run flag is set [line 264]
34. `proposeTx(proposal)` — Display transaction proposal without executing [line 279]
35. `handleError(err)` — Print error and exit with code [line 22]

## Internal Utility Functions (src/utils.ts)

36. `resolvePathOnChain(path, chainId)` — Hash multi-level path right-to-left [line 129]
37. `resolveLinkedEnsName(ensName)` — Resolve linked .eth via API call [line 170]

## Exported Classes & Types (src/utils.ts)

38. `CliError` — Error class with exit code [line 16]
39. `ExitCode` — Enum: SUCCESS=0, GENERAL_ERROR=1, INPUT_ERROR=2, AUTH_ERROR=3, NOT_FOUND=4, INSUFFICIENT_FUNDS=5 [line 7]
40. `ResolvedName` — Interface: path, node, chainId, domain, topLabel [line 104]
41. `TxProposal` — Interface: action, chainId, contractName, contractAddress, functionAbi, args, argLabels, notes [line 268]

## Constants (src/utils.ts)

42. `LABEL_RE` — Regex /^[a-z0-9-]+$/ for label validation [line 30]
43. `RESOLVE_API_URL` — ENS resolution endpoint (env override) [line 168]

## Output Module (src/output.ts)

44. `getOutputFormat()` — Auto-detect JSON vs human output [line 8]
45. `isJsonOutput()` — Check if output mode is JSON [line 20]
46. `outputSuccess(data, metadata?)` — JSON envelope for success [line 31]
47. `outputError(code, message, exitCode?, metadata?)` — JSON envelope for error + exit [line 40]
48. `handleErrorJson(err)` — Route error to JSON or human output + exit [line 50]
49. `humanLog(msg)` — Log only in human mode [line 61] STATUS:REVIEW JSDoc says "stderr" but implementation uses console.log (stdout)
50. `statusLog(msg)` — Log to stderr in JSON mode, stdout in human [line 68]
51. `Envelope` — Interface: { status, data?, error?, metadata? } [line 24]

## Provider Module (src/provider.ts)

52. `getProvider(chainId)` — Create JsonRpcProvider for chain [line 18] — [STATUS: PASS] Clean wrapper with proper RPC override support, no issues found 2026-03-23
53. `getWallet(chainId)` — Create Wallet from PRIVATE_KEY env var [line 23]
54. `isKeyFromDotenv()` — Check if PRIVATE_KEY is in .env file (internal) [line 7]

## Config Module (src/config.ts)

55. `CHAIN_CONFIGS` — Record of 5 chain configurations [line 15]
56. `DEFAULT_CHAIN` — 8453 (Base) [line 83]
57. `INDEXER_BASE_URL` — Indexer endpoint (env override) [line 84]
58. `getChainConfig(chainId)` — Get chain config with RPC overrides [line 95]
59. `resolveChain(chain)` — Resolve chain name/shortname/ID to chainId [line 109] [STATUS: REVIEW] Dead code on line 116 ("sepolia" alias already matched by name lookup); parseInt accepts trailing garbage
60. `RPC_ENV_KEYS` — Per-chain env var mapping (internal) [line 87]

## ABI Definitions (src/abi.ts)

61. `REGISTRAR_ABI` — IDAgentRegistrar: register, registerWithParent, nextLabel, price, renew [line 1]
62. `REGISTRY_ABI` — IDRegistry: owner, setText, setAddr, setContenthash, setSubnodeOwner, setOwner, setRecord, isLocked, addr, getText [line 9]
63. `USDC_ABI` — ERC-20 + permit: balanceOf, approve, mint, name, nonces, permit [line 32]
64. `REVERSE_REGISTRAR_ABI` — setName, setNameForAddr [line 46]
65. `ENS_REGISTRY_ABI` — owner, resolver, setResolver [line 52]
66. `ENS_NAME_WRAPPER_ABI` — ownerOf, setResolver [line 58] — [STATUS: PASS] Minimal correct ABI, properly handles wrapped name ownership and resolver setting in link-ens.ts 2026-03-24
67. `ENS_REGISTRAR_CONTROLLER_ABI` — available, rentPrice, makeCommitment, commit, register [line 63]
68. `ID_LINKED_RESOLVER_ABI` — setLink(bytes32,bytes32), addr(bytes32) [line 72]
69. `ID_UNIFIED_RESOLVER_ABI` — setLink(bytes32,uint256,bytes32), addr(bytes32) [line 78]
70. `IDENTITY_REGISTRY_ABI` — register(string), Transfer event [line 83]

## Chain Configurations

71. Ethereum mainnet (chainId 1, suffix .eth.xid.eth) [config.ts:16]
72. Base (chainId 8453, suffix .base.xid.eth) [config.ts:29]
73. Optimism (chainId 10, suffix .op.xid.eth) [config.ts:42]
74. Arbitrum (chainId 42161, suffix .arb.xid.eth) [config.ts:55] STATUS:PASS all fields correct, integrations consistent across explore/link-ens/set-reverse
75. Sepolia (chainId 11155111, suffix .sep.xid.eth) [config.ts:68]

## Contract Addresses (per chain)

76. ID_REGISTRY — IDRegistry contract (5 addresses, one per chain) [config.ts]
77. MOCK_USDC — Test USDC contract (5 addresses) [config.ts]
78. ID_AGENT_REGISTRAR — Registration contract (5 addresses) [config.ts] STATUS:PASS
79. IDENTITY_REGISTRY_8004 — ERC-8004 agent registry (5 addresses) [config.ts]
80. PARENT_NODE — Namehash root for each chain (5 values) [config.ts]
81. ENS_REGISTRY — 0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e [link-ens.ts:18]
82. ENS_NAME_WRAPPER — Mainnet + Sepolia addresses [link-ens.ts:20]
83. ENS_LINKING_RESOLVERS — LINKED_MAINNET, LINKED_SEPOLIA, UNIFIED_MAINNET [link-ens.ts:26]
84. ENS_REGISTRAR_CONTROLLER — Mainnet + Sepolia [register-ens.ts:12]
85. ENS_PUBLIC_RESOLVER — Mainnet + Sepolia [register-ens.ts:17]
86. REVERSE_REGISTRAR addresses — DEFAULT, per-chain overrides [set-reverse.ts:12-22]

## Internal Command Helpers

87. `chainIdToMinimalBytes(chainId)` — ERC-7930 chain encoding [agent.ts:13]
88. `buildErc7930Address(chainId, contractAddress)` — Build interoperable address [agent.ts:24]
89. `buildEnsip25Key(chainId, registryAddress, agentId)` — ENSIP-25 text record key [agent.ts:38]
90. `ensNamehash(name)` — Compute ENS namehash from scratch [link-ens.ts:57]
91. `getEnsLinkingConfig(agentChainId)` — Get resolver address/type for linking [link-ens.ts:38]
92. `getRegistryChainId(agentChainId)` — Map agent chain to ENS registry chain [link-ens.ts:53]
93. `checkEnsOwnership(ensNameNode, registryChainId)` — Check ENS owner + wrapped status [link-ens.ts:71]
94. `extractSchema(cmd)` — Extract Commander.js schema as JSON [schema.ts:18]
95. `resolveTarget(input)` — Resolve reverse registrar target [set-reverse.ts:44]
96. `validateUrl(url, flag)` — Validate URL protocol (https/http/ipfs) [agent-endpoints.ts:18]
97. `endpointKey(protocol)` — Build ENSIP-26 text record key [agent-endpoints.ts:14]
98. `VALID_PROTOCOLS` — ["mcp", "a2a", "oasf", "web"] [agent-endpoints.ts:11]
99. `HIDDEN_NAMES` — Set of names hidden from explore output [explore.ts:8]
100. `INDEXER_CHAINS` — Chain name mapping for indexer API [explore.ts:13]

## Environment Variables

101. `PRIVATE_KEY` — Wallet private key (required for write ops) [provider.ts:24]
102. `RPC_URL` — Global RPC endpoint override [config.ts:101]
103. `RPC_URL_BASE` — Base chain RPC override [config.ts:89]
104. `RPC_URL_ETH` — Ethereum chain RPC override [config.ts:88]
105. `RPC_URL_OP` — Optimism chain RPC override [config.ts:90]
106. `RPC_URL_ARB` — Arbitrum chain RPC override [config.ts:91]
107. `RPC_URL_SEPOLIA` — Sepolia chain RPC override [config.ts:92]
108. `INDEXER_URL` — Custom indexer URL [config.ts:84, utils.ts:255]
109. `INDEXER_API_KEY` — Indexer API authentication [utils.ts:256]
110. `API_KEY` — Fallback for INDEXER_API_KEY [utils.ts:256]
111. `RESOLVE_API_URL` — Override for ENS resolution API [utils.ts:168]

## External Network Calls

112. `fetch(RESOLVE_API_URL/...)` — Resolve linked .eth names [utils.ts:172]
113. `fetch(INDEXER_BASE_URL/...)` — Indexer API queries [utils.ts:259]
114. `registrar.nextLabel()` — Get next available label from contract [register.ts:32]
115. `registrar.price()` — Get registration price from contract [register.ts:33]
116. `registrar.register(...)` — Submit registration transaction [register.ts:123]
117. `registrar.registerWithParent(...)` — Register with sublabel [register.ts:117]
118. `usdc.balanceOf(addr)` — Check USDC balance [register.ts:44]
119. `usdc.approve(spender, amount)` — Approve USDC spending [register.ts:108]
120. `usdc.mint(to, amount)` — Mint test USDC [mint.ts:39]
121. `wallet.signTypedData(...)` — EIP-712 permit signing [utils.ts:226]
122. `registry.owner(node)` — Get name owner [info.ts, transfer.ts, etc.]
123. `registry.setOwner(node, newOwner)` — Transfer ownership [transfer.ts:40]
124. `registry.setText(node, key, value)` — Set text record [records.ts:108]
125. `registry.setAddr(node, addr)` — Set ETH address [records.ts:168]
126. `registry.setAddr(node, coinType, bytes)` — Set multi-coin address [records.ts:176]
127. `registry.setContenthash(node, hash)` — Set content hash [records.ts:216]
128. `registry.setSubnodeOwner(node, label, owner)` — Create subname [subname.ts:44]
129. `registry.setRecord(node, textKeys, textValues, coinTypes, addresses, contentHash, dataKeys, dataValues)` — Bulk record update [set-record.ts:108]
130. `registry.isLocked(node)` — Check if name is permanent [info.ts:27]
131. `identityRegistry.register(agentURI)` — ERC-8004 registration [agent.ts:112]
132. `controller.available(label)` — Check ENS name availability [register-ens.ts:64]
133. `controller.rentPrice(label, duration)` — ENS rental price [register-ens.ts:65]
134. `controller.makeCommitment(...)` — Generate ENS commitment hash [register-ens.ts:111]
135. `controller.commit(commitment)` — Submit ENS commitment [register-ens.ts:115]
136. `controller.register(...)` — ENS registration (with ETH value) [register-ens.ts:132]
137. `resolver.setLink(ensNode, agentNode)` — ENS forward-link (L1) [link-ens.ts]
138. `resolver.setLink(ensNode, chainId, agentNode)` — ENS forward-link (L2) [link-ens.ts]
139. `wrapper.setResolver(node, resolver)` — Set resolver on wrapped name [link-ens.ts]
140. `registrar.setName(name)` — Set reverse name for msg.sender [set-reverse.ts:138]
141. `registrar.setNameForAddr(addr, name)` — Set reverse for specific address [set-reverse.ts:100]

## Input Validation Points

142. Label validation via LABEL_RE regex [utils.ts:30]
143. Address validation via ethers.getAddress() [utils.ts:44]
144. Integer validation via parseInt + range check [utils.ts:51]
145. Private key format: /^(0x)?[0-9a-fA-F]{64}$/ [provider.ts:31]
146. Text record format: key=value with indexOf("=") [register.ts:54]
147. Chain name resolution with error on unknown [config.ts:119]
148. URL protocol validation (https/http/ipfs) [agent-endpoints.ts:18] — [STATUS: PASS] Correct prefix validation for https/http/ipfs, clear error message, properly skipped for --clear path 2026-03-23
149. ENS name format: must be second-level .eth [link-ens.ts]
150. Coin type validation via parseNonNegativeInt [records.ts:134]
151. Duration parsing (register-ens): minimum 30 days [register-ens.ts]
152. Sublabel validation before subname creation [register.ts:62, subname.ts:19]

## Private Key Handling

153. PRIVATE_KEY read from process.env [provider.ts:24]
154. Format validation: 64-char hex with optional 0x [provider.ts:31]
155. .env file detection and security warning [provider.ts:7-16, 37-41]
156. Key never logged or included in error messages [provider.ts:45]
157. ethers.Wallet construction from key [provider.ts:43]
158. EIP-712 typed data signing with wallet [utils.ts:226]

## Transaction Safety

159. Dry-run mode prevents execution, shows proposal [utils.ts:264-322]
160. Ownership verification before write operations [utils.ts:58-71]
161. USDC balance check before registration [register.ts:45-47]
162. EIP-2612 permit with 1-hour deadline [utils.ts:223]
163. Permit fallback to approve() on failure [register.ts:106-111] [STATUS: PASS] Correct EIP-2612 flow; zero permit values signal contract to use pre-approved allowance
164. Transaction receipt awaited via tx.wait() [all write commands]
165. Gas used reported in output [register.ts:133, agent.ts:159]
166. ENS commit/reveal 60-second delay [register-ens.ts:125] — [STATUS: PASS] Correct 60s countdown (6×10s), matches ENS minCommitmentAge, secret properly reused for reveal 2026-03-24
167. Random secret for ENS commitment [register-ens.ts:107]

## Error Handling

168. CliError class with structured exit codes [utils.ts:16]
169. handleErrorJson routes to JSON or human output [output.ts:50]
170. handleError prints and exits [utils.ts:22]
171. outputError writes JSON envelope and exits [output.ts:40]
172. Try/catch in every command action handler [all commands]
173. process.exit() called on all error paths [output.ts:44,47,57]

## Output Formatting

174. Auto-detect: JSON when stdout not TTY [output.ts:17]
175. --output json|human override [output.ts:11-16]
176. BigInt serializer in JSON.stringify [output.ts:34-36]
177. Envelope format: { status: "ok"|"error", data?, error?, metadata? } [output.ts:24]
178. humanLog suppressed in JSON mode [output.ts:61]
179. statusLog to stderr in JSON mode [output.ts:68-73]

## Package Configuration

180. Package name: @xid/cli [package.json:2] [STATUS: REVIEW] Missing `files` field risks publishing test/agent artifacts; also missing license, repository, engines fields
181. Version: 0.2.8 [package.json:3]
182. ESM module type [package.json:5]
183. Binary entry: id-cli -> ./dist/index.js [package.json:7]
184. Build script: tsc [package.json:10]
185. Test script: bash test/run-tests.sh [package.json:13]
186. Test:unit script: vitest run [package.json:14]

## Dependencies

187. chalk ^5.3.0 — Terminal styling [package.json:18]
188. commander ^12.0.0 — CLI argument parsing [package.json:19]
189. dotenv ^17.3.1 — .env file loading [package.json:20]
190. ethers ^6.13.7 — Ethereum operations [package.json:21]
191. @types/node ^20.0.0 — Node.js type definitions [package.json:24]
192. tsx ^4.7.0 — TypeScript execution [package.json:25]
193. typescript ^5.4.0 — TypeScript compiler [package.json:26]
194. vitest ^4.1.0 — Unit test framework [package.json:27]

## TypeScript Configuration

195. Target: ES2022 [tsconfig.json]
196. Module: Node16 [tsconfig.json]
197. Strict mode: enabled [tsconfig.json] [STATUS: PASS] Compiles cleanly; ~33 `any` uses are idiomatic (catch clauses, JSON responses, Commander internals)
198. Output directory: ./dist [tsconfig.json]
199. Declaration files: enabled [tsconfig.json]

## Test Files

200. test/run-tests.sh — Integration test runner (starts Anvil fork) [80 lines]
201. test/test.ts — Integration tests (~40 tests, 532 lines) [test/test.ts]
202. test/unit/utils.test.ts — Input validation, name resolution, hashing [55 tests]
203. test/unit/provider.test.ts — Key validation, provider creation [13 tests]
204. test/unit/config.test.ts — Chain config, resolution [20 tests]
205. test/unit/output.test.ts — Output formatting, error codes [10 tests]
206. test/unit/commands/register.test.ts — Registration logic [17 tests]
207. test/unit/commands/transfer.test.ts — Transfer logic [9 tests]
208. test/unit/commands/records.test.ts — Record management logic [12 tests] [STATUS: FIXED] Renamed to parseNonNegativeInt, set-record.test.ts added (19 tests) 2026-03-24
209. test/unit/commands/agent.test.ts — ERC-7930, ENSIP-25, agent registration [17 tests]
210. test/unit/commands/subname.test.ts — Subname creation, listing [10 tests] STATUS:PASS all 10 tests match production logic correctly
211. test/unit/commands/ens.test.ts — ENS namehash, linking config [15 tests]
212. vitest.config.ts — Vitest configuration [8 lines]

## Test Helpers

213. clearAccountCode(address) — Clear ERC-7702 delegation on Anvil [test.ts:29]
214. run(cmd, expectFail?) — Execute CLI command via execSync [test.ts:39]
215. test(name, fn) — Run test with pass/fail tracking [test.ts:67]
216. testOptional(name, fn) — Run test, skip on failure [test.ts:80]
217. assert(condition, message) — Assert with message [test.ts:92] — [STATUS: PASS] Correct minimal assertion helper, clear error messages, properly caught by test wrappers 2026-03-23
218. assertIncludes(output, expected) — Assert string contains [test.ts:96]

## Plugin Files

219. plugins/id-rest-ap/plugin.json — Plugin manifest [15 lines]
220. plugins/id-rest-ap/SKILL.md — Agent communication skill doc [203 lines]
221. plugins/id-rest-ap/scripts/list-agents.sh — List available agents
222. plugins/id-rest-ap/scripts/talk-to-agent.sh — Send message to agent
223. plugins/id-rest-ap/scripts/broadcast-to-agents.sh — Broadcast to all agents
224. plugins/id-rest-ap/scripts/wait-for-response.sh — Poll for agent response
225. plugins/id-rest-ap/scripts/pay-agent.sh — Send ETH to agent

## File System Operations

226. readFileSync(.env) — Check if PRIVATE_KEY in .env [provider.ts:11]
227. existsSync(.env) — Check .env file existence [provider.ts:9]

## Security-Relevant Items

228. Private key regex validation [provider.ts:31] [STATUS: PASS] Regex correctly validates 256-bit hex keys; error messages never leak the key value
229. .env key warning message [provider.ts:37-41]
230. Ownership check before every write transaction [utils.ts:58] — [STATUS: PASS] Fixed — verifyOwnership now called in agent.ts at lines 141 and 209. 2026-03-24
231. Zero address detection (name not registered) [utils.ts:65]
232. Checksummed address return from validateAddress [utils.ts:44]
233. EIP-2612 permit deadline (1 hour) [utils.ts:223]
234. ENS commit secret via ethers.randomBytes(32) [register-ens.ts:107]
235. Indexer API key sent only to custom indexer [utils.ts:255-258]
236. No raw error messages containing secrets [provider.ts:45]
237. BigInt handling in JSON serialization [output.ts:34]
238. USDC insufficient funds check before tx [register.ts:45-47]
