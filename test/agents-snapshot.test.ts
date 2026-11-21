import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Engine, startEngine } from "../src/engine.js";

// Issue 28: removing pipelines must not change what Motherboard (`GET /agents`) gets for main sessions and
// background agents. test/fixtures/agents-snapshot.json was generated once, on the code before the
// removal, from the desks fixtures WITHOUT a workflow folder (main session s-desk-1 and background agent bg1). It is
// never regenerated or edited by hand. This file sets up its own logs, so it runs unchanged on the older code too.
const FIXTURES = join(import.meta.dirname, "fixtures");
const SNAPSHOT = join(FIXTURES, "agents-snapshot.json");
const SESSION = "s-desk-1";
const NOW = Date.parse("2026-10-29T09:05:00.000Z");

let base = "";
let engine: Engine | null = null;

const fixture = (name: string) =>
  readFileSync(join(FIXTURES, "desks", name), "utf8").replaceAll('"/work/', `"${base}/`);

beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), "lens-snapshot-")));
  const project = join(base, "logs", "-work-shop-app");
  const subagents = join(project, SESSION, "subagents");
  mkdirSync(subagents, { recursive: true });
  for (const repo of ["shop-app", "docs-site"]) mkdirSync(join(base, repo, ".git"), { recursive: true });
  writeFileSync(join(project, `${SESSION}.jsonl`), fixture("session.jsonl"));
  writeFileSync(join(subagents, "agent-bg1.jsonl"), fixture("agent-bg1.jsonl"));
  writeFileSync(join(subagents, "agent-bg1.meta.json"), fixture("agent-bg1.meta.json"));
});
afterEach(() => {
  engine?.stop();
  engine = null;
  rmSync(base, { recursive: true, force: true });
});

const until = async (check: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!check() && Date.now() < end) await new Promise((r) => setTimeout(r, 25));
  return check();
};

describe("main sessions and background agents look the same as before pipelines were removed", () => {
  it("GET /agents gives exactly the snapshot", async () => {
    engine = startEngine({ root: join(base, "logs"), dbPath: join(base, "ns.db"), everyMs: 40 });
    const { board } = engine;
    const snapshot = JSON.parse(readFileSync(SNAPSHOT, "utf8"));
    // Wait until the watcher has read every log (the meta file is read just after its agent's log), then compare.
    await until(() => isDeepStrictEqual(board.desks(NOW, base), snapshot.desks));
    expect(board.desks(NOW, base)).toEqual(snapshot.desks);
  });
});
