import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { excerpt, postsFromSearch, tapeLogin } from "./trends";

describe("crypto tape", () => {
  it("drops link stubs and keeps one line", () => {
    assert.equal(excerpt("launching now https://t.co/abc  watch"), "launching now watch");
    assert.equal(excerpt("a".repeat(200)).endsWith("…"), true);
    assert.equal(excerpt("a".repeat(200)).length <= 140, true);
  });

  it("joins the author and the photo, and ignores other image hosts", () => {
    const posts = postsFromSearch({
      data: [
        {
          id: "10",
          text: "new coin on pump https://t.co/abc",
          author_id: "7",
          attachments: { media_keys: ["m1"] },
        },
        { id: "11", text: "   ", author_id: "7" },
      ],
      includes: {
        users: [
          {
            id: "7",
            username: "ct",
            name: "CT",
            profile_image_url: "https://pbs.twimg.com/profile_images/a_normal.jpg",
          },
        ],
        media: [
          { media_key: "m1", url: "https://pbs.twimg.com/media/shot.jpg" },
          { media_key: "m2", url: "https://evil.example/shot.jpg" },
        ],
      },
    });
    assert.equal(posts.length, 1);
    assert.equal(posts[0]?.username, "ct");
    assert.equal(posts[0]?.text, "new coin on pump");
    assert.equal(posts[0]?.url, "https://x.com/ct/status/10");
    assert.equal(posts[0]?.avatar, "https://pbs.twimg.com/profile_images/a_bigger.jpg");
    assert.equal(posts[0]?.image, "https://pbs.twimg.com/media/shot.jpg");
  });

  it("signs the strip with the API key pair", () => {
    const login = tapeLogin({
      X_CONSUMER_KEY: "api-key",
      X_CONSUMER_SECRET: "api-secret",
      X_CLIENT_ID: "client",
      X_CLIENT_SECRET: "client-secret-long-enough",
    });
    assert.equal(login?.id, "api-key");
    assert.equal(login?.tokenUrl, "https://api.x.com/oauth2/token");
  });

  it("falls back to the OAuth client when the API secret is absent", () => {
    assert.equal(
      tapeLogin({ X_CLIENT_ID: "client", X_CLIENT_SECRET: "client-secret-long-enough" })?.id,
      "client",
    );
    assert.equal(tapeLogin({ X_CONSUMER_KEY: "api-key", X_CLIENT_SECRET: "client-secret-long-enough" }), null);
  });
});
