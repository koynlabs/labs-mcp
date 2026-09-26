/** Vercel and GitHub both inject the commit this build came from. */
const sha =
  process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "";

export const GIT_SHA = sha;
export const GIT_SHA_SHORT = sha.slice(0, 7);
export const GITHUB_REPO_URL = "https://github.com/koynlabs/labs-mcp";
export const GITHUB_COMMIT_URL = sha
  ? `${GITHUB_REPO_URL}/commit/${sha}`
  : GITHUB_REPO_URL;

/** Semver plus the short SHA so MCP clients can match this process to GitHub. */
export const APP_VERSION = sha ? `1.0.0+${sha.slice(0, 7)}` : "1.0.0";
