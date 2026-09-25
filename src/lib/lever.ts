import { PublicKey } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  FEE_SOL,
  JUPITER_PRICE_API,
  LEVER_MINT,
  WSOL_MINT,
} from "./config";
import { connection } from "./solana";

/**
 * The fee can be paid in SOL or waived by holding $LEVERCOIN. A waiver records
 * the raw token amount that was required, so submit re-checks the same number
 * rather than repricing: the token's USD price moves during the signing window,
 * and a launch should not become unaffordable between building and signing.
 */
export type FeeWaiver = {
  /** Wallet that would otherwise have paid the SOL fee. */
  holder: string;
  mint: string;
  decimals: number;
  /** Base units, the unit the balance is read in. */
  requiredRaw: string;
  requiredTokens: number;
  heldTokens: number;
  feeSolWaived: number;
};

type PriceRow = { usdPrice?: number; decimals?: number };

async function prices(
  mint: string,
): Promise<{ lever: PriceRow; sol: PriceRow } | null> {
  const url = new URL(JUPITER_PRICE_API);
  url.searchParams.set("ids", `${mint},${WSOL_MINT}`);

  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) return null;

  const body = (await response.json()) as Record<string, PriceRow | undefined>;
  const lever = body[mint];
  const sol = body[WSOL_MINT];
  if (!lever || !sol) return null;
  return { lever, sol };
}

/**
 * A failed lookup charges SOL rather than failing the launch, so it has to be
 * visible in the logs: an RPC that cannot read token accounts would otherwise
 * turn the waiver off with no sign of it.
 */
function warn<T = null>(what: string, fallback?: T) {
  return (error: unknown): T => {
    console.warn(
      `[lever] ${what} lookup failed, charging the SOL fee:`,
      error instanceof Error ? error.message : error,
    );
    return (fallback ?? null) as T;
  };
}

function positive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

/**
 * The wallet's $LEVERCOIN in base units, read from its associated token
 * accounts under both token programs. Reading the two derived addresses rather
 * than scanning the owner's accounts keeps this off `getTokenAccountsByOwner`,
 * which many RPC plans bill as an index method and refuse. The cost is that
 * tokens parked in some other account do not count towards the waiver.
 */
async function heldRaw(
  owner: PublicKey,
  mint: PublicKey,
): Promise<{ raw: bigint; decimals: number | null }> {
  const atas = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID].map((programId) =>
    getAssociatedTokenAddressSync(mint, owner, true, programId),
  );
  const accounts = await connection().getMultipleParsedAccounts(atas);

  let raw = 0n;
  let decimals: number | null = null;

  for (const account of accounts.value) {
    const data = account?.data;
    if (!data || !("parsed" in data)) continue;
    const info = (
      data.parsed as {
        info?: { tokenAmount?: { amount?: string; decimals?: number } };
      }
    ).info?.tokenAmount;
    if (!info?.amount) continue;
    raw += BigInt(info.amount);
    if (typeof info.decimals === "number") decimals = info.decimals;
  }

  return { raw, decimals };
}

/**
 * Whether this wallet holds enough $LEVERCOIN to skip the SOL fee. Returns null
 * whenever the answer is not a confident yes — no configured mint, no price, or
 * too small a balance — and the caller then charges SOL.
 */
export async function feeWaiverFor(wallet: string): Promise<FeeWaiver | null> {
  if (!LEVER_MINT || FEE_SOL <= 0) return null;

  const mint = new PublicKey(LEVER_MINT);
  const owner = new PublicKey(wallet);

  const [quote, held] = await Promise.all([
    prices(LEVER_MINT).catch(warn("price")),
    heldRaw(owner, mint).catch(warn("balance", { raw: 0n, decimals: null })),
  ]);

  const leverUsd = positive(quote?.lever.usdPrice);
  const solUsd = positive(quote?.sol.usdPrice);
  if (!leverUsd || !solUsd) return null;

  const decimals = held.decimals ?? quote?.lever.decimals;
  if (typeof decimals !== "number") return null;

  const requiredTokens = (FEE_SOL * solUsd) / leverUsd;
  const requiredRaw = BigInt(Math.ceil(requiredTokens * 10 ** decimals));
  if (requiredRaw <= 0n || held.raw < requiredRaw) return null;

  const scale = 10 ** decimals;
  return {
    holder: wallet,
    mint: LEVER_MINT,
    decimals,
    requiredRaw: requiredRaw.toString(),
    requiredTokens: Number(requiredRaw) / scale,
    heldTokens: Number(held.raw) / scale,
    feeSolWaived: FEE_SOL,
  };
}

/**
 * Re-reads the balance against a stored waiver. Deliberately not a fresh price
 * lookup: the amount agreed when the launch was built is the amount that has to
 * still be held when it is submitted.
 */
export async function stillHolds(waiver: FeeWaiver): Promise<void> {
  const required = BigInt(waiver.requiredRaw);
  const held = await heldRaw(
    new PublicKey(waiver.holder),
    new PublicKey(waiver.mint),
  );

  if (held.raw < required) {
    const scale = 10 ** waiver.decimals;
    throw new Error(
      `the fee was waived because ${waiver.holder} held ${waiver.requiredTokens} $LEVERCOIN, and it now holds ${
        Number(held.raw) / scale
      }. Hold that amount again, or build the launch again to pay ${waiver.feeSolWaived} SOL instead.`,
    );
  }
}
