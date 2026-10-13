import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertPublicHttpUrl, fetchPublic, isBlockedAddress, isBlockedHostname, SsrfError } from "./ssrf";

describe("isBlockedAddress", () => {
  it("rejects loopback, private, and link-local ranges", () => {
    for (const address of [
      "127.0.0.1",
      "10.0.0.1",
      "192.168.1.1",
      "172.16.0.1",
      "169.254.169.254",
      "0.0.0.0",
      "100.64.0.1",
      "224.0.0.1",
      "::1",
      "fe80::1",
      "fd00::1",
      "::ffff:127.0.0.1",
    ]) {
      assert.equal(isBlockedAddress(address), true, address);
    }
  });

  it("allows public addresses", () => {
    for (const address of ["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"]) {
      assert.equal(isBlockedAddress(address), false, address);
    }
  });
});

describe("assertPublicHttpUrl", () => {
  it("refuses credentials, non-http schemes, and local names", () => {
    assert.throws(() => assertPublicHttpUrl("file:///etc/passwd"), SsrfError);
    assert.throws(() => assertPublicHttpUrl("http://user:pass@example.com/a.png"), SsrfError);
    assert.throws(() => assertPublicHttpUrl("http://127.0.0.1/latest"), SsrfError);
    assert.throws(() => assertPublicHttpUrl("http://[::1]/"), SsrfError);
    assert.throws(() => assertPublicHttpUrl("http://localhost/image.png"), SsrfError);
    assert.throws(() => assertPublicHttpUrl("http://metadata.google.internal/"), SsrfError);
    assert.equal(isBlockedHostname("169.254.169.254"), true);
  });

  it("accepts a public https URL", () => {
    const url = assertPublicHttpUrl("https://example.com/image.png");
    assert.equal(url.hostname, "example.com");
  });
});

describe("fetchPublic", () => {
  it("does not connect to loopback", async () => {
    await assert.rejects(() => fetchPublic("http://127.0.0.1/"), SsrfError);
  });
});
