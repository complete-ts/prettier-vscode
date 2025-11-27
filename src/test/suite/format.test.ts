import assert from "node:assert";
import { readFile, rename } from "node:fs";
import type { Done } from "mocha";
import path from "node:path";
import * as prettier from "prettier";
import { promisify } from "node:util";
import * as vscode from "vscode";
import { assertDefined } from "complete-common";

const readFileAsync: (filePath: string, encoding: "utf8") => Promise<string> =
  promisify(readFile);

const wait = async (ms: number) =>
  // eslint-disable-next-line no-promise-executor-return
  await new Promise((resolve) => setTimeout(resolve, ms));

/** Gets the workspace folder by name. */
export function getWorkspaceFolderURI(workspaceFolderName: string): vscode.Uri {
  const workspaceFolder = vscode.workspace.workspaceFolders?.find(
    (folder) => folder.name === workspaceFolderName,
  );
  assertDefined(
    workspaceFolder,
    "Folder not found in workspace. Did you forget to add the test folder to test.code-workspace?",
  );
  return workspaceFolder.uri;
}

export async function getText(
  workspaceFolderName: string,
  expectedFile: string,
): Promise<string> {
  const base = getWorkspaceFolderURI(workspaceFolderName);
  const expectedPath = path.join(base.fsPath, expectedFile);
  const expected = await readFileAsync(expectedPath, "utf8");
  return expected;
}

const prettierConfigOrig = path.resolve(__dirname, "../../../.prettierrc");
const prettierConfigTemp = path.resolve(__dirname, "../../../old.prettierrc");

export function moveRootPrettierRC(done: Done): void {
  rename(prettierConfigOrig, prettierConfigTemp, done);
}

export function putBackPrettierRC(done: Done): void {
  rename(prettierConfigTemp, prettierConfigOrig, done);
}

/**
 * Loads and format a file.
 *
 * @param workspaceFolderName n/a
 * @param testFile Path relative to base URI (a workspaceFolder's URI).
 * @param shouldRetry n/a
 * @returns The source code and resulting code.
 */
export async function format(
  workspaceFolderName: string,
  testFile: string,
  shouldRetry = false,
): Promise<{
  actual: string;
  source: string;
}> {
  const base = getWorkspaceFolderURI(workspaceFolderName);
  const absPath = path.join(base.fsPath, testFile);
  const doc = await vscode.workspace.openTextDocument(absPath);
  const text = doc.getText();
  try {
    await vscode.window.showTextDocument(doc);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log(error);
    throw error;
  }
  // eslint-disable-next-line no-console
  console.time(testFile);
  // eslint-disable-next-line complete/require-variadic-function-argument
  await vscode.commands.executeCommand("editor.action.formatDocument");

  let actual = doc.getText();

  if (shouldRetry) {
    for (let i = 0; i < 10; i++) {
      if (text !== actual) {
        break;
      }
      // eslint-disable-next-line no-await-in-loop
      await wait(250);
      // eslint-disable-next-line complete/require-variadic-function-argument, no-await-in-loop
      await vscode.commands.executeCommand("editor.action.formatDocument");
      actual = doc.getText();
    }
  }

  // eslint-disable-next-line no-console
  console.timeEnd(testFile);

  return {
    actual,
    source: text,
  };
}
/**
 * Compare Prettier's output (default settings) with the output from extension.
 *
 * @param file Path relative to workspace root.
 * @param options The options from Prettier.
 */
async function formatSameAsPrettier(
  file: string,
  options?: Partial<prettier.Options>,
) {
  const prettierOptions: prettier.Options = {
    ...options,
    filepath: file,
  };
  const { actual, source } = await format("project", file);
  const prettierFormatted = await prettier.format(source, prettierOptions);
  assert.equal(actual, prettierFormatted);
}

suite("Test format Document", function tests() {
  // eslint-disable-next-line @typescript-eslint/no-invalid-this
  this.timeout(10_000);

  test("it formats JavaScript", async () => {
    await wait(500);
    await formatSameAsPrettier("formatTest/ugly.js");
  });
  test("it formats TypeScript", async () => {
    await formatSameAsPrettier("formatTest/ugly.ts");
  });
  test("it formats CSS", async () => {
    await formatSameAsPrettier("formatTest/ugly.css");
  });
  test("it formats JSON", async () => {
    await formatSameAsPrettier("formatTest/ugly.json");
  });
  test("it formats JSONC", async () => {
    await formatSameAsPrettier("formatTest/ugly.jsonc", { parser: "json" });
  });
  test("it formats JSON", async () => {
    await formatSameAsPrettier("formatTest/package.json");
  });
  test("it formats HTML", async () => {
    await formatSameAsPrettier("formatTest/ugly.html");
  });
  test("it formats LWC", async () => {
    await formatSameAsPrettier("formatTest/lwc.html", { parser: "lwc" });
  });
  test("it formats TSX", async () => {
    await formatSameAsPrettier("formatTest/ugly.tsx");
  });
  test("it formats SCSS", async () => {
    await formatSameAsPrettier("formatTest/ugly.scss");
  });
  test("it formats GraphQL", async () => {
    await formatSameAsPrettier("formatTest/ugly.graphql");
  });
  test("it formats HTML with literals", async () => {
    await formatSameAsPrettier("formatTest/htmlWithLiterals.html");
  });
  test("it formats Vue", async () => {
    await formatSameAsPrettier("formatTest/ugly.vue");
  });
  test("it formats HBS", async () => {
    await formatSameAsPrettier("formatTest/ugly.hbs");
  });
});
