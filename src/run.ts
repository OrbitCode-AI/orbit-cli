import { createServer } from "vite";
import type { ProxyOptions } from "vite";
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

// Every URL prefix the production hosting worker serves. Anything under
// these paths gets proxied through vite to the backend so the browser
// hits localhost:5173 (first-party cookies) while the actual response
// comes from api.orbitcode.app (or a local wrangler override).
const BACKEND_PREFIXES = [
  "/provision",
  "/auth",
  "/room",
  "/cas",
  "/sync",
  "/publish",
  "/secrets",
  "/collab",
  "/favorites",
  "/templates",
  "/billing",
  "/stats",
  "/discover",
  "/dev",
  "/admin",
];

function buildBackendProxy(backendOrigin: string): Record<string, ProxyOptions> {
  const proxy: Record<string, ProxyOptions> = {};
  const secure = backendOrigin.startsWith("https:");
  for (const p of BACKEND_PREFIXES) {
    proxy[p] = {
      target: backendOrigin,
      changeOrigin: true,
      ws: true,
      secure,
    };
  }
  return proxy;
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

export async function startServer(root: string, entry: string = "App.tsx") {
  const backendOrigin = process.env.ORBIT_BACKEND_ORIGIN ?? "https://api.orbitcode.app";
  const backendProxy = buildBackendProxy(backendOrigin);

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
      proxy: backendProxy,
      fs: {
        allow: [root, cliRoot],
      },
    },
  });

  await server.listen();
  console.log(`[orbit] backend proxy → ${backendOrigin}`);
  server.printUrls();

  const url = server.resolvedUrls?.local[0];
  if (url) {
    exec(`open "${url}"`);
  }
}
