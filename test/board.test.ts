import { describe, expect, it } from "vitest";
import type { NightEvent } from "../src/parser/index.js";
import { Board } from "../src/store/index.js";

const seen = (sessionId: string, cwd: string, at = "2026-10-23T21:00:00.000Z"): NightEvent => ({
  kind: "session.seen",
  at,
  sessionId,
  cwd,
  branch: "next",
});
const step = (sessionId: string, summary: string, at: string, agentId?: string): NightEvent => ({
  kind: "tool.use",
  at,
  sessionId,
  ...(agentId ? { agentId } : {}),
  toolUseId: `${agentId ?? sessionId}-${at}`,
  tool: "Bash",
  summary,
});

function demoNight(): Board {
  const board = new Board(() => null);
  board.apply(seen("s-demo-1", "/work/demo-app"));
  board.apply({ kind: "session.title", at: "2026-10-23T21:00:01.000Z", sessionId: "s-demo-1", title: "Dark mode" });
  return board;
}

// SPEC scenario 3 (two projects at once, never mixed): main sessions on the board, no pipeline stations (issue 28).
describe("the board follows the sessions of the night", () => {
  it("shows what is happening now: the session's newest step first", () => {
    const board = demoNight();
    board.apply(step("s-demo-1", "Editing src/header.tsx", "2026-10-23T21:20:00.000Z"));
    board.apply(step("s-demo-1", "Reading docs/plan.md", "2026-10-23T21:21:00.000Z"));
    const view = board.view("demo-app");
    expect(view.now).toEqual([{ who: "Dark mode", what: "Reading docs/plan.md", at: "2026-10-23T21:21:00.000Z" }]);
    expect(view).toMatchObject({ folder: "/work/demo-app", branch: "next", agents: [], alerts: [] });
    expect(Object.keys(view).sort()).toEqual(["agents", "alerts", "branch", "folder", "now", "project"]);
  });

  it("keeps two projects apart: each board shows only its own steps, the start page lists both", () => {
    const board = demoNight();
    board.apply(seen("s-other", "/work/other-app", "2026-10-23T22:00:00.000Z"));
    board.apply(step("s-demo-1", "Editing only/in/demo.ts", "2026-10-23T21:30:00.000Z"));
    expect(board.view("demo-app").folder).toBe("/work/demo-app");
    expect(board.view("other-app").folder).toBe("/work/other-app");
    expect(board.view("other-app").now.map((r) => r.what)).not.toContain("Editing only/in/demo.ts");
    expect(board.projects()).toEqual([
      { project: "other-app", folder: "/work/other-app", lastAt: "2026-10-23T22:00:00.000Z", agents: 0 },
      { project: "demo-app", folder: "/work/demo-app", lastAt: "2026-10-23T21:30:00.000Z", agents: 0 },
    ]);
    expect(board.view("no-such-project")).toEqual({
      project: "no-such-project",
      folder: null,
      branch: null,
      now: [],
      agents: [],
      alerts: [],
    });
  });

  it("treats every agent step as a background agent's, and tags it for the terminal", () => {
    const board = demoNight();
    expect(board.apply(step("s-demo-1", "Editing x.ts", "2026-10-23T21:40:00.000Z", "agent-unknown"))).toBe(true);
    expect(board.agentLabel("agent-unknown")).toEqual({ project: "demo-app", name: "agent agent-" });
    expect(board.agentLabel("never-seen")).toBeNull();
    const nowMs = Date.parse("2026-10-23T21:41:00.000Z");
    expect(board.view("demo-app", nowMs).agents.map((a) => a.agentId)).toEqual(["agent-unknown"]);
    expect(board.projects(nowMs)[0]).toMatchObject({ project: "demo-app", agents: 1 });
  });

  it("ignores a step of a session it has not seen, and a usage line never redraws", () => {
    const board = demoNight();
    expect(board.apply(step("s-unknown", "Editing y.ts", "2026-10-23T21:40:00.000Z"))).toBe(false);
    const usage: NightEvent = {
      kind: "turn.usage",
      at: "2026-10-23T21:41:00.000Z",
      sessionId: "s-demo-1",
      messageId: "m1",
      model: "claude-opus-5-5",
      inputTokens: 1,
      outputTokens: 2,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    expect(board.apply(usage)).toBe(false);
    expect(board.deskTokens("main:s-demo-1")?.total).toBe(3);
  });
});
