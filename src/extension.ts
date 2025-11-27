import type { ExtensionContext } from "vscode";
import { commands, extensions, window, workspace } from "vscode";
import { createConfigFile } from "./commands.js";
import { LoggingService } from "./LoggingService.js";
import { EXTENSION_DISABLED, RESTART_TO_ENABLE } from "./message.js";
import { ModuleResolver } from "./ModuleResolver.js";
import { PrettierEditService } from "./PrettierEditService.js";
import { StatusBar } from "./StatusBar.js";
import { TemplateService } from "./TemplateService.js";
import { getConfig } from "./util.js";

// The application insights key (also known as instrumentation key).
const extensionName = process.env["EXTENSION_NAME"] ?? "dev.prettier-vscode";
const extensionVersion = process.env["EXTENSION_VERSION"] ?? "0.0.0";

export function activate(context: ExtensionContext): void {
  const loggingService = new LoggingService();

  loggingService.logInfo(`Extension Name: ${extensionName}.`);
  loggingService.logInfo(`Extension Version: ${extensionVersion}.`);

  // Check if the official Prettier extension is also installed.
  const officialExtension = extensions.getExtension("esbenp.prettier-vscode");
  if (officialExtension) {
    const message =
      "Both the official Prettier extension (esbenp.prettier-vscode) and the community fork (complete.prettier-vscode-community) are installed. This will cause conflicts. Please uninstall one of them.";
    loggingService.logError(message);
    window
      .showErrorMessage(message, "Uninstall Official", "Uninstall Community")
      .then((selection) => {
        if (selection === "Uninstall Official") {
          commands.executeCommand(
            "workbench.extensions.uninstallExtension",
            "esbenp.prettier-vscode",
          );
        } else if (selection === "Uninstall Community") {
          commands.executeCommand(
            "workbench.extensions.uninstallExtension",
            "complete.prettier-vscode-community",
          );
        }
      });
    return;
  }

  const { enable, enableDebugLogs } = getConfig();

  if (enableDebugLogs) {
    loggingService.setOutputLevel("DEBUG");
  }

  if (!enable) {
    loggingService.logInfo(EXTENSION_DISABLED);
    context.subscriptions.push(
      workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("prettier.enable")) {
          loggingService.logWarning(RESTART_TO_ENABLE);
        }
      }),
    );
    return;
  }

  const moduleResolver = new ModuleResolver(loggingService);

  const templateService = new TemplateService(
    loggingService,
    moduleResolver.getGlobalPrettierInstance(),
  );

  const statusBar = new StatusBar();

  const editService = new PrettierEditService(
    moduleResolver,
    loggingService,
    statusBar,
  );
  editService
    .registerGlobal()
    .then(() => {
      const createConfigFileFunc = createConfigFile(templateService);
      const createConfigFileCommand = commands.registerCommand(
        "prettier.createConfigFile",
        createConfigFileFunc,
      );
      const openOutputCommand = commands.registerCommand(
        "prettier.openOutput",
        () => {
          loggingService.show();
        },
      );
      const forceFormatDocumentCommand = commands.registerCommand(
        "prettier.forceFormatDocument",
        editService.forceFormatDocument,
      );

      context.subscriptions.push(
        statusBar,
        editService,
        createConfigFileCommand,
        openOutputCommand,
        forceFormatDocumentCommand,
        ...editService.registerDisposables(),
      );
    })
    .catch((error: unknown) => {
      loggingService.logError("Error registering extension", error);
    });
}
