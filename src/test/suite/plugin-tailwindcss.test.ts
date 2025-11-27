import assert from "node:assert";
import { format, getText } from "./format.test.js";

suite("Test plugin-tailwindcss", function tests() {
  // eslint-disable-next-line @typescript-eslint/no-invalid-this
  this.timeout(10_000);

  test("it formats with prettier-plugin-tailwindcss", async () => {
    const { actual } = await format(
      "plugin-tailwindcss",
      "index.js",
      /* shouldRetry */ true,
    );
    const expected = await getText("plugin-tailwindcss", "index.result.js");
    assert.equal(actual, expected);
  });
});
