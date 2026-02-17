import type { Plugin } from "vite";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const VIRTUAL_ENTRY_ID = "virtual:orbit-entry";
const RESOLVED_ENTRY_ID = "\0" + VIRTUAL_ENTRY_ID;

interface OrbitConfig {
  name?: string;
  icon?: string;
  defaultTheme?: "dark" | "light";
}

function loadConfig(root: string): OrbitConfig {
  const configPath = path.join(root, "orbitcode.config.json");
  if (existsSync(configPath)) {
    try {
      return JSON.parse(readFileSync(configPath, "utf-8"));
    } catch {
      return {};
    }
  }
  return {};
}

function generateHtml(config: OrbitConfig, importMapJson: string): string {
  const title = config.name || "OrbitCode App";
  const icon = config.icon || "🪐";
  const bgColor = config.defaultTheme === "light" ? "#ffffff" : "#000000";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <script type="importmap">${importMapJson}</script>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text x='50' y='75' font-size='70' text-anchor='middle'>${icon}</text></svg>">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body, #root { width: 100%; height: 100%; background: ${bgColor}; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/@id/__x00__virtual:orbit-entry"></script>
</body>
</html>`;
}

const VIRTUAL_ENTRY = `
import 'preact/debug';
import { render, createElement } from 'preact/compat';
import App from '/App.tsx';
render(createElement(App), document.getElementById('root'));
`;

// Shim modules use bare specifiers so Vite resolves them through the
// same alias/optimization pipeline as all other modules (single instance).
const SHIM_MAP: Record<string, string> = {
  "react.js": `import * as mod from 'preact/compat'; export default mod; export * from 'preact/compat';`,
  "react-dom.js": `import * as mod from 'preact/compat'; export default mod; export * from 'preact/compat';`,
  "react-dom-client.js": `import * as mod from 'preact/compat'; export default mod; export * from 'preact/compat';`,
  "jsx-runtime.js": `export * from 'preact/jsx-runtime';`,
  "jsx-dev-runtime.js": `export * from 'preact/jsx-dev-runtime';`,
};

export function virtualHtmlPlugin(preactPaths: Record<string, string>): Plugin {
  let root: string;

  const importMap = JSON.stringify({
    imports: {
      "react": "/__orbit-shims/react.js",
      "react-dom": "/__orbit-shims/react-dom.js",
      "react-dom/client": "/__orbit-shims/react-dom-client.js",
      "react/jsx-runtime": "/__orbit-shims/jsx-runtime.js",
      "react/jsx-dev-runtime": "/__orbit-shims/jsx-dev-runtime.js",
    },
  });

  return {
    name: "virtual-html",
    enforce: "pre",

    configResolved(config) {
      root = config.root;
    },

    resolveId(id) {
      if (id === VIRTUAL_ENTRY_ID) {
        return RESOLVED_ENTRY_ID;
      }
      // Shim modules resolve to themselves so load() can handle them
      if (id.startsWith("/__orbit-shims/")) {
        return id;
      }
      return null;
    },

    load(id) {
      if (id === RESOLVED_ENTRY_ID) {
        return VIRTUAL_ENTRY;
      }
      // Return shim source with bare specifiers - Vite's transform
      // pipeline resolves them through the same aliases/optimization
      // as all other modules, ensuring a single preact instance.
      if (id.startsWith("/__orbit-shims/")) {
        const name = id.split("/").pop()!.split("?")[0];
        return SHIM_MAP[name] ?? null;
      }
      return null;
    },

    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        // Serve shims through Vite's transform pipeline
        if (req.url?.startsWith("/__orbit-shims/")) {
          const result = await server.transformRequest(req.url);
          if (result) {
            res.setHeader("Content-Type", "application/javascript");
            res.end(result.code);
            return;
          }
        }

        // Serve virtual index.html if none exists
        if (req.url === "/" || req.url === "/index.html") {
          const realHtml = path.join(root, "index.html");
          if (!existsSync(realHtml)) {
            const config = loadConfig(root);
            res.setHeader("Content-Type", "text/html");
            res.end(generateHtml(config, importMap));
            return;
          }
        }
        next();
      });
    },
  };
}
