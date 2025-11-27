import assert from "node:assert";
import { format, getText } from "./format.test.js";

suite("Tests for Prettier v3", function tests() {
  // eslint-disable-next-line @typescript-eslint/no-invalid-this
  this.timeout(10_000);

  test("it formats by Prettier v3", async () => {
    const { actual } = await format("v3", "index.ts", /* shouldRetry */ true);
    const expected = await getText("v3", "index.result.ts");
    assert.equal(actual, expected);
  });
});
