# labs

An MCP server that launches tokens on pump.fun and StonkFun, and runs a
disclosed two-sided quoter. Connect it to Claude, ChatGPT or Grok and ask for a
launch; it builds the transactions and hands back a link where your own wallet
signs them. 0.25 SOL per launch, paid inside the same bundle, or nothing at all
if the paying wallet already holds that much value in $LEVERCOIN. No
subscription.

This replaces the old `labs` CLI, which held wallet secret keys in
`.config/wallets.json` and signed locally. Nothing here holds a wallet key.

## Connect

```
https://labs.levercoin.lol/mcp
```

Streamable HTTP, no API key. A launch is authorised by the creator signing a
bundle that pays the fee, so there is nothing to provision per user.

- **Claude** — Settings, Connectors, Add custom connector.
- **ChatGPT** — Settings, Connectors, Advanced, Add.
- **Grok** — add it as a custom MCP server.

## Tools

| Tool | What it does |
| --- | --- |
| `launch_token` | Builds a launch and returns a signing link |
| `launch_status` | Who still has to sign, and whether the bundle landed |
| `token_info` | Price, market cap, graduation progress |
| `wallet_balance` | SOL balance, to size a launch before signing |
| `stonks_pairs` | Quote tokens a StonkFun launch can pair against |
| `start_maker` | Opens a two-sided quoting session |
| `maker_status` | Position, last bid and ask, fills, time left |
| `stop_maker` | Ends a session, needs the maker wallet's signature |

## How a launch works

`launch_token` builds up to five transactions and stores them unsigned:

| # | Transaction |
| --- | --- |
| 0 | 0.25 SOL fee to the treasury |
| 1 | Create the token, plus the creator's own opening buy |
| 2–4 | One buy per additional wallet the creator controls |

They go out as a single Jito bundle, which lands all-or-none. That is what makes
the fee unavoidable: the launch cannot reach the chain without it. It is also why
only three extra buyers fit — a Jito bundle holds five transactions.

The fee is its own transaction rather than an instruction appended to the create.
Both venues hand back an already-compiled transaction, and injecting an
instruction would mean re-deriving its address lookup tables.

You open `/sign/<bundleId>`, connect each wallet in turn, and sign. The server
re-verifies every signature against the exact message it handed out, re-reads the
fee transaction to confirm it still pays the treasury, and only then submits. A
signer can refuse, but cannot rewrite what they were given.

### Holding $LEVERCOIN instead of paying

Set `LEVER_MINT` and the fee becomes a hold rather than a payment. When the
wallet that would have paid already owns `LABS_FEE_SOL` worth of that mint,
transaction 0 is left out and the bundle is one shorter. The tokens are never
transferred: labs reads the balance across both token programs and prices it
against SOL in USD.

The required token amount is written onto the stored launch, and submit re-reads
the balance against that same number instead of repricing. A wallet cannot
qualify and then sell before the launch lands, and a price move during the
15-minute signing window cannot raise the bar after the fact. Selling below it
rejects the submit, and building again charges SOL.

### The two venues

**pump.fun** goes through [PumpPortal's](https://pumpportal.fun/creation)
`trade-local`, which returns a compiled create and one compiled buy per wallet.

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

## Running it

```bash
npm install
cp .env.example .env.local   # LABS_TREASURY is required
npm run dev
npx workflow web             # inspect quoter runs
```

`LABS_SITE_URL` must be the public URL in production; it is baked into signing
links and into metadata URIs. Launch bundles fall back to in-memory storage
without Redis, which is fine for `next dev`, but maker sessions refuse to start
without it because each workflow step resumes in a new invocation.

Deploy to Vercel as its own project with its own env; it shares nothing with the
levercoin marketing site.

## Known limits

- Three extra buyer wallets per launch, from the five-transaction Jito limit.
- StonkFun launches are standard mode only.
- The quoter supports pump.fun only. StonkFun quoting is refused rather than
  guessed at, because an existing LaunchLab pool's state is not in the
  launch-time pricing response.
- PumpPortal rejects a bundle if it dislikes any one wallet and does not say
  which, so `launch_token` lists the buyers back in that error.

## License

[MIT](LICENSE). The code is public so you can verify that a launch is signed by
your wallet and that the server never holds that key. Secrets (`LABS_TREASURY`,
`LABS_PINATA_JWT`, `LABS_SESSION_SECRET`, Redis) stay in the deployment env and
are not in this repo.
