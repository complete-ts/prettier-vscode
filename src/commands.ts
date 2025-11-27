import { window } from "vscode";
import type { TemplateService } from "./TemplateService.js";

export type CreateConfigFileFunction = () => Promise<void>;

export const createConfigFile =
  (templateService: TemplateService): CreateConfigFileFunction =>
  async () => {
    const folderResult = await window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
    });
    if (folderResult && folderResult.length === 1) {
      const folderURI = folderResult[0];
      if (folderURI !== undefined) {
        await templateService.writeConfigFile(folderURI);
      }
    }
  };
