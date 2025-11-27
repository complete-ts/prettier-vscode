import { Worker } from "node:worker_threads";
import url from "node:url";
import path from "node:path";
import type {
  PrettierFileInfoOptions,
  PrettierFileInfoResult,
  PrettierOptions,
  PrettierPlugin,
  PrettierSupportLanguage,
} from "./types.js";
import type {
  PrettierInstance,
  PrettierInstanceConstructor,
} from "./PrettierInstance.js";
import type { ResolveConfigOptions, Options } from "prettier";

let currentCallId = 0;

const worker = new Worker(
  url.pathToFileURL(
    path.join(__dirname, "/worker/prettier-instance-worker.js"),
  ),
);

export const PrettierWorkerInstance: PrettierInstanceConstructor = class PrettierWorkerInstance
  implements PrettierInstance
{
  private readonly messageResolvers = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (value: unknown) => void;
    }
  >();

  // eslint-disable-next-line unicorn/no-null
  public version: string | null = null;
  private readonly modulePath: string

  constructor(modulePath: string) {
    this.modulePath = modulePath;

    worker.on("message", ({ type, id, payload }) => {
      const resolver = this.messageResolvers.get(id);
      if (resolver) {
        this.messageResolvers.delete(id);
        switch (type) {
          case "import": {
            resolver.resolve(payload.version);
            this.version = payload.version;
            break;
          }

          case "callMethod": {
            if (payload.isError) {
              resolver.reject(payload.result);
            } else {
              resolver.resolve(payload.result);
            }
            break;
          }
        }
      }
    });
  }

  public async import(): Promise</* version of imported prettier */ string> {
    const callId = currentCallId++;
    const promise = new Promise((resolve, reject) => {
      this.messageResolvers.set(callId, { resolve, reject });
    });
    worker.postMessage({
      type: "import",
      id: callId,
      payload: { modulePath: this.modulePath },
    });
    return await (promise as Promise<string>);
  }

  public async format(
    source: string,
    options?: PrettierOptions,
  ): Promise<string> {
    const result = await this.callMethod("format", [source, options]);
    return result;
  }

  public async getSupportInfo({
    plugins,
  }: {
    plugins: Array<string | PrettierPlugin>;
  }): Promise<{
    languages: PrettierSupportLanguage[];
  }> {
    const result = await this.callMethod("getSupportInfo", [{ plugins }]);
    return result;
  }

  public async clearConfigCache(): Promise<void> {
    await this.callMethod("clearConfigCache", []);
  }

  public async getFileInfo(
    filePath: string,
    fileInfoOptions?: PrettierFileInfoOptions,
  ): Promise<PrettierFileInfoResult> {
    const result = await this.callMethod("getFileInfo", [
      filePath,
      fileInfoOptions,
    ]);
    return result;
  }

  public async resolveConfigFile(filePath?: string): Promise<string | null> {
    const result = await this.callMethod("resolveConfigFile", [filePath]);
    return result;
  }

  public async resolveConfig(
    fileName: string,
    options?: ResolveConfigOptions,
  ): Promise<Options> {
    const result = await this.callMethod("resolveConfig", [fileName, options]);
    return result;
  }


  private async callMethod(
    methodName: string,
    methodArgs: unknown[],
  ): Promise<any> {
    const callId = currentCallId++;
    const promise = new Promise((resolve, reject) => {
      this.messageResolvers.set(callId, { resolve, reject });
    });
    worker.postMessage({
      type: "callMethod",
      id: callId,
      payload: {
        modulePath: this.modulePath,
        methodName,
        methodArgs,
      },
    });
    return await promise;
  }
};
