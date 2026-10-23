import { xConfigFromEnv } from "./config";
import { X_API, X_TOKEN_URL, xPostUrl } from "./constants";
import { basicAuthorization, type XFetch } from "./oauth";

export type CtPost = {
  id: string;
  text: string;
  url: string;
  username: string;
  name: string;
  avatar: string | null;
  image: string | null;
};

/** App-only bearer. Uses the API key pair, not the OAuth client id. */
const X_APP_TOKEN_URL = "https://api.x.com/oauth2/token";

const QUERY = '(memecoin OR #crypto OR #memecoin OR "pump.fun") lang:en -is:retweet -is:reply';
const MAX_POSTS = 20;
const EXCERPT = 140;
const CACHE_MS = 3 * 60 * 1000;

type SearchUser = {
  id?: string;
  username?: string;
  name?: string;
  profile_image_url?: string;
};

type SearchMedia = {
  media_key?: string;
  url?: string;
  preview_image_url?: string;
};

type SearchTweet = {
  id?: string;
  text?: string;
  author_id?: string;
  attachments?: { media_keys?: string[] };
};

type SearchBody = {
  data?: SearchTweet[];
  includes?: { users?: SearchUser[]; media?: SearchMedia[] };
};

/** Drop trailing links and keep one line a card can show. */
export function excerpt(text: string, max = EXCERPT): string {
  const clean = text
    .replace(/https?:\/\/t\.co\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

function xImage(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    if (url.hostname !== "pbs.twimg.com" && url.hostname !== "video.twimg.com") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function avatar(value: string | undefined): string | null {
  const url = xImage(value);
  if (!url) return null;
  return url.replace("_normal.", "_bigger.");
}

export function postsFromSearch(body: SearchBody): CtPost[] {
  const users = new Map<string, SearchUser>();
  for (const user of body.includes?.users ?? []) {
    if (user.id) users.set(user.id, user);
  }
  const media = new Map<string, SearchMedia>();
  for (const item of body.includes?.media ?? []) {
    if (item.media_key) media.set(item.media_key, item);
  }
  const posts: CtPost[] = [];
  for (const tweet of body.data ?? []) {
    const user = tweet.author_id ? users.get(tweet.author_id) : undefined;
    const text = excerpt(tweet.text ?? "");
    if (!tweet.id || !user?.username || !text) continue;
    const key = tweet.attachments?.media_keys?.[0];
    const shot = key ? media.get(key) : undefined;
    posts.push({
      id: tweet.id,
      text,
      url: xPostUrl(user.username, tweet.id),
      username: user.username,
      name: user.name?.trim() || user.username,
      avatar: avatar(user.profile_image_url),
      image: xImage(shot?.url) ?? xImage(shot?.preview_image_url),
    });
    if (posts.length >= MAX_POSTS) break;
  }
  return posts;
}

export async function fetchCryptoPosts(fetchImpl: XFetch, token: string): Promise<CtPost[]> {
  const params = new URLSearchParams({
    query: QUERY,
    max_results: String(MAX_POSTS),
    "tweet.fields": "created_at,text,attachments,author_id",
    expansions: "author_id,attachments.media_keys",
    "user.fields": "username,name,profile_image_url",
    "media.fields": "url,preview_image_url,type",
  });
  const res = await fetchImpl(`${X_API}/2/tweets/search/recent?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.error("x trends search", res.status);
    return [];
  }
  const body = (await res.json()) as SearchBody;
  return postsFromSearch(body);
}

/** API key plus API secret, or the OAuth client pair when that is all that is set. */
export function tapeLogin(
  env: Record<string, string | undefined> = process.env,
): { id: string; secret: string; tokenUrl: string } | null {
  const key = env.X_CONSUMER_KEY?.trim();
  const consumerSecret = env.X_CONSUMER_SECRET?.trim();
  if (key && consumerSecret) {
    return { id: key, secret: consumerSecret, tokenUrl: X_APP_TOKEN_URL };
  }
  const config = xConfigFromEnv(env as NodeJS.ProcessEnv);
  if (!config) return null;
  return { id: config.clientId, secret: config.clientSecret, tokenUrl: X_TOKEN_URL };
}

async function appToken(
  fetchImpl: XFetch,
  login: { id: string; secret: string; tokenUrl: string },
): Promise<string | null> {
  const res = await fetchImpl(login.tokenUrl, {
    method: "POST",
    headers: {
      Authorization: basicAuthorization(login.id, login.secret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    console.error("x trends token", res.status);
    return null;
  }
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) return null;
  const ttl = Math.max(60, body.expires_in ?? 7200) * 1000;
  tokenCache = { value: body.access_token, expiresAt: Date.now() + ttl };
  return body.access_token;
}

let tokenCache: { value: string; expiresAt: number } | null = null;
let postCache: { posts: CtPost[]; at: number } | null = null;

/** One shared result. Recent search is metered per post, so visitors reuse it. */
export async function cachedCryptoPosts(fetchImpl: XFetch = fetch, now = Date.now()): Promise<CtPost[]> {
  if (postCache && now - postCache.at < CACHE_MS) return postCache.posts;
  const login = tapeLogin();
  if (!login) return postCache?.posts ?? [];
  try {
    const fresh = tokenCache && tokenCache.expiresAt > now + 30_000 ? tokenCache.value : null;
    const token = fresh ?? (await appToken(fetchImpl, login));
    if (!token) {
      postCache = { posts: postCache?.posts ?? [], at: now };
      return postCache.posts;
    }
    const posts = await fetchCryptoPosts(fetchImpl, token);
    postCache = { posts: posts.length > 0 ? posts : (postCache?.posts ?? []), at: now };
    return postCache.posts;
  } catch {
    return postCache?.posts ?? [];
  }
}
