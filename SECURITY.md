# Security

labs never asks for a wallet private key. Report anything that would let the server move funds, serve a different binary than [github.com/koynlabs/labs-mcp](https://github.com/koynlabs/labs-mcp), or leak `LABS_TREASURY`, `LABS_PINATA_JWT`, `LABS_SESSION_SECRET`, or Redis credentials.

Email **d.rafique@icloud.com**. Do not open a public issue for those.

Production is `https://labs.levercoin.lol`. The MCP `serverInfo.version` and the homepage footer both carry the git SHA of that deploy (`1.0.0+<shortsha>`). Match it to a commit on `main`.
