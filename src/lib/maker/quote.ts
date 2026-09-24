import { VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { PUMP } from "../config";
import { connection } from "../solana";
import type { MakerSession } from "../types";

export type QuoteDecision =
  | { side: "idle"; bid: number; ask: number; reason: string }
  | { side: "buy"; bid: number; ask: number; sol: number; reason: string }
  | { side: "sell"; bid: number; ask: number; token: number; reason: string };

export type QuoteInputs = {
  price: number;
  anchor: number;
  spreadBps: number;
  quoteSol: number;
  maxSol: number;
  maxToken: number;
  solSpent: number;
  tokenHeld: number;
};

/**
 * Quoting on a bonding curve: the wallet holds a bid and an ask around its own
 * fair-value anchor and only trades when the curve price crosses one of them.
 * Inside the band it does nothing, which is what keeps this from manufacturing
 * volume. Inventory pulls size down on whichever side the wallet is already
 * heavy, and stops that side outright at the cap.
 */
export function decideQuote(input: QuoteInputs): QuoteDecision {
  const half = input.spreadBps / 2 / 10_000;
  const bid = input.anchor * (1 - half);
  const ask = input.anchor * (1 + half);

  if (input.price <= bid) {
    const solRoom = input.maxSol - input.solSpent;
    if (solRoom <= 0) {
      return { side: "idle", bid, ask, reason: "SOL cap reached; bid is off" };
    }
    const tokenRoom = input.maxToken - input.tokenHeld;
    if (tokenRoom <= 0) {
      return {
        side: "idle",
        bid,
        ask,
        reason: "token cap reached; bid is off",
      };
    }
    // Size fades as inventory builds, so the last of the cap is never spent at
    // once.
    const fade = Math.max(0.1, tokenRoom / input.maxToken);
    const sol = Math.min(input.quoteSol * fade, solRoom, tokenRoom * input.price);
    if (sol <= 0.000_01) {
      return { side: "idle", bid, ask, reason: "remaining room is too small to quote" };
    }
    return {
      side: "buy",
      bid,
      ask,
      sol,
      reason: `price ${input.price} is at or below the bid ${bid}`,
    };
  }

  if (input.price >= ask) {
    if (input.tokenHeld <= 0) {
      return {
        side: "idle",
        bid,
        ask,
        reason: "nothing held to sell at the ask",
      };
    }
    const token = Math.min(input.quoteSol / input.price, input.tokenHeld);
    if (token <= 0) {
      return { side: "idle", bid, ask, reason: "position too small to quote" };
    }
    return {
      side: "sell",
      bid,
      ask,
      token,
      reason: `price ${input.price} is at or above the ask ${ask}`,
    };
  }

  return {
    side: "idle",
    bid,
    ask,
    reason: `price ${input.price} is inside the spread; holding both sides`,
  };
}

/** Moves the anchor a third of the way to a fill, so the band tracks the market. */
export function nextAnchor(anchor: number, filledAt: number): number {
  return anchor + (filledAt - anchor) / 3;
}

/**
 * Sends one side of a quote. Only pump.fun is wired: PumpPortal builds a buy or
 * sell from the mint alone. Quoting an existing StonkFun LaunchLab pool needs
 * pool state that the launch-time pricing call does not return, so it is refused
 * rather than guessed at.
 */
export async function executeQuote(
  session: MakerSession,
  decision: QuoteDecision,
  signer: import("@solana/web3.js").Keypair,
): Promise<{ signature: string; filledAt: number }> {
  if (decision.side === "idle") throw new Error("nothing to send");
  if (session.venue !== "pump") {
    throw new Error(
      "quoting is only wired for pump.fun mints; StonkFun pool quoting is not enabled",
    );
  }

  const response = await fetch(PUMP.tradeLocal, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      publicKey: signer.publicKey.toBase58(),
      action: decision.side,
      mint: session.mint,
      denominatedInSol: decision.side === "buy" ? "true" : "false",
      amount: decision.side === "buy" ? decision.sol : decision.token,
      slippage: 5,
      priorityFee: 0.00005,
      pool: "auto",
    }),
  });
  if (!response.ok) {
    throw new Error(
      `PumpPortal refused the quote (${response.status}): ${await response.text()}`,
    );
  }

  const tx = VersionedTransaction.deserialize(
    new Uint8Array(await response.arrayBuffer()),
  );
  tx.sign([signer]);

  const signature = await connection().sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 2,
  });

  return {
    signature,
    filledAt: decision.side === "buy" ? decision.bid : decision.ask,
  };
}
