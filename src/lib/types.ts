export type Venue = "pump" | "stonks";

export type TxRole = "fee" | "create" | "buy";

/**
 * One transaction a wallet still has to sign. `tx` is base64 and unsigned.
 * The mint key signs only after the wallet does. The message is replaced,
 * still unsigned, when the signer asks for a fresh blockhash.
 */
export type PendingTx = {
  index: number;
  role: TxRole;
  /** Wallet that must add a signature. */
  signer: string;
  tx: string;
  /**
   * Amount this transaction spends, on a create or a buy. SOL when the quote
   * is wSOL. Otherwise the quote asset's own amount (`LaunchBundle.quoteMint`).
   */
  sol?: number;
};

export type BundleStatus =
  | "awaiting_signatures"
  | "submitting"
  | "submitted"
  | "failed";

export type LaunchBundle = {
  id: string;
  kind: "launch";
  venue: Venue;
  mint: string;
  creator: string;
  name: string;
  symbol: string;
  metadataUri: string;
  metadataHost: "caller" | "ipfs" | "labs";
  buyers: { publicKey: string; sol: number }[];
  /** Always 0. Kept so older clients still see the field. */
  feeSol: number;
  /**
   * Present when the launch is paired with something other than wSOL.
   * `txs[].sol` is then an amount of this mint, which the buyer already holds.
   */
  quoteMint?: string;
  txs: PendingTx[];
  /** index -> base64 signed transaction. The create also carries the mint signature. */
  signed: Record<string, string>;
  /**
   * Mint keypair, sealed with LABS_SESSION_SECRET. Co-signs the create after
   * the wallet. Never returned to the browser. Holds no funds.
   */
  sealedMint?: string;
  /** Blockhash currently inside `txs`, and the last block height it survives. */
  blockhash?: string;
  lastValidBlockHeight?: number;
  status: BundleStatus;
  jitoBundleId?: string;
  signatures?: string[];
  error?: string;
  createdAt: number;
};

export type MakerSession = {
  id: string;
  kind: "maker";
  venue: Venue;
  mint: string;
  /** The one public maker wallet. Disclosed in maker_status. */
  maker: string;
  spreadBps: number;
  quoteSol: number;
  maxToken: number;
  maxSol: number;
  refreshSeconds: number;
  expiresAt: number;
  /** Always 0. Kept so older clients still see the field. */
  feeSol: number;
  /** Empty. A session has nothing to sign besides the approval text. */
  txs: PendingTx[];
  signed: Record<string, string>;
  status:
    | "awaiting_approval"
    | "running"
    | "stopped"
    | "expired"
    | "failed";
  /** Ephemeral quoting key, encrypted at rest. Never returned by any tool. */
  sessionKey?: string;
  sessionPublicKey?: string;
  solSpent: number;
  tokenHeld: number;
  /**
   * The fair-value estimate the quotes bracket. Seeded from the price when the
   * session starts and nudged toward each fill, so the band has to be crossed
   * before anything trades.
   */
  anchor?: number;
  lastBid?: number;
  lastAsk?: number;
  lastSignature?: string;
  lastQuotedAt?: number;
  runId?: string;
  error?: string;
  createdAt: number;
};

export type PerpAsset = "SOL" | "ETH" | "BTC";
export type PerpSide = "long" | "short";

type TradeDraftBase = {
  wallet: string;
  summary: string;
};

/** An order an agent asked for, before it is stored. */
export type TradeDraft =
  | (TradeDraftBase & {
      action: "swap";
      inputMint: string;
      outputMint: string;
      amount: string;
    })
  | (TradeDraftBase & {
      action: "order";
      mode: "limit" | "stop" | "bracket" | "dca";
      inputMint: string;
      outputMint: string;
      tokenMint: string;
      amount: string;
      expiresAt: number;
      triggerPriceUsd?: number;
      triggerCondition?: "above" | "below";
      trailingBps?: number;
      tpPriceUsd?: number;
      slPriceUsd?: number;
      orderCount?: number;
      intervalSeconds?: number;
    })
  | (TradeDraftBase & {
      action: "perp-open";
      asset: PerpAsset;
      side: PerpSide;
      mode: "market" | "limit";
      usdcRaw: string;
      leverage: string;
      triggerPrice?: string;
      tpPrice?: string;
      slPrice?: string;
    })
  | (TradeDraftBase & {
      action: "perp-close";
      positionPubkey: string;
    })
  | (TradeDraftBase & {
      action: "perp-exit";
      op: "set" | "cancel-tpsl" | "cancel-limit";
      positionPubkey?: string;
      requestPubkey?: string;
      tpPrice?: string;
      slPrice?: string;
    });

/**
 * The Jupiter quote this trade may submit. The signed message has to match
 * `transaction`, and `requestId` is the only one execute will accept.
 */
export type StoredQuote = {
  requestId: string;
  transaction: string;
  expiresAt: number;
};

/** The same order, kept until the bundle TTL. The sign page builds the transaction later. */
export type TradeIntent = TradeDraft & {
  id: string;
  kind: "trade";
  createdAt: number;
  /** Present after build or deposit. Cleared once the trade is submitted. */
  quote?: StoredQuote;
  /** AES-GCM sealed Jupiter bearer. Never returned to the browser. */
  sealedSession?: string;
  sessionExpiresAt?: number;
};
