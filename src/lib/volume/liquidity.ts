/**
 * How much of the coin to swap into the quote so the rest matches the pool.
 * Reserves and amounts are raw units. A 1% fee is assumed on the swap, so the
 * split is 100/199 of the bag when the wallet holds none of the quote.
 * Ported from Koyndex so a volume wallet can deposit instead of sit as a seller.
 */
export function zapBaseRaw(
  baseRaw: bigint,
  quoteHave: bigint,
  baseReserve: bigint,
  quoteReserve: bigint,
): bigint {
  if (baseRaw <= BigInt(0) || baseReserve <= BigInt(0) || quoteReserve <= BigInt(0)) return BigInt(0);
  const num = baseRaw * quoteReserve * BigInt(100) - quoteHave * baseReserve * BigInt(100);
  if (num <= BigInt(0)) return BigInt(0);
  const swapped = num / (quoteReserve * BigInt(199));
  if (swapped <= BigInt(0)) return BigInt(0);
  return swapped >= baseRaw ? baseRaw - BigInt(1) : swapped;
}

/** Largest base deposit the quote balance can match at the current reserves. */
export function fitDeposit(
  baseRaw: bigint,
  quoteHave: bigint,
  baseReserve: bigint,
  quoteReserve: bigint,
): bigint {
  if (baseRaw <= BigInt(0) || quoteHave <= BigInt(0) || baseReserve <= BigInt(0) || quoteReserve <= BigInt(0)) {
    return BigInt(0);
  }
  const need = (baseRaw * quoteReserve) / baseReserve;
  if (need <= quoteHave) return baseRaw;
  const fitted = (quoteHave * baseReserve) / quoteReserve;
  return fitted > BigInt(0) && fitted < baseRaw ? fitted : fitted > BigInt(0) ? baseRaw : BigInt(0);
}

/** A share of an amount. 100 stays inside the amount. */
export function portionRaw(raw: bigint, percent: number): bigint {
  if (raw <= BigInt(0) || percent <= 0) return BigInt(0);
  const pct = Math.min(100, Math.floor(percent));
  return (raw * BigInt(pct)) / BigInt(100);
}

export function pairedDeposit(
  baseHave: bigint,
  quoteHave: bigint,
  baseReserve: bigint,
  quoteReserve: bigint,
): { baseRaw: bigint; quoteRaw: bigint } {
  const baseRaw = fitDeposit(baseHave, quoteHave, baseReserve, quoteReserve);
  if (baseRaw <= BigInt(0) || baseReserve <= BigInt(0)) return { baseRaw: BigInt(0), quoteRaw: BigInt(0) };
  return { baseRaw, quoteRaw: (baseRaw * quoteReserve) / baseReserve };
}
