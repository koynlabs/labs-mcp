import type { PendingTx, Venue } from "../types";

export type LaunchInput = {
  venue: Venue;
  creator: string;
  name: string;
  symbol: string;
  imageUrl: string;
  description?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  /** The creator's own opening buy, in SOL. */
  creatorBuySol: number;
  /** Additional creator-owned wallets buying in the same bundle. */
  buyers: { publicKey: string; sol: number }[];
  slippagePercent: number;
  priorityFeeSol: number;
  /** StonkFun only: the mint the new token trades against. */
  quoteMint?: string;
  /** A metadata JSON URI the caller has already pinned somewhere. */
  metadataUri?: string;
};

export type BuiltLaunch = {
  venue: Venue;
  mint: string;
  metadataUri: string;
  metadataHost: "caller" | "ipfs" | "labs";
  txs: PendingTx[];
  buyers: { publicKey: string; sol: number }[];
};
