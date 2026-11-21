// The history holds prompts, file paths and tool steps from every session, so no other account on the computer may
// read it. These scenarios show Lens makes the folder 0700 and the database files 0600 each time it opens them.
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startEngine } from "../src/engine.js";
import { History } from "../src/store/index.js";

// Windows has no POSIX modes.
const hasModes = process.platform !== "win32";
// root may chmod anything and write anywhere, so the failing case cannot be made there.
const canFail = hasModes && process.getuid?.() !== 0;
// A shared temp folder (like /tmp) belongs to another account: a file can be made in it, but it cannot be chmodded.
const isTmpShared = canFail && statSync(tmpdir()).uid !== process.getuid?.();

const line = (id: string, file: string) =>
  `${JSON.stringify({
    sessionId: "s1",
    cwd: "/work/demo-app",
    timestamp: "2026-11-19T22:00:00.000Z",
    type: "assistant",
    message: { content: [{ type: "tool_use", id, name: "Edit", input: { file_path: `/work/demo-app/${file}` } }] },
  })}\n`;
const until = async (check: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!check() && Date.now() < end) await new Promise((r) => setTimeout(r, 25));
  return check();
};
const modeOf = (path: string) => statSync(path).mode & 0o777;

describe.skipIf(!hasModes)("only the developer's account can read the history", () => {
  let dir = "";
  let stop: () => void = () => {};
  afterEach(() => {
    stop();
    stop = () => {};
    rmSync(dir, { recursive: true, force: true });
  });
  const setup = () => {
    dir = mkdtempSync(join(tmpdir(), "lens-private-"));
    mkdirSync(join(dir, "logs", "demo-app"), { recursive: true });
    const data = join(dir, "data");
    return {
      root: join(dir, "logs"),
      data,
      db: join(data, "nightshift.db"),
      log: join(dir, "logs", "demo-app", "s1.jsonl"),
    };
  };
  const open = (root: string, dbPath: string) => {
    const engine = startEngine({ root, dbPath, everyMs: 40 });
    stop = engine.stop;
    return engine;
  };

  it("an existing folder at 0755 and database at 0644 become 0700 and 0600 when Lens starts", () => {
    const { root, data, db } = setup();
    mkdirSync(data);
    writeFileSync(db, "");
    chmodSync(data, 0o755);
    chmodSync(db, 0o644);
    open(root, db);
    expect(modeOf(data)).toBe(0o700);
    expect(modeOf(db)).toBe(0o600);
  });

  it("a fresh start under umask 022 makes the folder 0700 and every database file 0600", async () => {
    const { root, data, db, log } = setup();
    const before = process.umask(0o022);
    try {
      writeFileSync(log, line("t1", "a.ts"));
      const engine = open(root, db);
      expect(await until(() => engine.history.count() > 0)).toBe(true);
      expect(modeOf(data)).toBe(0o700);
      expect(modeOf(db)).toBe(0o600);
      const sides = [`${db}-wal`, `${db}-shm`].filter((p) => existsSync(p));
      expect(sides.length).toBeGreaterThan(0);
      for (const side of sides) expect(modeOf(side)).toBe(0o600);
    } finally {
      process.umask(before);
    }
  });

  it("a database loosened while Lens was off is 0600 again after a restart, and the board keeps its steps", async () => {
    const { root, db, log } = setup();
    writeFileSync(log, line("t1", "a.ts") + line("t2", "b.ts"));
    let engine = open(root, db);
    expect(await until(() => engine.history.count() === 4)).toBe(true);
    const steps = engine.board.view("demo-app").now.map((n) => n.what);
    stop();

    chmodSync(db, 0o644);
    engine = open(root, db);
    expect(modeOf(db)).toBe(0o600);
    expect(engine.board.view("demo-app").now.map((n) => n.what)).toEqual(steps);
    expect(steps).toEqual(["Editing b.ts"]);
  });

  it.skipIf(!canFail)("a folder that cannot be made fails loudly, naming the folder", () => {
    const { data } = setup();
    writeFileSync(data, "not a folder");
    const folder = join(data, "history");
    expect(() => new History(join(folder, "nightshift.db"))).toThrow(folder);
  });

  it.skipIf(!isTmpShared)("a folder Lens cannot chmod stops the open with an error naming the folder and mode", () => {
    setup();
    const db = join(tmpdir(), `${dir.split("/").pop()}.db`);
    try {
      expect(() => new History(db)).toThrow(`cannot make ${tmpdir()} private (mode 700)`);
    } finally {
      for (const end of ["", "-wal", "-shm"]) rmSync(db + end, { force: true });
    }
  });

  it("the in-memory history used by tests touches no files", () => {
    const { data } = setup();
    const history = new History(":memory:");
    expect(history.count()).toBe(0);
    history.close();
    expect(existsSync(data)).toBe(false);
    expect(existsSync(":memory:")).toBe(false);
  });
});
