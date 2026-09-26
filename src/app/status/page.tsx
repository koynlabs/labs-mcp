import type { Metadata } from "next";
import Link from "next/link";
import Wordmark from "@/components/Wordmark";
import { GITHUB_REPO_URL } from "@/lib/revision";
import { getStatus } from "@/lib/status";

/** Rendered per request, or the checks would freeze at build time. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Status",
  description:
    "Which commit labs is running, and what this deployment has configured.",
};

export default function StatusPage() {
  const status = getStatus();

  return (
    <main className="wrap">
      <Wordmark />

      <h1>Status</h1>
      <p className="muted">
        Read from the running process. Match the commit below to{" "}
        <a href={GITHUB_REPO_URL}>github.com/koynlabs/labs-mcp</a> to confirm
        this is the published source.
      </p>

      <ul className="caps">
        <li>
          MCP<span className="state ok">up</span>
        </li>
        <li>
          version<span className="state">{status.version}</span>
        </li>
        <li>
          commit
          <span className="state">
            {status.shaShort ? (
              <a href={status.commitUrl}>{status.shaShort}</a>
            ) : (
              "local build"
            )}
          </span>
        </li>
        <li>
          endpoint<span className="state">{status.mcpUrl}</span>
        </li>
        <li>
          tools<span className="state">{status.tools}</span>
        </li>
        <li>
          storage
          <span className={`state ${status.store === "redis" ? "ok" : "bad"}`}>
            {status.store === "redis" ? "redis" : "memory only"}
          </span>
        </li>
        <li>
          quoter<span className="state">{status.maker}</span>
        </li>
        <li>
          fee
          <span className="state">
            {status.feeSol} SOL
            {status.feeWaiver === "levercoin" ? " · waived on hold" : ""}
          </span>
        </li>
      </ul>

      <p className="muted">
        {status.store === "redis"
          ? "Launch bundles and maker sessions are stored in Redis, so they survive a redeploy."
          : "No Redis is configured, so launch bundles live in memory and maker sessions cannot start."}
      </p>

      <h2>Tools</h2>
      <ul className="tools">
        {status.toolNames.map((name) => (
          <li key={name}>
            <code>{name}</code>
          </li>
        ))}
      </ul>

      <h2>Machine readable</h2>
      <pre>{`${status.mcpUrl.replace(/\/mcp$/, "")}/api/status`}</pre>
      <p className="muted">
        The same values as JSON. <Link href="/">Back to labs</Link>.
      </p>
    </main>
  );
}
