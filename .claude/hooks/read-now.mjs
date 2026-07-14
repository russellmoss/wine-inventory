#!/usr/bin/env node
// SessionStart hook: surface NOW.md (the working-set spine) into context on every
// session start / resume / clear, so a new session picks up exactly where the last
// one left off. Prints nothing (silent no-op) if NOW.md is absent.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const nowPath = join(root, "NOW.md");

if (!existsSync(nowPath)) process.exit(0);

const body = readFileSync(nowPath, "utf8").trim();
if (!body) process.exit(0);

process.stdout.write(
  "Current focus spine from NOW.md — this is where work stood at last checkpoint. " +
    "Resume from the Current objective; keep NOW.md current as work proceeds.\n\n" +
    body +
    "\n",
);
