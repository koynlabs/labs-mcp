import type { Metadata } from "next";
import CopyField from "@/components/site/CopyField";
import { PageIntro } from "@/components/site/PageIntro";
import { Panel } from "@/components/site/Panel";
import SiteChrome from "@/components/site/SiteChrome";
import { SITE_URL } from "@/lib/config";
import { GITHUB_REPO_URL } from "@/lib/revision";
import { getStatus } from "@/lib/status";

/** Rendered per request, or the checks would freeze at build time. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Status",
  description: "Which commit labs is running, and what this deployment has configured.",
};

export default function StatusPage() {
  const status = getStatus();
  const statusUrl = `${SITE_URL}/api/status`;

  return (
    <SiteChrome>
      <main id="content">
        <PageIntro eyebrow="Status" title="What this deployment is running.">
          Read from the running process. Match the commit below to {GITHUB_REPO_URL.replace("https://", "")} to
          confirm this is the published source.
        </PageIntro>

        <dl className="stats">
          <div>
            <dt>MCP</dt>
            <dd className="ok">up</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>{status.version}</dd>
          </div>
          <div>
            <dt>Commit</dt>
            <dd>
              {status.shaShort ? <a href={status.commitUrl}>{status.shaShort}</a> : "local build"}
            </dd>
          </div>
          <div>
            <dt>Tools</dt>
            <dd>{status.tools}</dd>
          </div>
          <div>
            <dt>Storage</dt>
            <dd className={status.store === "redis" ? "ok" : "bad"}>
              {status.store === "redis" ? "redis" : "memory only"}
            </dd>
          </div>
          <div>
            <dt>Quoter</dt>
            <dd>{status.maker}</dd>
          </div>
          <div>
            <dt>Fee</dt>
            <dd>none</dd>
          </div>
        </dl>

        <p className="lede x-follow">
          {status.store === "redis"
            ? "Launch bundles and maker sessions are stored in Redis, so they survive a redeploy."
            : "No Redis is configured, so launch bundles live in memory and maker sessions cannot start."}
        </p>

        <section className="band" aria-labelledby="tools-status-title">
          <header className="section-head">
            <p className="eyebrow">MCP</p>
            <h2 id="tools-status-title">Tools</h2>
          </header>
          <ul className="scope-list">
            {status.toolNames.map((name) => (
              <li key={name}>
                <code>{name}</code>
              </li>
            ))}
          </ul>
        </section>

        <section className="band" aria-labelledby="machine-title">
          <header className="section-head">
            <p className="eyebrow">JSON</p>
            <h2 id="machine-title">Machine readable</h2>
            <p>The same values as JSON. The MCP endpoint is the one clients add.</p>
          </header>
          <div className="connect-grid">
            <Panel title="Status URL">
              <CopyField value={statusUrl} label="Status URL" />
            </Panel>
            <Panel title="MCP URL">
              <CopyField value={status.mcpUrl} label="MCP URL" />
            </Panel>
          </div>
        </section>
      </main>
    </SiteChrome>
  );
}
