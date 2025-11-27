import { glob } from "node:fs/promises";
import Mocha from "mocha";
import path from "node:path";

export async function run(): Promise<void> {
  // Create the mocha test.
  const mocha = new Mocha({
    ui: "tdd",
    color: true,
  });

  const testsRoot = path.resolve(import.meta.dirname, "..");

  // Use Node.js built-in glob (returns an AsyncIterable).
  for await (const file of glob("**/**.test.js", { cwd: testsRoot })) {
    mocha.addFile(path.resolve(testsRoot, file));
  }

  // To run only a single test, set this value: `mocha.grep("<test name>");`

  // Wrap mocha.run in a Promise as it remains callback-based.
  await new Promise<void>((resolve, reject) => {
    try {
      mocha.run((failures) => {
        if (failures > 0) {
          reject(new Error(`${failures} tests failed.`));
        } else {
          resolve();
        }
      });
    } catch (error) {
      if (error instanceof Error) {
        reject(error);
      } else {
        reject(new Error(`Unknown error: ${error}`));
      }
    }
  });
}
