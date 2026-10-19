# Security

labs never asks for a wallet private key. A launch generates a mint keypair, seals it with `LABS_SESSION_SECRET`, and uses it only to co-sign the create after the creator's wallet has signed. That key holds no funds. An X connection seals the account's access and refresh tokens with `X_TOKEN_ENCRYPTION_KEY` (or `X_CLIENT_SECRET` when that key is unset). Report anything that would let the server move funds, serve a different binary than [github.com/koynlabs/labs-mcp](https://github.com/koynlabs/labs-mcp), or leak `LABS_PINATA_JWT`, `LABS_SESSION_SECRET`, `X_CLIENT_SECRET`, `X_CONSUMER_SECRET`, `X_TOKEN_ENCRYPTION_KEY`, or Redis credentials.

## Wallet domain review

Phantom shows "this domain is new" on its own until the domain has been reviewed, and "this dApp could be malicious" when it cannot simulate the transaction. Simulation is fixed in the app. The new-domain warning is cleared by Phantom and Blowfish, not by code:

1. Confirm `https://labs.levercoin.lol/.well-known/security.txt` resolves and names this repository.
2. If the new-domain warning is still there after a week, submit [Phantom's domain review form](https://docs.google.com/forms/d/1JgIxdmolgh_80xMfQKBKx9-QPC7LRdN6LHpFFW8BlKM/viewform). Include the domain, what the signer is authorising (a pump.fun or StonkFun create, plus the creator's own buy), the public GitHub repo, and a link to a sign page whose simulation succeeds.
3. Email [review@blowfish.xyz](mailto:review@blowfish.xyz) with the same packet. Blowfish is the scanner behind Phantom's malicious-dApp warning. A known Solana developer vouching via that address or [@blowfishxyz](https://x.com/blowfishxyz) is what they ask for when the team is new.
4. The warnings docs are [Domain and transaction warnings](https://docs.phantom.com/developer-powertools/domain-and-transaction-warnings). Multi-signer launches stay on `signTransaction` (the wallet signs first; the mint key co-signs after). Do not switch them to `signAndSendTransaction`.

Email **dev@levercoin.lol**. Do not open a public issue for those.

Production is `https://labs.levercoin.lol`. The MCP `serverInfo.version` and the homepage footer both carry the git SHA of that deploy (`1.0.0+<shortsha>`). Match it to a commit on `main`.
