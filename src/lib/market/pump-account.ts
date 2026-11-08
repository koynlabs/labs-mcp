import { PublicKey } from "@solana/web3.js";

/** pump.fun program. Bonding curves are PDAs of this program. */
export const PUMP_PROGRAM = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
export const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const TOKEN_2022_PROGRAM = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

/** Real tokens a new curve sells before it completes. Matches pump Global. */
const CURVE_TOKENS = BigInt("793100000000000");
const MINT_SIZE = 82;
const ACCOUNT_SIZE = 165;
const ACCOUNT_TYPE_MINT = 1;
const EXT_METADATA_POINTER = 18;
const EXT_TOKEN_METADATA = 19;

export type CurveState = {
  virtualTokenReserves: bigint;
  virtualSolReserves: bigint;
  realTokenReserves: bigint;
  complete: boolean;
  /** 0 to 1. A completed curve is 1. */
  progress: number;
};

export type MintFacts = {
  decimals: number;
  supply: bigint;
  name?: string;
  symbol?: string;
  uri?: string;
  /** Metadata pointer target, when it is not this mint. */
  metadataAccount?: string;
};

export function bondingCurveAddress(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("bonding-curve"), mint.toBuffer()],
    PUMP_PROGRAM,
  )[0];
}

function u64(data: Uint8Array, offset: number): bigint {
  let n = BigInt(0);
  for (let i = 0; i < 8; i += 1) n += BigInt(data[offset + i] ?? 0) << BigInt(8 * i);
  return n;
}

function u32(data: Uint8Array, offset: number): number {
  return (
    (data[offset] ?? 0) |
    ((data[offset + 1] ?? 0) << 8) |
    ((data[offset + 2] ?? 0) << 16) |
    ((data[offset + 3] ?? 0) << 24)
  ) >>> 0;
}

/**
 * Bonding-curve account after the 8-byte discriminator:
 * virtual token, virtual SOL, real token, real SOL, supply, complete.
 * Later fields sit after `complete` and are ignored.
 */
export function decodeCurve(data: Uint8Array): CurveState | null {
  if (data.length <= 48) return null;
  const virtualTokenReserves = u64(data, 8);
  const virtualSolReserves = u64(data, 16);
  const realTokenReserves = u64(data, 24);
  const complete = data[48] === 1;
  let progress = 1;
  if (!complete) {
    const sold = CURVE_TOKENS > realTokenReserves ? CURVE_TOKENS - realTokenReserves : BigInt(0);
    progress = Math.min(1, Number((sold * BigInt(10_000)) / CURVE_TOKENS) / 10_000);
  }
  return { virtualTokenReserves, virtualSolReserves, realTokenReserves, complete, progress };
}

/** Quote-asset price of one whole token, from the curve's virtual reserves. */
export function curvePrice(curve: CurveState, decimals: number): number | undefined {
  if (!curve.virtualSolReserves || !curve.virtualTokenReserves) return undefined;
  const sol = Number(curve.virtualSolReserves) / 1_000_000_000;
  const tokens = Number(curve.virtualTokenReserves) / 10 ** decimals;
  if (!Number.isFinite(sol) || !Number.isFinite(tokens) || tokens <= 0) return undefined;
  const price = sol / tokens;
  return Number.isFinite(price) && price > 0 ? price : undefined;
}

function extension(data: Uint8Array, type: number): Uint8Array | null {
  if (data.length <= ACCOUNT_SIZE || data[ACCOUNT_SIZE] !== ACCOUNT_TYPE_MINT) return null;
  let index = ACCOUNT_SIZE + 1;
  while (index + 4 <= data.length) {
    const entryType = data[index]! | (data[index + 1]! << 8);
    const entryLength = data[index + 2]! | (data[index + 3]! << 8);
    const value = index + 4;
    if (entryType === 0) return null;
    if (value + entryLength > data.length) return null;
    if (entryType === type) return data.subarray(value, value + entryLength);
    index = value + entryLength;
  }
  return null;
}

function readString(data: Uint8Array, offset: number, max: number): { text: string; next: number } | null {
  if (offset + 4 > data.length) return null;
  const length = u32(data, offset);
  if (length > max || offset + 4 + length > data.length) return null;
  const bytes = data.subarray(offset + 4, offset + 4 + length);
  return { text: new TextDecoder().decode(bytes), next: offset + 4 + length };
}

/** Token-2022 metadata extension: authority, mint, then length-prefixed name, symbol, uri. */
function readTokenMetadata(value: Uint8Array): { name?: string; symbol?: string; uri?: string } | null {
  let offset = 64;
  const name = readString(value, offset, 200);
  if (!name) return null;
  offset = name.next;
  const symbol = readString(value, offset, 32);
  if (!symbol) return null;
  offset = symbol.next;
  const uri = readString(value, offset, 200);
  if (!uri) return null;
  return {
    ...(name.text ? { name: name.text } : {}),
    ...(symbol.text ? { symbol: symbol.text } : {}),
    ...(uri.text ? { uri: uri.text } : {}),
  };
}

function pubkey(data: Uint8Array, offset: number): string | null {
  if (offset + 32 > data.length) return null;
  const key = new PublicKey(data.subarray(offset, offset + 32));
  return key.equals(PublicKey.default) ? null : key.toBase58();
}

/** Name, symbol, and URI from a metadata account or from a mint that carries the extension. */
export function decodeMetadataAccount(data: Uint8Array): { name?: string; symbol?: string; uri?: string } | null {
  const mint = decodeMint(data);
  if (mint?.name || mint?.symbol || mint?.uri) {
    return {
      ...(mint.name ? { name: mint.name } : {}),
      ...(mint.symbol ? { symbol: mint.symbol } : {}),
      ...(mint.uri ? { uri: mint.uri } : {}),
    };
  }
  return readTokenMetadata(data);
}

/** Decimals, supply, and Token-2022 name, symbol, and metadata URI when the mint stores them. */
export function decodeMint(data: Uint8Array): MintFacts | null {
  if (data.length < MINT_SIZE || data[45] !== 1) return null;
  const decimals = data[44] ?? 0;
  if (decimals > 255) return null;
  const facts: MintFacts = { decimals, supply: u64(data, 36) };
  const meta = extension(data, EXT_TOKEN_METADATA);
  if (meta) {
    const parsed = readTokenMetadata(meta);
    if (parsed?.name) facts.name = parsed.name;
    if (parsed?.symbol) facts.symbol = parsed.symbol;
    if (parsed?.uri) facts.uri = parsed.uri;
  }
  const pointer = extension(data, EXT_METADATA_POINTER);
  const pointed = pointer ? pubkey(pointer, 32) : null;
  if (pointed) facts.metadataAccount = pointed;
  return facts;
}
