import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { FEE_SOL, MAKER, SITE_URL, treasury } from "../config";
import { buildFeeTx } from "../fee";
import { feeWaiverFor, stillHolds } from "../lever";
import { verifySignedTx } from "../solana";
import { getSession, put } from "../store";
import type { MakerSession, Venue } from "../types";

export function makerUrl(id: string): string {
  return `${SITE_URL}/maker/${id}`;
}

function encryptionKey(): Buffer {
  const secret = process.env.LABS_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "LABS_SESSION_SECRET must be set to at least 32 characters to hold maker session keys",
    );
  }
  return createHash("sha256").update(secret).digest();
}

/**
 * The quoting key is stored encrypted so a leaked row cannot trade. It is only
 * ever decrypted inside a workflow step, and it can only reach the one mint and
 * SOL cap the maker approved.
 */
function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    body.toString("base64"),
  ].join(".");
}

function decrypt(packed: string): string {
  const [iv, tag, body] = packed.split(".");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return (
    decipher.update(Buffer.from(body, "base64")).toString("utf8") +
    decipher.final("utf8")
  );
}

/**
 * Exactly what the maker wallet is asked to sign. Written out in full so the
 * wallet prompt states the mint, the cap and the expiry rather than a hash.
 */
export function approvalMessage(
  session: MakerSession,
  sessionPublicKey: string,
): string {
  return [
    "labs.levercoin.lol maker session",
    `venue: ${session.venue}`,
    `mint: ${session.mint}`,
    `maker: ${session.maker}`,
    `session key: ${sessionPublicKey}`,
    `max sol: ${session.maxSol}`,
    `max token: ${session.maxToken}`,
    `spread: ${session.spreadBps} bps`,
    `quote size: ${session.quoteSol} SOL`,
    `refresh: ${session.refreshSeconds}s`,
    `expires: ${new Date(session.expiresAt).toISOString()}`,
    "",
    "This session key may only buy and sell this one mint, up to the SOL cap,",
    "until it expires or you stop it. It cannot move funds anywhere else.",
  ].join("\n");
}

export type MakerRequest = {
  venue: Venue;
  mint: string;
  maker: string;
  spreadBps: number;
  quoteSol: number;
  maxToken: number;
  maxSol: number;
  refreshSeconds: number;
  durationHours: number;
};

export async function createSession(
  request: MakerRequest,
): Promise<MakerSession> {
  if (request.spreadBps < MAKER.minSpreadBps) {
    throw new Error(
      `spreadBps must be at least ${MAKER.minSpreadBps}. A tighter spread is not quoting.`,
    );
  }
  if (request.refreshSeconds < MAKER.minRefreshSeconds) {
    throw new Error(
      `refreshSeconds must be at least ${MAKER.minRefreshSeconds}.`,
    );
  }
  if (request.durationHours > MAKER.maxDurationHours) {
    throw new Error(
      `durationHours cannot exceed ${MAKER.maxDurationHours}.`,
    );
  }
  if (request.quoteSol > request.maxSol) {
    throw new Error("quoteSol cannot be larger than maxSol.");
  }

  // A maker holding $LEVERCOIN approves the session without paying the fee, so
  // there is nothing for them to sign beyond the approval itself.
  const feeWaiver = await feeWaiverFor(request.maker);

  const expiresAt = Date.now() + request.durationHours * 3600 * 1000;
  const session: MakerSession = {
    id: randomUUID(),
    kind: "maker",
    ...request,
    expiresAt,
    feeSol: feeWaiver ? 0 : FEE_SOL,
    feeWaiver: feeWaiver ?? undefined,
    treasury: treasury().toBase58(),
    txs: feeWaiver ? [] : [await buildFeeTx(request.maker, 0)],
    signed: {},
    status: "awaiting_approval",
    solSpent: 0,
    tokenHeld: 0,
    createdAt: Date.now(),
  };

  await put(session, request.durationHours * 3600 + 3600);
  return session;
}

function ttlFor(session: MakerSession): number {
  return Math.max(
    60,
    Math.ceil((session.expiresAt - Date.now()) / 1000) + 3600,
  );
}

/**
 * Turns an approved session on: the maker's signature over the approval text is
 * checked against the exact parameters stored here, and the fee transaction is
 * verified the same way a launch is.
 */
export async function activateSession(input: {
  id: string;
  sessionPublicKey: string;
  sessionSecretKey: string;
  approvalSignature: string;
  /** Absent when the maker's $LEVERCOIN hold waived the fee. */
  signedFeeTx?: string;
}): Promise<MakerSession> {
  const session = await getSession(input.id);
  if (!session) throw new Error("that maker session has expired or does not exist");
  if (session.status !== "awaiting_approval") {
    throw new Error(`this session is already ${session.status}`);
  }

  const expected = approvalMessage(session, input.sessionPublicKey);
  const signatureOk = nacl.sign.detached.verify(
    new TextEncoder().encode(expected),
    bs58.decode(input.approvalSignature),
    new PublicKey(session.maker).toBytes(),
  );
  if (!signatureOk) {
    throw new Error("the approval was not signed by the maker wallet");
  }

  // The secret must actually belong to the approved public key, otherwise the
  // signature covers a key that is not the one being stored.
  const keypair = Keypair.fromSecretKey(bs58.decode(input.sessionSecretKey));
  if (keypair.publicKey.toBase58() !== input.sessionPublicKey) {
    throw new Error("the session key does not match the approved public key");
  }

  if (session.feeWaiver) {
    await stillHolds(session.feeWaiver);
  } else {
    const fee = session.txs[0];
    if (!input.signedFeeTx) throw new Error("the fee transaction is not signed");
    const check = verifySignedTx(input.signedFeeTx, fee.tx, fee.signer);
    if (!check.ok) throw new Error(check.reason);
    session.signed["0"] = input.signedFeeTx;
  }

  session.sessionPublicKey = input.sessionPublicKey;
  session.sessionKey = encrypt(input.sessionSecretKey);
  session.status = "running";

  await put(session, ttlFor(session));
  return session;
}

export function sessionKeypair(session: MakerSession): Keypair {
  if (!session.sessionKey) throw new Error("this session has no quoting key");
  return Keypair.fromSecretKey(bs58.decode(decrypt(session.sessionKey)));
}

export async function saveSession(session: MakerSession): Promise<void> {
  await put(session, ttlFor(session));
}

/** Everything a tool may reveal. The quoting key is never part of it. */
export function publicView(session: MakerSession) {
  return {
    sessionId: session.id,
    status: session.status,
    venue: session.venue,
    mint: session.mint,
    maker: session.maker,
    spreadBps: session.spreadBps,
    quoteSol: session.quoteSol,
    refreshSeconds: session.refreshSeconds,
    caps: { maxSol: session.maxSol, maxToken: session.maxToken },
    inventory: { solSpent: session.solSpent, tokenHeld: session.tokenHeld },
    lastBid: session.lastBid,
    lastAsk: session.lastAsk,
    lastSignature: session.lastSignature,
    lastQuotedAt: session.lastQuotedAt
      ? new Date(session.lastQuotedAt).toISOString()
      : undefined,
    expiresAt: new Date(session.expiresAt).toISOString(),
    secondsRemaining: Math.max(
      0,
      Math.round((session.expiresAt - Date.now()) / 1000),
    ),
    error: session.error,
  };
}
