import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NOW, until, useDeskLogs } from "./desks-logs.js";

// A busy computer: more live desks than Motherboard's Agents tab shows (50). The cut must keep the working and
// waiting desks, so idle ones that are newer than all of them can never push a working desk off the list.
const logs = useDeskLogs();
const MAIN_SESSIONS = 53;
const FINISHED_AGENTS = 5;

/** One line of a background agent: a file it reads, or (file null) its closing answer. */
const agentLine = (agentId: string, timestamp: string, file: string | null) =>
  logs.line({
    isSidechain: true,
    agentId,
    type: "assistant",
    timestamp,
    message: {
      id: `msg_${agentId}_${timestamp}_${file ? "read" : "end"}`,
      model: "claude-opus-5-5",
      ...(file
        ? {
            content: [{ type: "tool_use", id: `tu_${agentId}_${timestamp}`, name: "Read", input: { file_path: file } }],
          }
        : { stop_reason: "end_turn", content: [{ type: "text", text: "Done." }] }),
    },
  });

/** A background agent of the fixture's session, named `title`, that read one file in shop-app and then answered. */
function addFinishedAgent(agentId: string, title: string, timestamp: string) {
  const { subagents } = logs.paths();
  const repo = join(logs.base(), "shop-app");
  mkdirSync(join(repo, ".git"), { recursive: true });
  writeFileSync(
    join(subagents, `agent-${agentId}.jsonl`),
    agentLine(agentId, timestamp, join(repo, "notes.md")) + agentLine(agentId, timestamp, null),
  );
  writeFileSync(join(subagents, `agent-${agentId}.meta.json`), JSON.stringify({ description: title }));
}

/** Main sessions that each got one task in the last five minutes, so they still count as working. */
function addMainSessions(count: number) {
  const { session } = logs.paths();
  for (let i = 0; i < count; i++) {
    writeFileSync(
      session.replace("s-desk-1.jsonl", `s-many-${i}.jsonl`),
      logs.line({
        sessionId: `s-many-${i}`,
        type: "user",
        timestamp: `2026-10-29T09:00:${String(i).padStart(2, "0")}.000Z`,
        message: { role: "user", content: `Task ${i}` },
      }),
    );
  }
}

describe("a busy computer: 60 live desks, 5 finished agents newer than all the rest", () => {
  it("GET /agents shows 50 desks, every working or waiting one ahead of every idle one", async () => {
    addMainSessions(MAIN_SESSIONS);
    for (let i = 0; i < FINISHED_AGENTS; i++)
      addFinishedAgent(`done${i}`, `Finished ${i}`, `2026-10-29T09:04:5${5 + i}.000Z`);
    const { board } = logs.start();
    // Wait until every log is read: every finished agent named on shop-app's board (an agent's meta file is read
    // just after its log, so the logs are all in by then) and 50 desks out.
    const isAllRead = () =>
      board.view("shop-app", NOW).agents.filter((a) => a.name.startsWith("Finished")).length === FINISHED_AGENTS &&
      board.desks(NOW).list?.length === 50;
    expect(await until(isAllRead, 8000)).toBe(true);
    const list = board.desks(NOW).list ?? [];
    expect(list).toHaveLength(50);
    expect(list.filter((d) => d.id.startsWith("main:s-many-"))).toHaveLength(48);
    expect(list.slice(0, 2).map((d) => d.id)).toEqual(["agent:bg1", "main:s-desk-1"]);
    const states = list.map((d) => d.state);
    const firstIdle = states.indexOf("idle");
    const lastBusy = Math.max(states.lastIndexOf("working"), states.lastIndexOf("waits"));
    expect(lastBusy).toBeGreaterThanOrEqual(0);
    if (firstIdle !== -1) expect(lastBusy).toBeLessThan(firstIdle);
    // 55 desks are busy, so the five finished agents, newest of all, are all cut.
    expect(list.filter((d) => d.title.startsWith("Finished"))).toEqual([]);
    expect(states.every((s) => s !== "idle")).toBe(true);
  });
});
