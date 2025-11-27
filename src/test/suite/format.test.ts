import assert from "node:assert";
import { readFile, rename } from "node:fs";
import type { Done } from "mocha";
import path from "node:path";
import * as prettier from "prettier";
import { promisify } from "node:util";
import * as vscode from "vscode";

const readFileAsync: (filePath: string, encoding: "utf8") => Promise<string> =
  promisify(readFile);

const wait = async (ms: number) =>
  await new Promise((resolve) => setTimeout(resolve, ms));

/**
 * gets the workspace folder by name
 *
 * @param name Workspace folder name
 */
export const getWorkspaceFolderUri = (workspaceFolderName: string) => {
  const workspaceFolder = vscode.workspace.workspaceFolders!.find(
    (folder) => folder.name === workspaceFolderName,
  );
  if (!workspaceFolder) {
    throw new Error(
      "Folder not found in workspace. Did you forget to add the test folder to test.code-workspace?",
    );
  }
  return workspaceFolder.uri;
};

export async function getText(
  workspaceFolderName: string,
  expectedFile: string,
) {
  const base = getWorkspaceFolderUri(workspaceFolderName);
  const expectedPath = path.join(base.fsPath, expectedFile);
  const expected = await readFileAsync(expectedPath, "utf8");
  return expected;
}

const prettierConfigOrig = path.resolve(__dirname, "../../../.prettierrc");
const prettierConfigTemp = path.resolve(__dirname, "../../../old.prettierrc");

export function moveRootPrettierRC(done: Done) {
  rename(prettierConfigOrig, prettierConfigTemp, done);
}

export function putBackPrettierRC(done: Done) {
  rename(prettierConfigTemp, prettierConfigOrig, done);
}

/**
 * loads and format a file.
 *
 * @param workspaceFolderName
 * @param testFile path relative to base URI (a workspaceFolder's URI)
 * @param base base URI
 * @param shouldRetry
 * @returns source code and resulting code
 */
export async function format(
  workspaceFolderName: string,
  testFile: string,
  shouldRetry = false,
) {
  const base = getWorkspaceFolderUri(workspaceFolderName);
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
  await vscode.commands.executeCommand("editor.action.formatDocument");

  let actual = doc.getText();

  if (shouldRetry) {
    for (let i = 0; i < 10; i++) {
      if (text !== actual) {
        break;
      }
      await wait(250);
      await vscode.commands.executeCommand("editor.action.formatDocument");
      actual = doc.getText();
    }
  }

  // eslint-disable-next-line no-console
  console.timeEnd(testFile);

  return { actual, source: text };
}
/**
 * Compare prettier's output (default settings) with the output from extension.
 *
 * @param file path relative to workspace root
 * @param options
 */
async function formatSameAsPrettier(
  file: string,
  options?: Partial<prettier.Options>,
) {
  const prettierOptions: prettier.Options = {
    ...options,

    /* cspell: disable-next-line */
    filepath: file,
  };
  const { actual, source } = await format("project", file);
  const prettierFormatted = await prettier.format(source, prettierOptions);
  assert.equal(actual, prettierFormatted);
}

suite("Test format Document", function () {
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
