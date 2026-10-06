import { PublicKey } from "@solana/web3.js";
import { WSOL_MINT } from "../config";
import { connection } from "../solana";

export function humanToRaw(amount: number, decimals: number): string {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be positive");
  const fixed = amount.toFixed(decimals);
  const [whole, frac = ""] = fixed.split(".");
  const raw = `${whole}${frac}`.replace(/^0+/, "");
  if (!/^[1-9]\d{0,29}$/.test(raw)) throw new Error("Amount is invalid");
  return raw;
}

/** USD prices on the perps API are integers scaled by 1e6. */
export function usdToRaw(price: number): string {
  if (!Number.isFinite(price) || price <= 0) throw new Error("Price must be positive");
  return humanToRaw(price, 6);
}

export async function mintDecimals(mint: string): Promise<number> {
  if (mint === WSOL_MINT) return 9;
  const info = await connection().getParsedAccountInfo(new PublicKey(mint));
  const data = info.value?.data;
  if (data && typeof data === "object" && "parsed" in data) {
    const decimals = (data as { parsed?: { info?: { decimals?: number } } }).parsed?.info?.decimals;
    if (typeof decimals === "number") return decimals;
  }
  throw new Error("Could not read token decimals");
}
