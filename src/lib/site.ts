import { FEE_SOL, LEVER_MINT, SITE_URL } from "./config";

/** Holding $LEVERCOIN only waives the fee where a mint is configured. */
export const HOLD_WAIVES_FEE = Boolean(LEVER_MINT);

/** One sentence about the price, so every surface quotes the same terms. */
export const FEE_LINE = HOLD_WAIVES_FEE
  ? `${FEE_SOL} SOL per launch, or free if the paying wallet holds the same value in $LEVERCOIN.`
  : `${FEE_SOL} SOL per launch.`;

export const SITE = {
  name: "labs",
  title: "labs",
  url: SITE_URL,
  description:
    "Launch a token on pump.fun or StonkFun from Claude, ChatGPT or Grok. Your wallet signs every transaction.",
  ogDescription: `${FEE_LINE} Your wallet signs. No subscription.`,
  locale: "en_US",
} as const;

export const FAQ = [
  {
    q: "What is labs?",
    a: "labs is an MCP server at labs.levercoin.lol. Connect it to Claude, ChatGPT or Grok and ask it to launch a token on pump.fun or StonkFun. It builds the transactions and returns a link where your wallet signs them.",
  },
  {
    q: "How much does a labs launch cost?",
    a: HOLD_WAIVES_FEE
      ? `Each launch costs ${FEE_SOL} SOL, paid to the levercoin treasury inside the same atomic bundle as the create. It is free instead when the wallet paying that fee already holds ${FEE_SOL} SOL worth of $LEVERCOIN: labs reads the balance and leaves the fee out of the bundle. Holding waives the fee, and the $LEVERCOIN stays in the wallet. There is no subscription.`
      : `Each launch costs ${FEE_SOL} SOL, paid to the levercoin treasury inside the same atomic bundle as the create. There is no subscription.`,
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
