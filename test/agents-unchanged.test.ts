import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type NightServer, startServer } from "../src/server/index.js";
import { NOW, useDeskLogs } from "./desks-logs.js";

// Motherboard and Forge pull GET /agents and GET /api/agents. Removing the Sentinel link and the usage meter must not
// change a byte of either: the golden files were captured once from the code before that removal, and are never
// regenerated. (test/fixtures/agents-snapshot.json is a different, older snapshot of the board itself, issue 28.)
const logs = useDeskLogs();
let server: NightServer | null = null;
const FIXTURES = join(import.meta.dirname, "fixtures");
const golden = (name: string) => join(FIXTURES, name);

afterEach(async () => {
  await server?.close();
  server = null;
});

/** The same real-shaped fixtures as the desks tests, at the fixed NOW, served the way the CLI serves them. */
async function answers() {
  const { board } = await logs.open();
  // The fixture folders are made per test: name them the same every run, so the bodies compare.
  const steady = (text: string) => text.replaceAll(logs.base(), "/work");
  server = await startServer(0, {
    view: () => ({}),
    projects: () => [],
    agents: () => board.desks(NOW),
    running: () => board.running(NOW),
  });
  const read = async (path: string) => {
    const res = await fetch(`http://127.0.0.1:${server?.port}${path}`);
    return { status: res.status, contentType: res.headers.get("content-type"), body: steady(await res.text()) };
  };
  return { agents: await read("/agents"), api: await read("/api/agents") };
}

describe("Motherboard and Forge get the same answers as before", () => {
  it("GET /agents and GET /api/agents match the golden files", async () => {
    const { agents, api } = await answers();
    for (const [got, file] of [
      [agents, "agents-route-snapshot.json"],
      [api, "api-agents-snapshot.json"],
    ] as const) {
      const want = JSON.parse(readFileSync(golden(file), "utf8")) as {
        status: number;
        contentType: string;
        body: unknown;
      };
      expect(got.status).toBe(200);
      expect(got.status).toBe(want.status);
      expect(got.contentType).toBe(want.contentType);
      expect(JSON.parse(got.body)).toEqual(want.body);
      // Byte for byte: the same JSON text, keys in the same order.
      expect(got.body).toBe(JSON.stringify(want.body));
    }
  });
});
