import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { orbitcodePlugin } from "./orbitcode-plugin.js";
import { virtualHtmlPlugin } from "./virtual-html.js";
import { exec } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cliRoot = path.resolve(__dirname, "../..");

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

export async function startServer(root: string, entry: string = "App.tsx") {
  const plugins: import("vite").PluginOption[] = [
    virtualHtmlPlugin(entry),
    orbitcodePlugin(),
    react(),
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
