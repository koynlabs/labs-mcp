import { OnlinePumpSdk, type QuoteMintSource } from "@pump-fun/pump-sdk";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, unpackMint } from "@solana/spl-token";
import { WSOL_MINT } from "../config";
import { connection } from "../solana";

export type PumpPair = {
  mint: string;
  /** Where create_v2 admits it: SOL, Global's whitelist, or the QuoteControl PDA. */
  source: QuoteMintSource;
  decimals: number;
  tokenProgram: string;
  /** Raw units a new curve quoted in this mint starts from. */
  initialVirtualQuoteReserves: string;
};

const MINT_BATCH = 100;

/**
 * Every quote mint create_v2 will accept right now. Read from Global and the
 * QuoteControl account. Nothing here is a hardcoded allowlist: a mint that
 * leaves the registry disappears from the next call.
 */
export async function listPumpPairs(): Promise<PumpPair[]> {
  const supported = await new OnlinePumpSdk(connection()).fetchSupportedQuoteMints();
  const pairs: PumpPair[] = [];

  for (let offset = 0; offset < supported.length; offset += MINT_BATCH) {
    const slice = supported.slice(offset, offset + MINT_BATCH);
    const infos = await connection().getMultipleAccountsInfo(
      slice.map((entry) => entry.mint),
    );
    for (const [index, info] of infos.entries()) {
      const entry = slice[index];
      if (!entry || !info) continue;
      const owner = info.owner;
      if (!owner.equals(TOKEN_PROGRAM_ID) && !owner.equals(TOKEN_2022_PROGRAM_ID)) {
        continue;
      }
      let decimals: number;
      try {
        decimals = unpackMint(entry.mint, info, owner).decimals;
      } catch {
        if (entry.mint.toBase58() !== WSOL_MINT) continue;
        decimals = 9;
      }
      pairs.push({
        mint: entry.mint.toBase58(),
        source: entry.source,
        decimals,
        tokenProgram: owner.toBase58(),
        initialVirtualQuoteReserves: entry.initialVirtualQuoteReserves.toString(),
      });
    }
  }

  return pairs;
}
