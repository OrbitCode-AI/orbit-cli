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

function generateHtml(config: OrbitConfig): string {
  const title = config.name || "OrbitCode App";
  const icon = config.icon || "🪐";
  const bgColor = config.defaultTheme === "light" ? "#ffffff" : "#000000";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
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
import { render, h } from 'preact';
import App from '/App.tsx';
render(h(App), document.getElementById('root'));
`;

export function virtualHtmlPlugin(): Plugin {
  let root: string;

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
      return null;
    },

    load(id) {
      if (id === RESOLVED_ENTRY_ID) {
        return VIRTUAL_ENTRY;
      }
      return null;
    },

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Serve virtual index.html if none exists
        if (req.url === "/" || req.url === "/index.html") {
          const realHtml = path.join(root, "index.html");
          if (!existsSync(realHtml)) {
            const config = loadConfig(root);
            res.setHeader("Content-Type", "text/html");
            res.end(generateHtml(config));
            return;
          }
        }
        next();
      });
    },
  };
}
