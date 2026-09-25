import { Keypair, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { MAX_BUYERS, PUMP } from "../config";
import { buildFeeTx } from "../fee";
import { encodeTx } from "../solana";
import type { PendingTx } from "../types";
import type { LaunchInput, BuiltLaunch } from "./input";
import { resolveMetadata } from "./metadata";

type PortalArg = Record<string, unknown>;

/**
 * Builds the pump.fun launch: one create transaction for the creator plus one
 * buy per creator-owned wallet, all unsigned apart from the mint keypair's
 * signature on the create. The mint keypair is generated here, used once, and
 * discarded; it never holds funds.
 */
export async function buildPumpLaunch(
  input: LaunchInput,
): Promise<BuiltLaunch> {
  const buyers = input.buyers.slice(0, MAX_BUYERS);
  const metadata = await resolveMetadata(input);
  const mintKeypair = Keypair.generate();
  const mint = mintKeypair.publicKey.toBase58();

  const args: PortalArg[] = [
    {
      publicKey: input.creator,
      action: "create",
      tokenMetadata: {
        name: input.name,
        symbol: input.symbol,
        uri: metadata.uri,
      },
      mint,
      denominatedInSol: "true",
      amount: input.creatorBuySol,
      slippage: input.slippagePercent,
      // PumpPortal forwards this as the Jito tip for the bundle.
      priorityFee: input.priorityFeeSol,
      pool: "pump",
    },
    ...buyers.map((buyer) => ({
      publicKey: buyer.publicKey,
      action: "buy",
      mint,
      denominatedInSol: "true",
      amount: buyer.sol,
      slippage: input.slippagePercent,
      // Ignored after the first transaction, but PumpPortal validates the field.
      priorityFee: input.priorityFeeSol,
      pool: "pump",
    })),
  ];

  const response = await fetch(PUMP.tradeLocal, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      [
        `PumpPortal refused the launch (${response.status}): ${detail}.`,
        buyers.length > 0
          ? `It rejects the whole bundle if it dislikes any single wallet, without saying which. Buyers were ${buyers
              .map((buyer) => buyer.publicKey)
              .join(", ")} — retry with fewer to find the one it objects to.`
          : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  const encoded = (await response.json()) as string[];
  if (!Array.isArray(encoded) || encoded.length !== args.length) {
    throw new Error("PumpPortal returned an unexpected number of transactions");
  }

  // The fee transaction leads the bundle so the treasury is paid in the same
  // atomic unit as the launch. A waived fee leaves the bundle a transaction
  // shorter, which is only ever more room under Jito's limit of five.
  const txs: PendingTx[] = input.feeWaived
    ? []
    : [await buildFeeTx(input.creator, 0)];

  encoded.forEach((raw, position) => {
    const tx = VersionedTransaction.deserialize(bs58.decode(raw));
    const isCreate = position === 0;
    if (isCreate) tx.sign([mintKeypair]);

    txs.push({
      index: txs.length,
      role: isCreate ? "create" : "buy",
      signer: isCreate ? input.creator : buyers[position - 1].publicKey,
      tx: encodeTx(tx),
      sol: isCreate ? input.creatorBuySol : buyers[position - 1].sol,
    });
  });

  return {
    venue: "pump",
    mint,
    metadataUri: metadata.uri,
    metadataHost: metadata.host,
    txs,
    buyers,
  };
}
