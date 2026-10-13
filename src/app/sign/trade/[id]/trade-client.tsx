"use client";

import { useState } from "react";
import { VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { prepareForSigning } from "@/lib/prepare-tx";

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

export function TradeClient({ id, wallet: expected, action }: { id: string; wallet: string; action: string }) {
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
      <p className="muted">Jupiter’s own fees still apply. labs never sees this wallet’s key.</p>
      {done ? (
        <p className="ok">
          Submitted <code>{done}</code>
        </p>
      ) : !connected ? (
        <button onClick={connect}>Connect wallet</button>
      ) : (
        <>
          <p className="muted">Connected as {connected}</p>
          <button onClick={sign} disabled={busy || !matches}>
            {busy ? "Signing…" : matches ? "Sign and submit" : "Wrong wallet"}
          </button>
        </>
      )}
      {note ? <p className="note">{note}</p> : null}
    </>
  );
}
