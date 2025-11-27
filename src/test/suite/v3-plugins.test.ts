import assert from "node:assert";
import { format, getText } from "./format.test.js";

suite("Test v3 + plugins", function tests() {
  // eslint-disable-next-line @typescript-eslint/no-invalid-this
  this.timeout(10_000);

  test("it formats with v3 + plugins", async () => {
    const { actual } = await format(
      "v3-plugins",
      "index.xml",
      /* shouldRetry */ true,
    );
    const expected = await getText("v3-plugins", "index.result.xml");
    assert.equal(actual, expected);
  });
});
