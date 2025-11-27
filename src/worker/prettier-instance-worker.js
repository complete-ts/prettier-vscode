const { parentPort } = require("node:worker_threads");

const path2ModuleCache = new Map();

function requireInstance(modulePath) {
  let prettierInstance = path2ModuleCache.get(modulePath);
  if (!prettierInstance) {
    // eslint-disable-next-line import-x/no-dynamic-require
    prettierInstance = require(modulePath);
    if (!prettierInstance.format) {
      throw new Error("wrong instance");
    }
    path2ModuleCache.set(modulePath, prettierInstance);
  }
  return prettierInstance;
}

parentPort.on("message", ({ type, id, payload }) => {
  switch (type) {
    case "import": {
      const { modulePath } = payload;
      try {
        const prettierInstance = requireInstance(modulePath);
        parentPort.postMessage({
          type,
          id,
          payload: { version: prettierInstance.version },
        });
      } catch {
        parentPort.postMessage({
          type,
          id,
          // eslint-disable-next-line unicorn/no-null
          payload: { version: null },
        });
      }
      break;
    }

    case "callMethod": {
      const { modulePath, methodName, methodArgs } = payload;
      const postError = (error) => {
        parentPort.postMessage({
          type,
          id,
          payload: { result: error, isError: true },
        });
      };
      const postResult = (result) => {
        parentPort.postMessage({
          type,
          id,
          payload: { result, isError: false },
        });
      };
      let prettierInstance = path2ModuleCache.get(modulePath);
      if (!prettierInstance) {
        try {
          prettierInstance = requireInstance(modulePath);
        } catch (error) {
          postError(error);
        }
      }
      let result;
      try {
        result = prettierInstance[methodName](...methodArgs);
      } catch (error) {
        postError(error);
      }
      if (result instanceof Promise) {
        result.then(
          (value) => {
            try {
              // For prettier-vscode, `languages` are enough.
              if (methodName === "getSupportInfo") {
                // Remove functions from language objects to avoid DataCloneError.
                // eslint-disable-next-line no-param-reassign
                value = {
                  languages: value.languages.map((lang) => {
                    const cleanLang = {};
                    for (const [key, val] of Object.entries(lang)) {
                      if (typeof val !== "function") {
                        cleanLang[key] = val;
                      }
                    }
                    return cleanLang;
                  }),
                };
              }
              postResult(value);
            } catch (error) {
              postError(error);
            }
          },
          // eslint-disable-next-line @typescript-eslint/use-unknown-in-catch-callback-variable
          (error) => {
            postError(error);
          },
        );
        break;
      }
      try {
        // For prettier-vscode, `languages` are enough.
        if (methodName === "getSupportInfo") {
          // Remove functions from language objects to avoid DataCloneError.
          result = {
            languages: result.languages.map((lang) => {
              const cleanLang = {};
              for (const [key, val] of Object.entries(lang)) {
                if (typeof val !== "function") {
                  cleanLang[key] = val;
                }
              }
              return cleanLang;
            }),
          };
        }
        postResult(result);
      } catch (error) {
        postError(error);
      }
      break;
    }

    default: {
      break;
    }
  }
});
