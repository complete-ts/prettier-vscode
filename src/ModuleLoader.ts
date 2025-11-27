import path from "node:path";
import type { PrettierOptions } from "./types.js";

// eslint-disable-next-line @typescript-eslint/naming-convention
declare const __webpack_require__: typeof require;
// eslint-disable-next-line @typescript-eslint/naming-convention
declare const __non_webpack_require__: typeof require;

export function nodeModuleLoader(): NodeJS.Require {
  return typeof __webpack_require__ === "function"
    ? __non_webpack_require__
    : require;
}

// Source: https://github.com/microsoft/vscode-eslint/blob/master/server/src/eslintServer.ts
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function loadNodeModule<T>(moduleName: string): T | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return nodeModuleLoader()(moduleName);
  } catch {
    throw new Error(`Error loading node module '${moduleName}'`);
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function resolveNodeModule(
  moduleName: string,
  options?: { paths: string[] },
) {
  try {
    return nodeModuleLoader().resolve(moduleName, options);
  } catch {
    throw new Error(`Error resolve node module '${moduleName}'`);
  }
}

/**
 * Resolve plugin package path for symlink structure dirs.
 * See: https://github.com/prettier/prettier/issues/8056
 */
export function resolveConfigPlugins(
  config: PrettierOptions,
  fileName: string,
): PrettierOptions {
  if (config.plugins?.length !== undefined) {
    // eslint-disable-next-line no-param-reassign
    config.plugins = config.plugins.map((plugin) => {
      if (
        typeof plugin === "string"
        && !plugin.startsWith(".")
        && !path.isAbsolute(plugin)
      ) {
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        return resolveNodeModule(plugin, { paths: [fileName] }) || plugin;
      }

      return plugin;
    });
  }

  return config;
}
