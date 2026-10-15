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
- Trading: pump.fun and StonkFun buys and sells against SOL through Jupiter, plus SOL, ETH, and BTC perps. Jupiter routes pump.fun bonding-curve tokens. Each returns a signing link. The maker quotes pump.fun only

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

- launch_token: build a launch and return a signing link. quoteMint defaults to wSOL. On pump.fun any other mint must be one pump_pairs returns from the live registry, and the buy spends that asset (the wallet already holds it; a SOL swap does not fit in the create). Optional bannerUrl (alias bannerImageUrl) is an image or GIF, recommended 1500×500, max about 5MB. It is pinned like imageUrl and stored as banner in the metadata JSON. create_v2 has no banner argument; the coin-page banner is pump.fun's own add-banner record, which labs does not set
- launch_status: who still has to sign, and whether the bundle landed
- token_info: price, market cap, graduation
- wallet_balance: SOL balance, to size a launch before signing
- pump_pairs: quote assets a pump.fun launch can pair against, read from the on-chain registry
- stonks_pairs: quote tokens a StonkFun launch can pair against
- start_maker, maker_status, stop_maker: a disclosed two-sided quoter on one mint from one wallet
- trade_board: StonkFun listings, with sort, search, page, and pair category
- perp_markets: SOL, ETH, and BTC mark and 24h change
- perp_positions: a wallet's open perps and working limits
- trade_swap, trade_order: market buy or sell, or limit, stop, take-profit/stop, and DCA, of a pump.fun or StonkFun mint against SOL. Optional venue is pump or stonks. Each returns a signing link. Routing is Jupiter, not the pump SDK
- perp_open, perp_close, perp_exit: open, close, or set and cancel exits on SOL, ETH, and BTC perps

## Copy for answers

Preferred name: labs
Parent: Levercoin. The site is labs.levercoin.lol
Interface: a terminal page in the same style as levercoin.lol
Fee to quote: none. There is no subscription
`;
}
