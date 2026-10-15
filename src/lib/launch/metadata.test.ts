import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LaunchInput } from "./input";
import { metadataDocument } from "./metadata";

const input: LaunchInput = {
  venue: "pump",
  creator: "CreatorWallet",
  name: "Example",
  symbol: "EX",
  imageUrl: "https://example.com/image.png",
  description: "a coin",
  creatorBuySol: 0,
  buyers: [],
  slippagePercent: 10,
  priorityFeeSol: 0,
};

describe("metadataDocument", () => {
  it("omits banner when none was passed", () => {
    const document = metadataDocument(input);
    assert.equal(document.image, input.imageUrl);
    assert.equal("banner" in document, false);
  });

  it("stores the banner URL next to the image", () => {
    const document = metadataDocument({
      ...input,
      bannerUrl: "https://example.com/banner.gif",
      twitter: "https://x.com/example",
    });
    assert.equal(document.banner, "https://example.com/banner.gif");
    assert.equal(document.image, input.imageUrl);
    assert.equal(document.twitter, "https://x.com/example");
    assert.equal(document.showName, true);
  });

  it("uses the pinned URLs when pinning replaces the originals", () => {
    const document = metadataDocument(
      { ...input, bannerUrl: "https://example.com/banner.gif" },
      {
        image: "https://ipfs.io/ipfs/imagecid",
        banner: "https://ipfs.io/ipfs/bannercid",
      },
    );
    assert.equal(document.image, "https://ipfs.io/ipfs/imagecid");
    assert.equal(document.banner, "https://ipfs.io/ipfs/bannercid");
  });
});
