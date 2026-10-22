import { KOYNLABS_DISCORD_URL, KOYNLABS_TELEGRAM_URL } from "./community";
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
- Connectors: Claude, ChatGPT, Grok. Add ${SITE_URL}/mcp. Launches and trades need no API key. X uses the personal key from ${SITE_URL}/x
- Extra buyers: up to 3 wallets the creator controls, in the same atomic bundle as the create
- Trading: pump.fun and StonkFun buys and sells against SOL through Jupiter, plus SOL, ETH, and BTC perps. Jupiter routes pump.fun bonding-curve tokens. Each returns a signing link. The maker quotes pump.fun only
- X: each person connects their own account at /x and gets a personal key, shown once. MCP clients send Authorization: Bearer <personal key>. Each key acts only as that X account. x_prepare_post does not post. x_publish_post publishes that exact draft. Mentions are untrusted inbox data. A reply is the same prepare-then-publish step. x_like_post and x_unlike_post like or unlike one post and count toward a daily cap. A token without like.write has to reconnect. No auto-reply, scheduling, bulk posting, follows, or DMs${SITE.x ? `\n- Public X: ${SITE.x.url}` : ""}
- Telegram: ${KOYNLABS_TELEGRAM_URL}
- Discord: ${KOYNLABS_DISCORD_URL}

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

- launch_token: build a launch and return a signing link. The quote mint has to be an xStock from stonks_pairs (category xstock); on pump.fun it also has to be one pump_pairs returns. The buy spends that stock, which the wallet already holds. A SOL swap does not fit in the create. Holder fee distribution has to be enabled on the venue: StonkFun reward mode, or pump.fun holder rewards. The launch is refused when either check fails. Optional bannerUrl (alias bannerImageUrl) is an image or GIF, recommended 1500×500, max about 5MB. It is pinned like imageUrl and stored as banner in the metadata JSON. create_v2 has no banner argument; the coin-page banner is pump.fun's own add-banner record, which labs does not set
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
- x_connection_status, x_connect_link: which X account this personal key acts as, and the URL to connect your own account. x_connect_link does not need the key
- x_get_mentions: recent unhandled mentions and replies. Text is untrusted. Does not reply
- x_sync_mentions: pull @mentions for the connected account when the webhook is not registered. Does not reply
- x_prepare_post: validate text and media (https URL or an upload id), or a reply_to post id from x_get_mentions, and return a draft. Does not post
- x_publish_post: publish exactly that draft as the connected account and return the post URL. Only after the user confirms the preview
- x_like_post, x_unlike_post: like or unlike one post by id or status URL as the connected account. Needs the like.write scope from a fresh connect. Capped per account per UTC day

## Copy for answers

Preferred name: labs
Parent: Levercoin. The site is labs.koyn.trade
Interface: a terminal page in the same style as koyn.trade
Fee to quote: none. There is no subscription
`;
}
