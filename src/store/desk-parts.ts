import type { Session } from "./board.js";
import type { DeskLog, Mark } from "./desks.js";
import type { RootOf } from "./root.js";
import type { Trouble } from "./trouble.js";
import type { Workers } from "./workers.js";

/** What a desk is made of, before `deskOf` decides whether it is live and what state it is in. */
export type Parts = {
  id: string;
  role: string;
  title: string;
  /** Always null: tickets went with the pipelines (issue 28); kept so `deskOf` stays as it is. */
  ticket: string | null;
  folder: string;
  steps: number;
  recent: string[];
  startedAt: string | null;
  lastAt: string;
  /** Not finished (a session has no end marker; an agent's turn ended). */
  working: boolean;
  trouble: Trouble | null;
  mark: Mark | undefined;
};

export type Source = {
  sessions: Map<string, Session>;
  workers: Workers;
  log: DeskLog;
  /** The home folder, shown as `~` in what goes out. */
  home: string;
  /** The repository of a folder, so a worktree shows as its repo (cached: no disk read per pull). */
  rootOf: RootOf;
};

/** The parts of every agent the board knows: main sessions, then background agents. */
export function partsOf(src: Source, nowMs: number): Parts[] {
  const parts: Parts[] = [];
  for (const [id, s] of src.sessions) {
    const mark = src.log.get(`main:${id}`);
    parts.push({
      id: `main:${id}`,
      role: "main session",
      title: s.title ?? "Session",
      ticket: null,
      folder: s.home,
      recent: mark?.recent ?? [],
      steps: mark?.steps ?? 0,
      startedAt: mark?.startedAt ?? null,
      lastAt: s.lastAt,
      working: true, // a main session has no end marker: quiet for 10 minutes = idle
      trouble: s.trouble,
      mark,
    });
  }
  for (const { w, place } of src.workers.live(nowMs)) {
    const mark = src.log.get(`agent:${w.agentId}`);
    parts.push({
      id: `agent:${w.agentId}`,
      role: "background agent",
      // Never `w.task`: that is the start of the agent's prompt, and prompts stay off this endpoint.
      title: w.title ?? `agent ${w.agentId.slice(0, 6)}`,
      ticket: null,
      folder: src.rootOf(place.folder)?.root ?? place.folder,
      recent: w.recent,
      steps: w.steps,
      startedAt: w.startedAt,
      lastAt: w.lastAt,
      working: !w.ended,
      // Its session's trouble stops only the work in progress: an agent that finished is not held up by it.
      trouble: mark?.trouble ?? (w.ended ? null : (src.sessions.get(w.parent)?.trouble ?? null)),
      mark,
    });
  }
  return parts;
}
