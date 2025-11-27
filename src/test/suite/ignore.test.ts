import assert from "node:assert";
import { format } from "./format.test.js";

suite("Test ignore", function tests() {
  // eslint-disable-next-line @typescript-eslint/no-invalid-this
  this.timeout(10_000);

  test("it does not format file", async () => {
    const { actual, source } = await format("project", "fileToIgnore.js");
    assert.equal(actual, source);
  });

  test("it does not format subfolder/*", async () => {
    const { actual, source } = await format("project", "ignoreMe2/index.js");
    assert.equal(actual, source);
  });

  test("it does not format sub-subfolder", async () => {
    const { actual, source } = await format(
      "project",
      "ignoreMe/subdir/index.js",
    );
    assert.equal(actual, source);
  });
});
