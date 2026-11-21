import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type NightServer, startServer } from "../src/server/index.js";
import { NOW, useDeskLogs } from "./desks-logs.js";

// Motherboard pulls GET /agents. Removing other parts of Lens must not change a byte of it: the golden file was
// captured once from the code before those removals, and is never regenerated. (test/fixtures/agents-snapshot.json
// is a different, older snapshot of the board itself, issue 28.)
const logs = useDeskLogs();
let server: NightServer | null = null;
const GOLDEN = join(import.meta.dirname, "fixtures", "agents-route-snapshot.json");

type Answer = { status: number; contentType: string | null; body: string };

afterEach(async () => {
  await server?.close();
  server = null;
});

/** The same real-shaped fixtures as the desks tests, at the fixed NOW, served the way the CLI serves them. */
async function serveLikeTheCli(): Promise<(path: string) => Promise<Answer>> {
  const { board } = await logs.open();
  // The fixture folders are made per test: name them the same every run, so the bodies compare.
  const steady = (text: string) => text.replaceAll(logs.base(), "/work");
  server = await startServer(0, { view: () => ({}), projects: () => [], agents: () => board.desks(NOW) });
  return async (path) => {
    const res = await fetch(`http://127.0.0.1:${server?.port}${path}`);
    return { status: res.status, contentType: res.headers.get("content-type"), body: steady(await res.text()) };
  };
}

/** GET /agents answers exactly what the golden file recorded, byte for byte. */
async function expectGoldenAgents(read: (path: string) => Promise<Answer>) {
  const got = await read("/agents");
  const want = JSON.parse(readFileSync(GOLDEN, "utf8")) as { status: number; contentType: string; body: unknown };
  expect(got.status).toBe(200);
  expect(got.status).toBe(want.status);
  expect(got.contentType).toBe("application/json");
  expect(got.contentType).toBe(want.contentType);
  expect(JSON.parse(got.body)).toEqual(want.body);
  // Byte for byte: the same JSON text, keys in the same order.
  expect(got.body).toBe(JSON.stringify(want.body));
}

describe("Motherboard gets the same GET /agents answer as before", () => {
  it("GET /agents matches its golden file", async () => {
    await expectGoldenAgents(await serveLikeTheCli());
  });

  it("GET /api/agents is gone: 404 Not found, and GET /agents still matches its golden file", async () => {
    const read = await serveLikeTheCli();
    const gone = await read("/api/agents");
    expect(gone.status).toBe(404);
    expect(gone.body).toBe("Not found");
    await expectGoldenAgents(read);
  });
});
