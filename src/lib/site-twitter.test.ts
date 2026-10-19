import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { parseTwitter, twitterHandle, twitterUrl } from "./site-twitter";

const previous = process.env.NEXT_PUBLIC_TWITTER;

afterEach(() => {
  if (previous === undefined) delete process.env.NEXT_PUBLIC_TWITTER;
  else process.env.NEXT_PUBLIC_TWITTER = previous;
});

describe("parseTwitter", () => {
  it("returns null when unset, blank, or a placeholder", () => {
    assert.equal(parseTwitter(undefined), null);
    assert.equal(parseTwitter(null), null);
    assert.equal(parseTwitter(""), null);
    assert.equal(parseTwitter("   "), null);
    assert.equal(parseTwitter("your_handle"), null);
    assert.equal(parseTwitter("@yourhandle"), null);
    assert.equal(parseTwitter("placeholder"), null);
    assert.equal(parseTwitter("https://x.com/your_handle"), null);
    assert.equal(parseTwitter("https://x.com/"), null);
  });

  it("accepts a handle, an @handle, or a profile URL and always emits https://x.com", () => {
    assert.deepEqual(parseTwitter("labsmcp"), {
      handle: "labsmcp",
      at: "@labsmcp",
      url: "https://x.com/labsmcp",
    });
    assert.deepEqual(parseTwitter("@labsmcp"), {
      handle: "labsmcp",
      at: "@labsmcp",
      url: "https://x.com/labsmcp",
    });
    assert.deepEqual(parseTwitter("https://x.com/labsmcp"), {
      handle: "labsmcp",
      at: "@labsmcp",
      url: "https://x.com/labsmcp",
    });
    assert.deepEqual(parseTwitter("https://twitter.com/labsmcp/"), {
      handle: "labsmcp",
      at: "@labsmcp",
      url: "https://x.com/labsmcp",
    });
    assert.deepEqual(parseTwitter("http://www.x.com/@labsmcp?s=20"), {
      handle: "labsmcp",
      at: "@labsmcp",
      url: "https://x.com/labsmcp",
    });
    assert.equal(parseTwitter("x.com/labsmcp")?.url, "https://x.com/labsmcp");
  });

  it("rejects anything that is not a single X profile", () => {
    assert.equal(parseTwitter("not a handle"), null);
    assert.equal(parseTwitter("this_handle_is_too_long"), null);
    assert.equal(parseTwitter("https://evil.com/labsmcp"), null);
    assert.equal(parseTwitter("https://x.com.evil.com/labsmcp"), null);
    assert.equal(parseTwitter("https://evil.com@x.com/labsmcp"), null);
    assert.equal(parseTwitter("https://x.com/labsmcp/status/1"), null);
    assert.equal(parseTwitter("javascript:alert(1)"), null);
  });
});

describe("twitterUrl", () => {
  it("reads NEXT_PUBLIC_TWITTER and omits a placeholder", () => {
    process.env.NEXT_PUBLIC_TWITTER = "labsmcp";
    assert.equal(twitterUrl(), "https://x.com/labsmcp");
    assert.equal(twitterHandle(), "@labsmcp");

    process.env.NEXT_PUBLIC_TWITTER = "changeme";
    assert.equal(twitterUrl(), null);
    assert.equal(twitterHandle(), null);

    delete process.env.NEXT_PUBLIC_TWITTER;
    assert.equal(twitterUrl(), null);
  });
});
