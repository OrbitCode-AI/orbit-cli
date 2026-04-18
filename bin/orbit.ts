#!/usr/bin/env node

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  switch (command) {
    case "clone":
      await clone(args[1]);
      break;
    case "run":
      await run(args.slice(1));
      break;
    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;
    default:
      if (!command) {
        printHelp();
      } else {
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
      }
  }
}

function printHelp() {
  console.log(`
orbit - CLI for running OrbitCode examples

Usage:
  orbit clone <name>           Clone an example from orbitcode-ai/<name>
  orbit run [--entry <file>]   Run the current directory as an OrbitCode app
                               (default entry: App.tsx)

Examples:
  orbit clone reveal           # Clone the reveal example
  cd reveal
  orbit run                    # Start the dev server
  orbit run --entry MyApp.tsx  # Use a different entry file
`);
}

async function clone(name: string | undefined) {
  if (!name) {
    console.error("Usage: orbit clone <name>");
    process.exit(1);
  }

  const repoUrl = `https://github.com/orbitcode-ai/${name}`;
  console.log(`Cloning ${repoUrl}...`);

  try {
    execSync(`git clone ${repoUrl}`, { stdio: "inherit" });
    console.log(`\nCloned into ${name}\n\nRun:\n  cd ${name}\n  orbit run`);
  } catch {
    console.error(`Failed to clone ${repoUrl}`);
    process.exit(1);
  }
}

async function run(runArgs: string[]) {
  const entry = parseEntry(runArgs);
  const cwd = process.cwd();
  const entryPath = path.join(cwd, entry);

  if (!existsSync(entryPath)) {
    console.error(`No ${entry} found in current directory`);
    process.exit(1);
  }

  const { startServer } = await import("../src/run.js");
  await startServer(cwd, entry);
}

function parseEntry(runArgs: string[]): string {
  for (let i = 0; i < runArgs.length; i++) {
    const a = runArgs[i];
    if (a === "--entry" || a === "-e") {
      const value = runArgs[i + 1];
      if (!value) {
        console.error(`${a} requires a filename`);
        process.exit(1);
      }
      return value;
    }
    if (a.startsWith("--entry=")) {
      return a.slice("--entry=".length);
    }
  }
  return "App.tsx";
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
