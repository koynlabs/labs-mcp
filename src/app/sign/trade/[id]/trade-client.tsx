"use client";

import { useState } from "react";
import { VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import Wordmark from "@/components/Wordmark";
import { SignFacts } from "@/components/SignFacts";
import { prepareForSigning } from "@/lib/prepare-tx";
import type { AmountLine } from "@/lib/trade/disclosure";

type Cluster = "mainnet" | "devnet";

type Phantom = {
  publicKey?: { toBase58(): string };
  connect(): Promise<{ publicKey: { toBase58(): string } }>;
  signTransaction(tx: VersionedTransaction): Promise<VersionedTransaction>;
  signMessage(
    message: Uint8Array,
    display?: string,
  ): Promise<{ signature: Uint8Array } | Uint8Array>;
};

function wallet(): Phantom {
  const scope = window as unknown as {
    phantom?: { solana?: Phantom & { isPhantom?: boolean } };
    solana?: Phantom;
  };
  const phantom = scope.phantom?.solana;
  if (phantom?.isPhantom) return phantom;
  if (scope.solana) return scope.solana;
  throw new Error("No Solana wallet found. Install Phantom.");
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function shorten(value: string, head: number, tail: number): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function isSolanaSignature(value: string): boolean {
  try {
    return bs58.decode(value).length === 64;
  } catch {
    return false;
  }
}

function solscanTx(signature: string, cluster: Cluster): string {
  const query = cluster === "devnet" ? "?cluster=devnet" : "";
  return `https://solscan.io/tx/${signature}${query}`;
}

async function post(id: string, body: Record<string, unknown>): Promise<Record<string, string>> {
  const response = await fetch(`/api/trade/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as { error?: string } & Record<string, string>;
  if (!response.ok) throw new Error(result.error ?? "The server refused it");
  return result;
}

export function TradeClient({
  id,
  wallet: expected,
  action,
  cluster,
  summary,
  host,
  expectedHost,
  actionLabel,
  amounts,
  warning,
  expiresAt,
}: {
  id: string;
  wallet: string;
  action: string;
  cluster: Cluster;
  summary: string;
  host: string;
  expectedHost: string;
  actionLabel: string;
  amounts: AmountLine[];
  warning: string;
  expiresAt?: number;
}) {
  const [connected, setConnected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const connect = async () => {
    try {
      const provider = wallet();
      const connectedWallet = await provider.connect();
      setConnected(connectedWallet.publicKey.toBase58());
      setNote(null);
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    }
  };

  const sign = async () => {
    if (!connected) return;
    if (connected !== expected) {
      setNote("Connect the wallet this order was made for.");
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const provider = wallet();
      if (action === "order") {
        const challenge = await post(id, { step: "challenge" });
        const signedMessage = await provider.signMessage(
          new TextEncoder().encode(challenge.message),
          "utf8",
        );
        const signatureBytes =
          signedMessage instanceof Uint8Array ? signedMessage : signedMessage.signature;
        await post(id, { step: "verify", signature: bs58.encode(signatureBytes) });
        const deposit = await post(id, { step: "deposit" });
        const transaction = VersionedTransaction.deserialize(fromBase64(deposit.transaction));
        await prepareForSigning(transaction);
        const signed = await provider.signTransaction(transaction);
        const created = await post(id, {
          step: "create",
          requestId: deposit.requestId,
          signedTransaction: toBase64(signed.serialize()),
        });
        setDone(created.signature ?? created.id);
      } else {
        const built = await post(id, { step: "build" });
        const transaction = VersionedTransaction.deserialize(fromBase64(built.transaction));
        await prepareForSigning(transaction);
        const signed = await provider.signTransaction(transaction);
        const submitted = await post(id, {
          step: "submit",
          requestId: built.requestId,
          signedTransaction: toBase64(signed.serialize()),
        });
        setDone(submitted.signature ?? "submitted");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setNote(/reject|cancel|denied|closed/i.test(message) ? "Cancelled in the wallet." : message);
    } finally {
      setBusy(false);
    }
  };

  const matches = connected === expected;

  return (
    <>
      <header className="sign-bar">
        <Wordmark />
        <div className="sign-wallet">
          {connected ? (
            <span className={matches ? "wallet-chip" : "wallet-chip bad"} title={connected}>
              {shorten(connected, 4, 4)}
            </span>
          ) : (
            <button onClick={connect}>Connect wallet</button>
          )}
        </div>
      </header>
      <h1>Sign this trade</h1>
      <p className="muted">{summary}</p>
      <SignFacts
        caller={expected}
        host={host}
        expectedHost={expectedHost}
        action={actionLabel}
        amounts={amounts}
        warning={warning}
        expiresAt={expiresAt}
      />
      <p className="muted">Jupiter’s own fees still apply. labs never sees this wallet’s key.</p>
      {done ? (
        <Submitted value={done} cluster={cluster} />
      ) : connected ? (
        <button onClick={sign} disabled={busy || !matches}>
          {busy ? "Signing…" : matches ? "Sign and submit" : "Wrong wallet"}
        </button>
      ) : null}
      {note ? <p className="note">{note}</p> : null}
    </>
  );
}

function Submitted({ value, cluster }: { value: string; cluster: Cluster }) {
  if (isSolanaSignature(value)) {
    return (
      <p className="ok">
        Submitted{" "}
        <a
          className="tx-link"
          href={solscanTx(value, cluster)}
          target="_blank"
          rel="noopener noreferrer"
          title={value}
        >
          {shorten(value, 6, 6)}
        </a>
      </p>
    );
  }
  if (value === "submitted") return <p className="ok">Submitted</p>;
  return (
    <p className="ok">
      Submitted <span className="order-id">{value}</span>
    </p>
  );
}
