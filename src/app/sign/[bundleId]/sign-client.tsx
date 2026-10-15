"use client";

import { useCallback, useEffect, useState } from "react";
import { VersionedTransaction } from "@solana/web3.js";
import Wordmark from "@/components/Wordmark";
import { SignFacts } from "@/components/SignFacts";
import type { LaunchView } from "@/lib/launch/disclosure";
import { assertUnsignedForWallet, prepareForSigning } from "@/lib/prepare-tx";

type PendingTx = {
  index: number;
  role: "fee" | "create" | "buy";
  signer: string;
  sol?: number;
  tx: string;
  signed: boolean;
};

type Bundle = {
  bundleId: string;
  status: string;
  venue: string;
  mint: string;
  name: string;
  symbol: string;
  feeSol: number;
  jitoBundleId?: string;
  error?: string;
  txs: PendingTx[];
};

type Wallet = {
  publicKey: { toBase58(): string } | null;
  connect(): Promise<unknown>;
  signTransaction(tx: VersionedTransaction): Promise<VersionedTransaction>;
};

function wallet(): Wallet {
  const scope = globalThis as {
    phantom?: { solana?: Wallet & { isPhantom?: boolean } };
    solana?: Wallet;
  };
  const phantom = scope.phantom?.solana;
  if (phantom?.isPhantom) return phantom;
  if (scope.solana) return scope.solana;
  throw new Error(
    "No Solana wallet found in this browser. Install Phantom, or open this link in your wallet's browser.",
  );
}

const label: Record<PendingTx["role"], string> = {
  fee: "labs fee",
  create: "create the token",
  buy: "buy",
};

export function SignClient({ bundleId, facts }: { bundleId: string; facts: LaunchView | null }) {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [connected, setConnected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/bundle/${bundleId}`);
    if (!response.ok) {
      setNote("This launch has expired or does not exist.");
      return;
    }
    setBundle(await response.json());
  }, [bundleId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!bundle || bundle.status !== "awaiting_signatures") return;
    const timer = setInterval(() => void load(), 10_000);
    return () => clearInterval(timer);
  }, [bundle, load]);

  const connect = async () => {
    try {
      const provider = wallet();
      await provider.connect();
      setConnected(provider.publicKey?.toBase58() ?? null);
      setNote(null);
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    }
  };

  const signMine = async () => {
    if (!bundle || !connected) return;
    setBusy(true);
    setNote(null);
    try {
      const provider = wallet();
      const mine = bundle.txs.filter(
        (tx) => tx.signer === connected && !tx.signed,
      );
      if (mine.length === 0) {
        setNote("Nothing left for this wallet to sign.");
        return;
      }

      const prepared = await fetch(`/api/bundle/${bundleId}/prepare`, {
        method: "POST",
      });
      const fresh = await prepared.json();
      if (!prepared.ok) {
        throw new Error(fresh.error ?? "the transaction failed simulation");
      }
      setBundle(fresh);
      if (fresh.reset) {
        setNote("The previous signatures expired. Sign again.");
      }
      const ready = (fresh.txs as PendingTx[]).filter(
        (tx) => tx.signer === connected && !tx.signed,
      );
      if (ready.length === 0) {
        setNote("Nothing left for this wallet to sign.");
        return;
      }

      for (const pending of ready) {
        const tx = VersionedTransaction.deserialize(
          Uint8Array.from(atob(pending.tx), (char) => char.charCodeAt(0)),
        );
        // signTransaction, not signAndSendTransaction: the mint key still has
        // to sign, and the bundle is submitted by the server.
        assertUnsignedForWallet(tx);
        await prepareForSigning(tx);
        const signed = await provider.signTransaction(tx);
        const response = await fetch(`/api/bundle/${bundleId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            index: pending.index,
            signedTx: btoa(String.fromCharCode(...signed.serialize())),
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "the server refused it");
        if (result.status === "submitted") {
          setNote(`Submitted. Jito bundle ${result.jitoBundleId}`);
        }
      }
      await load();
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  if (!bundle) {
    return (
      <main className="wrap">
        <Wordmark />
        <p>{note ?? "Loading…"}</p>
      </main>
    );
  }

  const waiting = bundle.txs.filter((tx) => !tx.signed);
  const mine = bundle.txs.filter((tx) => tx.signer === connected && !tx.signed);

  return (
    <main className="wrap">
      <Wordmark />
      <h1>
        Launch {bundle.name} ({bundle.symbol})
      </h1>
      <p className="muted">
        {bundle.venue === "pump" ? "pump.fun" : "StonkFun"} · mint {bundle.mint}
      </p>

      <p>
        These transactions land together as one atomic bundle: the token is
        created, and your wallets buy. If any part fails, none of it happens.
        Your wallet signs first. The token&apos;s mint key co-signs on the
        server after that, and only then is the bundle sent.
        {bundle.venue === "pump"
          ? " The create and your opening buy are one transaction, so the wallet can simulate the SOL leaving your account."
          : ""}
      </p>

      {facts ? (
        <SignFacts
          caller={facts.caller}
          host={facts.host}
          expectedHost={facts.host}
          action={facts.action}
          amounts={facts.amounts}
          warning={facts.warning}
        />
      ) : null}

      <ol className="txs">
        {bundle.txs.map((tx) => (
          <li key={tx.index} className={tx.signed ? "done" : ""}>
            <strong>{label[tx.role]}</strong>
            {tx.sol !== undefined ? ` · ${tx.sol} SOL` : ""}
            <br />
            <code>{tx.signer}</code>
            <span className="state">{tx.signed ? "signed" : "waiting"}</span>
          </li>
        ))}
      </ol>

      {bundle.status === "submitted" ? (
        <p className="ok">
          Submitted as Jito bundle <code>{bundle.jitoBundleId}</code>.
        </p>
      ) : bundle.status === "failed" ? (
        <p className="bad">Failed: {bundle.error}</p>
      ) : !connected ? (
        <button onClick={connect}>Connect wallet</button>
      ) : (
        <>
          <p className="muted">Connected as {connected}</p>
          <button onClick={signMine} disabled={busy || mine.length === 0}>
            {busy
              ? "Signing…"
              : mine.length > 0
                ? `Sign ${mine.length} transaction${mine.length > 1 ? "s" : ""}`
                : "Nothing for this wallet"}
          </button>
          {waiting.length > mine.length ? (
            <p className="muted">
              Other wallets still have to sign:{" "}
              {[...new Set(waiting.filter((tx) => tx.signer !== connected).map((tx) => tx.signer))].join(", ")}
              . Connect each one in turn.
            </p>
          ) : null}
        </>
      )}

      {note ? <p className="note">{note}</p> : null}
    </main>
  );
}
