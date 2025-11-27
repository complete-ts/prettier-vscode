import assert from "node:assert";
import path from "node:path";
import * as prettier from "prettier";
import * as sinon from "sinon";
import { getWorkspaceFolderURI } from "./format.test.js";
import type { PrettierNodeModule } from "../../ModuleResolver.js";
import { ModuleResolver } from "../../ModuleResolver.js";
import { LoggingService } from "../../LoggingService.js";
import {
  OUTDATED_PRETTIER_VERSION_MESSAGE,
  USING_BUNDLED_PRETTIER,
} from "../../message.js";

suite("Test ModuleResolver", function tests() {
  let moduleResolver: ModuleResolver;
  let logErrorSpy: sinon.SinonSpy;
  let logDebugSpy: sinon.SinonSpy;

  // eslint-disable-next-line @typescript-eslint/no-invalid-this
  this.beforeEach(() => {
    const loggingService = new LoggingService();
    logErrorSpy = sinon.spy(loggingService, "logError");
    logDebugSpy = sinon.spy(loggingService, "logDebug");
    moduleResolver = new ModuleResolver(loggingService);
  });

  suite("getPrettierInstance", () => {
    test("it returns the bundled version of Prettier if local isn't found", async () => {
      const fileName = path.join(
        getWorkspaceFolderURI("no-dep").fsPath,
        "index.js",
      );
      const prettierInstance =
        await moduleResolver.getPrettierInstance(fileName);

      assert.strictEqual(prettierInstance, prettier);
      assert.ok(logDebugSpy.calledWith(USING_BUNDLED_PRETTIER));
    });

    test("it returns the bundled version of Prettier if local is outdated", async () => {
      const fileName = path.join(
        getWorkspaceFolderURI("outdated").fsPath,
        "ugly.js",
      );
      const prettierInstance =
        await moduleResolver.getPrettierInstance(fileName);

      assert.strictEqual(prettierInstance, undefined);
      assert.ok(logErrorSpy.calledWith(OUTDATED_PRETTIER_VERSION_MESSAGE));
    });

    test("it returns prettier version from package.json", async () => {
      const fileName = path.join(
        getWorkspaceFolderURI("specific-version").fsPath,
        "ugly.js",
      );
      const prettierInstance = (await moduleResolver.getPrettierInstance(
        fileName,
      )) as PrettierNodeModule;

      if (!prettierInstance) {
        assert.fail("Prettier is undefined.");
      }
      assert.notStrictEqual(prettierInstance, prettier);
      assert.strictEqual(prettierInstance.version, "2.0.2");
    });

    test("it returns prettier version from module dep", async () => {
      const fileName = path.join(
        getWorkspaceFolderURI("module").fsPath,
        "index.js",
      );
      const prettierInstance =
        await moduleResolver.getPrettierInstance(fileName);

      if (!prettierInstance) {
        assert.fail("Prettier is undefined.");
      }
      assert.notStrictEqual(prettierInstance, prettier);
      assert.strictEqual(prettierInstance.version, "2.0.2");
    });

    test("it uses explicit dep if found instead fo a closer implicit module dep", async () => {
      const fileName = path.join(
        getWorkspaceFolderURI("explicit-dep").fsPath,
        "implicit-dep",
        "index.js",
      );
      const prettierInstance =
        await moduleResolver.getPrettierInstance(fileName);
      if (!prettierInstance) {
        assert.fail("Prettier is undefined.");
      }
      assert.notStrictEqual(prettierInstance, prettier);
      assert.strictEqual(prettierInstance.version, "2.0.2");
    });
  });
});
