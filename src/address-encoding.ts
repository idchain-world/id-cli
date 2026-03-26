import { bech32, bech32m, base58check, base64url, base32nopad } from "@scure/base";
import { ethers } from "ethers";

function sha256(data: Uint8Array): Uint8Array {
  return ethers.getBytes(ethers.sha256(data));
}

const b58c = base58check(sha256);

/**
 * Encode an address string to raw bytes for ENS storage.
 * Detects the address format and encodes appropriately:
 * - 0x... → hex bytes (ETH, Sui, EVM chains)
 * - bc1.../tb1... → Bitcoin bech32 scriptPubKey
 * - T... (34 chars) → Tron base58check (21 bytes)
 * - UQ.../EQ... → TON base64url (workchain + hash)
 * - f0-f4/t0-t4 → Filecoin protocol-prefixed bytes
 * - *1... → Cosmos-style bech32 raw bytes
 */
export function encodeAddressToBytes(address: string, coinType: number): Uint8Array {
  // 1. ETH or hex addresses (0x prefix)
  if (address.startsWith("0x") || address.startsWith("0X")) {
    if (coinType === 60) {
      // ETH: validate checksum and return 20 bytes
      return ethers.getBytes(ethers.getAddress(address));
    }
    // Sui, other EVM chains: already hex, just decode
    return ethers.getBytes(address);
  }

  // 2. Bitcoin bech32/bech32m (bc1... or tb1...)
  if (address.startsWith("bc1") || address.startsWith("tb1")) {
    return decodeBitcoinBech32(address);
  }

  // 3. Tron base58check (T..., 34 chars)
  if (address.startsWith("T") && address.length === 34) {
    return decodeTronAddress(address);
  }

  // 4. TON user-friendly addresses (UQ.../EQ.../kQ.../0Q...)
  if (/^[UEk0]Q/.test(address)) {
    return decodeTonAddress(address);
  }

  // 5. Filecoin addresses (f0-f4 or t0-t4)
  if (/^[ft][0-4]/.test(address)) {
    return decodeFilecoinAddress(address);
  }

  // 6. Try as Cosmos-style bech32 (contains "1" separator)
  if (address.includes("1")) {
    try {
      return decodeCosmosBech32(address);
    } catch {
      // Not a valid bech32 address, fall through
    }
  }

  // 7. Fallback: treat as raw hex bytes
  return ethers.getBytes(address);
}

/**
 * Decode Bitcoin bech32/bech32m address to scriptPubKey bytes.
 * Per BIP-141/BIP-350: scriptPubKey = OP_n <push_len> <witness_program>
 */
function decodeBitcoinBech32(address: string): Uint8Array {
  let words: number[];
  const bech32Addr = address as `${string}1${string}`;
  try {
    // Witness version 0 uses bech32
    const decoded = bech32.decode(bech32Addr);
    words = Array.from(decoded.words);
  } catch {
    // Witness version 1+ uses bech32m (BIP-350)
    const decoded = bech32m.decode(bech32Addr);
    words = Array.from(decoded.words);
  }

  const witnessVersion = words[0];
  const witnessProgram = bech32.fromWordsUnsafe(words.slice(1));
  if (!witnessProgram) throw new Error(`Invalid Bitcoin bech32 address: ${address}`);

  // Encode as scriptPubKey: OP_n <push_length> <program>
  const versionOpcode = witnessVersion === 0 ? 0x00 : 0x50 + witnessVersion;
  const script = new Uint8Array(2 + witnessProgram.length);
  script[0] = versionOpcode;
  script[1] = witnessProgram.length;
  script.set(witnessProgram, 2);
  return script;
}

/**
 * Decode Cosmos-style bech32 address to raw bytes.
 * Works for cosmos1..., osmo1..., terra1..., etc.
 */
function decodeCosmosBech32(address: string): Uint8Array {
  const decoded = bech32.decode(address as `${string}1${string}`);
  const bytes = bech32.fromWordsUnsafe(decoded.words);
  if (!bytes) throw new Error(`Invalid Cosmos bech32 address: ${address}`);
  return new Uint8Array(bytes);
}

/**
 * Decode Tron base58check address to 21-byte payload (version + address).
 */
function decodeTronAddress(address: string): Uint8Array {
  return b58c.decode(address);
}

/**
 * Decode TON user-friendly address to raw bytes (workchain + hash).
 * Format: 1 byte flags + 1 byte workchain + 32 bytes hash + 2 bytes CRC16
 */
function decodeTonAddress(address: string): Uint8Array {
  // TON uses base64url with possible padding
  const padded = address + "=".repeat((4 - (address.length % 4)) % 4);
  const raw = base64url.decode(padded);
  // Return workchain (1 byte) + hash (32 bytes), skip flags and CRC16
  return raw.slice(1, 34);
}

/**
 * Decode Filecoin address to protocol-prefixed bytes.
 */
function decodeFilecoinAddress(address: string): Uint8Array {
  const protocol = parseInt(address[1], 10);
  const payload = address.slice(2);

  switch (protocol) {
    case 0: {
      // ID address: protocol byte + leb128 encoded ID
      const id = BigInt(payload);
      const leb = encodeLeb128(id);
      const result = new Uint8Array(1 + leb.length);
      result[0] = 0;
      result.set(leb, 1);
      return result;
    }
    case 1:
    case 2: {
      // secp256k1 (f1) or Actor (f2): protocol byte + 20-byte hash
      // Payload is base32 lowercase (no padding) of hash + 4-byte checksum
      const decoded = base32nopad.decode(payload.toUpperCase());
      const hash = decoded.subarray(0, decoded.length - 4); // remove checksum
      const result = new Uint8Array(1 + hash.length);
      result[0] = protocol;
      result.set(hash, 1);
      return result;
    }
    case 3: {
      // BLS (f3): protocol byte + 48-byte public key
      const decoded = base32nopad.decode(payload.toUpperCase());
      const pubkey = decoded.subarray(0, decoded.length - 4);
      const result = new Uint8Array(1 + pubkey.length);
      result[0] = 3;
      result.set(pubkey, 1);
      return result;
    }
    case 4: {
      // Delegated (f4): protocol byte + leb128(namespace) + sub-address
      // Format: f4{namespace}f{subaddress}
      const fIdx = payload.indexOf("f");
      if (fIdx === -1) throw new Error(`Invalid f4 address: ${address}`);
      const namespace = BigInt(payload.slice(0, fIdx));
      const subPayload = payload.slice(fIdx + 1);
      const namespaceLeb = encodeLeb128(namespace);

      const decoded = base32nopad.decode(subPayload.toUpperCase());
      const subAddr = decoded.subarray(0, decoded.length - 4);

      const result = new Uint8Array(1 + namespaceLeb.length + subAddr.length);
      result[0] = 4;
      result.set(namespaceLeb, 1);
      result.set(subAddr, 1 + namespaceLeb.length);
      return result;
    }
    default:
      throw new Error(`Unknown Filecoin protocol: ${protocol}`);
  }
}

/**
 * Encode a BigInt as unsigned LEB128 bytes.
 */
function encodeLeb128(value: bigint): Uint8Array {
  const bytes: number[] = [];
  let v = value;
  do {
    let byte = Number(v & 0x7fn);
    v >>= 7n;
    if (v !== 0n) byte |= 0x80;
    bytes.push(byte);
  } while (v !== 0n);
  return new Uint8Array(bytes);
}
