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

interface WorkerMessage {
  type: "import" | "callMethod";
  id: number;
  payload: {
    isError: boolean;
    modulePath: string;
    result: unknown;
    version: string;
  };
}

let currentCallId = 0;

const worker = new Worker(
  url.pathToFileURL(
    path.join(import.meta.dirname, "/worker/prettier-instance-worker.js"),
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
  private readonly modulePath: string;

  constructor(modulePath: string) {
    this.modulePath = modulePath;

    worker.on("message", ({ type, id, payload }: WorkerMessage) => {
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
    const callId = currentCallId;
    currentCallId++;
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const result = await this.callMethod("format", [source, options]);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return result;
  }

  public async getSupportInfo({
    plugins,
  }: {
    plugins: Array<string | URL | PrettierPlugin>;
  }): Promise<{
    languages: PrettierSupportLanguage[];
  }> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const result = await this.callMethod("getSupportInfo", [{ plugins }]);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return result;
  }

  public async clearConfigCache(): Promise<void> {
    await this.callMethod("clearConfigCache", []);
  }

  public async getFileInfo(
    filePath: string,
    fileInfoOptions?: PrettierFileInfoOptions,
  ): Promise<PrettierFileInfoResult> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const result = await this.callMethod("getFileInfo", [
      filePath,
      fileInfoOptions,
    ]);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return result;
  }

  public async resolveConfigFile(filePath?: string): Promise<string | null> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const result = await this.callMethod("resolveConfigFile", [filePath]);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return result;
  }

  public async resolveConfig(
    fileName: string,
    options?: ResolveConfigOptions,
  ): Promise<Options> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const result = await this.callMethod("resolveConfig", [fileName, options]);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return result;
  }

  private async callMethod(
    methodName: string,
    methodArgs: readonly unknown[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    const callId = currentCallId;
    currentCallId++;
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
