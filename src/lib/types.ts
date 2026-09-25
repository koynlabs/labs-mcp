import type { FeeWaiver } from "./lever";

export type Venue = "pump" | "stonks";

export type TxRole = "fee" | "create" | "buy";

/**
 * One transaction a wallet still has to sign. `tx` is base64 and may already
 * carry the mint keypair's signature; the message itself is never rebuilt
 * after this point, so the sign page cannot alter what it signs.
 */
export type PendingTx = {
  index: number;
  role: TxRole;
  /** Wallet that must add a signature. */
  signer: string;
  tx: string;
  /** Present on fee and buy transactions. */
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
  feeSol: number;
  /** Set when the creator's $LEVERCOIN hold stood in for the SOL fee. */
  feeWaiver?: FeeWaiver;
  treasury: string;
  txs: PendingTx[];
  /** index -> base64 signed transaction. */
  signed: Record<string, string>;
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
  feeSol: number;
  /** Set when the maker's $LEVERCOIN hold stood in for the SOL fee. */
  feeWaiver?: FeeWaiver;
  treasury: string;
  /** Fee transaction the maker signs to open the session. Empty when waived. */
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
