import { assertObject, assertStringNotEmpty, isObject } from "complete-common";
import { findUpStop, findUpSync } from "find-up";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import * as prettier from "prettier";
import resolve from "resolve";
import * as semver from "semver";
import type { TextDocument } from "vscode";
import { commands, Uri, workspace } from "vscode";
import { resolveGlobalNodePath, resolveGlobalYarnPath } from "./Files.js";
import type { LoggingService } from "./LoggingService.js";
import {
  FAILED_TO_LOAD_MODULE_MESSAGE,
  INVALID_PRETTIER_CONFIG,
  INVALID_PRETTIER_PATH_MESSAGE,
  OUTDATED_PRETTIER_VERSION_MESSAGE,
  UNTRUSTED_WORKSPACE_USING_BUNDLED_PRETTIER,
  USING_BUNDLED_PRETTIER,
} from "./message.js";
import { loadNodeModule, resolveConfigPlugins } from "./ModuleLoader.js";
import type { PrettierInstance } from "./PrettierInstance.js";
import { PrettierMainThreadInstance } from "./PrettierMainThreadInstance.js";
import { PrettierWorkerInstance } from "./PrettierWorkerInstance.js";
import type {
  ModuleResolverInterface,
  PackageManagers,
  PrettierOptions,
  PrettierResolveConfigOptions,
  PrettierVSCodeConfig,
} from "./types.js";
import { getConfig, getWorkspaceRelativePath, isAboveV3 } from "./util.js";

const minPrettierVersion = "1.13.0";

export type PrettierNodeModule = typeof prettier;

const origFsStatSync = fs.statSync;
const fsStatSyncWorkaround = (
  pathLike: fs.PathLike,
  options?: fs.StatSyncOptions,
) => {
  if (
    options === undefined
    || options.throwIfNoEntry === true
    || options.throwIfNoEntry === undefined
  ) {
    return origFsStatSync(pathLike, options);
  }

  // eslint-disable-next-line no-param-reassign
  options.throwIfNoEntry = true;
  try {
    return origFsStatSync(pathLike, options);
  } catch (error: unknown) {
    if (isObject(error) && "code" in error && error["code"] === "ENOENT") {
      return undefined;
    }

    throw error;
  }
};
// @ts-expect-error Workaround for https://github.com/prettier/prettier-vscode/issues/3020
fs.statSync = fsStatSyncWorkaround;

const globalPaths: Record<
  string,
  { cache: string | undefined; get: () => string | undefined }
> = {
  npm: {
    cache: undefined,
    get(): string | undefined {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      return resolveGlobalNodePath();
    },
  },
  pnpm: {
    cache: undefined,
    get(): string {
      const pnpmPath = execSync("pnpm root -g").toString().trim();
      return pnpmPath;
    },
  },
  yarn: {
    cache: undefined,
    get(): string | undefined {
      return resolveGlobalYarnPath();
    },
  },
};

function globalPathGet(packageManager: PackageManagers): string | undefined {
  const pm = globalPaths[packageManager];
  if (pm) {
    pm.cache ??= pm.get();
    return pm.cache;
  }
  return undefined;
}

export class ModuleResolver implements ModuleResolverInterface {
  private readonly findPkgCache = new Map<string, string>();
  private readonly ignorePathCache = new Map<string, string>();

  private readonly path2Module = new Map<string, PrettierInstance>();
  private readonly loggingService: LoggingService;

  constructor(loggingService: LoggingService) {
    this.loggingService = loggingService;
  }

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  public getGlobalPrettierInstance(): PrettierNodeModule {
    return prettier;
  }

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  private loadPrettierVersionFromPackageJSON(modulePath: string): string {
    let cwd: string;
    try {
      // Checking if dir with readdir will handle directories and symlinks.
      fs.readdirSync(modulePath);
      cwd = modulePath;
    } catch {
      cwd = path.dirname(modulePath);
    }
    const projectPackageJSONPath = findUpSync(
      (dir) => {
        const pkgFilePath = path.join(dir, "package.json");
        if (fs.existsSync(pkgFilePath)) {
          try {
            const packageJSONContents = fs.readFileSync(pkgFilePath, "utf8");
            const packageJSON = JSON.parse(packageJSONContents) as unknown;
            if (
              isObject(packageJSON)
            ) {
              return pkgFilePath;
            }
          } catch {
            // If we can't read or parse the package.json, continue searching.
          }
        }

        return undefined;
      },
      { cwd },
    );

    assertStringNotEmpty(projectPackageJSONPath, "Cannot find the \"package.json\" file for the current project.");

    const prettierPackageJSON = loadNodeModule(projectPackageJSONPath);
    assertObject(
      prettierPackageJSON,
      'The Prettier "package.json" file was not an object.',
    );

    const { version } = prettierPackageJSON;
    assertStringNotEmpty(
      version,
      'Failed to parse the Prettier version from the "package.json" file.',
    );

    return version;
  }

  /**
   * Returns an instance of the prettier module.
   *
   * @param fileName The path of the file to use as the starting point. If none provided, the
   *                 bundled prettier will be used.
   */
  public async getPrettierInstance(
    fileName: string,
  ): Promise<PrettierNodeModule | PrettierInstance | undefined> {
    if (!workspace.isTrusted) {
      this.loggingService.logDebug(UNTRUSTED_WORKSPACE_USING_BUNDLED_PRETTIER);
      return prettier;
    }

    const { prettierPath, resolveGlobalModules } = getConfig(
      Uri.file(fileName),
    );

    this.loggingService.logDebug(
      `getPrettierInstance: fileName=${fileName}, prettierPath=${prettierPath ?? "undefined"}`,
    );

    // Look for local module.
    let modulePath: string | undefined;

    try {
      modulePath =
        prettierPath === undefined || prettierPath === ""
          ? this.findPkg(fileName, "prettier")
          : getWorkspaceRelativePath(fileName, prettierPath);
    } catch (error) {
      let moduleDirectory: string | undefined;
      if (modulePath === undefined && error instanceof Error) {
        // If findPkg threw an error from `resolve.sync`, attempt to parse the directory it failed
        // on to provide a better error message.
        const resolveSyncPathRegex = /Cannot find module '.*' from '(.*)'/;
        const resolveErrorMatches = resolveSyncPathRegex.exec(error.message);
        if (resolveErrorMatches !== null) {
          const match = resolveErrorMatches[1];
          if (match !== undefined) {
            moduleDirectory = match;
          }
        }
      }

      this.loggingService.logInfo(
        `Attempted to determine module path from ${
          modulePath ?? moduleDirectory ?? "package.json"
        }`,
      );
      this.loggingService.logError(FAILED_TO_LOAD_MODULE_MESSAGE, error);

      // Return here because there is a local module, but we can't resolve it. Must do npm install
      // for Prettier to work.
      return undefined;
    }

    // If global modules allowed, look for global module.
    if (resolveGlobalModules && modulePath === undefined) {
      let workspaceFolder: Uri | undefined;
      if (workspace.workspaceFolders) {
        const folder = workspace.getWorkspaceFolder(Uri.file(fileName));
        if (folder) {
          workspaceFolder = folder.uri;
        }
      }
      const packageManager = await commands.executeCommand<
        "npm" | "pnpm" | "yarn"
      >("npm.packageManager", workspaceFolder);
      const resolvedGlobalPackageManagerPath = globalPathGet(packageManager);
      if (resolvedGlobalPackageManagerPath !== undefined) {
        const globalModulePath = path.join(
          resolvedGlobalPackageManagerPath,
          "prettier",
        );
        if (fs.existsSync(globalModulePath)) {
          modulePath = globalModulePath;
        }
      }
    }

    let moduleInstance: PrettierInstance | undefined;

    if (modulePath !== undefined) {
      this.loggingService.logDebug(`Local Prettier module path: ${modulePath}`);

      // First check module cache.
      moduleInstance = this.path2Module.get(modulePath);
      if (moduleInstance !== undefined) {
        return moduleInstance;
      }

      try {
        const prettierVersion =
          this.loadPrettierVersionFromPackageJSON(modulePath);

        const isAboveVersion3 = isAboveV3(prettierVersion);

        moduleInstance = isAboveVersion3
          ? new PrettierWorkerInstance(modulePath)
          : new PrettierMainThreadInstance(modulePath);
        this.path2Module.set(modulePath, moduleInstance);
      } catch (error) {
        this.loggingService.logInfo(
          `Attempted to load Prettier module from ${modulePath}`,
        );
        this.loggingService.logError(FAILED_TO_LOAD_MODULE_MESSAGE, error);

        // Returning here because module didn't load.
        return undefined;
      }
    }

    if (moduleInstance) {
      const version = await moduleInstance.import();

      if (version === "" && prettierPath !== undefined) {
        this.loggingService.logError(INVALID_PRETTIER_PATH_MESSAGE);
        return undefined;
      }

      const isValidVersion =
        version !== "" && semver.gte(version, minPrettierVersion);

      if (!isValidVersion) {
        this.loggingService.logInfo(
          `Attempted to load Prettier module from ${modulePath}`,
        );
        this.loggingService.logError(OUTDATED_PRETTIER_VERSION_MESSAGE);
        return undefined;
      }
      this.loggingService.logDebug(`Using prettier version ${version}`);

      return moduleInstance;
    }
    this.loggingService.logDebug(USING_BUNDLED_PRETTIER);
    return prettier;
  }

  public async getResolvedIgnorePath(
    fileName: string,
    ignorePath: string,
  ): Promise<string | undefined> {
    const cacheKey = `${fileName}:${ignorePath}`;
    // Cache resolvedIgnorePath because resolving it checks the file system.
    let resolvedIgnorePath = this.ignorePathCache.get(cacheKey);
    if (resolvedIgnorePath === undefined) {
      resolvedIgnorePath = getWorkspaceRelativePath(fileName, ignorePath);
      // If multiple different workspace folders contain this same file, we may have chosen one that
      // doesn't actually contain .prettierignore.
      if (workspace.workspaceFolders) {
        // All workspace folders that contain the file.
        const folders = workspace.workspaceFolders
          .map((folder) => folder.uri.fsPath)
          .filter((folder) => {
            // https://stackoverflow.com/a/45242825
            const relative = path.relative(folder, fileName);
            return (
              relative !== ""
              && !relative.startsWith("..")
              && !path.isAbsolute(relative)
            );
          })
          // Sort folders innermost to outermost.
          .toSorted((a, b) => b.length - a.length);
        for (const folder of folders) {
          const p = path.join(folder, ignorePath);
          if (
            // https://stackoverflow.com/questions/17699599/node-js-check-if-file-exists#comment121041700_57708635
            // eslint-disable-next-line no-await-in-loop
            await fs.promises.stat(p).then(
              () => true,
              () => false,
            )
          ) {
            resolvedIgnorePath = p;
            break;
          }
        }
      }
    }
    if (resolvedIgnorePath !== undefined) {
      this.ignorePathCache.set(cacheKey, resolvedIgnorePath);
    }
    return resolvedIgnorePath;
  }

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  private adjustFileNameForPrettierVersion3_1_1(
    prettierInstance: { version: string | null },
    fileName: string,
  ) {
    if (prettierInstance.version === null) {
      return fileName;
    }

    // Avoid: https://github.com/prettier/prettier/pull/15363
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const isGte3_1_1 = semver.gte(prettierInstance.version, "3.1.1");
    if (isGte3_1_1) {
      return path.join(fileName, "noop.js");
    }
    return fileName;
  }

  public async resolveConfig(
    prettierInstance: {
      version: string | null;
      resolveConfigFile: (filePath?: string) => Promise<string | null>;
      resolveConfig: (
        fileName: string,
        options?: prettier.ResolveConfigOptions,
      ) => Promise<PrettierOptions | null>;
    },
    uri: Uri,
    fileName: string,
    vscodeConfig: PrettierVSCodeConfig,
  ): Promise<"error" | "disabled" | PrettierOptions | null> {
    const isVirtual = uri.scheme !== "file" && uri.scheme !== "vscode-userdata";

    let configPath: string | undefined;
    try {
      if (!isVirtual) {
        configPath =
          (await prettierInstance.resolveConfigFile(
            this.adjustFileNameForPrettierVersion3_1_1(
              prettierInstance,
              fileName,
            ),
          )) ?? undefined;
      }
    } catch (error) {
      this.loggingService.logError(
        `Error resolving prettier configuration for ${fileName}`,
        error,
      );
      return "error";
    }

    const resolveConfigOptions: PrettierResolveConfigOptions = {
      // eslint-disable-next-line no-nested-ternary
      config: isVirtual
        ? undefined
        : vscodeConfig.configPath === undefined
          ? configPath
          : getWorkspaceRelativePath(fileName, vscodeConfig.configPath),
      editorconfig: isVirtual ? undefined : vscodeConfig.useEditorConfig,
    };

    let resolvedConfig: PrettierOptions | null;
    try {
      resolvedConfig = isVirtual
        ? // eslint-disable-next-line unicorn/no-null
          null
        : await prettierInstance.resolveConfig(fileName, resolveConfigOptions);
    } catch (error) {
      this.loggingService.logError(
        "Invalid prettier configuration file detected.",
        error,
      );
      this.loggingService.logError(INVALID_PRETTIER_CONFIG);

      return "error";
    }

    if (resolveConfigOptions.config !== undefined) {
      this.loggingService.logInfo(
        `Using config file at ${resolveConfigOptions.config}`,
      );
    }

    resolvedConfig &&= resolveConfigPlugins(resolvedConfig, fileName);

    if (
      !isVirtual
      && vscodeConfig.configPath === undefined
      && configPath === undefined
      && vscodeConfig.requireConfig
    ) {
      this.loggingService.logInfo(
        "Require config set to true and no config present. Skipping file.",
      );
      return "disabled";
    }

    return resolvedConfig;
  }

  public async getResolvedConfig(
    { fileName, uri }: TextDocument,
    vscodeConfig: PrettierVSCodeConfig,
  ): Promise<"error" | "disabled" | PrettierOptions | null> {
    const prettierInstance: typeof prettier | PrettierInstance =
      (await this.getPrettierInstance(fileName)) ?? prettier;

    const resolvedConfig = await this.resolveConfig(
      prettierInstance,
      uri,
      fileName,
      vscodeConfig,
    );

    return resolvedConfig;
  }

  /** Clears the module and config cache. */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  public async dispose(): Promise<void> {
    await prettier.clearConfigCache();
    for (const module of this.path2Module.values()) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        module.clearConfigCache();
      } catch (error) {
        this.loggingService.logError("Error clearing module cache.", error);
      }
    }
    this.path2Module.clear();
  }

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  private isInternalTestRoot(dir: string): boolean {
    if (process.env["NODE_ENV"] !== "production") {
      // This is for testing purposes only. This code is removed in the shipped version of this
      // extension so do not use this in your project. It won't work.
      return fs.existsSync(path.join(dir, ".do-not-use-prettier-vscode-root"));
    }
    return false;
  }

  /**
   * Recursively search upwards for a given module definition based on package.json or node_modules
   * existence.
   *
   * @param fsPath File system path to start searching from.
   * @param pkgName Package's name to search for.
   * @returns Resolved path to module.
   */
  private findPkg(fsPath: string, pkgName: string): string | undefined {
    const cacheKey = `${fsPath}:${pkgName}`;
    const packagePathState = this.findPkgCache.get(cacheKey);
    if (packagePathState !== undefined) {
      return packagePathState;
    }

    // Only look for a module definition outside of any "node_modules" directories.
    const splitPath = fsPath.split("/");
    let finalPath = fsPath;
    const nodeModulesIndex = splitPath.indexOf("node_modules");

    if (nodeModulesIndex > 1) {
      finalPath = splitPath.slice(0, nodeModulesIndex).join("/");
    }

    // First look for an explicit package.json dep.
    const packageJSONResDir = findUpSync(
      (dir) => {
        if (fs.existsSync(path.join(dir, "package.json"))) {
          let packageJSON: unknown;
          try {
            const packageJSONContents = fs.readFileSync(
              path.join(dir, "package.json"),
              "utf8",
            );
            packageJSON = JSON.parse(packageJSONContents);
          } catch {
            // Swallow, if we can't read it we don't want to resolve based on it.
          }

          if (isObject(packageJSON)) {
            const { dependencies } = packageJSON;
            if (isObject(dependencies)) {
              const dependency = dependencies[pkgName];
              if (typeof dependency === "string" && dependency !== "") {
                return dir;
              }
            }

            const { devDependencies } = packageJSON;
            if (isObject(devDependencies)) {
              const dependency = devDependencies[pkgName];
              if (typeof dependency === "string" && dependency !== "") {
                return dir;
              }
            }
          }
        }

        if (this.isInternalTestRoot(dir)) {
          return findUpStop;
        }

        return undefined;
      },
      { cwd: finalPath, type: "directory" },
    );

    if (packageJSONResDir !== undefined) {
      const packagePath = resolve.sync(pkgName, { basedir: packageJSONResDir });
      this.loggingService.logDebug(
        `findPkg: Found ${pkgName} in ${packageJSONResDir}, resolve.sync returned: ${packagePath}`,
      );
      this.findPkgCache.set(cacheKey, packagePath);
      return packagePath;
    }

    // If no explicit package.json dep found, instead look for implicit dep.
    const nodeModulesResDir = findUpSync(
      (dir) => {
        if (fs.existsSync(path.join(dir, "node_modules", pkgName))) {
          return dir;
        }

        if (this.isInternalTestRoot(dir)) {
          return findUpStop;
        }

        return undefined;
      },
      { cwd: finalPath, type: "directory" },
    );

    if (nodeModulesResDir !== undefined && nodeModulesResDir !== "") {
      const packagePath = resolve.sync(pkgName, { basedir: nodeModulesResDir });
      this.loggingService.logDebug(
        `findPkg: Found ${pkgName} implicitly in ${nodeModulesResDir}, resolve.sync returned: ${packagePath}`,
      );
      this.findPkgCache.set(cacheKey, packagePath);
      return packagePath;
    }

    return undefined;
  }
}
