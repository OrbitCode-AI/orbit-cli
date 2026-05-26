# orbit-cli

Run [OrbitCode](https://orbitcode.ai) apps locally with your own IDE.

## Install

```bash
git clone https://github.com/OrbitCode-AI/orbit-cli.git
cd orbit-cli && npm install && npm link
```

## Example

```bash
orbit clone orbitcode-logo
cd orbitcode-logo
orbit run
```

Opens http://localhost:5173 with HMR.

By default `orbit run` looks for `App.tsx`. Use `--entry` to point at a different file:

```bash
orbit run --entry MyApp.tsx
```

## Publish

Once your app runs locally, share it with a real URL:

```bash
orbit publish --name my-app
```

This:

1. Runs `vite build` to produce `dist/`.
2. Opens your browser to sign in (one-time per publish — Google OAuth via orbitcode.ai).
3. Uploads the bundle as git-format objects to the publish worker.
4. Prints the canonical URL (content-addressed) and your `my-app.{zone}` alias.

By default this publishes to the staging zone (`api.llama.space`). Pass `--prod`
to publish to `api.myth.work` instead:

```bash
orbit publish --name my-app --prod
```

Other flags:

- `--api <url>` — point at a different worker (e.g. local wrangler dev).
- `ORBIT_API_URL` / `ORBIT_AUTH_URL` env vars work too.

Token storage is in-memory per invocation. Each publish runs the browser
handshake fresh — no on-disk cache (yet).
