import { xCallbackUrl } from "./constants";

export type XConfig = {
  clientId: string;
  clientSecret: string;
  /** AES-GCM key material. Explicit env wins; otherwise the client secret. */
  encryptionSecret: string;
  redirectUri: string;
};

export function xConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): XConfig | null {
  const clientId = env.X_CLIENT_ID?.trim();
  const clientSecret = env.X_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  const configuredKey = env.X_TOKEN_ENCRYPTION_KEY?.trim();
  const encryptionSecret = configuredKey || clientSecret;
  if (encryptionSecret.length < 16) return null;
  return {
    clientId,
    clientSecret,
    encryptionSecret,
    redirectUri: xCallbackUrl(),
  };
}

export function requireXConfig(env?: NodeJS.ProcessEnv): XConfig {
  const config = xConfigFromEnv(env);
  if (!config) {
    throw new XError(
      "X is not configured. Set X_CLIENT_ID and X_CLIENT_SECRET. X_TOKEN_ENCRYPTION_KEY is optional and defaults to the client secret.",
    );
  }
  return config;
}

export class XError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XError";
  }
}

/** Video processing started but did not finish inside this request. The draft keeps the media id. */
export class MediaStillProcessing extends Error {
  readonly mediaId: string;

  constructor(mediaId: string) {
    super("media still processing");
    this.name = "MediaStillProcessing";
    this.mediaId = mediaId;
  }
}
