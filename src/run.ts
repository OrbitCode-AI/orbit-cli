import { createServer } from "vite";
import preact from "@preact/preset-vite";
import { orbitcodePlugin } from "./orbitcode-plugin.js";
import { virtualHtmlPlugin } from "./virtual-html.js";
import { exec } from "node:child_process";

export async function startServer(root: string) {
  const server = await createServer({
    root,
    plugins: [
      virtualHtmlPlugin(),
      orbitcodePlugin(),
      preact(),
    ],
    resolve: {
      alias: {
        react: "preact/compat",
        "react-dom": "preact/compat",
      },
    },
    optimizeDeps: {
      include: [
        "preact",
        "preact/hooks",
        "preact/compat",
        "preact/debug",
        "preact/devtools",
        "@prefresh/core",
        "@prefresh/utils",
      ],
    },
  });

  await server.listen();
  server.printUrls();

  const url = server.resolvedUrls?.local[0];
  if (url) {
    exec(`open "${url}"`);
  }
}
