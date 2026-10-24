/** Next expands `$NAME` in .env values, so an unescaped "$KOYN" arrives empty. */
function trimEnv(value: string | undefined, fallback = "") {
  return value?.trim() || fallback;
}

const UNSET = new Set(["", "tba", "tbd", "pending", "pending_launch", "n/a", "na"]);

export function isConfigured(value: string) {
  return !UNSET.has(value.trim().toLowerCase());
}

export const DESK_ORIGIN = "https://koyn.trade";

export const token = {
  ticker: trimEnv(process.env.NEXT_PUBLIC_TICKER, "KOYN"),
  symbol: trimEnv(process.env.NEXT_PUBLIC_SYMBOL, "$KOYN"),
  chain: trimEnv(process.env.NEXT_PUBLIC_CHAIN, "solana"),
  mint: trimEnv(process.env.NEXT_PUBLIC_TOKEN_MINT),
  twitter: trimEnv(process.env.NEXT_PUBLIC_TWITTER),
  telegram: trimEnv(process.env.NEXT_PUBLIC_TELEGRAM),
  launchDate: trimEnv(process.env.NEXT_PUBLIC_LAUNCH_DATE),
  supply: trimEnv(process.env.NEXT_PUBLIC_SUPPLY, "1,000,000,000"),
};

export const LAUNCH_TBD = "TBD";
const RETIRED_LAUNCH_DATES = new Set(["2026-09-19"]);

export function displayLaunch() {
  const value = token.launchDate.trim();
  if (!isConfigured(value) || RETIRED_LAUNCH_DATES.has(value)) return LAUNCH_TBD;
  return value;
}

export const PENDING = "PENDING_LAUNCH";

export function hasMint() {
  return isConfigured(token.mint);
}

/** The desk page for the token. Null until the mint is set. */
export function deskPath(): string | null {
  return hasMint() ? `${DESK_ORIGIN}/meme/${token.mint}` : null;
}

export function deskHref(path: string) {
  return `${DESK_ORIGIN}${path}`;
}

/** The desk only answers API calls that name its own host. A server fetch has no browser origin. */
export function deskRequestHeaders(extra?: HeadersInit) {
  const headers = new Headers(extra);
  headers.set("Origin", DESK_ORIGIN);
  headers.set("Referer", `${DESK_ORIGIN}/`);
  return headers;
}

export function displayOrPending(value: string, pending = PENDING) {
  return isConfigured(value) ? value : pending;
}

export function telegramUrl(raw: string) {
  const value = raw.trim();
  if (!isConfigured(value)) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const handle = value.replace(/^@/, "");
  if (/^[A-Za-z0-9_]+$/.test(handle)) return `https://t.me/${handle}`;
  return null;
}
