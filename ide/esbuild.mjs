import { context, build } from "esbuild";

const isWatchMode = process.argv.includes("--watch");

const buildOptions = {
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.js",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  // `vscode` is provided by the extension host at runtime
  external: ["vscode"],
  alias: {
    "@": "./src",
    "@protocol": "../protocol/protocol.ts",
  },
  sourcemap: true,
  minify: false,
  logLevel: "info",
};

if (isWatchMode) {
  const watchContext = await context(buildOptions);
  await watchContext.watch();
} else {
  await build(buildOptions);
}
