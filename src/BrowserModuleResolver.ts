import type {
  PrettierFileInfoOptions,
  PrettierFileInfoResult,
  PrettierSupportLanguage,
  PrettierModule,
  PrettierOptions,
  ModuleResolverInterface,
  PrettierVSCodeConfig,
} from "./types.js";
import * as prettierStandalone from "prettier/standalone";
import * as angularPlugin from "prettier/plugins/angular";
import * as babelPlugin from "prettier/plugins/babel";
import * as glimmerPlugin from "prettier/plugins/glimmer";
import * as graphqlPlugin from "prettier/plugins/graphql";
import * as htmlPlugin from "prettier/plugins/html";
import * as markdownPlugin from "prettier/plugins/markdown";
import * as meriyahPlugin from "prettier/plugins/meriyah";
import * as typescriptPlugin from "prettier/plugins/typescript";
import * as yamlPlugin from "prettier/plugins/yaml";
import type { TextDocument, Uri } from "vscode";
import type { LoggingService } from "./LoggingService.js";
import { getWorkspaceRelativePath } from "./util.js";
import type { ResolveConfigOptions } from "prettier";

const plugins = [
  angularPlugin,
  babelPlugin,
  glimmerPlugin,
  graphqlPlugin,
  htmlPlugin,
  markdownPlugin,
  meriyahPlugin,
  typescriptPlugin,
  yamlPlugin,
];

export class ModuleResolver implements ModuleResolverInterface {
  private readonly loggingService: LoggingService;

  constructor(loggingService: LoggingService) {
    this.loggingService = loggingService;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public async getPrettierInstance(
    _fileName: string,
  ): Promise<PrettierModule | undefined> {
    return this.getGlobalPrettierInstance();
  }

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this, @typescript-eslint/require-await
  public async getResolvedIgnorePath(
    fileName: string,
    ignorePath: string,
  ): Promise<string | undefined> {
    return getWorkspaceRelativePath(fileName, ignorePath);
  }

  public getGlobalPrettierInstance(): PrettierModule {
    this.loggingService.logInfo("Using standalone prettier");
    return {
      format: async (source: string, options?: PrettierOptions) =>
        await prettierStandalone.format(source, { ...options, plugins }),

      // eslint-disable-next-line @typescript-eslint/require-await
      getSupportInfo: async (): Promise<{
        languages: PrettierSupportLanguage[];
      }> => ({
        languages: [
          {
            vscodeLanguageIds: [
              "javascript",
              "javascriptreact",
              "mongo",
              "mongodb",
            ],
            extensions: [],
            parsers: [
              "babel",
              "espree",
              "meriyah",
              "babel-flow",
              "babel-ts",
              "flow",
              "typescript",
            ],
          },
          {
            vscodeLanguageIds: ["typescript"],
            extensions: [],
            parsers: ["typescript", "babel-ts"],
          },
          {
            vscodeLanguageIds: ["typescriptreact"],
            extensions: [],
            parsers: ["typescript", "babel-ts"],
          },
          {
            vscodeLanguageIds: ["json"],
            extensions: [],
            parsers: ["json-stringify"],
          },
          {
            vscodeLanguageIds: ["json"],
            extensions: [],
            parsers: ["json"],
          },
          {
            vscodeLanguageIds: ["jsonc"],
            parsers: ["json"],
          },
          {
            vscodeLanguageIds: ["json5"],
            extensions: [],
            parsers: ["json5"],
          },
          {
            vscodeLanguageIds: ["handlebars"],
            extensions: [],
            parsers: ["glimmer"],
          },
          {
            vscodeLanguageIds: ["graphql"],
            extensions: [],
            parsers: ["graphql"],
          },
          {
            vscodeLanguageIds: ["markdown"],
            parsers: ["markdown"],
          },
          {
            vscodeLanguageIds: ["mdx"],
            extensions: [],
            parsers: ["mdx"],
          },
          {
            vscodeLanguageIds: ["html"],
            extensions: [],
            parsers: ["angular"],
          },
          {
            vscodeLanguageIds: ["html"],
            extensions: [],
            parsers: ["html"],
          },
          {
            vscodeLanguageIds: ["html"],
            extensions: [],
            parsers: ["lwc"],
          },
          {
            vscodeLanguageIds: ["vue"],
            extensions: [],
            parsers: ["vue"],
          },
          {
            vscodeLanguageIds: ["yaml", "ansible", "home-assistant"],
            extensions: [],
            parsers: ["yaml"],
          },
        ],
      }),

      // eslint-disable-next-line @typescript-eslint/require-await
      getFileInfo: async (
        _filePath: string,
        _options?: PrettierFileInfoOptions,
      ): Promise<PrettierFileInfoResult> =>
        // eslint-disable-next-line unicorn/no-null
        ({ ignored: false, inferredParser: null }),
    };
  }

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this, @typescript-eslint/require-await
  async resolveConfig(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    prettierInstance: {
      version: string | null;
      resolveConfigFile: (filePath?: string) => Promise<string | null>;
      resolveConfig: (
        fileName: string,
        options?: ResolveConfigOptions,
      ) => Promise<PrettierOptions | null>;
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    uri: Uri,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    fileName: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    vscodeConfig: PrettierVSCodeConfig,
  ): Promise<PrettierOptions | "error" | "disabled" | null> {
    // eslint-disable-next-line unicorn/no-null
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this, @typescript-eslint/require-await
  async getResolvedConfig(
    _doc: TextDocument,
    _vscodeConfig: PrettierVSCodeConfig,
  ): Promise<"error" | "disabled" | PrettierOptions | null> {
    // eslint-disable-next-line unicorn/no-null
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  dispose(): void {
    // nothing to do
  }
}
