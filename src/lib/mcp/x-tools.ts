import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { allow } from "../rate-limit";
import { xConfigFromEnv, XError } from "../x/config";
import { xCallbackUrl, xConnectUrl, X_SCOPES } from "../x/constants";
import { connectionStatus, readAccount } from "../x/oauth";
import { preparePost, publishPost } from "../x/post";
import { xStore } from "../x/store";

export const X_TOOL_NAMES = [
  "x_connection_status",
  "x_connect_link",
  "x_prepare_post",
  "x_publish_post",
] as const;

const preparePostInput = z.object({
  text: z
    .string()
    .max(2_000)
    .optional()
    .describe("Exact post text. Weighted length must be 280 or less. A URL counts as 23."),
  media: z
    .string()
    .min(1)
    .max(2_000)
    .refine((value) => value.startsWith("https://") || /^[0-9a-f-]{36}$/i.test(value), {
      message: "media must be an https URL or an upload id",
    })
    .optional()
    .describe(
      "https URL of a JPEG, PNG, WEBP, GIF, or MP4, or an upload id from POST /api/x/media. MP4 must be H.264/AAC. About 20MB is fine; the cap is 25MB. A file larger than 4MB is uploaded in 4MB segments, then finished, and the returned upload id is passed here.",
    ),
  reply_to: z
    .string()
    .regex(/^[0-9]{1,20}$/)
    .optional()
    .describe("Post id to reply to."),
  quote: z
    .string()
    .regex(/^[0-9]{1,20}$/)
    .optional()
    .describe("Post id to quote."),
});

const publishPostInput = z.object({
  draft_id: z.string().uuid(),
});

function text(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value as Record<string, unknown>,
  };
}

function failure(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true as const,
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerXTools(server: McpServer): void {
  server.registerTool(
    "x_connection_status",
    {
      title: "X connection",
      description:
        "Whether the owner has connected an X account, and which @username posts will be published as. Does not post.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const configured = xConfigFromEnv() !== null;
        const account = configured ? await readAccount(xStore) : null;
        return text({
          ...connectionStatus(account, configured),
          callbackUrl: xCallbackUrl(),
        });
      } catch (error) {
        return failure(messageOf(error));
      }
    },
  );

  server.registerTool(
    "x_connect_link",
    {
      title: "Connect X",
      description: [
        "Returns the URL the owner opens to authorize one X account.",
        "OAuth 2.0 with PKCE. Scopes:",
        X_SCOPES.join(" ") + ".",
        "The owner should sign in as the account that will publish launch posts.",
        "Tokens stay on the server. This does not post.",
      ].join(" "),
      inputSchema: z.object({}),
    },
    async () => {
      try {
        if (!xConfigFromEnv()) {
          throw new XError(
            "X is not configured. Set X_CLIENT_ID and X_CLIENT_SECRET, and add the callback URL to the X app.",
          );
        }
        const account = await readAccount(xStore);
        return text({
          url: xConnectUrl(),
          callbackUrl: xCallbackUrl(),
          scopes: [...X_SCOPES],
          connectedAs: account ? `@${account.username}` : null,
          nextStep: account
            ? `Already connected as @${account.username}. Opening the URL again and signing in as that same account replaces the token. A different account is refused until this one is disconnected at /x.`
            : "Open url in a browser and authorize the owner's X account. Then call x_connection_status.",
        });
      } catch (error) {
        return failure(messageOf(error));
      }
    },
  );

  server.registerTool(
    "x_prepare_post",
    {
      title: "Prepare an X post",
      description: [
        "Validates text and media and stores a draft. Does not post.",
        "Returns the exact text, media, reply, and quote that x_publish_post will send.",
        "Show that preview to the user. Publish only after they confirm it.",
        "One post at a time. No scheduling, no bulk posting, no likes, follows, or DMs.",
      ].join(" "),
      inputSchema: preparePostInput,
    },
    async (args) => {
      try {
        if (!(await allow("x:prepare", 20, 600))) {
          return failure("Too many drafts. Wait a few minutes.");
        }
        const config = xConfigFromEnv();
        if (!config) {
          throw new XError("X is not configured. Set X_CLIENT_ID and X_CLIENT_SECRET.");
        }
        const { preview } = await preparePost(
          { store: xStore, config, http: fetch },
          {
            text: args.text,
            media: args.media,
            replyTo: args.reply_to,
            quote: args.quote,
          },
        );
        return text(preview);
      } catch (error) {
        return failure(messageOf(error));
      }
    },
  );

  server.registerTool(
    "x_publish_post",
    {
      title: "Publish a prepared X post",
      description: [
        "Publishes exactly one prepared draft as the connected X account and returns the post URL.",
        "Call this only after the user has confirmed the preview from x_prepare_post.",
        "The draft id is the only input. Text and media cannot be changed here.",
        "A video may still be processing; call again with the same draft id. Nothing is posted until X accepts it.",
        "No scheduling, no bulk posting, no likes, follows, or DMs.",
      ].join(" "),
      inputSchema: publishPostInput,
    },
    async ({ draft_id }) => {
      try {
        if (!(await allow("x:publish", 10, 600))) {
          return failure("Too many publish attempts. Wait a few minutes.");
        }
        const config = xConfigFromEnv();
        if (!config) {
          throw new XError("X is not configured. Set X_CLIENT_ID and X_CLIENT_SECRET.");
        }
        const published = await publishPost({ store: xStore, config, http: fetch }, draft_id);
        return text({
          posted: true,
          url: published.url,
          id: published.id,
          username: `@${published.username}`,
          text: published.text,
          draftId: published.draftId,
        });
      } catch (error) {
        return failure(messageOf(error));
      }
    },
  );
}

export { preparePostInput, publishPostInput };
