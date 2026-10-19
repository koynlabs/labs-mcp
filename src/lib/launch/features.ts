/** StonkFun category for a tokenized stock quote such as NVDAX or SPYX. */
export const STOCK_CATEGORY = "xstock";

export type LaunchFeatures = {
  stockPairing: true;
  holderFees: true;
  /** StonkFun reward mode, or pump.fun holder-reward coins. */
  mode: "reward" | "holder-reward";
  quoteSymbol?: string;
};

/**
 * A launch from the MCP has to be paired with a stock and has to pay trading
 * fees out to holders. Both are live venue flags, so a quote that is not an
 * xStock, or a venue that has turned holder rewards off, is refused here
 * rather than launched without them.
 */
export function assertStockPairing(category: string | undefined, label: string): void {
  if (category === STOCK_CATEGORY) return;
  throw new Error(
    `Token pairing to a stock is not enabled for ${label}. Pass an xStock quote mint (category ${STOCK_CATEGORY}) from stonks_pairs.`,
  );
}

export function assertHolderFees(enabled: boolean, where: string): void {
  if (enabled) return;
  throw new Error(
    `Distributing fees to holders is not enabled for ${where}.`,
  );
}
