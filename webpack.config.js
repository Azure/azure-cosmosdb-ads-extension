//@ts-check

"use strict";

const path = require("path");
const webpack = require("webpack");

/**@type {import('webpack').Configuration}*/
const config = {
  target: "node", // vscode extensions run in webworker context for VS Code web 📖 -> https://webpack.js.org/configuration/target/#target

  entry: "./src/extension.ts", // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
  output: {
    // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
    path: path.resolve(__dirname, "dist"),
    filename: "extension.js",
    libraryTarget: "commonjs2",
    devtoolModuleFilenameTemplate: "../[resource-path]",
  },
  devtool: "source-map",
  externals: {
    vscode: "commonjs vscode", // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
    azdata: "commonjs vscode",
    // fs: 'commonjs fs',
    // child_process: 'commonjs child_process',
    // os: 'commonjs os',
    // net: 'commonjs net',
    // dns: 'commonjs dns',
    // tls: 'commonjs tls',
    // http: 'commonjs http',
    // https: 'commonjs https',
    // 'mongodb-client-encryption': 'commonjs mongodb',
    // snappy: 'commonjs mongodb',
    // kerberos: 'commonjs mongodb',
    // 'bson-ext': 'commonjs mongodb',
    // 'snappy/package.json': 'commonjs mongodb',
    // 'DOMParser': 'commonjs jsdom'
  },
  resolve: {
    // support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
    mainFields: ["browser", "module", "main"], // look for `browser` entry point in imported node modules
    extensions: [".ts", ".js"],
    alias: {
      // provides alternate implementation for node module and source files
      'fetch-shim': path.resolve(__dirname, './src/fetch-shim')
    },
    fallback: {
      // Webpack 5 no longer polyfills Node.js core modules automatically.
      // see https://webpack.js.org/configuration/resolve/#resolvefallback
      // for the list of Node.js core module polyfills.
      // "crypto": require.resolve("crypto-browserify"),
      // "stream": require.resolve("stream-browserify"),
      // "zlib": require.resolve("browserify-zlib"),
      // "path": require.resolve("path-browserify"),
      // "DOMParser": false
      // "DOMParser": require.resolve("jsdom"),
      // "fs": false,
      // "child_process": false,
      // "os": false,
      // "net": false,
      // "dns": false,
      // "tls": false,
      // "http": false,
      // "https": false,
      "bson-ext": false,
      "mongodb-client-encryption": false,
      snappy: false,
      "snappy/package.json": false,
      kerberos: false,
      "abort-controller": false
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
  plugins: [
    new webpack.DefinePlugin({
      'global.fetch': {}
    }),
    new webpack.ProvidePlugin({
      fetch: ['fetch-shim', 'default']
    })
  ]
};
module.exports = config;
