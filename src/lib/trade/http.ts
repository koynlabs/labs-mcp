import { JUPITER_API_KEY } from "../config";

export class JupiterError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const record = body as { errorMessage?: unknown; error?: unknown; message?: unknown };
    for (const value of [record.errorMessage, record.error, record.message]) {
      if (typeof value === "string" && value) return value;
    }
  }
  return fallback;
}

export function upstreamStatus(status: number): number {
  if (status === 429) return 429;
  return status >= 400 && status < 500 ? 400 : 502;
}

export function jupiterHeaders(json = false, token?: string): HeadersInit {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (json) headers["Content-Type"] = "application/json";
  if (JUPITER_API_KEY) headers["x-api-key"] = JUPITER_API_KEY;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function jupiter(
  url: string,
  init: { method?: string; token?: string; body?: unknown; perps?: boolean } = {},
): Promise<unknown> {
  const headers = jupiterHeaders(init.body !== undefined, init.token);
  if (init.perps) (headers as Record<string, string>)["x-perps-api-version"] = "v2";
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers,
    cache: "no-store",
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    throw new JupiterError(errorMessage(body, `Jupiter ${res.status}`), upstreamStatus(res.status));
  }
  return body;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function str(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}
