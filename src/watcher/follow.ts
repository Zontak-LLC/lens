import { closeSync, constants, fstatSync, openSync, readSync, type Stats, statSync } from "node:fs";
import { type NightEvent, parseAgentMeta, parseLine } from "../parser/index.js";
import { type LogFile, logFiles } from "./files.js";
import { advance, committed, START, startAt, type TailState } from "./tail.js";

/** Where an event came from: a key that is the same every time the same line is read, so a store can tell a repeat. */
export type Origin = { key: string };
/** What a file looked like when the watcher last finished with it (kept by the store, handed back after a restart). */
export type FileMark = { ino: number; epoch: number; offset: number };

export type WatchOptions = {
  /** Claude Code's projects folder (one sub-folder per project, one .jsonl log per session). */
  root: string;
  /** How often to look for new lines, in ms. Once a second keeps "Now" under the spec's 2 seconds. */
  everyMs?: number;
  /** On start, files changed within this window are read, so a running session shows at once. */
  recentMs?: number;
  /** A file bigger than this, when first seen, is read from its last `tailBytes` only (old history is not "now"). */
  tailBytes?: number;
  onEvent: (event: NightEvent, origin: Origin) => void;
  /** Where a file got to last time: carry on from there (same file, not shorter) instead of guessing from its age. */
  resume?: (path: string) => FileMark | null;
  /** A file was read up to `offset` (the end of its last whole line): remember it. Called after its events. */
  onRead?: (path: string, mark: FileMark) => void;
  onSkipped?: (count: number) => void;
  /** A log was looked at and its read place is `offset` (bytes read, a half-written line too; a failed read too). */
  onPlace?: (path: string, offset: number) => void;
  /** Whole lines were read (any lines, events or not): the watcher is alive and keeping up. */
  onLines?: (count: number) => void;
  /** A problem that did not stop the watcher (an unreadable folder or file, a failing `onEvent`). */
  onError?: (error: unknown) => void;
  /** At most this many bytes of one file per look: a huge log is caught up over several looks, never read whole. */
  chunkBytes?: number;
};

type Followed = { tail: TailState; ino: number; epoch: number };

/** What one look at a session or agent log found: its complete new lines and where each one ends. */
type Read = {
  path: string;
  ino: number;
  epoch: number;
  lines: string[];
  ends: number[];
  mark: FileMark | null;
};

/** The bytes from `from` to `to`; fewer when the file shrank meanwhile (never zero padding). Sync, so a read always
 * returns (decisions.md); read only (Lens never writes to Claude Code's files) and non-blocking, so a pipe with no
 * writer can never freeze Lens. */
function readRange(path: string, from: number, to: number): Buffer {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    // Before the empty-range shortcut: a pipe has size 0, so a shortcut taken first would never see it.
    if (!fstatSync(fd).isFile()) throw new Error("not a regular file");
    if (to <= from) return Buffer.alloc(0);
    const buf = Buffer.alloc(to - from);
    const bytesRead = readSync(fd, buf, 0, buf.length, from);
    return buf.subarray(0, bytesRead);
  } finally {
    closeSync(fd);
  }
}

/** A file's facts, or null when it is gone. */
function statOrNull(path: string): Stats | null {
  try {
    return statSync(path);
  } catch {
    return null;
  }
}

/** Follows every session log under `root`; returns a function that stops it. */
export function watchLogs(opts: WatchOptions): () => void {
  const {
    root,
    everyMs = 1000,
    recentMs = 10 * 60_000,
    tailBytes = 256_000,
    onEvent,
    onSkipped,
    onError,
    resume,
    onRead,
    onLines,
    onPlace,
    chunkBytes = 8_000_000,
  } = opts;
  const files = new Map<string, Followed>();
  /** meta file -> the size last read (it is written once, then left alone). */
  const metas = new Map<string, number>();
  let first = true;
  let busy = false;
  let stopped = false;
  /** File and folder problems are said once each: the same unreadable file must not fill the log every second. */
  const said = new Set<string>();
  function reportOnce(where: string, error: unknown): void {
    const message = `${where}: ${error instanceof Error ? error.message : String(error)}`;
    if (said.has(message)) return;
    said.add(message);
    onError?.(new Error(message));
  }

  function firstTail(size: number, mtimeMs: number): TailState {
    if (!first) return START; // a file that appears later is brand new: read it all
    if (Date.now() - mtimeMs > recentMs) return startAt(size); // quiet: only new lines from now on
    return size > tailBytes ? startAt(size - tailBytes) : START;
  }

  /** One failing listener must not lose the rest of the lines. */
  function safely(call: () => void): void {
    try {
      call();
    } catch (error) {
      onError?.(error);
    }
  }

  function emit(read: Read): void {
    let skipped = 0;
    const at = `${read.path}#${read.ino}.${read.epoch}`;
    read.lines.forEach((line, i) => {
      if (stopped) return;
      const key = (n: number) => ({ key: `${at}@${read.ends[i]}.${n}` });
      const r = parseLine(line);
      skipped += r.skipped;
      for (const [n, e] of r.events.entries()) safely(() => onEvent(e, key(n)));
    });
    if (skipped && onSkipped) onSkipped(skipped);
  }

  /** What was remembered about a file before this run, if it is still the same file and has not shrunk. */
  function remembered(path: string, ino: number, size: number): Followed | null {
    const saved = resume?.(path);
    if (!saved) return null;
    if (saved.ino === ino && size >= saved.offset) {
      return { tail: { offset: saved.offset, partial: Buffer.alloc(0), skipping: false }, ino, epoch: saved.epoch };
    }
    return { tail: START, ino, epoch: saved.epoch + 1 }; // replaced or cut short while we were away: read it anew
  }

  /** Where to read from and which epoch the file is in: carried on, read from the top, or a first look. */
  function placeFor(known: Followed | null, info: Stats): { tail: TailState; epoch: number } {
    // A different file under the same name (replaced, not appended to), or one that shrank: read it from the top.
    const replaced = known && (known.ino !== info.ino || info.size < known.tail.offset);
    if (known && !replaced) return { tail: known.tail, epoch: known.epoch };
    if (known) return { tail: START, epoch: known.epoch + 1 };
    return { tail: firstTail(info.size, info.mtimeMs), epoch: 0 };
  }

  /** Reads what one file gained since the last look and returns its complete new lines. */
  function newLines({ path }: LogFile): Read | null {
    const info = statOrNull(path);
    if (!info) return null;
    const known = files.get(path) ?? remembered(path, info.ino, info.size);
    if (known && known.ino === info.ino && info.size === known.tail.offset) return null;
    const { tail, epoch } = placeFor(known, info);
    const to = Math.min(info.size, tail.offset + chunkBytes);
    let chunk: Buffer | null = null;
    try {
      chunk = readRange(path, tail.offset, to);
    } catch (error) {
      reportOnce(path, error); // and try again on the next look
    }
    // Keep the place chosen even when the read failed: a retry must not start the file over from its top.
    if (!chunk) {
      files.set(path, { tail, ino: info.ino, epoch });
      safely(() => onPlace?.(path, tail.offset));
      return null;
    }
    for (const message of said) if (message.startsWith(`${path}: `)) said.delete(message); // it reads again
    const step = advance(tail, chunk);
    files.set(path, { tail: step.state, ino: info.ino, epoch });
    safely(() => onPlace?.(path, step.state.offset));
    const mark = step.state.skipping ? null : { ino: info.ino, epoch, offset: committed(step.state) };
    return { path, ino: info.ino, epoch, lines: step.lines, ends: step.ends, mark };
  }

  /** An agent's description, read once per change of the file (a half-written one is retried on the next look). */
  function readMeta(file: LogFile & { meta: NonNullable<LogFile["meta"]> }): void {
    const info = statOrNull(file.path);
    if (!info || metas.get(file.path) === info.size) return;
    let text: string;
    try {
      text = readRange(file.path, 0, info.size).toString("utf8");
    } catch (error) {
      // A pipe or device is said once (by look); a meta that vanished or is not readable yet is retried quietly.
      if (error instanceof Error && error.message.includes("not a regular file")) throw error;
      return;
    }
    const event = parseAgentMeta(text, file.meta.sessionId, file.meta.agentId);
    const key = `${file.path}#meta@${info.size}.${Math.floor(info.mtimeMs)}.0`;
    if (event) safely(() => onEvent({ ...event, agentId: file.meta.agentId }, { key }));
    metas.set(file.path, info.size);
  }

  function follow(file: LogFile): void {
    const read = newLines(file);
    if (!read) return;
    if (read.lines.length) safely(() => onLines?.(read.lines.length));
    emit(read);
    const mark = read.mark;
    if (mark && !stopped) safely(() => onRead?.(read.path, mark));
  }

  /** One file at a time. A file that fails is reported once and skipped, so one file can never stop the others. */
  function look(file: LogFile): void {
    try {
      if (file.meta) readMeta({ ...file, meta: file.meta });
      else follow(file);
    } catch (error) {
      reportOnce(file.path, error);
    }
  }

  function tick(): void {
    if (busy || stopped) return;
    busy = true;
    try {
      const paths = logFiles(root, (error) => reportOnce(root, error));
      for (const file of paths ?? []) {
        if (stopped) return;
        look(file);
      }
      if (paths) first = false; // a folder that appears later is new work: read it all
    } finally {
      busy = false;
    }
  }

  const run = () => {
    try {
      tick();
    } catch (error) {
      onError?.(error);
    }
  };
  // The first look runs just after watchLogs returns (as when reads were async), so a caller has wired everything
  // before the first event arrives.
  const soon = setImmediate(run);
  const timer = setInterval(run, everyMs);
  return () => {
    stopped = true;
    clearImmediate(soon);
    clearInterval(timer);
  };
}
