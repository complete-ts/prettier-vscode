import os from "node:os";
import path from "node:path";
import * as semver from "semver";
import { Uri, workspace } from "vscode";
import type { TextDocument } from "vscode";
import type { PrettierVSCodeConfig } from "./types.js";

export function getWorkspaceRelativePath(
  filePath: string,
  pathToResolve: string,
): string | undefined {
  const homeDir = os.homedir();

  // In case the user wants to use ~/.prettierrc on Mac.
  if (
    process.platform === "darwin" &&
    pathToResolve.startsWith("~") &&
    homeDir !== ""
  ) {
    return pathToResolve.replace(/^~(?=$|\/|\\)/, homeDir);
  }

  if (workspace.workspaceFolders === undefined) {
    return undefined;
  }

  const folder = workspace.getWorkspaceFolder(Uri.file(filePath));
  if (folder === undefined) {
    return undefined;
  }

  return path.isAbsolute(pathToResolve)
    ? pathToResolve
    : path.join(folder.uri.fsPath, pathToResolve);
}

export function getConfig(scope?: TextDocument | Uri): PrettierVSCodeConfig {
  const config = workspace.getConfiguration(
    "prettier",
    scope,
  ) as unknown as PrettierVSCodeConfig;

  // Some settings are disabled for untrusted workspaces because they can be used for bad things.
  if (!workspace.isTrusted) {
    const newConfig = {
      ...config,
      prettierPath: undefined,
      configPath: undefined,
      ignorePath: ".prettierignore",
      documentSelectors: [],
      useEditorConfig: false,
      withNodeModules: false,
      resolveGlobalModules: false,
    };
    return newConfig;
  }

  return config;
}

export function isAboveV3(version: string | null): boolean {
  const parsedVersion = semver.parse(version);
  if (!parsedVersion) {
    throw new Error("Invalid version");
  }
  return parsedVersion.major >= 3;
}
