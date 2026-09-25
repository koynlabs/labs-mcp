import { FEE_SOL, SITE_URL } from "./config";

export const SITE = {
  name: "labs",
  title: "labs",
  url: SITE_URL,
  description:
    "Launch a token on pump.fun or StonkFun from Claude, ChatGPT or Grok. Your wallet signs every transaction.",
  ogDescription: `${FEE_SOL} SOL per launch. Your wallet signs. No subscription.`,
  locale: "en_US",
} as const;

export const FAQ = [
  {
    q: "What is labs?",
    a: "labs is an MCP server at labs.levercoin.lol. Connect it to Claude, ChatGPT or Grok and ask it to launch a token on pump.fun or StonkFun. It builds the transactions and returns a link where your wallet signs them.",
  },
  {
    q: "How much does a labs launch cost?",
    a: `Each launch costs ${FEE_SOL} SOL, paid to the levercoin treasury inside the same atomic bundle as the create. There is no subscription.`,
  },
  {
    q: "Does labs hold my private key?",
    a: "No. labs never asks for a wallet private key. Every transaction is built unsigned and signed in your own wallet. The only key it can hold is a throwaway quoting key you generate in the browser for a maker session, and that key is capped and expires.",
  },
  {
    q: "How do I connect labs to Claude, ChatGPT or Grok?",
    a: "Add https://labs.levercoin.lol/mcp as a custom connector. There is no API key. A launch is authorised when your wallet signs the bundle.",
  },
  {
    q: "Which venues can labs launch on?",
    a: "pump.fun and StonkFun. Up to three extra wallets you control can buy in the same bundle as the create.",
  },
] as const;
