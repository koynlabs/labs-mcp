import type { PendingTx, Venue } from "../types";
import type { LaunchFeatures } from "./features";

export type LaunchInput = {
  venue: Venue;
  creator: string;
  name: string;
  symbol: string;
  imageUrl: string;
  /**
   * Optional coin banner. Pinned and stored in the metadata JSON the same way
   * as `imageUrl`. pump.fun's create instruction has no banner argument.
   */
  bannerUrl?: string;
  description?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  /**
   * Opening buy, in SOL when the quote is wSOL. For any other quote mint this
   * is that asset's own amount: the wallet already holds it.
   */
  creatorBuySol: number;
  /** Additional creator-owned wallets buying in the same bundle. Same unit as `creatorBuySol`. */
  buyers: { publicKey: string; sol: number }[];
  slippagePercent: number;
  priorityFeeSol: number;
  /**
   * Mint the new token trades against. Omitted means wSOL. On pump.fun the
   * mint has to be wSOL or listed in the on-chain QuoteControl registry.
   */
  quoteMint?: string;
  /** A metadata JSON URI the caller has already pinned somewhere. */
  metadataUri?: string;
};

/** Set by the MCP launch. Scripts that build a transaction directly omit these. */
export type LaunchChecks = {
  /** The quote mint has to be an xStock. */
  stockPairing?: boolean;
  /** Trading fees have to be paid out to holders. */
  holderFees?: boolean;
};

export type BuiltLaunch = {
  venue: Venue;
  mint: string;
  /**
   * Base58 secret of the mint keypair this build generated. The caller seals
   * it and co-signs only after the wallet has signed. It is not a wallet key
   * and it never holds funds.
   */
  mintSecret: string;
  blockhash: string;
  lastValidBlockHeight: number;
  metadataUri: string;
  metadataHost: "caller" | "ipfs" | "labs";
  /**
   * Banner URL written into the metadata JSON. Absent when the caller supplied
   * their own metadata URI, which labs does not rewrite.
   */
  banner?: string;
  txs: PendingTx[];
  buyers: { publicKey: string; sol: number }[];
  /**
   * Set when the quote is not wSOL. Buy amounts are then in this asset, which
   * each buyer already holds. A SOL-to-quote swap does not fit in the create
   * transaction, so none is added.
   */
  quoteMint?: string;
  features?: LaunchFeatures;
};
