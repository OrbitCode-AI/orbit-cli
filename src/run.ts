import { createServer } from "vite";
import preact from "@preact/preset-vite";
import { orbitcodePlugin } from "./orbitcode-plugin.js";
import { virtualHtmlPlugin } from "./virtual-html.js";
import { exec } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cliRoot = path.resolve(__dirname, "../..");

const require = createRequire(import.meta.url);

// Resolve the ESM ("module") entry point for a preact subpackage
function resolveEsm(pkg: string): string {
  const pkgJsonPath = require.resolve(pkg + "/package.json");
  const pkgDir = path.dirname(pkgJsonPath);
  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
  return path.join(pkgDir, pkgJson.module);
}

export async function startServer(root: string) {
  const preactPaths = {
    "preact": resolveEsm("preact"),
    "preact/compat": resolveEsm("preact/compat"),
    "preact/hooks": resolveEsm("preact/hooks"),
    "preact/jsx-runtime": resolveEsm("preact/jsx-runtime"),
    "preact/jsx-dev-runtime": resolveEsm("preact/jsx-runtime"), // shares same module
    "preact/debug": resolveEsm("preact/debug"),
    "preact/devtools": resolveEsm("preact/devtools"),
  };

  const server = await createServer({
    root,
    plugins: [
      virtualHtmlPlugin(preactPaths),
      orbitcodePlugin(),
      preact({ reactAliasesEnabled: false }),
    ],
    resolve: {
      alias: {
        "@/": root + "/",
        "react/jsx-runtime": preactPaths["preact/jsx-runtime"],
        "react/jsx-dev-runtime": preactPaths["preact/jsx-dev-runtime"],
        "react-dom/client": preactPaths["preact/compat"],
        "react-dom/test-utils": preactPaths["preact/compat"],
        "react-dom": preactPaths["preact/compat"],
        "react": preactPaths["preact/compat"],
        "preact/jsx-runtime": preactPaths["preact/jsx-runtime"],
        "preact/jsx-dev-runtime": preactPaths["preact/jsx-dev-runtime"],
        "preact/hooks": preactPaths["preact/hooks"],
        "preact/compat": preactPaths["preact/compat"],
        "preact/debug": preactPaths["preact/debug"],
        "preact/devtools": preactPaths["preact/devtools"],
        "preact": preactPaths["preact"],
      },
    },
    server: {
      fs: {
        allow: [root, cliRoot],
      },
    },
  });

  await server.listen();
  server.printUrls();

  const url = server.resolvedUrls?.local[0];
  if (url) {
    exec(`open "${url}"`);
  }
}
