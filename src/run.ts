import { createServer } from "vite";
import preact from "@preact/preset-vite";
import { orbitcodePlugin } from "./orbitcode-plugin.js";
import { virtualHtmlPlugin } from "./virtual-html.js";
import { exec } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";

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

/** Scan CSS files at the project root for bare @import specifiers (npm packages). */
function detectCssImports(root: string): string[] {
  const imports = new Set<string>();
  const importRe = /@import\s+["']([^./][^"']*)["']/g;
  for (const file of readdirSync(root)) {
    if (file.endsWith(".css")) {
      const contents = readFileSync(path.join(root, file), "utf-8");
      for (const match of contents.matchAll(importRe)) {
        imports.add(match[1]);
      }
    }
  }
  return [...imports];
}

/** Resolve a CSS package's entry file from orbit-cli's node_modules. */
function resolveCssEntry(pkg: string): string | null {
  const pkgDir = path.join(cliRoot, "node_modules", pkg);
  try {
    const pkgJson = JSON.parse(readFileSync(path.join(pkgDir, "package.json"), "utf-8"));
    // Check exports["."].style, then style field, then main
    const entry =
      pkgJson.exports?.["."]?.style ??
      pkgJson.style ??
      pkgJson.main;
    if (entry) {
      return path.join(pkgDir, entry);
    }
    // For packages like tailwindcss, the directory itself is enough
    return pkgDir;
  } catch {
    return null;
  }
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

  const plugins: import("vite").PluginOption[] = [
    virtualHtmlPlugin(preactPaths),
    orbitcodePlugin(),
    preact({ reactAliasesEnabled: false }),
  ];

  // Auto-detect CSS dependencies and resolve them from orbit-cli's node_modules
  const cssImports = detectCssImports(root);
  const cssAliases: Record<string, string> = {};
  const usesTailwind = cssImports.includes("tailwindcss");

  for (const pkg of cssImports) {
    const entry = resolveCssEntry(pkg);
    if (entry) {
      cssAliases[pkg] = entry;
    }
  }

  if (usesTailwind) {
    const tailwindcss = await import("@tailwindcss/vite");
    plugins.push(tailwindcss.default());
  }

  const server = await createServer({
    root,
    configFile: false,
    plugins,
    resolve: {
      alias: {
        "@/": root + "/",
        ...cssAliases,
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
