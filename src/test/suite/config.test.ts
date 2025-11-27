import assert from "node:assert";
import {
  format,
  getText,
  moveRootPrettierRC,
  putBackPrettierRC,
} from "./format.test.js";

const testConfig = (testPath: string, resultPath: string) => async () => {
  const { actual } = await format("config", testPath);
  const expected = await getText("config", resultPath);
  assert.equal(actual, expected);
};

suite("Test configurations", function tests() {
  // eslint-disable-next-line @typescript-eslint/no-invalid-this
  this.timeout(10_000);
  // eslint-disable-next-line @typescript-eslint/no-invalid-this
  this.beforeAll(moveRootPrettierRC);
  // eslint-disable-next-line @typescript-eslint/no-invalid-this
  this.afterAll(putBackPrettierRC);

  test(
    "it uses config from .prettierrc file and does not inherit VS Code settings ",
    testConfig("rcfile/test.js", "rcfile/test.result.js"),
  );
  test(
    "it uses config from prettier.config.js file ",
    testConfig("jsconfigfile/test.js", "jsconfigfile/test.result.js"),
  );
  test(
    "it uses config from .prettierrc.js file ",
    testConfig("jsfile/test.js", "jsfile/test.result.js"),
  );
  test(
    "it uses config from .prettierrc.js file for hbs files",
    testConfig("hbsfile/test.hbs", "hbsfile/test.result.hbs"),
  );
  test(
    "it uses config from .editorconfig file ",
    testConfig("editorconfig/test.js", "editorconfig/test.result.js"),
  );
  test(
    "it uses config from vscode settings ",
    testConfig("vscodeconfig/test.js", "vscodeconfig/test.result.js"),
  );
  test(
    "it uses config from vscode settings with language overridables ",
    testConfig(
      "vscodeconfig-language-overridable/test.ts",
      "vscodeconfig-language-overridable/test.result.ts",
    ),
  );
  test(
    "it formats custom file extension ",
    testConfig("customextension/test.abc", "customextension/test.result.abc"),
  );
});
