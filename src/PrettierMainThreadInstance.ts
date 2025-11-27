import type { FileInfoOptions, Options, ResolveConfigOptions } from "prettier";
import type {
  PrettierInstance,
  PrettierInstanceConstructor,
} from "./PrettierInstance.js";
import type {
  PrettierFileInfoResult,
  PrettierPlugin,
  PrettierSupportLanguage,
} from "./types.js";
import type { PrettierNodeModule } from "./ModuleResolver.js";
import { loadNodeModule } from "./ModuleLoader.js";

export const PrettierMainThreadInstance: PrettierInstanceConstructor = class PrettierMainThreadInstance
  implements PrettierInstance
{
  // eslint-disable-next-line unicorn/no-null
  public version: string | null = null;
  private prettierModule: PrettierNodeModule | undefined;
  private readonly modulePath: string;

  constructor(modulePath: string) {
    this.modulePath = modulePath;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public async import(): Promise</* version of imported prettier */ string> {
    this.prettierModule = loadNodeModule(this.modulePath);

    // eslint-disable-next-line unicorn/no-null
    this.version = this.prettierModule?.version ?? null;
    if (this.version === null) {
      throw new Error(`Failed to load Prettier instance: ${this.modulePath}`);
    }

    return this.version;
  }

  public async format(source: string, options?: Options): Promise<string> {
    if (this.prettierModule === undefined) {
      await this.import();
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return await this.prettierModule!.format(source, options);
  }

  public async getFileInfo(
    filePath: string,
    fileInfoOptions?: FileInfoOptions,
  ): Promise<PrettierFileInfoResult> {
    if (!this.prettierModule) {
      await this.import();
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return await this.prettierModule!.getFileInfo(filePath, fileInfoOptions);
  }

  public async getSupportInfo({
    plugins,
  }: {
    plugins: Array<string | URL | PrettierPlugin>;
  }): Promise<{
    languages: PrettierSupportLanguage[];
  }> {
    if (this.prettierModule === undefined) {
      await this.import();
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return await this.prettierModule!.getSupportInfo({ plugins });
  }

  public async clearConfigCache(): Promise<void> {
    if (this.prettierModule === undefined) {
      await this.import();
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await this.prettierModule!.clearConfigCache();
  }

  public async resolveConfigFile(filePath?: string): Promise<string | null> {
    if (this.prettierModule === undefined) {
      await this.import();
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return await this.prettierModule!.resolveConfigFile(filePath);
  }

  public async resolveConfig(
    fileName: string,
    options?: ResolveConfigOptions,
  ): Promise<Options | null> {
    if (this.prettierModule === undefined) {
      await this.import();
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return await this.prettierModule!.resolveConfig(fileName, options);
  }
};
