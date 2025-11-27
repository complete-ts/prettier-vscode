import assert from "node:assert";
import { format, getText } from "./format.test.js";

suite("Test plugins", function tests() {
  // eslint-disable-next-line @typescript-eslint/no-invalid-this
  this.timeout(10_000);

  test("it formats with plugins", async () => {
    const { actual } = await format(
      "plugins",
      "index.php",
      /* shouldRetry */ true,
    );
    const expected = await getText("plugins", "index.result.php");
    assert.equal(actual, expected);
  });

  test("it correctly resolved plugin in pnpm node_modules dirs structure", async () => {
    const { actual } = await format("plugins-pnpm", "index.js");
    const expected = await getText("plugins-pnpm", "index.result.js");
    assert.equal(actual, expected);
  });

  test("it should be able to obtain the `inferredParser` of the plugin", async () => {
    const { actual } = await format("plugins-pnpm", "index.php");
    const expected = await getText("plugins-pnpm", "index.result.php");
    assert.equal(actual, expected);
  });
});
