import { PublicKey } from "@solana/web3.js";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export const SITE_URL = (
  process.env.LABS_SITE_URL ?? "https://labs.levercoin.lol"
).replace(/\/$/, "");

/** Same value; named for the callers that build links rather than read config. */
export function baseUrl(): string {
  return SITE_URL;
}

export const SOLANA_RPC =
  process.env.SOLANA_RPC ?? "https://api.mainnet-beta.solana.com";

/** Fee charged per launch and per maker session, in SOL. */
export const FEE_SOL = Number(process.env.LABS_FEE_SOL ?? "0.1");

export function treasury(): PublicKey {
  return new PublicKey(required("LABS_TREASURY"));
}

/**
 * A Jito bundle holds at most 5 transactions. One is the create, one is the
 * fee, so three wallets can buy inside the launch bundle.
 */
export const MAX_BUYERS = 3;

/** Signed bundles are dropped if nobody finishes signing within this window. */
export const BUNDLE_TTL_SECONDS = 15 * 60;

export const MAKER = {
  /** Refusing tighter spreads keeps this a quoter rather than a volume printer. */
  minSpreadBps: 50,
  minRefreshSeconds: 15,
  maxDurationHours: 24,
};

/** The quoter runner is off until a maker session has somewhere to run. */
export const MAKER_ENABLED = process.env.LABS_MAKER_ENABLED === "true";

/**
 * Metadata pinning. Optional, but without it a launch's metadata JSON is served
 * by labs itself, and an on-chain URI should outlive this deployment.
 */
export const PINATA = {
  jwt: process.env.LABS_PINATA_JWT,
  /** The v3 files endpoint, which is what PumpPortal's own examples use. */
  upload: "https://uploads.pinata.cloud/v3/files",
  gateway: (process.env.LABS_IPFS_GATEWAY ?? "https://ipfs.io/ipfs").replace(
    /\/$/,
    "",
  ),
};

export const PUMP = {
  tradeLocal: "https://pumpportal.fun/api/trade-local",
  jitoBundle: "https://mainnet.block-engine.jito.wtf/api/v1/bundles",
  /** Read-only pump.fun data: bonding curve, token details, holders. */
  readMcp: process.env.PUMP_READ_MCP_URL ?? "https://three.ws/api/pump-fun-mcp",
};

/**
 * StonkFun launches are Raydium LaunchLab pools built client-side: read a
 * launchable pair and its pricing, build `initialize_with_token_2022` against
 * StonkFun's platform id, and land it yourself. StonkFun then adopts the pool.
 * Their own prepare/submit flow is gated behind `paidLaunchesEnabled`, which is
 * currently off, so it is not used here.
 */
export const STONKS = {
  publicApi: "https://www.stonkfun.xyz/api/public/v1",
  /** LaunchLab mints are always 6 decimals. */
  baseDecimals: 6,
};
