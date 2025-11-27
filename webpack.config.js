const webpack = require("webpack");
const path = require("node:path");
const extensionPackage = require("./package.json");
const CopyPlugin = require("copy-webpack-plugin");

/** @type {import("webpack").Configuration} */
const config = {
  target: "node",
  entry: "./src/extension.ts",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "extension.js",
    libraryTarget: "commonjs2",
    /* cspell: disable-next-line */
    devtoolModuleFilenameTemplate: "../[resource-path]",
  },
  plugins: [
    new webpack.EnvironmentPlugin({
      EXTENSION_NAME: `${extensionPackage.publisher}.${extensionPackage.name}`,
      EXTENSION_VERSION: extensionPackage.version,
    }),
    new CopyPlugin({
      patterns: [{ from: "src/worker", to: "worker" }],
    }),
  ],
  /* cspell: disable-next-line */
  devtool: "source-map",
  externals: {
    vscode: "commonjs vscode",
    prettier: "commonjs prettier",
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "ts-loader",
          },
        ],
      },
      {
        // `vscode-nls-dev` loader rewrite nls-calls.
        loader: "vscode-nls-dev/lib/webpack-loader",
        options: {
          base: path.join(__dirname, "src"),
        },
      },
    ],
  },
};

const browserConfig = /** @type WebpackConfig */ {
  mode: "none",
  target: "webworker", // web extensions run in a webworker context
  entry: {
    "web-extension": "./src/extension.ts",
  },
  output: {
    filename: "[name].js",

    path: path.join(__dirname, "./dist"),
    libraryTarget: "commonjs",
  },
  resolve: {
    mainFields: ["module", "main"],
    extensions: [".ts", ".js", ".mjs"], // support ts-files and js-files
    alias: {
      // Replace the node based resolver with the browser version.
      "./ModuleResolver": "./BrowserModuleResolver",
    },
    fallback: {
      path: require.resolve("path-browserify"),

      util: require.resolve("util/"),
      os: false,
    },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "ts-loader",
          },
        ],
      },
    ],
  },
  externals: {
    vscode: "commonjs vscode", // ignored because it doesn't exist
  },
  performance: {
    hints: false,
  },
  devtool: "source-map",
  plugins: [
    new webpack.ProvidePlugin({
      process: "process/browser",
      babel: "prettier/esm/parser-babel.mjs",
    }),
    new webpack.DefinePlugin({
      "process.env": JSON.stringify({}),
      "process.env.BROWSER_ENV": JSON.stringify("true"),
    }),
  ],
};

module.exports = [config, browserConfig];
