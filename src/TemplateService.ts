import { TextEncoder } from "node:util";
import { Uri, workspace } from "vscode";
import type { LoggingService } from "./LoggingService.js";
import type { PrettierModule, PrettierOptions } from "./types.js";

export class TemplateService {
  private readonly loggingService: LoggingService;
  private readonly prettierModule: PrettierModule;

  constructor(loggingService: LoggingService, prettierModule: PrettierModule) {
    this.loggingService = loggingService;
    this.prettierModule = prettierModule;
  }

  public async writeConfigFile(folderPath: Uri): Promise<void> {
    const settings = { tabWidth: 2, useTabs: false };

    const outputPath = Uri.joinPath(folderPath, ".prettierrc");

    const formatterOptions: PrettierOptions = {
      filepath: outputPath.scheme === "file" ? outputPath.fsPath : undefined,
      tabWidth: settings.tabWidth,
      useTabs: settings.useTabs,
    };

    const templateSource = await this.prettierModule.format(
      JSON.stringify(settings, undefined, 2),
      formatterOptions,
    );

    this.loggingService.logInfo(`Writing .prettierrc to ${outputPath}`);
    await workspace.fs.writeFile(
      outputPath,
      new TextEncoder().encode(templateSource),
    );
  }
}
