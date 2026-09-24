"use client";

import { useCallback, useEffect, useState } from "react";
import { Keypair, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import Wordmark from "@/components/Wordmark";

type Session = {
  id: string;
  status: string;
  venue: string;
  mint: string;
  maker: string;
  spreadBps: number;
  quoteSol: number;
  maxSol: number;
  maxToken: number;
  refreshSeconds: number;
  expiresAt: number;
  solSpent: number;
  tokenHeld: number;
  lastBid?: number;
  lastAsk?: number;
  lastFillAt?: number;
  fills: number;
  error?: string;
  feeSol?: number;
  treasury?: string;
  feeTx?: string;
  approvalMessage?: string;
};

type Wallet = {
  publicKey: { toBase58(): string } | null;
  connect(): Promise<unknown>;
  signMessage(message: Uint8Array, encoding?: string): Promise<{ signature: Uint8Array }>;
  signTransaction(tx: VersionedTransaction): Promise<VersionedTransaction>;
};

function wallet(): Wallet {
  const found = (globalThis as { solana?: Wallet }).solana;
  if (!found) {
    throw new Error(
      "No Solana wallet found in this browser. Install Phantom, or open this link in your wallet's browser.",
    );
  }
  return found;
}

export function MakerClient({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/maker/${sessionId}`);
    if (!response.ok) {
      setNote("This maker session has expired or does not exist.");
      return;
    }
    setSession(await response.json());
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const approve = async () => {
    if (!session?.feeTx) return;
    setBusy(true);
    setNote(null);
    try {
      const provider = wallet();
      await provider.connect();
      const connected = provider.publicKey?.toBase58();
      if (connected !== session.maker) {
        throw new Error(
          `Connect the maker wallet ${session.maker}. This one is ${connected}.`,
        );
      }

      // The quoting key is generated here, in your browser, and is the only key
      // the server ever holds. Your wallet's key stays in your wallet.
      const quoting = Keypair.generate();

      const detail = await fetch(
        `/api/maker/${sessionId}?sessionPublicKey=${quoting.publicKey.toBase58()}`,
      ).then((response) => response.json());
      const message: string = detail.approvalMessage;
      if (!message) throw new Error("the server did not return an approval to sign");

      setNote("Read the approval in your wallet before signing it.");
      const { signature } = await provider.signMessage(
        new TextEncoder().encode(message),
        "utf8",
      );

      const feeTx = VersionedTransaction.deserialize(
        Uint8Array.from(atob(session.feeTx), (char) => char.charCodeAt(0)),
      );
      const signedFee = await provider.signTransaction(feeTx);

      const response = await fetch(`/api/maker/${sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionPublicKey: quoting.publicKey.toBase58(),
          sessionSecretKey: bs58.encode(quoting.secretKey),
          approvalSignature: bs58.encode(signature),
          signedFeeTx: btoa(String.fromCharCode(...signedFee.serialize())),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "the server refused it");

      setNote("Quoting is live. You can close this page.");
      await load();
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  if (!session) {
    return (
      <main className="wrap">
        <Wordmark />
        <p>{note ?? "Loading…"}</p>
      </main>
    );
  }

  return (
    <main className="wrap">
      <Wordmark />
      <h1>Two-sided quoting</h1>
      <p className="muted">
        {session.venue === "pump" ? "pump.fun" : "StonkFun"} · mint {session.mint}
      </p>

      <p>
        One wallet, <code>{session.maker}</code>, will hold a bid and an ask{" "}
        {session.spreadBps / 100}% apart around its own fair-value estimate. It
        buys only when the price falls through the bid and sells only when it
        rises through the ask. Between the two it does nothing.
      </p>

      <ul className="caps">
        <li>Quote size: {session.quoteSol} SOL</li>
        <li>Will never spend more than {session.maxSol} SOL</li>
        <li>Will never hold more than {session.maxToken} tokens</li>
        <li>Re-quotes at most every {session.refreshSeconds}s</li>
        <li>Stops at {new Date(session.expiresAt).toLocaleString()}</li>
      </ul>

      <p className="muted">
        The maker address is public and is the only wallet that trades. This is
        not volume generation: no second wallet, nothing hidden, and no trade at
        all unless the price leaves the band.
      </p>

      {session.status === "pending" ? (
        <>
          <p>
            Approving creates a throwaway quoting key in this browser, hands it
            to the server, and pays {session.feeSol} SOL to{" "}
            <code>{session.treasury}</code>. That key can only place these
            quotes, up to these caps, until expiry.
          </p>
          <button onClick={approve} disabled={busy}>
            {busy ? "Approving…" : "Approve and start quoting"}
          </button>
        </>
      ) : (
        <>
          <p className={session.status === "active" ? "ok" : ""}>
            Status: {session.status}
            {session.error ? ` — ${session.error}` : ""}
          </p>
          <ul className="caps">
            <li>Spent: {session.solSpent.toFixed(4)} SOL</li>
            <li>Holding: {session.tokenHeld.toFixed(4)} tokens</li>
            <li>Fills: {session.fills}</li>
            {session.lastBid ? (
              <li>
                Last quote: bid {session.lastBid.toPrecision(6)} / ask{" "}
                {session.lastAsk?.toPrecision(6)}
              </li>
            ) : null}
          </ul>
          <p className="muted">
            To stop early, call <code>stop_maker</code> from your assistant.
          </p>
        </>
      )}

      {note ? <p className="note">{note}</p> : null}
    </main>
  );
}
