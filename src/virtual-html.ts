import type { Plugin } from "vite";
import { existsSync } from "node:fs";
import path from "node:path";

const VIRTUAL_ENTRY_ID = "virtual:orbit-entry";
const RESOLVED_ENTRY_ID = "\0" + VIRTUAL_ENTRY_ID;

const VIRTUAL_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>OrbitCode App</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='40' fill='%234299e1'/><circle cx='50' cy='50' r='20' fill='white'/><circle cx='50' cy='50' r='8' fill='%234299e1'/></svg>">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body, #root { width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/@id/__x00__virtual:orbit-entry"></script>
</body>
</html>`;

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
            res.setHeader("Content-Type", "text/html");
            res.end(VIRTUAL_HTML);
            return;
          }
        }
        next();
      });
    },
  };
}
