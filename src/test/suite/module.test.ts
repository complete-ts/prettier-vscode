import assert from "node:assert";
import { format, getText } from "./format.test.js";

suite("Test module resolution", function tests() {
  // eslint-disable-next-line @typescript-eslint/no-invalid-this
  this.timeout(10_000);

  test("it formats without prettier dep using internal version", async () => {
    const { actual } = await format("no-dep", "index.js");
    const expected = await getText("no-dep", "index.result.js");
    assert.equal(actual, expected);
  });

  test("it formats without prettier in package.json", async () => {
    const { actual } = await format("module", "index.js");
    const expected = await getText("module", "index.result.js");
    assert.equal(actual, expected);
  });

  test("it loads plugin referenced in dependency module", async () => {
    const { actual } = await format(
      "module-plugin",
      "index.js",
      /* shouldRetry */ true,
    );
    const expected = await getText("module-plugin", "index.result.js");
    assert.equal(actual, expected);
  });
});
