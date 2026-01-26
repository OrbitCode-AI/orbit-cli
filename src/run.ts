import { createServer } from "vite";
import preact from "@preact/preset-vite";
import { orbitcodePlugin } from "./orbitcode-plugin.js";
import { virtualHtmlPlugin } from "./virtual-html.js";

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
    server: {
      open: true,
    },
  });

  await server.listen();
  server.printUrls();
}
