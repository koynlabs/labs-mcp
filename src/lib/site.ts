import { SITE_URL } from "./config";
import { twitterProfile } from "./site-twitter";

export const SITE = {
  name: "labs",
  title: "labs",
  url: SITE_URL,
  description:
    "Launch a token on pump.fun or StonkFun, trade it, and announce it on your X account from one assistant. Your wallet signs. A post goes out only after you confirm it.",
  ogDescription:
    "Launch a token on pump.fun or StonkFun and announce it on your X account. Your wallet signs. A post goes out only after you confirm.",
  locale: "en_US",
  /** Public X profile. Null when NEXT_PUBLIC_TWITTER is unset or a placeholder. */
  x: twitterProfile(),
} as const;

export const FAQ = [
  {
    q: "What is labs?",
    a: "labs is an MCP server at labs.levercoin.lol. Connect it to Claude, ChatGPT or Grok and ask it to launch a token on pump.fun or StonkFun, trade it, and draft the announcement for your own X account. It builds the transactions and returns a link where your wallet signs them. A post goes out only after you confirm the draft.",
  },
  {
    q: "How much does a labs launch cost?",
    a: "labs does not charge to launch or to open a maker session. There is no subscription. You still pay the network, and any opening buy you include.",
  },
  {
    q: "Does labs hold my private key?",
    a: "No. labs never asks for a wallet private key. Your wallet signs every transaction. labs generates the new token's mint key, seals it until you have signed, and uses it only to co-sign the create. That key holds no funds. A maker session can also hold the throwaway quoting key you generate in the browser, and that key is capped and expires. An X connection seals that account's tokens. Each person gets a personal key at /x, shown once, and a post is published only after they confirm the draft.",
  },
  {
    q: "How do I connect labs to Claude, ChatGPT or Grok?",
    a: "Add https://labs.levercoin.lol/mcp as a custom connector. Launches and trades need no API key; your wallet signs the bundle. To post, open https://labs.levercoin.lol/x, connect your own X account, and send the personal key shown once as Authorization: Bearer on the MCP request.",
  },
  {
    q: "Which venues can labs launch on?",
    a: "pump.fun and StonkFun. A pump.fun coin pairs with wSOL unless you pass a quote mint from pump_pairs, which reads the live on-chain registry. That buy spends the quote asset the wallet already holds. Up to three extra wallets you control can buy in the same bundle as the create.",
  },
  {
    q: "Can labs trade, or only launch?",
    a: "It can market-swap a pump.fun or StonkFun mint against SOL, place a limit, stop, take-profit/stop, or DCA through Jupiter, and open or close SOL, ETH, and BTC perps. Jupiter routes pump.fun bonding-curve tokens. Each one returns a link where your wallet signs.",
  },
] as const;
