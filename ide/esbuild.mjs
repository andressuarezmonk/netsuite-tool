import { context, build } from "esbuild";

const isWatchMode = process.argv.includes("--watch");

const sharedOptions = {
  bundle: true,
  target: "node20",
  alias: {
    "@": "./src",
    "@protocol": "../protocol/protocol.ts",
  },
  sourcemap: true,
  minify: false,
  logLevel: "info",
};

// The extension itself, running in the extension host (Node)
const extensionOptions = {
  ...sharedOptions,
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.js",
  platform: "node",
  format: "cjs",
  // `vscode` is provided by the extension host at runtime
  external: ["vscode"],
};

// The week grid, running inside the webview (a browser context)
const webviewOptions = {
  ...sharedOptions,
  entryPoints: ["src/webview/main.ts"],
  outfile: "dist/webview.js",
  platform: "browser",
  format: "iife",
  target: "es2022",
};

if (isWatchMode) {
  const contexts = await Promise.all([
    context(extensionOptions),
    context(webviewOptions),
  ]);
  await Promise.all(contexts.map((watchContext) => watchContext.watch()));
} else {
  await Promise.all([build(extensionOptions), build(webviewOptions)]);
}
