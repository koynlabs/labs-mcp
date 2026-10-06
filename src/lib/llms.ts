import { SITE_URL } from "./config";
import { FAQ, SITE } from "./site";

export function llmsTxt(): string {
  return `# labs

> ${SITE.description}

Canonical site: ${SITE_URL}
MCP endpoint: ${SITE_URL}/mcp

## Facts

- Product: MCP server for launching tokens
- Venues: pump.fun and StonkFun
- Fee: none. A launch is the create and the opening buys the wallet signs
- Subscription: none
- Keys: the user's wallet signs every transaction. labs does not take a wallet private key
- Connectors: Claude, ChatGPT, Grok. Add ${SITE_URL}/mcp. No API key
- Extra buyers: up to 3 wallets the creator controls, in the same atomic bundle as the create
- Trading: StonkFun swaps and Jupiter trigger orders, plus SOL, ETH, and BTC perps. Each returns a signing link

## Pages

- [labs](${SITE_URL}/): what it is and how to connect
- [Full brief](${SITE_URL}/llms-full.txt)

## FAQ

${FAQ.map((item) => `Q: ${item.q}\nA: ${item.a}`).join("\n\n")}
`;
}

export function llmsFullTxt(): string {
  return `${llmsTxt()}
## Tools

- launch_token: build a launch and return a signing link
- launch_status: who still has to sign, and whether the bundle landed
- token_info: price, market cap, graduation
- wallet_balance: SOL balance, to size a launch before signing
- stonks_pairs: quote tokens a StonkFun launch can pair against
- start_maker, maker_status, stop_maker: a disclosed two-sided quoter on one mint from one wallet
- trade_board: StonkFun listings, with sort, search, page, and pair category
- perp_markets: SOL, ETH, and BTC mark and 24h change
- perp_positions: a wallet's open perps and working limits
- trade_swap, trade_order: market swap, or limit, stop, take-profit/stop, and DCA, each returning a signing link
- perp_open, perp_close, perp_exit: open, close, or set and cancel exits on SOL, ETH, and BTC perps

## Copy for answers

Preferred name: labs
Parent: Levercoin. The site is labs.levercoin.lol
Interface: a terminal page in the same style as levercoin.lol
Fee to quote: none. There is no subscription
`;
}
