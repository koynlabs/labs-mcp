import { sleep } from "workflow";
import { MAKER_ENABLED } from "../src/lib/config";
import { referencePrice } from "../src/lib/market";
// Everything below this line is only ever touched from inside a step. The
// workflow function itself runs in a sandbox with no Node.js modules, so it
// must not read config, hit the network, or build a Solana client.
import {
  decideQuote,
  executeQuote,
  nextAnchor,
} from "../src/lib/maker/quote";
import {
  saveSession,
  sessionKeypair,
} from "../src/lib/maker/session";
import { getSession } from "../src/lib/store";

type Outcome = {
  done: boolean;
  refreshSeconds: number;
  note: string;
};

/**
 * One pass of the quoter. A step rather than a loop body held open: the run
 * sleeps between passes, so a 24-hour session costs nothing while it waits and
 * survives a deploy.
 */
async function quoteOnce(sessionId: string): Promise<Outcome> {
  "use step";

  if (!MAKER_ENABLED) {
    return { done: true, refreshSeconds: 0, note: "quoting is disabled here" };
  }

  // Clients are built inside the step; nothing is captured across passes.
  const session = await getSession(sessionId);
  if (!session) {
    return { done: true, refreshSeconds: 0, note: "session is gone" };
  }
  if (session.status !== "running") {
    return { done: true, refreshSeconds: 0, note: `session is ${session.status}` };
  }
  if (Date.now() >= session.expiresAt) {
    session.status = "expired";
    await saveSession(session);
    return { done: true, refreshSeconds: 0, note: "session expired" };
  }

  try {
    const { price } = await referencePrice(session.venue, session.mint);
    const anchor = session.anchor ?? price;
    const decision = decideQuote({
      price,
      anchor,
      spreadBps: session.spreadBps,
      quoteSol: session.quoteSol,
      maxSol: session.maxSol,
      maxToken: session.maxToken,
      solSpent: session.solSpent,
      tokenHeld: session.tokenHeld,
    });

    session.anchor = anchor;
    session.lastBid = decision.bid;
    session.lastAsk = decision.ask;
    session.lastQuotedAt = Date.now();

    if (decision.side === "idle") {
      await saveSession(session);
      return {
        done: false,
        refreshSeconds: session.refreshSeconds,
        note: decision.reason,
      };
    }

    const filled = await executeQuote(session, decision, sessionKeypair(session));

    if (decision.side === "buy") {
      session.solSpent += decision.sol;
      session.tokenHeld += decision.sol / price;
    } else {
      session.tokenHeld = Math.max(0, session.tokenHeld - decision.token);
      session.solSpent = Math.max(0, session.solSpent - decision.token * price);
    }

    session.anchor = nextAnchor(anchor, filled.filledAt);
    session.lastSignature = filled.signature;
    await saveSession(session);

    return {
      done: false,
      refreshSeconds: session.refreshSeconds,
      note: `${decision.side}: ${decision.reason}`,
    };
  } catch (error) {
    // A failed pass does not end the session; the next one re-reads the price.
    session.error = error instanceof Error ? error.message : String(error);
    await saveSession(session);
    return {
      done: false,
      refreshSeconds: session.refreshSeconds,
      note: `pass failed: ${session.error}`,
    };
  }
}

/**
 * The durable maker session. Started when the maker approves, ends on stop,
 * expiry, or a cap being reached.
 */
export async function makerSession(sessionId: string) {
  "use workflow";

  let passes = 0;
  while (true) {
    const outcome = await quoteOnce(sessionId);
    passes += 1;
    if (outcome.done) {
      return { sessionId, passes, note: outcome.note };
    }
    await sleep(`${outcome.refreshSeconds} seconds`);
  }
}
