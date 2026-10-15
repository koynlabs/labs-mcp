import { SITE_URL } from "./config";

export const SITE = {
  name: "labs",
  title: "labs",
  url: SITE_URL,
  description:
    "Launch a token on pump.fun or StonkFun from Claude, ChatGPT or Grok. Your wallet signs every transaction.",
  ogDescription: "Your wallet signs. No launch fee, and no subscription.",
  locale: "en_US",
} as const;

export const FAQ = [
  {
    q: "What is labs?",
    a: "labs is an MCP server at labs.levercoin.lol. Connect it to Claude, ChatGPT or Grok and ask it to launch a token on pump.fun or StonkFun. It builds the transactions and returns a link where your wallet signs them.",
  },
  {
    q: "How much does a labs launch cost?",
    a: "labs does not charge to launch or to open a maker session. There is no subscription. You still pay the network, and any opening buy you include.",
  },
  {
    q: "Does labs hold my private key?",
    a: "No. labs never asks for a wallet private key. Your wallet signs every transaction. labs generates the new token's mint key, seals it until you have signed, and uses it only to co-sign the create. That key holds no funds. A maker session can also hold the throwaway quoting key you generate in the browser, and that key is capped and expires.",
  },
  {
    q: "How do I connect labs to Claude, ChatGPT or Grok?",
    a: "Add https://labs.levercoin.lol/mcp as a custom connector. There is no API key. A launch is authorised when your wallet signs the bundle.",
  },
  {
    q: "Which venues can labs launch on?",
    a: "pump.fun and StonkFun. A pump.fun coin pairs with wSOL unless you pass a quote mint from pump's on-chain registry, such as an xStock. That buy spends the quote asset the wallet already holds. Up to three extra wallets you control can buy in the same bundle as the create.",
  },
  {
    q: "Can labs trade, or only launch?",
    a: "It can also market-swap a StonkFun mint, place a limit, stop, take-profit/stop, or DCA through Jupiter, and open or close SOL, ETH, and BTC perps. Each one returns a link where your wallet signs.",
  },
] as const;
