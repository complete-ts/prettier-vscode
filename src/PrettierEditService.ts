import type {
  Disposable,
  DocumentFilter,
  TextDocument,
  TextEditor,
  Uri,
} from "vscode";
import { languages, Range, TextEdit, window, workspace } from "vscode";
import { getParserFromLanguageId } from "./languageFilters.js";
import type { LoggingService } from "./LoggingService.js";
import { RESTART_TO_ENABLE } from "./message.js";
import { PrettierEditProvider } from "./PrettierEditProvider.js";
import type { PrettierInstance } from "./PrettierInstance.js";
import type { StatusBar } from "./StatusBar.js";
import type {
  ExtensionFormattingOptions,
  ModuleResolverInterface,
  PrettierBuiltInParserName,
  PrettierFileInfoResult,
  PrettierModule,
  PrettierOptions,
  PrettierPlugin,
  RangeFormattingOptions,
} from "./types.js";
import { getConfig, isAboveV3 } from "./util.js";
import { FormatterStatus } from "./FormatterStatus.js";

interface ISelectors {
  rangeLanguageSelector: readonly DocumentFilter[];
  languageSelector: readonly DocumentFilter[];
}

/** Prettier reads configuration from files. */
const PRETTIER_CONFIG_FILES = [
  ".prettierrc",
  ".prettierrc.json",
  ".prettierrc.json5",
  ".prettierrc.yaml",
  ".prettierrc.yml",
  ".prettierrc.toml",
  ".prettierrc.js",
  ".prettierrc.cjs",
  ".prettierrc.mjs",
  "package.json",
  "prettier.config.js",
  "prettier.config.cjs",
  "prettier.config.mjs",
  ".editorconfig",
] as const;

export class PrettierEditService implements Disposable {
  private formatterHandler: undefined | Disposable;
  private rangeFormatterHandler: undefined | Disposable;
  private readonly registeredWorkspaces = new Set<string>();

  private allLanguages: string[] = [];
  private allExtensions: string[] = [];
  private readonly allRangeLanguages: string[] = [
    "javascript",
    "javascriptreact",
    "typescript",
    "typescriptreact",
    "json",
    "jsonc",
    "graphql",
  ];

  private readonly moduleResolver: ModuleResolverInterface;
  private readonly loggingService: LoggingService;
  private readonly statusBar: StatusBar;

  constructor(
    moduleResolver: ModuleResolverInterface,
    loggingService: LoggingService,
    statusBar: StatusBar,
  ) {
    this.moduleResolver = moduleResolver;
    this.loggingService = loggingService;
    this.statusBar = statusBar;
  }

  public registerDisposables(): readonly Disposable[] {
    const packageWatcher = workspace.createFileSystemWatcher("**/package.json");
    packageWatcher.onDidChange(this.resetFormatters);
    packageWatcher.onDidCreate(this.resetFormatters);
    packageWatcher.onDidDelete(this.resetFormatters);

    const configurationWatcher = workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("prettier.enable")) {
        this.loggingService.logWarning(RESTART_TO_ENABLE);
      } else if (event.affectsConfiguration("prettier")) {
        this.resetFormatters();
      }
    });

    const prettierConfigWatcher = workspace.createFileSystemWatcher(
      `**/{${PRETTIER_CONFIG_FILES.join(",")}}`,
    );
    prettierConfigWatcher.onDidChange(this.prettierConfigChanged);
    prettierConfigWatcher.onDidCreate(this.prettierConfigChanged);
    prettierConfigWatcher.onDidDelete(this.prettierConfigChanged);

    const textEditorChange = window.onDidChangeActiveTextEditor(
      this.handleActiveTextEditorChangedSync,
    );

    this.handleActiveTextEditorChangedSync(window.activeTextEditor);

    return [
      packageWatcher,
      configurationWatcher,
      prettierConfigWatcher,
      textEditorChange,
    ];
  }

  public forceFormatDocument = async (): Promise<void> => {
    try {
      const editor = window.activeTextEditor;
      if (!editor) {
        this.loggingService.logInfo(
          "No active document. Nothing was formatted.",
        );
        return;
      }

      this.loggingService.logInfo(
        "Forced formatting will not use ignore files.",
      );

      const edits = await this.provideEdits(editor.document, { force: true });
      if (edits.length !== 1) {
        return;
      }

      await editor.edit((editBuilder) => {
        const edit = edits[0];
        if (edit !== undefined) {
          editBuilder.replace(edit.range, edit.newText);
        }
      });
    } catch (error) {
      this.loggingService.logError("Error formatting document", error);
    }
  };

  private readonly prettierConfigChanged = (uri: Uri) => {
    this.resetFormatters(uri);
  };

  private readonly resetFormatters = (uri?: Uri) => {
    if (uri) {
      const workspaceFolder = workspace.getWorkspaceFolder(uri);
      this.registeredWorkspaces.delete(workspaceFolder?.uri.fsPath ?? "global");
    } else {
      // VS Code config change, reset everything.
      this.registeredWorkspaces.clear();
    }
    this.statusBar.update(FormatterStatus.Ready);
  };

  private readonly handleActiveTextEditorChangedSync = (
    textEditor: TextEditor | undefined,
  ) => {
    this.handleActiveTextEditorChanged(textEditor).catch((error: unknown) => {
      this.loggingService.logError("Error handling text editor change", error);
    });
  };

  private readonly handleActiveTextEditorChanged = async (
    textEditor: TextEditor | undefined,
  ) => {
    if (!textEditor) {
      this.statusBar.hide();
      return;
    }
    const { document } = textEditor;

    if (document.uri.scheme !== "file") {
      // We set as ready for untitled documents, but return because these will always use the global
      // registered formatter.
      this.statusBar.update(FormatterStatus.Ready);
      return;
    }
    const workspaceFolder = workspace.getWorkspaceFolder(document.uri);

    if (!workspaceFolder) {
      // Do nothing, this is only for registering formatters in workspace folder.
      return;
    }

    const prettierInstance = await this.moduleResolver.getPrettierInstance(
      workspaceFolder.uri.fsPath,
    );

    const isRegistered = this.registeredWorkspaces.has(
      workspaceFolder.uri.fsPath,
    );

    // If there isn't an instance here, it is because the module could not be loaded either locally
    // or globally when specified.
    if (!prettierInstance) {
      this.statusBar.update(FormatterStatus.Error);
      return;
    }

    const selectors = await this.getSelectors(
      prettierInstance,
      document.uri,
      workspaceFolder.uri,
    );

    this.statusBar.updateConfig({
      selector: selectors.languageSelector,
    });

    if (!isRegistered) {
      this.registerDocumentFormatEditorProviders(selectors);
      this.registeredWorkspaces.add(workspaceFolder.uri.fsPath);
      this.loggingService.logDebug(
        `Enabling Prettier for Workspace ${workspaceFolder.uri.fsPath}`,
        selectors,
      );
    }

    const score = languages.match(selectors.languageSelector, document);
    if (score > 0) {
      this.statusBar.update(FormatterStatus.Ready);
    } else {
      this.statusBar.update(FormatterStatus.Disabled);
    }
  };

  public async registerGlobal(): Promise<void> {
    const selectors = await this.getSelectors(
      this.moduleResolver.getGlobalPrettierInstance(),
    );
    this.registerDocumentFormatEditorProviders(selectors);
    this.loggingService.logDebug("Enabling Prettier globally", selectors);
  }

  public dispose = (): void => {
    this.moduleResolver.dispose();
    this.formatterHandler?.dispose();
    this.rangeFormatterHandler?.dispose();
    this.formatterHandler = undefined;
    this.rangeFormatterHandler = undefined;
  };

  private registerDocumentFormatEditorProviders({
    languageSelector,
    rangeLanguageSelector,
  }: ISelectors) {
    this.dispose();
    const editProvider = new PrettierEditProvider(this.provideEdits);
    this.rangeFormatterHandler =
      languages.registerDocumentRangeFormattingEditProvider(
        rangeLanguageSelector,
        editProvider,
      );
    this.formatterHandler = languages.registerDocumentFormattingEditProvider(
      languageSelector,
      editProvider,
    );
  }

  /** Build formatter selectors */
  private readonly getSelectors = async (
    prettierInstance: PrettierModule | PrettierInstance,
    documentUri?: Uri,
    workspaceFolderURI?: Uri,
  ): Promise<ISelectors> => {
    const plugins: Array<string | URL | PrettierPlugin> = [];

    // Prettier v3 does not load plugins automatically So need to resolve config to get plugins
    // info.
    if (
      documentUri &&
      "resolveConfig" in prettierInstance &&
      isAboveV3(prettierInstance.version)
    ) {
      const resolvedConfig = await this.moduleResolver.resolveConfig(
        prettierInstance,
        documentUri,
        documentUri.fsPath,
        getConfig(documentUri),
      );
      if (resolvedConfig === "error") {
        this.statusBar.update(FormatterStatus.Error);
      } else if (resolvedConfig === "disabled") {
        this.statusBar.update(FormatterStatus.Disabled);
      } else if (resolvedConfig?.plugins) {
        plugins.push(...resolvedConfig.plugins);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-shadow
    const { languages } = await prettierInstance.getSupportInfo({
      plugins,
    });

    for (const language of languages) {
      if (language.vscodeLanguageIds) {
        this.allLanguages.push(...language.vscodeLanguageIds);
      }
    }
    this.allLanguages = this.allLanguages.filter(
      // eslint-disable-next-line complete/prefer-readonly-parameter-types
      (value, index, self) => self.indexOf(value) === index,
    );

    for (const language of languages) {
      if (language.extensions) {
        this.allExtensions.push(...language.extensions);
      }
    }
    this.allExtensions = this.allExtensions.filter(
      // eslint-disable-next-line complete/prefer-readonly-parameter-types
      (value, index, self) => self.indexOf(value) === index,
    );

    const { documentSelectors } = getConfig();

    // Language selector for file extensions.
    // eslint-disable-next-line no-nested-ternary
    const extensionLanguageSelector: DocumentFilter[] =
      workspaceFolderURI === undefined
        ? []
        : this.allExtensions.length === 0
          ? []
          : [
              {
                pattern: `${workspaceFolderURI.fsPath}/**/*.{${this.allExtensions
                  .map((e) => e.slice(1))
                  .join(",")}}`,
                scheme: "file",
              },
            ];

    const customLanguageSelectors: DocumentFilter[] = workspaceFolderURI
      ? documentSelectors.map((pattern) => ({
          pattern: `${workspaceFolderURI.fsPath}/${pattern}`,
          scheme: "file",
        }))
      : [];

    const defaultLanguageSelectors: DocumentFilter[] = [
      ...this.allLanguages.map((language) => ({ language })),
      { language: "jsonc", scheme: "vscode-userdata" }, // Selector for VSCode settings.json
    ];

    const languageSelector = [
      ...customLanguageSelectors,
      ...extensionLanguageSelector,
      ...defaultLanguageSelectors,
    ];

    const rangeLanguageSelector: DocumentFilter[] = this.allRangeLanguages.map(
      (language) => ({
        language,
      }),
    );
    return { languageSelector, rangeLanguageSelector };
  };

  private readonly provideEdits = async (
    document: TextDocument,
    options: ExtensionFormattingOptions,
  ): Promise<TextEdit[]> => {
    const startTime = Date.now();
    const result = await this.format(document.getText(), document, options);
    if (result === undefined) {
      // No edits happened, return never so VS Code can try other formatters.
      return [];
    }
    const duration = Date.now() - startTime;
    this.loggingService.logInfo(`Formatting completed in ${duration}ms.`);
    const edit = this.minimalEdit(document, result);
    return [edit];
  };

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  private minimalEdit(document: TextDocument, string1: string) {
    const string0 = document.getText();
    // Length of common prefix.
    let i = 0;
    while (
      i < string0.length &&
      i < string1.length &&
      string0[i] === string1[i]
    ) {
      i++;
    }
    // Length of common suffix.
    let j = 0;
    while (
      i + j < string0.length &&
      i + j < string1.length &&
      string0[string0.length - j - 1] === string1[string1.length - j - 1]
    ) {
      j++;
    }
    const newText = string1.slice(i, string1.length - j);
    const pos0 = document.positionAt(i);
    const pos1 = document.positionAt(string0.length - j);

    return TextEdit.replace(new Range(pos0, pos1), newText);
  }

  /** Format the given text with user's configuration. */
  private async format(
    text: string,
    doc: TextDocument,
    options: ExtensionFormattingOptions,
  ): Promise<string | undefined> {
    const { fileName, uri, languageId } = doc;

    this.loggingService.logInfo(`Formatting ${uri}`);

    const vscodeConfig = getConfig(doc);

    const resolvedConfig = await this.moduleResolver.getResolvedConfig(
      doc,
      vscodeConfig,
    );
    if (resolvedConfig === "error") {
      this.statusBar.update(FormatterStatus.Error);
      return;
    }
    if (resolvedConfig === "disabled") {
      this.statusBar.update(FormatterStatus.Disabled);
      return;
    }

    const prettierInstance =
      await this.moduleResolver.getPrettierInstance(fileName);
    this.loggingService.logInfo("PrettierInstance:", prettierInstance);

    if (!prettierInstance) {
      this.loggingService.logError(
        "Prettier could not be loaded. See previous logs for more information.",
      );
      this.statusBar.update(FormatterStatus.Error);
      return;
    }

    let resolvedIgnorePath: string | undefined;
    if (vscodeConfig.ignorePath !== "") {
      resolvedIgnorePath = await this.moduleResolver.getResolvedIgnorePath(
        fileName,
        vscodeConfig.ignorePath,
      );
      if (resolvedIgnorePath !== undefined) {
        this.loggingService.logInfo(
          `Using ignore file (if present) at ${resolvedIgnorePath}`,
        );
      }
    }

    let fileInfo: PrettierFileInfoResult | undefined;
    if (fileName !== "") {
      fileInfo = await prettierInstance.getFileInfo(fileName, {
        ignorePath: resolvedIgnorePath,
        plugins: resolvedConfig?.plugins?.filter(
          (item): item is string => typeof item === "string",
        ),
        resolveConfig: true,
        withNodeModules: vscodeConfig.withNodeModules,
      });
      this.loggingService.logInfo("File Info:", fileInfo);
    }

    if (!options.force && fileInfo && fileInfo.ignored) {
      this.loggingService.logInfo("File is ignored, skipping.");
      this.statusBar.update(FormatterStatus.Ignore);
      return;
    }

    let parser: PrettierBuiltInParserName | undefined;
    if (fileInfo && typeof fileInfo.inferredParser === "string") {
      parser = fileInfo.inferredParser;
    } else if (languageId !== "plaintext") {
      // Don't attempt VS Code language for plaintext because we never have a formatter for
      // plaintext and most likely the reason for this is somebody has registered a custom file
      // extension without properly configuring the parser in their prettier config.
      this.loggingService.logWarning(
        "Parser not inferred, trying VS Code language.",
      );
      // eslint-disable-next-line @typescript-eslint/no-shadow
      const { languages } = await prettierInstance.getSupportInfo({
        plugins: [],
      });
      parser = getParserFromLanguageId(languages, uri, languageId);
    }

    if (parser === undefined) {
      this.loggingService.logError(
        "Failed to resolve a parser, skipping file. If you registered a custom file extension, be sure to configure the parser.",
      );
      this.statusBar.update(FormatterStatus.Error);
      return;
    }

    const prettierOptions = this.getPrettierOptions(
      fileName,
      parser,
      vscodeConfig,
      resolvedConfig,
      options,
    );

    this.loggingService.logInfo("Prettier Options:", prettierOptions);

    try {
      // Since Prettier v3, `format` returns Promise.
      const formattedText = await prettierInstance.format(
        text,
        prettierOptions,
      );
      this.statusBar.update(FormatterStatus.Success);

      return formattedText;
    } catch (error) {
      this.loggingService.logError("Error formatting document.", error);
      this.statusBar.update(FormatterStatus.Error);

      return text;
    }
  }

  private getPrettierOptions(
    fileName: string,
    parser: PrettierBuiltInParserName,
    vsCodeConfig: PrettierOptions,
    configOptions: PrettierOptions | null,
    extensionFormattingOptions: ExtensionFormattingOptions,
  ): Partial<PrettierOptions> {
    const fallbackToVSCodeConfig = configOptions === null;

    const vsOpts: PrettierOptions = {};
    if (fallbackToVSCodeConfig) {
      vsOpts.arrowParens = vsCodeConfig.arrowParens;
      vsOpts.bracketSpacing = vsCodeConfig.bracketSpacing;
      vsOpts.endOfLine = vsCodeConfig.endOfLine;
      vsOpts.htmlWhitespaceSensitivity = vsCodeConfig.htmlWhitespaceSensitivity;
      vsOpts.insertPragma = vsCodeConfig.insertPragma;
      vsOpts.singleAttributePerLine = vsCodeConfig.singleAttributePerLine;
      vsOpts.bracketSameLine = vsCodeConfig.bracketSameLine;
      vsOpts.jsxSingleQuote = vsCodeConfig.jsxSingleQuote;
      vsOpts.printWidth = vsCodeConfig.printWidth;
      vsOpts.proseWrap = vsCodeConfig.proseWrap;
      vsOpts.quoteProps = vsCodeConfig.quoteProps;
      vsOpts.requirePragma = vsCodeConfig.requirePragma;
      vsOpts.semi = vsCodeConfig.semi;
      vsOpts.singleQuote = vsCodeConfig.singleQuote;
      vsOpts.tabWidth = vsCodeConfig.tabWidth;
      vsOpts.trailingComma = vsCodeConfig.trailingComma;
      vsOpts.useTabs = vsCodeConfig.useTabs;
      vsOpts.embeddedLanguageFormatting =
        vsCodeConfig.embeddedLanguageFormatting;
      vsOpts.vueIndentScriptAndStyle = vsCodeConfig.vueIndentScriptAndStyle;
      vsOpts.experimentalTernaries = vsCodeConfig.experimentalTernaries;
    }

    this.loggingService.logInfo(
      fallbackToVSCodeConfig
        ? "No local configuration (i.e. .prettierrc or .editorconfig) detected, falling back to VS Code configuration"
        : "Detected local configuration (i.e. .prettierrc or .editorconfig), VS Code configuration will not be used",
    );

    let rangeFormattingOptions: RangeFormattingOptions | undefined;
    if (
      extensionFormattingOptions.rangeEnd !== undefined &&
      extensionFormattingOptions.rangeStart !== undefined
    ) {
      rangeFormattingOptions = {
        rangeEnd: extensionFormattingOptions.rangeEnd,
        rangeStart: extensionFormattingOptions.rangeStart,
      };
    }

    const options: PrettierOptions = {
      ...(fallbackToVSCodeConfig ? vsOpts : {}),

      filepath: fileName,
      parser,
      ...rangeFormattingOptions,
      ...configOptions,
    };

    if (extensionFormattingOptions.force && options.requirePragma === true) {
      options.requirePragma = false;
    }

    return options;
  }
}
