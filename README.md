<p align="center">
  <a href="https://www.levercoin.lol">
    <img src="docs/assets/levercoin.svg" alt="LEVERCOIN" width="720" />
  </a>
</p>

<p align="center">
  <strong>Launch a token from Claude, ChatGPT or Grok.</strong><br />
  Your wallet signs every transaction. The server never holds the key.
</p>

<p align="center">
  <a href="https://labs.levercoin.lol/status"><img src="https://img.shields.io/endpoint?url=https%3A%2F%2Flabs.levercoin.lol%2Fapi%2Fstatus%2Fbadge%3Ffield%3Dstatus&style=flat-square&labelColor=070708" alt="status" /></a>
  <a href="https://labs.levercoin.lol/status"><img src="https://img.shields.io/endpoint?url=https%3A%2F%2Flabs.levercoin.lol%2Fapi%2Fstatus%2Fbadge%3Ffield%3Dversion&style=flat-square&labelColor=070708" alt="live version" /></a>
  <a href="https://labs.levercoin.lol/status"><img src="https://img.shields.io/endpoint?url=https%3A%2F%2Flabs.levercoin.lol%2Fapi%2Fstatus%2Fbadge%3Ffield%3Ddeployed&style=flat-square&labelColor=070708" alt="deployed commit" /></a>
  <a href="https://github.com/koynlabs/labs-mcp/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/koynlabs/labs-mcp/ci.yml?branch=main&style=flat-square&label=ci&labelColor=070708" alt="CI" /></a>
</p>

<p align="center">
  <a href="https://labs.levercoin.lol/mcp"><img src="https://img.shields.io/badge/MCP-labs.levercoin.lol%2Fmcp-111111?style=flat-square&labelColor=070708" alt="MCP" /></a>
  <a href="https://github.com/koynlabs/labs-mcp/commits/main"><img src="https://img.shields.io/github/last-commit/koynlabs/labs-mcp/main?style=flat-square&label=main&labelColor=070708&color=111111" alt="main commit" /></a>
  <a href="https://github.com/koynlabs/labs-mcp/deployments/Production"><img src="https://img.shields.io/github/deployments/koynlabs/labs-mcp/Production?style=flat-square&label=vercel&labelColor=070708&color=111111" alt="Vercel production" /></a>
  <a href="https://solana.com"><img src="https://img.shields.io/badge/chain-Solana-9945FF?style=flat-square&labelColor=070708" alt="Solana" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-111111?style=flat-square&labelColor=070708" alt="MIT" /></a>
</p>

<p align="center">
  <sub>
    Production is <code>main</code>, deployed by Vercel. The top row reads
    <a href="https://labs.levercoin.lol/api/status">labs.levercoin.lol/api/status</a>,
    so the commit it shows is the one answering requests right now — match it to
    <a href="https://labs.levercoin.lol/mcp"><code>serverInfo.version</code></a>
    and to a commit in this repo.
  </sub>
</p>

<p align="center">
  <a href="https://www.levercoin.lol">Website</a>
  ·
  <a href="https://labs.levercoin.lol">labs</a>
  ·
  <a href="https://labs.levercoin.lol/mcp">MCP</a>
  ·
  <a href="https://x.com/LeverCoinonsol">X</a>
  ·
  <a href="https://t.me/LeverCoinonsol">Telegram</a>
  ·
  <a href="https://www.stonkfun.xyz/token/GJx6KxLzEeB5cQh7Bmo85M2N6s6bVM63VEUjT2tfe6mg">Buy on StonkFun</a>
</p>

---

<p align="center">
  <a href="https://www.levercoin.lol/tapes/levercoin-3.mp4">
    <img src="docs/assets/levercoin-poster.jpg" alt="Play the $LEVERCOIN tape" width="720" />
  </a>
</p>

<p align="center">
  <a href="https://www.levercoin.lol/tapes/levercoin-3.mp4">▶ Watch the tape</a>
  &nbsp;·&nbsp;
  <a href="https://labs.levercoin.lol/demo/">▶ Play the Grok bot Rive</a>
</p>

<p align="center">
  <a href="https://labs.levercoin.lol">
    <img src="docs/assets/labs.svg" alt="labs" width="360" />
  </a>
</p>

## Why people use it

| | |
| --- | --- |
| 🔑 **Your keys stay yours** | Every create and buy is built unsigned. You sign in Phantom. labs cannot move the funds. |
| ⚡ **One atomic bundle** | The create and the opening buys land together on Jito, or none of it does. |
| 🪙 **No launch fee** | labs does not add a treasury payment. You pay the network, and any buy you include. |
| 🤖 **Talk to it** | No dashboard to learn. Ask your assistant for a launch. It hands back a signing link. |
| 🕳️ **No subscription** | Nothing to provision per user. The creator's signature is the authorisation. |

## Connect in 30 seconds

```
https://labs.levercoin.lol/mcp
```

Streamable HTTP. No API key.

- **Claude** — Settings → Connectors → Add custom connector
- **ChatGPT** — Settings → Connectors → Advanced → Add
- **Grok** — add it as a custom MCP server

Then: *“Launch a token on pump.fun called …”*

## Tools

| Tool | What it does |
| --- | --- |
| `launch_token` | Builds a launch and returns a signing link |
| `launch_status` | Who still has to sign, and whether the bundle landed |
| `token_info` | Price, market cap, graduation progress |
| `wallet_balance` | SOL balance, to size a launch before signing |
| `pump_pairs` | Quote assets a pump.fun launch can pair against, from the live on-chain registry |
| `stonks_pairs` | Quote tokens a StonkFun launch can pair against |
| `start_maker` | Opens a two-sided quoting session |
| `maker_status` | Position, last bid and ask, fills, time left |
| `stop_maker` | Ends a session, needs the maker wallet's signature |
| `trade_board` | StonkFun listings, with sort, search, page, and pair category |
| `perp_markets` | SOL, ETH, and BTC mark and 24h change |
| `perp_positions` | A wallet's open perps and working limits |
| `trade_swap` | Market buy or sell of a pump.fun or StonkFun mint against SOL through Jupiter, returns a signing link |
| `trade_order` | Limit, stop, take-profit/stop, or DCA on either venue through Jupiter, returns a signing link |
| `perp_open` | Long or short SOL, ETH, or BTC, returns a signing link |
| `perp_close` | Closes one perp position back to USDC |
| `perp_exit` | Sets or cancels a take profit, stop, or limit |
| `x_connection_status` | Which X account is connected, if any |
| `x_connect_link` | URL the owner opens to authorize X |
| `x_prepare_post` | Validates a post and returns a draft. Does not post |
| `x_publish_post` | Publishes exactly that draft and returns the post URL |

## How a launch works

`launch_token` builds the create and up to three extra buys. The transactions
are stored unsigned. The blockhash is replaced when a signer clicks Sign, so it
has not expired by the time Phantom simulates or Jito receives the bundle.

| # | Transaction |
| --- | --- |
| 0 | Create the token, plus the creator's own opening buy, in one transaction |
| 1–3 | One buy per additional wallet the creator controls |

They go out as a single Jito bundle, which lands all-or-none. A Jito bundle holds
five transactions, and launches stay capped at three extra buyers.

On pump.fun the create uses the same address lookup table as pump.fun's own
creates, which is what keeps the creator buy inside the create. Phantom can
then simulate the SOL leaving the wallet. The sign page loads that table before
asking for a signature. The wallet signs first (`signTransaction`). The mint
key labs generated co-signs the same message afterwards. It is sealed with
`LABS_SESSION_SECRET`, holds no funds, and is never a wallet key.

You open `/sign/<bundleId>`, connect each wallet in turn, and sign. Phantom may
refresh the blockhash, insert a priority fee or a higher compute budget, and
add Lighthouse assertions anywhere in the transaction. The mint, the fee payer,
and the create and buy instructions (program, data, and account order) stay
the ones that were built. The mint key co-signs that signed message, and the
wallet's signature is checked against it before the bundle is sent. A signer
can refuse, but cannot change who is paid or how much.

### The two venues

**pump.fun** is built in-process with the official [`@pump-fun/pump-sdk`](https://www.npmjs.com/package/@pump-fun/pump-sdk).
The create is a `create_v2` (Token-2022). The creator's opening buy rides in
that same transaction. Each extra wallet gets its own buy, which runs after the
create inside the bundle. `npm run simulate:pump` builds one of these against
mainnet and simulates it, and does not send it.

`quoteMint` defaults to wSOL. Any other mint has to be one `pump_pairs` returns.
That tool reads Global's whitelist and the QuoteControl account, which is the
registry `create_v2` consults: xStocks, crypto, metals, PUMP, USDC, and eligible
parent coins, whatever is listed on-chain at that moment. The create and the
buys are built against that asset. `creatorBuySol` and each extra buy are then
amounts of the quote asset, and the wallet has to hold it already. A swap from
SOL into the quote asset does not fit in the same transaction as the create and
the creator buy (that transaction is already about 1100 bytes, and a packet holds
1232), and a swap in an earlier transaction cannot be simulated by the wallet.
`npm run simulate:pump:pairs` builds one xStock pair and one non-xStock pair
from that live list and simulates both, and does not send them.

**StonkFun** has no launch endpoint — `paidLaunchesEnabled` is off, and
`launchLabEnabled` is on. So labs builds the Raydium LaunchLab
`initialize_with_token_2022` itself against StonkFun's platform id, and StonkFun
adopts the pool about a minute later. Standard mode only: a reward-mode launch
writes a transfer-fee extension whose withheld tax cannot be recovered if the
pool is never adopted. Call `stonks_pairs` first — a StonkFun token trades
against another token, not necessarily SOL.

### Metadata

pump.fun's `/api/ipfs` no longer accepts uploads and answers server-side
requests with a block page, so metadata is resolved one of three ways:

1. a `metadataUri` you pass in, used as-is;
2. pinned to IPFS via Pinata, if `LABS_PINATA_JWT` is set — **use this in
   production**;
3. otherwise served by labs at `/api/metadata/<id>`, which only lasts as long as
   this deployment does.

The URI is written into the token permanently, so option 3 returns a warning, and
labs refuses the launch if it cannot fetch its own URI back — that catches a
misconfigured `LABS_SITE_URL` before a token is minted pointing at nothing.

An optional `bannerUrl` (or `bannerImageUrl`) is fetched and pinned the same way
as `imageUrl`: recommended 1500×500 (3:1), image or GIF, max about 5MB, which is
also the fetch limit. The pinned URL is stored as `banner` in the metadata JSON.
pump.fun's `create_v2` instruction has no banner argument — it only stores the
metadata URI. The banner on the coin page is a separate pump.fun record, set
only at creation by `POST https://frontend-api-v3.pump.fun/coins/add-banner`
with `{ mint, banner }`, and it cannot be changed later. labs does not call
that endpoint. A caller-supplied `metadataUri` is used as-is, so a banner has
to already be inside that JSON if you want it there.

## Buying and selling

`trade_swap` and `trade_order` buy or sell a mint against SOL. The mint can be a
pump.fun coin, including one still on the bonding curve, or a StonkFun coin.
Jupiter builds the route. A pump.fun bonding-curve swap is Jupiter's Pump.fun
route: the sign page calls `/order`, the wallet signs, and labs submits that
same quote to `/execute`. labs does not sell through the pump SDK.

`venue` is optional: `pump` or `stonks`. It labels the sign page. Callers that
omit it keep working. labs does not look the mint up and does not refuse a pump
mint. Any mint Jupiter can route is accepted. The wallet named on the call signs
at `/sign/trade/<id>`. Phantom may refresh the blockhash, insert a priority
fee or a higher compute budget, and add Lighthouse assertions. Those edits are
kept. The Jupiter instructions themselves — program, data, and account order —
and the stored request id are not. Submit forwards the transaction the wallet
signed, not a replacement quote. The link lasts 15 minutes, and a wallet is
limited to 20 trade intents a minute.

`trade_order` is a Jupiter Trigger order: limit, stop (a price, or a trail from
0.5% to 90%), take-profit and stop as one OCO, or DCA. The wallet signs
Jupiter's challenge, then the deposit. Funds sit in a Jupiter vault until fill
or cancel. labs seals that session with `LABS_SESSION_SECRET` and does not
return it to the browser.

`trade_board` is the StonkFun board. The maker quotes pump.fun only.

## The quoter

Off unless `LABS_MAKER_ENABLED=true`.

One disclosed wallet holds a bid and an ask around its own fair-value anchor. It
buys when the price falls through the bid, sells when it rises through the ask,
and does nothing in between — so the band has to be crossed before anything
trades. Spread is floored at 50 bps, refresh at 15 seconds, duration at 24 hours.
Inventory caps shrink size on whichever side the wallet is already heavy and stop
that side at the cap.

It runs as a Vercel Workflow: one `"use step"` quote pass, then a durable
`sleep`, so a 24-hour session costs nothing while it waits and survives a deploy.
The workflow function itself touches no Node modules — it only orchestrates.

The maker approves a session in the browser. A throwaway quoting key is generated
there, the wallet signs a plain-text approval naming the exact mint, spread and
SOL cap, and only that key reaches the server, encrypted with `LABS_SESSION_SECRET`.
It expires, and `stop_maker` discards it early.

The same secret seals a Jupiter trigger session after the wallet signs the
challenge. The browser never receives that bearer. Set `LABS_SESSION_SECRET` in
Vercel before deploying, or limit, stop, take-profit, and DCA signing fails closed.

## Running it

```bash
npm install
cp .env.example .env.local
npm run dev
npx workflow web             # inspect quoter runs
```

`LABS_SITE_URL` must be the public URL in production; it is baked into signing
links and into metadata URIs. Launch bundles fall back to in-memory storage
without Redis, which is fine for `next dev`, but maker sessions refuse to start
without it because each workflow step resumes in a new invocation.

Deploy to Vercel as its own project with its own env; it shares nothing with the
levercoin marketing site.

## Checking what is live

Production is `main` only, and `main` takes pull requests: direct pushes are
rejected, and every PR runs `typecheck` and `next build`.

Three surfaces report the same commit, so nobody has to trust the badges:

| Where | What it says |
| --- | --- |
| [`/status`](https://labs.levercoin.lol/status) | version, commit, tool count, whether Redis is backing launches, whether the quoter is on |
| [`/api/status`](https://labs.levercoin.lol/api/status) | the same values as JSON, `no-store` |
| [`/mcp`](https://labs.levercoin.lol/mcp) | `serverInfo.version` is `1.0.0+<shortsha>` on `initialize` |

```bash
curl -s https://labs.levercoin.lol/api/status | jq '{version, sha, store}'
```

Take the `sha` and open `https://github.com/koynlabs/labs-mcp/commit/<sha>`. If
it resolves to a commit on `main`, the deployment is this source.

Status is read from the running process — the build's commit and the env it
booted with. It is deliberately not an HTTP probe of `/mcp`: that would pay a
cold start on the heaviest route in the app every time a badge refreshed.

The Grok bot Rive lives at [`public/demo`](public/demo) and is served at
[`/demo`](https://labs.levercoin.lol/demo/) after deploy.

## Posting to X

Launch and promo posts go out as one connected account. The owner signs in with X. labs stores the access and refresh tokens sealed, and the MCP publishes only a draft the caller has already prepared. There is no scheduler, no bulk posting, and no follow, like, or DM tooling.

OAuth is the confidential-client user-context flow with PKCE (S256). The token request sends the client id and secret as Basic auth. Scopes: `tweet.read tweet.write users.read offline.access media.write`. Refresh tokens rotate. Every refresh stores the new refresh token.

| Env | Purpose |
| --- | --- |
| `X_CLIENT_ID` | X app client id. Reuse the KOYN FX app |
| `X_CLIENT_SECRET` | X app client secret. Never commit it |
| `X_TOKEN_ENCRYPTION_KEY` | Optional. AES-GCM key for the token bundle. Falls back to `X_CLIENT_SECRET` |
| `LABS_SITE_URL` | Public origin baked into the callback. Production is `https://labs.levercoin.lol` |
| `REDIS_URL` | Keeps the connection across cold starts. Memory is only for local dev |

Callback to add on that X app, alongside the KOYN FX callback:

```
https://labs.levercoin.lol/api/x/oauth/callback
```

Connect @cyberpsychoxx78:

1. Set the env vars on the deployment. Do not put them in the repo.
2. Add the callback above to the X app's allowed callback URLs.
3. Call `x_connect_link`, or open [https://labs.levercoin.lol/x](https://labs.levercoin.lol/x), and sign in as @cyberpsychoxx78.
4. `x_connection_status` should report `@cyberpsychoxx78`.
5. `x_prepare_post` returns a draft and the exact preview. `x_publish_post` with that draft id is what publishes it.

Media is a JPEG, PNG, WEBP, GIF, or MP4 (H.264 video, AAC audio). Images use `POST https://api.x.com/2/media/upload`. GIF and video use the chunked v2 flow: `POST /2/media/upload/initialize`, `POST /2/media/upload/{id}/append`, `POST /2/media/upload/{id}/finalize`, then `GET /2/media/upload?command=STATUS` until processing succeeds. Pass an https URL, or upload a file to `POST /api/x/media`. A file around 20MB is over the host's single-request body limit, so start a stage, `PUT` 4MB segments to `/api/x/media/<stageId>` with `x-segment-index`, then `POST /api/x/media/<stageId>/finish`, and pass the returned upload id as `media`. The cap on this server is 25MB.

Disconnect from the browser that connected the account, at `/x`. That revokes the refresh token. Signing in again as the same @username replaces the token. A different account is refused until then. Posts are 280 weighted characters. A URL counts as 23.

## Known limits

- Three extra buyer wallets per launch.
- StonkFun launches are standard mode only.
- The quoter supports pump.fun only. StonkFun quoting is refused rather than
  guessed at, because an existing LaunchLab pool's state is not in the
  launch-time pricing response.
- Market buys, sells, and trigger orders go through Jupiter for both pump.fun
  and StonkFun. There is no pump-sdk sell.
- A launch is refused before you sign if the create transaction fails simulation.
  Buys that follow the create in the same bundle spend a mint that does not
  exist yet, so they cannot be simulated on their own.
- X posting is one connected account, two steps (prepare, then publish), and
  one post at a time. Video is MP4 up to 25MB.

## License

[MIT](LICENSE). The code is public so you can verify that a launch is signed by
your wallet and that the server never holds that key. Secrets (`LABS_PINATA_JWT`,
`LABS_SESSION_SECRET`, Redis) stay in the deployment env and
are not in this repo.
